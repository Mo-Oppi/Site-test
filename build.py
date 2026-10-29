#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Le Carnet — générateur de site statique.

Lit les fichiers Word (.docx) du dossier « articles/ » (et « pages/ »), les
convertit en HTML avec Pandoc et écrit le site complet dans « dist/ ».

    python3 build.py

Prérequis : Python 3.9 ou plus récent, et Pandoc (https://pandoc.org).
Aucune autre dépendance. Voir LISEZ-MOI.md pour le mode d'emploi.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
ARTICLES_DIR = ROOT / "articles"
PAGES_DIR = ROOT / "pages"
ASSETS_DIR = ROOT / "assets"
DIST = ROOT / "dist"

NB = " "  # espace insécable
MARK = "<!--@@CORPS@@-->"

# Modèle Pandoc : on récupère le titre / sous-titre du document (styles Word
# « Titre » et « Sous-titre ») séparément du corps du texte.
PANDOC_TEMPLATE = (
    '$if(title)$<div id="doc-title">$title$</div>$endif$\n'
    '$if(subtitle)$<div id="doc-subtitle">$subtitle$</div>$endif$\n'
    + MARK + "\n$body$\n"
)

MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
          "août", "septembre", "octobre", "novembre", "décembre"]
MONTHS_ABBR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.",
               "août", "sept.", "oct.", "nov.", "déc."]

DEFAULTS = {
    "title": "Le Carnet",
    "tagline": "Textes, notes et lectures — publiés au fil de l’eau.",
    "description": "",
    "author": "",
    "lang": "fr",
    "url": "",
    "words_per_minute": 220,
    "footer": "Tous droits réservés.",
}


# --------------------------------------------------------------------------
# Utilitaires
# --------------------------------------------------------------------------
def esc(s: str) -> str:
    return html.escape(s, quote=True)


def warn(msg: str) -> None:
    print(f"  ! {msg}", file=sys.stderr)


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "sans-titre"


def strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def fmt_long(d: dt.date) -> str:
    day = "1er" if d.day == 1 else str(d.day)
    return f"{day} {MONTHS[d.month - 1]} {d.year}"


def fmt_short(d: dt.date) -> str:
    day = "1er" if d.day == 1 else str(d.day)
    return f"{day} {MONTHS_ABBR[d.month - 1]}"


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    path = ROOT / "site.json"
    if path.exists():
        try:
            cfg.update(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError as e:
            sys.exit(f"site.json n'est pas un JSON valide : {e}")
    if not cfg["url"]:
        cfg["url"] = os.environ.get("SITE_URL", "").strip()
    cfg["url"] = cfg["url"].rstrip("/")
    return cfg


def french_typography(h: str) -> str:
    """Espaces insécables avant : ; ! ? et à l'intérieur des guillemets « »."""
    parts = re.split(r"(<[^>]+>)", h)
    skip = 0
    for i, p in enumerate(parts):
        if p.startswith("<"):
            if re.match(r"<(pre|code|script|style)\b", p, re.I):
                skip += 1
            elif re.match(r"</(pre|code|script|style)\b", p, re.I):
                skip = max(0, skip - 1)
            continue
        if skip or not p:
            continue
        t = p.replace("&nbsp;", NB)
        t = re.sub(rf"(?<=[^\s{NB}])[ {NB}]+([;!?:])", NB + r"\1", t)
        if i > 0:
            t = re.sub(r"^ +([;!?:»])", NB + r"\1", t)
        t = re.sub(rf"«[ {NB}]*", "«" + NB, t)
        t = re.sub(rf"(?<=\S)[ {NB}]*»|^[ {NB}]*»", NB + "»", t)
        parts[i] = t
    return "".join(parts)


# --------------------------------------------------------------------------
# Lecture d'un document Word
# --------------------------------------------------------------------------
@dataclass
class Doc:
    kind: str            # "article" ou "page"
    slug: str
    title: str
    subtitle: str
    body: str
    excerpt: str
    date: dt.date | None
    category: str
    cat_slug: str
    minutes: int
    cover: str | None    # chemin relatif au site, ex. articles/x/media/image1.png

    @property
    def url_path(self) -> str:
        return f"articles/{self.slug}/" if self.kind == "article" else f"{self.slug}/"


DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[\s_.\-]*(.*)$")


def parse_name(stem: str):
    m = DATE_RE.match(stem)
    if m:
        try:
            return dt.date(int(m[1]), int(m[2]), int(m[3])), (m[4] or stem)
        except ValueError:
            pass
    return None, stem


def git_first_date(path: Path):
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--format=%aI", "--", str(path)],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        ).stdout.strip().splitlines()
        if out:
            return dt.datetime.fromisoformat(out[-1]).date()
    except Exception:
        pass
    return None


def pretty_name(s: str) -> str:
    s = re.sub(r"[-_]+", " ", s).strip()
    return s[:1].upper() + s[1:]


def shift_headings(body: str, only_h1: bool = False) -> str:
    def repl(m):
        n = int(m.group(2))
        if only_h1 and n != 1:
            return m.group(0)
        return f"<{m.group(1)}h{min(n + 1, 6)}"
    return re.sub(r"<(/?)h([1-6])(?=[\s>])", repl, body)


def copy_image(src: Path, dest_dir: Path) -> None:
    """Copie une image ; la réduit si Pillow est installé et qu'elle est très grande."""
    try:
        from PIL import Image  # facultatif
        if src.suffix.lower() in (".jpg", ".jpeg", ".png"):
            with Image.open(src) as im:
                if im.width > 1800:
                    ratio = 1800 / im.width
                    small = im.resize((1800, round(im.height * ratio)), Image.LANCZOS)
                    small.save(dest_dir / src.name, optimize=True)
                    return
    except Exception:
        pass
    shutil.copy2(src, dest_dir / src.name)


def make_excerpt(subtitle: str, body: str, limit: int = 230) -> str:
    if subtitle:
        text = strip_tags(subtitle)
    else:
        clean = re.sub(r'<a[^>]*class="footnote-ref"[^>]*>.*?</a>', "", body, flags=re.S)
        paras = [strip_tags(m.group(1)) for m in re.finditer(r"<p>(.*?)</p>", clean, re.S)]
        paras = [p for p in paras if p]
        text = next((p for p in paras if len(p) >= 60), paras[0] if paras else "")
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:.— ")
    return cut + "…"


def convert(src: Path, kind: str, category: str, cfg: dict, used: set[str]) -> Doc:
    date, rest = parse_name(src.stem)
    if kind == "article" and date is None:
        date = git_first_date(src) or dt.date.fromtimestamp(src.stat().st_mtime)
        warn(f"{src.name} : pas de date dans le nom du fichier, date retenue : {date.isoformat()} "
             f"(préférez « AAAA-MM-JJ-titre.docx »)")
    if kind == "page":
        rest = re.sub(r"^\d+[\s_.\-]+", "", src.stem)

    slug = slugify(rest)
    base, n = slug, 2
    while slug in used:
        slug, n = f"{base}-{n}", n + 1
    used.add(slug)

    outdir = DIST / ("articles" if kind == "article" else "") / slug
    outdir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_s:
        tmp = Path(tmp_s)
        (tmp / "t.html").write_text(PANDOC_TEMPLATE, encoding="utf-8")
        cmd = [
            "pandoc", str(src), "-f", "docx", "-t", "html5", "-s",
            "--template", str(tmp / "t.html"), "--wrap=none",
            "--track-changes=accept", "--email-obfuscation=none",
            f"--extract-media={tmp / 'x'}",
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        except FileNotFoundError:
            sys.exit("Pandoc est introuvable. Installez-le (https://pandoc.org/installing.html).")
        if res.returncode != 0:
            sys.exit(f"Pandoc n'a pas pu lire « {src.name} » :\n{res.stderr}")
        head, _, body = res.stdout.partition(MARK)

        media_dir = tmp / "x" / "media"
        if media_dir.is_dir():
            dest = outdir / "media"
            dest.mkdir(exist_ok=True)
            for f in sorted(media_dir.iterdir()):
                copy_image(f, dest)
            body = body.replace(str(media_dir) + "/", "media/")

    def img(m):
        tag = m.group(0)
        s = re.search(r'src="([^"]+)"', tag)
        if not s or re.search(r"\.(emf|wmf)$", s.group(1), re.I):
            warn(f"{src.name} : une image au format non supporté (emf/wmf) a été ignorée. "
                 f"Réinsérez-la en JPEG ou PNG.")
            return ""
        a = re.search(r'alt="([^"]*)"', tag)
        return (f'<img src="{s.group(1)}" alt="{a.group(1) if a else ""}" '
                f'loading="lazy" decoding="async">')

    body = re.sub(r"<img\b[^>]*>", img, body)

    t = re.search(r'<div id="doc-title">(.*?)</div>', head, re.S)
    st = re.search(r'<div id="doc-subtitle">(.*?)</div>', head, re.S)
    title = strip_tags(t.group(1)) if t else ""
    subtitle = st.group(1).strip() if st else ""

    if title:
        body = shift_headings(body)                       # Titre 1 → h2, etc.
    else:
        m = re.match(r"\s*<h1[^>]*>(.*?)</h1>", body, re.S)
        if m:
            title = strip_tags(m.group(1))
            body = shift_headings(body[m.end():], only_h1=True)
    if not title:
        title = pretty_name(rest)
        warn(f"{src.name} : aucun titre trouvé dans le document, titre déduit du nom du fichier.")

    body = re.sub(
        r'(<(?:aside|section) id="footnotes"[^>]*>)\s*<hr\s*/?>',
        r'\1<h2 class="notes-title">Notes</h2>', body)

    if cfg["lang"].startswith("fr"):
        body = french_typography(body)
        title = french_typography(title)
        subtitle = french_typography(subtitle)

    words = len(strip_tags(body).split())
    minutes = max(1, round(words / max(1, int(cfg["words_per_minute"]))))
    first_img = re.search(r'<img src="(media/[^"]+)"', body)
    cover = (f"{'articles/' if kind == 'article' else ''}{slug}/{first_img.group(1)}"
             if first_img else None)

    return Doc(kind, slug, title, subtitle, body, make_excerpt(subtitle, body), date,
               category, slugify(category) if category else "", minutes, cover)


def collect(cfg: dict) -> tuple[list[Doc], list[Doc]]:
    used: set[str] = set()
    articles: list[Doc] = []
    pages: list[Doc] = []

    def eligible(p: Path) -> bool:
        return (p.suffix.lower() == ".docx" and not p.name.startswith(("_", "~$"))
                and not any(part.startswith("_") or part.lower() == "brouillons"
                            for part in p.relative_to(ARTICLES_DIR).parts[:-1]))

    if ARTICLES_DIR.is_dir():
        for p in sorted(ARTICLES_DIR.rglob("*.docx")):
            if not eligible(p):
                continue
            rel = p.relative_to(ARTICLES_DIR).parts
            category = pretty_name(rel[0]) if len(rel) > 1 else ""
            print(f"  article : {'/'.join(rel)}")
            articles.append(convert(p, "article", category, cfg, used))
    if PAGES_DIR.is_dir():
        for p in sorted(PAGES_DIR.glob("*.docx")):
            if p.name.startswith(("_", "~$")):
                continue
            print(f"  page    : {p.name}")
            pages.append(convert(p, "page", "", cfg, used))
    articles.sort(key=lambda d: (d.date, d.title), reverse=True)
    return articles, pages


# --------------------------------------------------------------------------
# Gabarits HTML
# --------------------------------------------------------------------------
def head_html(cfg, title, desc, root, path, image=None, og_type="website") -> str:
    full_title = esc(title if title == cfg["title"] else f"{title} — {cfg['title']}")
    url = cfg["url"]
    canon = f'<link rel="canonical" href="{esc(url + "/" + path)}">' if url else ""
    img = ""
    if image and url:
        img = f'<meta property="og:image" content="{esc(url + "/" + image)}">'
    return f"""<!doctype html>
<html lang="{esc(cfg['lang'])}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{full_title}</title>
<meta name="description" content="{esc(desc)}">
<meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#15140f" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{esc(cfg['title'])}">
{img}
{canon}
<link rel="alternate" type="application/rss+xml" title="{esc(cfg['title'])}" href="{root}feed.xml">
<link rel="preload" href="{root}assets/fonts/lora-latin.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="{root}assets/style.css">
</head>"""


def masthead(cfg, pages, root, current="") -> str:
    links = []
    for p in pages:
        cur = ' aria-current="page"' if p.slug == current else ""
        links.append(f'<a href="{root}{p.slug}/"{cur}>{esc(p.title)}</a>')
    links.append(f'<a href="{root}feed.xml" class="rss">RSS</a>')
    return f"""<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="masthead">
  <a class="wordmark" href="{root}"><span class="dot" aria-hidden="true"></span>{esc(cfg['title'])}</a>
  <nav aria-label="Navigation principale">{''.join(links)}</nav>
</header>"""


def footer_html(cfg) -> str:
    year = dt.date.today().year
    who = f"© {year} {esc(cfg['author'])}" if cfg["author"] else f"© {year}"
    extra = f" · {esc(cfg['footer'])}" if cfg["footer"] else ""
    return f"""<footer class="site-footer"><p>{who}{extra}</p></footer>
<script src="ROOT_PLACEHOLDERassets/site.js" defer></script>
</body>
</html>"""


def render_home(cfg, articles, pages) -> str:
    root = ""
    desc = cfg["description"] or cfg["tagline"]
    cats = []
    for a in articles:
        if a.category and a.cat_slug not in [c[0] for c in cats]:
            cats.append((a.cat_slug, a.category))

    filters = ""
    if len(cats) > 1:
        btns = ['<button type="button" class="chip" data-filter="*" aria-pressed="true">Tout</button>']
        btns += [f'<button type="button" class="chip" data-filter="{esc(s)}" aria-pressed="false">{esc(n)}</button>'
                 for s, n in cats]
        filters = f'<div class="filters" role="group" aria-label="Filtrer par rubrique" hidden>{"".join(btns)}</div>'

    rows, last = [], None
    for a in articles:
        key = (a.date.year, a.date.month)
        if key != last:
            rows.append(f'<li class="month" data-month>{MONTHS[a.date.month - 1].capitalize()} {a.date.year}</li>')
            last = key
        thumb = (f'<img class="thumb" src="{a.cover}" alt="" loading="lazy" decoding="async">'
                 if a.cover else "")
        cat = f'<span class="cat">{esc(a.category)}</span>' if a.category else ""
        rows.append(f"""<li class="entry" data-cat="{esc(a.cat_slug)}">
  <a href="articles/{a.slug}/">
    <div class="meta"><time datetime="{a.date.isoformat()}">{fmt_short(a.date)}</time>{cat}</div>
    <div class="txt"><h2>{esc(a.title)}</h2><p>{esc(a.excerpt)}</p><span class="read">{a.minutes} min de lecture</span></div>
    {thumb}
  </a>
</li>""")
    feed = (f'<ol class="feed">{"".join(rows)}</ol>' if rows
            else '<p class="empty">Aucun article pour le moment. Déposez un fichier Word dans le dossier « articles ».</p>')

    return (head_html(cfg, cfg["title"], desc, root, "") + masthead(cfg, pages, root or "./") + f"""
<main id="contenu" class="home">
  <section class="intro">
    <p class="lede">{esc(cfg['tagline'])}</p>
  </section>
  {filters}
  {feed}
</main>
""" + footer_html(cfg)).replace("ROOT_PLACEHOLDER", root)


def render_article(cfg, a: Doc, newer: Doc | None, older: Doc | None, pages) -> str:
    root = "../../"
    desc = a.excerpt or cfg["description"]
    cat = f'<p class="kicker">{esc(a.category)}</p>' if a.category else '<p class="kicker">Article</p>'
    sub = f'<p class="standfirst">{a.subtitle}</p>' if a.subtitle else ""
    by = f" · {esc(cfg['author'])}" if cfg["author"] else ""
    pager = ""
    if newer or older:
        def cell(d, cls, label):
            if not d:
                return '<span></span>'
            return (f'<a class="{cls}" href="{root}articles/{d.slug}/"><span class="lbl">{label}</span>'
                    f'<strong>{esc(d.title)}</strong></a>')
        pager = (f'<nav class="pager" aria-label="Autres articles">{cell(older, "prev", "← Plus ancien")}'
                 f'{cell(newer, "next", "Plus récent →")}</nav>')
    return (head_html(cfg, a.title, desc, root, f"articles/{a.slug}/", a.cover, "article")
            + masthead(cfg, pages, root) + f"""
<div class="progress" aria-hidden="true"></div>
<main id="contenu">
<div class="back-row"><a class="back" href="{root}">← Tous les articles</a></div>
<article class="article">
  <header class="a-head">
    {cat}
    <h1>{esc(a.title)}</h1>
    {sub}
    <p class="byline"><time datetime="{a.date.isoformat()}">{fmt_long(a.date)}</time> · {a.minutes} min de lecture{by}</p>
    <span class="rule" aria-hidden="true"></span>
  </header>
  <div class="prose">
{a.body}
  </div>
</article>
{pager}
</main>
""" + footer_html(cfg)).replace("ROOT_PLACEHOLDER", root)


def render_page(cfg, p: Doc, pages) -> str:
    root = "../"
    sub = f'<p class="standfirst">{p.subtitle}</p>' if p.subtitle else ""
    return (head_html(cfg, p.title, p.excerpt or cfg["description"], root, f"{p.slug}/")
            + masthead(cfg, pages, root, p.slug) + f"""
<main id="contenu">
<article class="article">
  <header class="a-head">
    <h1>{esc(p.title)}</h1>
    {sub}
    <span class="rule" aria-hidden="true"></span>
  </header>
  <div class="prose">
{p.body}
  </div>
</article>
</main>
""" + footer_html(cfg)).replace("ROOT_PLACEHOLDER", root)


def render_404(cfg, pages) -> str:
    base = urlparse(cfg["url"]).path.rstrip("/") if cfg["url"] else ""
    root = base + "/"
    return (head_html(cfg, "Page introuvable", "Cette page n'existe pas.", root, "404.html")
            + masthead(cfg, pages, root) + f"""
<main id="contenu" class="notfound">
  <p class="kicker">Erreur 404</p>
  <h1>Cette page n’existe pas.</h1>
  <p><a href="{root}">Retour à la liste des articles</a></p>
</main>
""" + footer_html(cfg)).replace("ROOT_PLACEHOLDER", root)


# --------------------------------------------------------------------------
# Flux RSS, plan du site
# --------------------------------------------------------------------------
def absolutize(body: str, url: str, path: str) -> str:
    return re.sub(r'(src|href)="(?!https?:|mailto:|#|/)([^"]+)"',
                  lambda m: f'{m.group(1)}="{url}/{path}{m.group(2)}"', body)


def render_rss(cfg, articles) -> str:
    url = cfg["url"]
    items = []
    for a in articles[:30]:
        link = f"{url}/articles/{a.slug}/" if url else f"articles/{a.slug}/"
        when = email.utils.format_datetime(
            dt.datetime(a.date.year, a.date.month, a.date.day, 8, 0, tzinfo=dt.timezone.utc))
        content = absolutize(a.body, url, f"articles/{a.slug}/") if url else a.body
        items.append(f"""    <item>
      <title>{esc(a.title)}</title>
      <link>{esc(link)}</link>
      <guid isPermaLink="true">{esc(link)}</guid>
      <pubDate>{when}</pubDate>
      <description>{esc(a.excerpt)}</description>
      <content:encoded><![CDATA[{content.replace("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
    </item>""")
    return f"""<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{esc(cfg['title'])}</title>
    <link>{esc(url or '.')}</link>
    <description>{esc(cfg['description'] or cfg['tagline'])}</description>
    <language>{esc(cfg['lang'])}</language>
{chr(10).join(items)}
  </channel>
</rss>
"""


def render_sitemap(cfg, articles, pages) -> str:
    url = cfg["url"]
    entries = [f"  <url><loc>{esc(url)}/</loc></url>"]
    entries += [f"  <url><loc>{esc(url)}/{p.slug}/</loc></url>" for p in pages]
    entries += [f"  <url><loc>{esc(url)}/articles/{a.slug}/</loc><lastmod>{a.date.isoformat()}</lastmod></url>"
                for a in articles]
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(entries) + "\n</urlset>\n")


# --------------------------------------------------------------------------
def main() -> None:
    cfg = load_config()
    print(f"Génération de « {cfg['title']} »")
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(ASSETS_DIR, DIST / "assets")

    articles, pages = collect(cfg)

    (DIST / "index.html").write_text(render_home(cfg, articles, pages), encoding="utf-8")
    for i, a in enumerate(articles):
        newer = articles[i - 1] if i > 0 else None
        older = articles[i + 1] if i + 1 < len(articles) else None
        (DIST / "articles" / a.slug / "index.html").write_text(
            render_article(cfg, a, newer, older, pages), encoding="utf-8")
    for p in pages:
        (DIST / p.slug / "index.html").write_text(render_page(cfg, p, pages), encoding="utf-8")
    (DIST / "404.html").write_text(render_404(cfg, pages), encoding="utf-8")
    (DIST / "feed.xml").write_text(render_rss(cfg, articles), encoding="utf-8")

    robots = "User-agent: *\nAllow: /\n"
    if cfg["url"]:
        (DIST / "sitemap.xml").write_text(render_sitemap(cfg, articles, pages), encoding="utf-8")
        robots += f"Sitemap: {cfg['url']}/sitemap.xml\n"
    else:
        warn("« url » est vide dans site.json : flux RSS et plan du site seront incomplets "
             "(sans effet sur GitHub Pages, qui fournit l'adresse automatiquement).")
    (DIST / "robots.txt").write_text(robots, encoding="utf-8")

    print(f"Terminé : {len(articles)} article(s), {len(pages)} page(s) → {DIST}")


if __name__ == "__main__":
    main()
