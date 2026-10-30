#!/usr/bin/env python3
"""Assemble le site dans le dossier _site/.

Lancé automatiquement par GitHub (voir .github/workflows/publier.yml) à chaque dépôt de fichier.
Il :
  1. convertit chaque article Word (.docx) du dossier articles/ en Markdown (via Pandoc) ;
  2. lit les informations de chaque article (titre, date, rubrique…) ;
  3. reconstruit la liste des articles (articles.json) ;
  4. copie le tout dans _site/, qui est ce que GitHub met en ligne.

Aucune dépendance Python à installer ; Pandoc n'est nécessaire que pour les fichiers .docx.
Les fichiers dont le nom commence par « _ » sont des brouillons : ils ne sont jamais publiés.
"""
import datetime, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
WPM = 220  # mots lus par minute (même valeur que assets/carnet.js)
STATIC = ["index.html", "article.html", "ajouter.html", "assets", "images", "CNAME"]
PANDOC_FORMAT = ("markdown-smart-raw_html-link_attributes-bracketed_spans-fenced_divs-native_divs"
                 "-native_spans-header_attributes-inline_code_attributes-escaped_line_breaks"
                 "-simple_tables-multiline_tables-grid_tables")


class Erreur(Exception):
    pass


def slugify(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "sans-titre"


# ---------- lecture des « informations » en tête de fichier (--- … ---) ----------
def split_front(text):
    text = text.lstrip("﻿")
    m = re.match(r"---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(":")
        if not sep or not k.strip() or k.lstrip().startswith("#"):
            continue
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        meta[k.strip().lower()] = v
    return meta, text[m.end():]


def pick(meta, *names):
    for n in names:
        if meta.get(n):
            return meta[n]
    return ""


# ---------- conversion Word ----------
def inl_text(items):
    out = []
    for it in items:
        t = it.get("t")
        if t == "Str": out.append(it["c"])
        elif t in ("Space", "SoftBreak", "LineBreak"): out.append(" ")
        elif t == "Quoted":
            q = "« {} »" if it["c"][0]["t"] == "DoubleQuote" else "‘{}’"
            out.append(q.format(inl_text(it["c"][1])))
        elif t in ("Emph", "Strong", "Underline", "SmallCaps", "Strikeout", "Superscript", "Subscript"):
            out.append(inl_text(it["c"]))
        elif t == "Span" or t == "Link":
            out.append(inl_text(it["c"][1]))
        elif t == "Code": out.append(it["c"][1])
    return re.sub(r"\s+", " ", "".join(out)).strip()


def convert_docx(path, slug):
    """Renvoie (meta, markdown) pour un fichier Word."""
    if not shutil.which("pandoc"):
        raise Erreur("Pandoc est introuvable : impossible de convertir " + path.name)
    media = OUT / "images" / slug
    cmd = ["pandoc", str(path), "-f", "docx", "-t", PANDOC_FORMAT, "--wrap=none",
           "--markdown-headings=atx", "--shift-heading-level-by=1", "--extract-media=" + str(media)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise Erreur("Pandoc n'a pas pu lire %s : %s" % (path.name, r.stderr.strip()))
    j = subprocess.run(["pandoc", str(path), "-f", "docx", "-t", "json"], capture_output=True, text=True, encoding="utf-8")
    m = json.loads(j.stdout).get("meta", {}) if j.returncode == 0 else {}
    meta = {}
    if "title" in m: meta["titre"] = inl_text(m["title"].get("c", []))
    if "subtitle" in m: meta["chapo"] = inl_text(m["subtitle"].get("c", []))
    md = r.stdout
    # chemins d'images : relatifs au site (images/<slug>/media/xxx.png)
    md = md.replace(str(OUT) + "/", "")
    if media.exists() and not any(media.rglob("*")):
        shutil.rmtree(media)
    return meta, md


# ---------- nettoyage du Markdown produit par Pandoc ----------
def tidy(md):
    md = md.replace("\r\n", "\n")
    md = re.sub(r"\[([^\]]*)\]\{\.[a-z-]+\}", r"\1", md)       # restes de [texte]{.souligné}
    md = re.sub(r"\{width=[^}]*\}|\{height=[^}]*\}", "", md)    # dimensions d'images
    return md.strip() + "\n"


def first_image(md):
    m = re.search(r"!\[[^\]]*\]\(([^)\s]+)", md)
    return m.group(1) if m else ""


def plain(md):
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)
    s = re.sub(r"\[\^[^\]]+\]", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"[*_`>#\\]|\^", "", s)
    return re.sub(r"\s+", " ", s).strip()


def first_paragraph(md):
    for block in re.split(r"\n\s*\n", md):
        b = block.strip()
        if not b or b[0] in "#>!-|" or re.match(r"(\d+[.)]|\[\^[^\]]+\]:)\s", b):
            continue
        return plain(b)
    return ""


def shorten(t, n=230):
    if len(t) <= n:
        return t
    return re.sub(r"[,;:.\s—]+$", "", re.sub(r"\s+\S*$", "", t[:n])) + "…"


def git_date(path):
    try:
        r = subprocess.run(["git", "log", "--diff-filter=A", "--follow", "--format=%as", "--", str(path)],
                           cwd=ROOT, capture_output=True, text=True)
        lines = [l for l in r.stdout.split() if l]
        return lines[-1] if lines else ""
    except Exception:
        return ""


# ---------- collecte ----------
def sources(folder):
    """Fichiers .md et .docx, y compris dans un sous-dossier (= rubrique). Ignore les « _brouillons »."""
    found = []
    if not folder.exists():
        return found
    for p in sorted(folder.rglob("*")):
        if p.suffix.lower() not in (".md", ".docx") or not p.is_file():
            continue
        rel = p.relative_to(folder)
        if any(part.startswith(("_", ".", "~$")) for part in rel.parts):
            continue
        found.append((p, rel))
    return found


def build_one(path, rel, is_page=False):
    stem = path.stem
    m = re.match(r"^(\d{4}-\d{2}-\d{2})-(.+)$", stem)
    file_date, rest = (m.group(1), m.group(2)) if m else ("", stem)
    slug = slugify(rest) if is_page else (file_date + "-" if file_date else "") + slugify(rest)
    if path.suffix.lower() == ".docx":
        meta, md = convert_docx(path, slug)
    else:
        meta, md = split_front(path.read_text(encoding="utf-8"))
        md = md
    md = tidy(md)
    title = pick(meta, "titre", "title")
    if not title:                                   # un « # Titre » au début du texte
        h = re.match(r"\s*#\s+(.+?)\s*#*\s*\n", md)
        if h:
            title, md = h.group(1).strip(), md[h.end():].lstrip("\n")
    if not title:
        title = rest.replace("-", " ").replace("_", " ").strip().capitalize()
    date = pick(meta, "date") or file_date or git_date(path) or datetime.date.today().isoformat()
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        raise Erreur("%s : la date « %s » n'est pas au format AAAA-MM-JJ." % (rel, date))
    cat = pick(meta, "rubrique", "categorie", "catégorie", "category") or (rel.parts[0] if len(rel.parts) > 1 else "")
    sub = pick(meta, "chapo", "sous-titre", "subtitle")
    excerpt = pick(meta, "resume", "résumé", "excerpt") or sub or shorten(first_paragraph(md))
    cover = pick(meta, "vignette", "cover") or first_image(md)
    words = len(plain(md).split())
    entry = {"file": slug + ".md", "title": title, "date": date}
    if sub: entry["subtitle"] = sub
    if cat: entry["category"] = cat
    entry["excerpt"] = excerpt
    if cover: entry["cover"] = cover
    entry["minutes"] = max(1, round(words / WPM))
    # le fichier publié contient, en plus du texte, un sous-titre (chapo) géré par la liste ; pas d'en-tête
    return slug, entry, md


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "articles").mkdir(parents=True)
    (OUT / "pages").mkdir()
    for name in STATIC:
        s = ROOT / name
        if s.is_dir():
            shutil.copytree(s, OUT / name)
        elif s.exists():
            shutil.copy2(s, OUT / name)
    (OUT / ".nojekyll").write_text("")

    settings = json.loads((ROOT / "reglages.json").read_text(encoding="utf-8"))
    site_pages = settings.setdefault("pages", [])

    articles, seen = [], {}
    # en cas de doublon (même article en .docx et en .md), le fichier Word l'emporte
    for path, rel in sorted(sources(ROOT / "articles"), key=lambda x: (x[0].suffix.lower() != ".docx", str(x[1]))):
        slug, entry, md = build_one(path, rel)
        if slug in seen:
            print("AVERTISSEMENT : %s ignoré, car %s donne déjà le même article. Supprimez l'un des deux." % (rel, seen[slug]))
            continue
        seen[slug] = rel
        (OUT / "articles" / (slug + ".md")).write_text(md, encoding="utf-8")
        articles.append(entry)
    articles.sort(key=lambda a: (a["date"], a["file"]), reverse=True)

    # pages fixes (« À propos »…) : pages/xxx.md ou pages/xxx.docx ; la liste de menu vient de reglages.json
    for path, rel in sources(ROOT / "pages"):
        slug, entry, md = build_one(path, rel, is_page=True)
        (OUT / "pages" / (slug + ".md")).write_text(md, encoding="utf-8")
        if not any(p.get("slug") == slug for p in site_pages):
            site_pages.append({"slug": slug, "title": entry["title"]})

    (OUT / "articles.json").write_text(json.dumps({"site": settings, "articles": articles},
                                                  ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("%d article(s) publié(s) dans %s" % (len(articles), OUT))
    for a in articles:
        print("  %s  %s" % (a["date"], a["title"]))


if __name__ == "__main__":
    try:
        main()
    except Erreur as e:
        print("ERREUR : " + str(e), file=sys.stderr)
        sys.exit(1)
