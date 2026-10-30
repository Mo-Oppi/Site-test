/* Le Carnet — site statique, sans outil de construction.
 *
 * Ce fichier :
 *  - lit articles.json (la liste des articles) et les fichiers Markdown du dossier articles/ ;
 *  - fabrique la page d'accueil, les pages de lecture et l'outil « ajouter.html » ;
 *  - contient un petit convertisseur Markdown (titres, gras, italique, liens, images,
 *    listes, citations, notes de bas de page) et la typographie française.
 */
(function () {
  'use strict';

  var NB = ' ';
  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var ABBR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var WPM = 220; // mots lus par minute

  var d = document;
  function $(s, r) { return (r || d).querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slugify(s) {
    s = String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sans-titre';
  }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function dayLabel(dt) { return dt.getDate() === 1 ? '1er' : String(dt.getDate()); }
  function longDate(dt) { return dayLabel(dt) + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getFullYear(); }
  function shortDate(dt) { return dayLabel(dt) + ' ' + ABBR[dt.getMonth()]; }
  function plainText(html) {
    return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function minutesFor(html) {
    return Math.max(1, Math.round(plainText(html).split(' ').length / WPM));
  }
  function safeUrl(u) {
    u = String(u).trim();
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return /^(https?:|mailto:)/i.test(u) ? u : '#';
    return u;
  }

  /* ------------------------------------------------------------------ *
   * Typographie française : espaces insécables avant : ; ! ? et dans « »
   * ------------------------------------------------------------------ */
  function typo(html) {
    var parts = html.split(/(<[^>]+>)/), skip = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.charAt(0) === '<') {
        if (/^<(pre|code)\b/i.test(p)) skip++;
        else if (/^<\/(pre|code)\b/i.test(p)) skip = Math.max(0, skip - 1);
        continue;
      }
      if (skip || !p) continue;
      p = p.replace(/&nbsp;/g, NB);
      p = p.replace(/([^\s ])[  ]+([;!?:])/g, '$1' + NB + '$2');
      if (i > 0) p = p.replace(/^ +([;!?:»])/, NB + '$1');
      p = p.replace(/«[  ]*/g, '«' + NB).replace(/[  ]*»/g, NB + '»');
      parts[i] = p;
    }
    return parts.join('');
  }

  /* ------------------------------------------------------------------ *
   * Markdown → HTML
   * ------------------------------------------------------------------ */
  function inline(s, ctx) {
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0001' + (codes.length - 1) + '\u0001'; });
    s = s.replace(/\\([\\*_\[\](){}#+.!|~^<>-])/g, function (_, c) { codes.push(c); return '\u0003' + (codes.length - 1) + '\u0003'; });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;.*?&quot;)?\)/g, function (_, alt, src) {
      return '<img src="' + safeUrl(src) + '" alt="' + alt + '" loading="lazy" decoding="async">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      var url = safeUrl(u), ext = /^https?:/i.test(url);
      return '<a href="' + url + '"' + (ext ? ' rel="noopener" target="_blank"' : '') + '>' + t + '</a>';
    });
    s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
    s = s.replace(/\^([^\s^]+?)\^/g, '<sup>$1</sup>');
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    if (ctx) {
      s = s.replace(/\[\^([\w-]+)\]/g, function (m, id) {
        if (!Object.prototype.hasOwnProperty.call(ctx.defs, id)) return m;
        var n = ctx.order.indexOf(id);
        if (n < 0) { ctx.order.push(id); n = ctx.order.length - 1; }
        return '<a href="#fn-' + id + '" id="fnref-' + id + '" class="footnote-ref" role="doc-noteref"><sup>' + (n + 1) + '</sup></a>';
      });
    }
    s = s.replace(/\u0003(\d+)\u0003/g, function (_, i) { return esc(codes[+i]); });
    return s.replace(/\u0001(\d+)\u0001/g, function (_, i) { return '<code>' + esc(codes[+i]) + '</code>'; });
  }

  function renderMarkdown(src) {
    var all = String(src).replace(/\r\n?/g, '\n').split('\n'), defs = {}, lines = [], i;
    for (i = 0; i < all.length; i++) {
      var dm = /^\[\^([\w-]+)\]:\s*(.*)$/.exec(all[i]);
      if (dm) {
        var t = dm[2];
        while (i + 1 < all.length && /^(?: {2,}|\t)\S/.test(all[i + 1])) t += ' ' + all[++i].trim();
        defs[dm[1]] = t;
      } else lines.push(all[i]);
    }

    var ctx = { defs: defs, order: [] };
    var out = [], para = [], list = null, quote = [], code = null;

    function flush() {
      if (para.length) {
        var raw = para.join('\n');
        var fig = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(raw.trim());
        if (fig) {
          out.push('<figure><img src="' + safeUrl(esc(fig[2])) + '" alt="' + esc(fig[1]) + '" loading="lazy" decoding="async">' +
            (fig[3] ? '<figcaption>' + esc(fig[3]) + '</figcaption>' : '') + '</figure>');
        } else {
          out.push('<p>' + inline(raw.replace(/ {2,}\n/g, '\u0002\n'), ctx).replace(/\u0002/g, '<br>') + '</p>');
        }
        para = [];
      }
      if (list) {
        out.push('<' + list.t + '>' + list.items.map(function (x) { return '<li>' + inline(x, ctx) + '</li>'; }).join('') + '</' + list.t + '>');
        list = null;
      }
      if (quote.length) {
        var paras = [], cur = [];
        quote.forEach(function (q) { if (q === '') { if (cur.length) paras.push(cur.join(' ')); cur = []; } else cur.push(q); });
        if (cur.length) paras.push(cur.join(' '));
        out.push('<blockquote>' + paras.map(function (x) { return '<p>' + inline(x, ctx) + '</p>'; }).join('') + '</blockquote>');
        quote = [];
      }
    }

    for (i = 0; i < lines.length; i++) {
      var l = lines[i], m;
      if (code) {
        if (/^```/.test(l)) { out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); code = null; } else code.push(l);
        continue;
      }
      if (/^```/.test(l)) { flush(); code = []; continue; }
      if (!l.trim()) { if (quote.length) quote.push(''); else flush(); continue; }
      if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] || '')) {
        flush();
        var cells = function (r) { return r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(function (c) { return c.trim(); }); };
        var head = cells(l), rows = [];
        for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
        i--;
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c, ctx) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c, ctx) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
        continue;
      }
      if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
        flush();
        var lv = m[1].length <= 2 ? 2 : m[1].length === 3 ? 3 : 4;
        out.push('<h' + lv + ' id="' + slugify(m[2]) + '">' + inline(m[2], ctx) + '</h' + lv + '>');
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push('<hr>'); continue; }
      if ((m = /^>\s?(.*)$/.exec(l))) { if (!quote.length) flush(); quote.push(m[1]); continue; }
      if ((m = /^\s{0,3}([-*+]|\d+[.)])\s+(.*)$/.exec(l))) {
        var tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (!list || list.t !== tag) { flush(); list = { t: tag, items: [] }; }
        list.items.push(m[2]);
        continue;
      }
      if (list && /^\s{2,}\S/.test(l)) { list.items[list.items.length - 1] += ' ' + l.trim(); continue; }
      if (list || quote.length) flush();
      para.push(l.replace(/^\s+/, ''));
    }
    if (code) out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
    flush();

    if (ctx.order.length) {
      out.push('<aside class="footnotes" role="doc-endnotes"><h2 class="notes-title">Notes</h2><ol>' +
        ctx.order.map(function (id) {
          return '<li id="fn-' + id + '"><p>' + inline(defs[id], null) + ' <a href="#fnref-' + id + '" class="footnote-back" role="doc-backlink">↩︎</a></p></li>';
        }).join('') + '</ol></aside>');
    }
    return typo(out.join('\n'));
  }

  /* ------------------------------------------------------------------ *
   * Word (presse-papiers HTML) → Markdown — pour l'outil « ajouter »
   * ------------------------------------------------------------------ */
  function htmlToMarkdown(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var meta = { title: '', subtitle: '' };
    var defs = [], labels = {};

    function norm(s) {
      return s.replace(/ /g, ' ').replace(/\s+/g, ' ').replace(/\u0002 /g, '\u0002').trim().replace(/\u0002/g, '  \n');
    }
    function wrap(s, mark) {
      var t = s.trim();
      if (!t || t.indexOf(mark) === 0) return s;
      return s.match(/^\s*/)[0] + mark + t + mark + s.match(/\s*$/)[0];
    }
    function noteLabel(id) {
      if (!labels[id]) labels[id] = String(Object.keys(labels).length + 1);
      return labels[id];
    }

    // Notes de bas de page de Word : on les récupère puis on les retire du corps
    [].forEach.call(doc.querySelectorAll('[style*="mso-element:footnote"]'), function (n) {
      if (/footnote-list/i.test(n.getAttribute('style') || '')) return;
      var id = n.getAttribute('id') || '', c = n.cloneNode(true);
      [].forEach.call(c.querySelectorAll('a[style*="mso-footnote-id"]'), function (a) { a.remove(); });
      defs.push({ id: id, text: (c.textContent || '').replace(/\s+/g, ' ').trim() });
    });
    [].forEach.call(doc.querySelectorAll('[style*="mso-element:footnote-list"]'), function (n) { n.remove(); });

    function inl(n) {
      if (n.nodeType === 3) return n.nodeValue.replace(/[\r\n\t ]+/g, ' ');
      if (n.nodeType !== 1) return '';
      var tag = n.tagName.toLowerCase(), st = n.getAttribute('style') || '';
      if (/mso-list:\s*Ignore/i.test(st) || /^(script|style|head|xml|o:p|title|meta|link)$/.test(tag)) return '';
      if (tag === 'a' && /mso-footnote-id:\s*([\w-]+)/i.test(st)) return '[^' + noteLabel(/mso-footnote-id:\s*([\w-]+)/i.exec(st)[1]) + ']';
      if (tag === 'br') return '\u0002';
      if (tag === 'img') {
        var alt = (n.getAttribute('alt') || '').replace(/[\[\]]/g, '');
        return '![' + alt + '](images/NOM-DE-L-IMAGE.jpg)';
      }
      var inner = [].map.call(n.childNodes, inl).join('');
      if (tag === 'b' || tag === 'strong') return wrap(inner, '**');
      if (tag === 'i' || tag === 'em') return wrap(inner, '*');
      if (tag === 'a') {
        var href = n.getAttribute('href') || '';
        if (!/^(https?:|mailto:)/i.test(href) || !inner.trim()) return inner;
        return '[' + inner.trim() + '](' + href + ')';
      }
      if (/(?:^|;)\s*font-weight:\s*(bold|[6-9]00)/i.test(st)) inner = wrap(inner, '**');
      if (/(?:^|;)\s*font-style:\s*italic/i.test(st)) inner = wrap(inner, '*');
      return inner;
    }

    var out = [];
    function push(kind, s) { if (s) out.push({ k: kind, s: s }); }
    function block(n) {
      if (n.nodeType === 3) { push('p', norm(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase(), cls = n.getAttribute('class') || '', st = n.getAttribute('style') || '';
      if (/^(script|style|head|title|meta|link|xml)$/.test(tag)) return;
      if (/^h[1-6]$/.test(tag)) {
        var lv = +tag.charAt(1);
        push('p', (lv === 1 ? '## ' : lv === 2 ? '### ' : '#### ') + norm(inl(n)));
        return;
      }
      if (tag === 'p') {
        var txt = norm(inl(n));
        if (/MsoTitle/.test(cls)) { if (!meta.title) meta.title = txt; return; }
        if (/MsoSubtitle/.test(cls)) { if (!meta.subtitle) meta.subtitle = txt; return; }
        if (/MsoQuote|MsoIntenseQuote/.test(cls)) { push('p', '> ' + txt); return; }
        if (/mso-list/i.test(st) && !/mso-list:\s*none/i.test(st)) {
          var bullet = n.querySelector('[style*="mso-list:Ignore"]');
          var ordered = bullet && /^\s*[\dA-Za-z]{1,3}[.)]/.test(bullet.textContent.replace(/ /g, ' '));
          push(ordered ? 'ol' : 'ul', txt);
          return;
        }
        push('p', txt);
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        [].forEach.call(n.children, function (li, i) { push(tag, norm(inl(li))); });
        out.push({ k: 'end', s: '' });
        return;
      }
      if (tag === 'blockquote') { push('p', '> ' + norm(inl(n))); return; }
      if (tag === 'img') { push('p', inl(n)); return; }
      [].forEach.call(n.childNodes, block);
    }
    block(doc.body);

    var chunks = [], num = 0, prev = '';
    out.forEach(function (o) {
      if (o.k === 'end') { prev = ''; return; }
      if (o.k === 'ul' || o.k === 'ol') {
        num = (prev === o.k) ? num + 1 : 1;
        var line = (o.k === 'ol' ? num + '. ' : '- ') + o.s;
        if (prev === o.k) chunks[chunks.length - 1] += '\n' + line; else chunks.push(line);
      } else chunks.push(o.s);
      prev = o.k;
    });
    var md = chunks.join('\n\n');
    if (defs.length) {
      md += '\n\n' + defs.map(function (n) { return '[^' + (labels[n.id] || n.id) + ']: ' + n.text; }).join('\n');
    }
    return { markdown: md, title: meta.title, subtitle: meta.subtitle };
  }

  /* ------------------------------------------------------------------ *
   * Données et éléments communs
   * ------------------------------------------------------------------ */
  function getJSON() {
    return fetch('articles.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('articles.json est introuvable (code ' + r.status + ').');
      return r.json();
    });
  }
  function getText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('Fichier introuvable : ' + url + ' (code ' + r.status + ').');
      return r.text();
    });
  }
  function fail(err) {
    var main = $('#contenu');
    var local = location.protocol === 'file:';
    main.innerHTML = '<div class="notfound"><p class="kicker">Oups</p><h1>Le contenu n’a pas pu être chargé.</h1><p>' +
      esc(err && err.message ? err.message : String(err)) + '</p>' +
      (local ? '<p>Vous avez ouvert le fichier directement depuis votre ordinateur : le navigateur interdit alors la lecture des articles. Ouvrez le site depuis son adresse GitHub, ou lancez <code>python3 -m http.server</code> dans le dossier puis visitez <code>http://localhost:8000</code>.</p>' : '') +
      '</div>';
  }

  /* Préférences de lecture (mémorisées dans ce navigateur) */
  var SCALES = [0.9, 1, 1.12, 1.28, 1.5];
  var SCALE_NAMES = ['Petit', 'Normal', 'Grand', 'Très grand', 'Maximum'];
  var prefs = { size: 1, justify: true };
  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem('carnet.prefs') || '{}');
      if (typeof p.size === 'number' && p.size >= 0 && p.size < SCALES.length) prefs.size = p.size;
      if (typeof p.justify === 'boolean') prefs.justify = p.justify;
    } catch (e) { /* stockage indisponible : valeurs par défaut */ }
  }
  function savePrefs() { try { localStorage.setItem('carnet.prefs', JSON.stringify(prefs)); } catch (e) { /* ignoré */ } }
  function applyPrefs() {
    d.documentElement.style.setProperty('--scale', SCALES[prefs.size]);
    d.documentElement.setAttribute('data-justify', prefs.justify ? 'on' : 'off');
  }

  function buildReader(nav) {
    var btn = d.createElement('button');
    btn.type = 'button'; btn.className = 'reader-btn';
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'reader-pop');
    btn.setAttribute('aria-label', 'Réglages de lecture'); btn.title = 'Réglages de lecture';
    btn.innerHTML = '<span aria-hidden="true">A<small>a</small></span>';
    nav.appendChild(btn);

    var pop = d.createElement('div');
    pop.id = 'reader-pop'; pop.className = 'reader-pop'; pop.hidden = true;
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Réglages de lecture');
    pop.innerHTML = '<label for="r-size">Taille du texte</label>' +
      '<div class="size-row"><span class="a-s" aria-hidden="true">A</span>' +
      '<input id="r-size" type="range" min="0" max="' + (SCALES.length - 1) + '" step="1">' +
      '<span class="a-l" aria-hidden="true">A</span></div>' +
      '<label class="check"><input id="r-just" type="checkbox"> Texte justifié</label>' +
      '<button type="button" class="linkish" id="r-reset">Réinitialiser</button>';
    $('.masthead').appendChild(pop);

    var size = $('#r-size', pop), just = $('#r-just', pop);
    function sync() {
      size.value = prefs.size; size.setAttribute('aria-valuetext', SCALE_NAMES[prefs.size]); just.checked = prefs.justify;
    }
    function set() { applyPrefs(); savePrefs(); sync(); }
    size.addEventListener('input', function () { prefs.size = +size.value; set(); });
    just.addEventListener('change', function () { prefs.justify = just.checked; set(); });
    $('#r-reset', pop).addEventListener('click', function () { prefs.size = 1; prefs.justify = true; set(); });

    function toggle(open) {
      pop.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); toggle(pop.hidden); });
    d.addEventListener('click', function (ev) { if (!pop.hidden && !pop.contains(ev.target)) toggle(false); });
    d.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !pop.hidden) { toggle(false); btn.focus(); } });
    sync();
  }

  /* Encadré affiché au survol du titre du site (à la manière des aperçus de Wikipédia) */
  function buildHovercard(site) {
    var hc = $('#hovercard'), brand = $('.brand');
    if (!hc || !brand) return;
    var h = site.hovercard;
    if (!h) { hc.remove(); return; }
    var link = h.link && /^https?:\/\//i.test(h.link.url || '') ? h.link : null;
    hc.innerHTML = typo(
      '<p class="hc-title">' + esc(h.title || '') + '</p>' +
      (h.subtitle ? '<p class="hc-sub">' + esc(h.subtitle) + '</p>' : '') +
      [].concat(h.text || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      (link ? '<p class="hc-foot"><a href="' + esc(link.url) + '" target="_blank" rel="noopener">' + esc(link.label || 'En savoir plus') + '</a></p>' : ''));

    var wm = $('.wordmark', brand);
    // Écran tactile : un premier appui ouvre l'encadré, un second ouvre l'accueil.
    wm.addEventListener('click', function (ev) {
      if (ev.pointerType === 'touch' && !brand.classList.contains('open')) { ev.preventDefault(); brand.classList.add('open'); }
    });
    d.addEventListener('click', function (ev) { if (!brand.contains(ev.target)) brand.classList.remove('open'); });
    d.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { brand.classList.remove('open'); brand.classList.add('dismissed'); } });
    brand.addEventListener('mouseleave', function () { brand.classList.remove('dismissed'); });
    brand.addEventListener('focusout', function () { brand.classList.remove('dismissed'); });
  }

  function randomSlug(list, exclude) {
    var pool = list.filter(function (a) { return a.slug !== exclude; });
    if (!pool.length) pool = list;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].slug : '';
  }

  function applySite(site, current, list, exclude) {
    site = site || {};
    var title = site.title || 'La Légende';
    [].forEach.call(d.querySelectorAll('[data-site="title"]'), function (el) { el.textContent = title; });
    var nav = $('#nav');
    if (nav) {
      nav.innerHTML = (site.pages || []).map(function (p) {
        return '<a href="article.html?p=' + encodeURIComponent(p.slug) + '"' + (current === p.slug ? ' aria-current="page"' : '') + '>' + esc(p.title) + '</a>';
      }).join('');
      if (list && list.length) {
        var rnd = d.createElement('a');
        rnd.id = 'random-link'; rnd.textContent = 'Au hasard'; rnd.title = 'Ouvrir un article au hasard';
        var pick = function () { var s = randomSlug(list, exclude); rnd.href = s ? 'article.html?a=' + encodeURIComponent(s) : 'index.html'; };
        pick();
        ['mouseenter', 'focus', 'click'].forEach(function (ev) { rnd.addEventListener(ev, pick); });
        nav.appendChild(rnd);
      }
      if (d.body.getAttribute('data-page') === 'article') buildReader(nav);
    }
    buildHovercard(site);
    var f = $('.site-footer');
    if (f) {
      f.innerHTML = '<p>© ' + new Date().getFullYear() + (site.author ? ' ' + esc(site.author) : '') +
        (site.footer ? ' · ' + esc(site.footer) : '') + '</p>';
      f.appendChild(buildBalance());
    }
    return title;
  }
  /* ------------------------------------------------------------------ *
   * Easter egg : la balance de la justice (pied de page)
   *  - au survol, elle se déconstruit ; à la sortie, elle se reconstruit ;
   *  - maintenue 5 secondes, elle fait apparaître des étoiles pendant 3 secondes.
   * ------------------------------------------------------------------ */
  function buildBalance() {
    var box = d.createElement('div');
    box.className = 'balance';
    box.setAttribute('aria-hidden', 'true');
    function part(inner, dx, dy, r) { return '<g class="part" style="--dx:' + dx + 'px;--dy:' + dy + 'px;--r:' + r + 'deg">' + inner + '</g>'; }
    var pan = function (x) { return '<path d="M' + (x - 8) + ' 33 Q' + x + ' 42 ' + (x + 8) + ' 33 Z"/>'; };
    box.innerHTML = '<svg viewBox="0 0 60 56" focusable="false">' +
      part('<path d="M16 52h28M22 52c1-4 3-5 8-5s7 1 8 5"/>', 0, 12, 0) +
      part('<path d="M30 47V10"/><circle cx="30" cy="7" r="2.2"/>', 0, -14, 25) +
      part('<path d="M6 14h48"/>', 0, -9, -35) +
      part('<path d="M6 14 0 33M6 14 12 33"/>' + pan(6), -17, 8, -40) +
      part('<path d="M54 14 48 33M54 14 60 33"/>' + pan(54), 17, 11, 45) +
      '</svg>';
    var timer = null;
    box.addEventListener('pointerenter', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { timer = null; showStars(); }, 2000);
    });
    box.addEventListener('pointerleave', function () { clearTimeout(timer); timer = null; });
    return box;
  }
  function showStars() {
    if ($('.stars')) return;
    var layer = d.createElement('div');
    layer.className = 'stars';
    layer.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 44; i++) {
      var st = d.createElement('span'), size = 8 + Math.random() * 20;
      st.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;top:' + (Math.random() * 100).toFixed(1) + '%;' +
        'width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px;animation-delay:' + (Math.random() * 0.8).toFixed(2) + 's';
      layer.appendChild(st);
    }
    d.body.appendChild(layer);
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 3000);
  }

  function sortedArticles(data) {
    return (data.articles || []).map(function (a) {
      var c = {}; for (var k in a) c[k] = a[k];
      c._d = parseDate(a.date); c.slug = String(a.file || '').replace(/\.md$/, '');
      return c;
    }).filter(function (a) { return a._d && a.slug; }).sort(function (a, b) {
      return (b._d - a._d) || (a.title < b.title ? 1 : -1);
    });
  }
  function setMeta(sel, attr, value) {
    var el = $(sel);
    if (!el) { el = d.createElement('meta'); var m = /\[(name|property)="([^"]+)"\]/.exec(sel); el.setAttribute(m[1], m[2]); d.head.appendChild(el); }
    el.setAttribute(attr, value);
  }

  /* ------------------------------------------------------------------ *
   * Page d'accueil
   * ------------------------------------------------------------------ */
  function renderHome(data) {
    var site = data.site || {};
    var list = sortedArticles(data);
    var title = applySite(site, '', list, '');
    d.title = title + (site.tagline ? ' — ' + site.tagline : '');
    setMeta('meta[name="description"]', 'content', site.description || site.tagline || '');

    var cats = [], seen = {};
    list.forEach(function (a) {
      if (a.category && !seen[slugify(a.category)]) { seen[slugify(a.category)] = 1; cats.push(a.category); }
    });

    var filters = '';
    if (cats.length > 1) {
      filters = '<div class="filters" role="group" aria-label="Filtrer par rubrique">' +
        '<button type="button" class="chip" data-filter="*" aria-pressed="true">Tout</button>' +
        cats.map(function (c) { return '<button type="button" class="chip" data-filter="' + esc(slugify(c)) + '" aria-pressed="false">' + esc(c) + '</button>'; }).join('') + '</div>';
    }
    var rows = [], last = '';
    list.forEach(function (a) {
      var key = a._d.getFullYear() + '-' + a._d.getMonth();
      if (key !== last) {
        var ml = MONTHS[a._d.getMonth()];
        rows.push('<li class="month" data-month>' + ml.charAt(0).toUpperCase() + ml.slice(1) + ' ' + a._d.getFullYear() + '</li>');
        last = key;
      }
      rows.push('<li class="entry" data-cat="' + esc(a.category ? slugify(a.category) : '') + '"><a href="article.html?a=' + encodeURIComponent(a.slug) + '">' +
        '<div class="meta"><time datetime="' + esc(a.date) + '">' + shortDate(a._d) + '</time>' + (a.category ? '<span class="cat">' + esc(a.category) + '</span>' : '') + '</div>' +
        '<div class="txt"><h2>' + esc(a.title) + '</h2>' + (a.excerpt ? '<p>' + esc(a.excerpt) + '</p>' : '') +
        (a.minutes ? '<span class="read">' + a.minutes + ' min de lecture</span>' : '') + '</div>' +
        (a.cover ? '<img class="thumb" src="' + esc(safeUrl(a.cover)) + '" alt="" loading="lazy" decoding="async">' : '') +
        '</a></li>');
    });

    $('#contenu').className = 'home';
    $('#contenu').innerHTML = '<section class="intro"><p class="lede">' + esc(site.tagline || '') + '</p></section>' + filters +
      (rows.length ? '<ol class="feed">' + typo(rows.join('')) + '</ol>' : '<p class="empty">Aucun article pour le moment.</p>');

    // apparition douce
    var entries = [].slice.call(d.querySelectorAll('.entry'));
    var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (entries.length && 'IntersectionObserver' in window && !calm) {
      var io = new IntersectionObserver(function (items) {
        items.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -6% 0px' });
      entries.forEach(function (el) {
        if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('reveal'); io.observe(el); }
      });
    }
    // filtres
    var bar = $('.filters'), feed = $('.feed');
    if (bar && feed) {
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('.chip'); if (!b) return;
        [].forEach.call(bar.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
        var f = b.getAttribute('data-filter'), label = null, count = 0, items = feed.children;
        for (var i = 0; i < items.length; i++) {
          var li = items[i];
          if (li.hasAttribute('data-month')) { if (label) label.hidden = count === 0; label = li; count = 0; }
          else { var show = f === '*' || li.getAttribute('data-cat') === f; li.hidden = !show; if (show) { count++; li.classList.add('in'); } }
        }
        if (label) label.hidden = count === 0;
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Page de lecture (article ou page fixe)
   * ------------------------------------------------------------------ */
  function renderArticle(data) {
    var q = new URLSearchParams(location.search);
    var isPage = q.has('p'), slug = q.get('a') || q.get('p') || '';
    var site = data.site || {};
    var list = sortedArticles(data), entry = null, idx = -1;
    var siteTitle = applySite(site, isPage ? slug : '', list, isPage ? '' : slug);
    if (isPage) {
      (site.pages || []).forEach(function (p) { if (p.slug === slug) entry = p; });
    } else {
      list.forEach(function (a, i) { if (a.slug === slug) { entry = a; idx = i; } });
    }
    if (!entry) { fail(new Error('Cet article n’existe pas (ou plus).')); return; }

    var url = isPage ? 'pages/' + entry.slug + '.md' : 'articles/' + entry.file;
    getText(url).then(function (md) {
      var body = renderMarkdown(md);
      var excerpt = entry.excerpt || site.description || '';
      d.title = entry.title + ' — ' + siteTitle;
      setMeta('meta[name="description"]', 'content', excerpt);
      setMeta('meta[property="og:title"]', 'content', entry.title);
      setMeta('meta[property="og:description"]', 'content', excerpt);

      var min = entry.minutes || minutesFor(body);
      var byline = isPage ? '' : '<p class="byline"><time datetime="' + esc(entry.date) + '">' + longDate(entry._d) + '</time> · ' + min + ' min de lecture' +
        (site.author ? ' · ' + esc(site.author) : '') + '</p>';
      var pager = '';
      if (!isPage) {
        var newer = idx > 0 ? list[idx - 1] : null, older = idx + 1 < list.length ? list[idx + 1] : null;
        var cell = function (a, cls, lbl) {
          return a ? '<a class="' + cls + '" href="article.html?a=' + encodeURIComponent(a.slug) + '"><span class="lbl">' + lbl + '</span><strong>' + esc(a.title) + '</strong></a>' : '<span></span>';
        };
        if (newer || older) pager = '<nav class="pager" aria-label="Autres articles">' + typo(cell(older, 'prev', '← Plus ancien') + cell(newer, 'next', 'Plus récent →')) + '</nav>';
      }
      $('#contenu').innerHTML =
        '<div class="progress" aria-hidden="true"></div>' +
        '<div class="back-row"><a class="back" href="index.html">← Tous les articles</a></div>' +
        '<article class="article"><header class="a-head">' +
        (isPage ? '' : '<p class="kicker">' + esc(entry.category || 'Article') + '</p>') +
        '<h1>' + typo(esc(entry.title)) + '</h1>' +
        (entry.subtitle ? '<p class="standfirst">' + typo(esc(entry.subtitle)) + '</p>' : '') +
        byline + '<span class="rule" aria-hidden="true"></span></header>' +
        '<div class="prose">' + body + '</div></article>' + pager;

      var prog = $('.progress'), art = $('.article');
      var update = function () {
        var r = art.getBoundingClientRect(), total = r.height - window.innerHeight;
        prog.style.setProperty('--p', total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1);
      };
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
      if (location.hash) { var t = d.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) t.scrollIntoView(); }
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ *
   * Outil « ajouter un article »
   * ------------------------------------------------------------------ */
  function initAdd(data) {
    applySite(data.site, '', sortedArticles(data), '');
    var f = {};
    ['title', 'date', 'cat', 'sub', 'cover', 'exc', 'body', 'paste', 'name', 'md', 'preview', 'warn', 'cats'].forEach(function (k) { f[k] = $('#f-' + k) || $('#o-' + k); });
    var excDirty = false;

    f.date.value = new Date().toISOString().slice(0, 10);
    f.cats.innerHTML = [].concat((data.articles || []).map(function (a) { return a.category; }))
      .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; })
      .map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');

    function autoExcerpt(html) {
      var m = /<p>([\s\S]*?)<\/p>/.exec(html.replace(/<a[^>]*footnote-ref[^>]*>[\s\S]*?<\/a>/g, ''));
      var t = m ? plainText(m[1]) : '';
      if (t.length > 230) t = t.slice(0, 230).replace(/\s+\S*$/, '').replace(/[,;:.\s—]+$/, '') + '…';
      return t;
    }
    function update() {
      var html = renderMarkdown(f.body.value);
      f.preview.innerHTML = '<h1 class="pv-title">' + typo(esc(f.title.value || 'Titre de l’article')) + '</h1>' +
        (f.sub.value ? '<p class="standfirst">' + typo(esc(f.sub.value)) + '</p>' : '') + html;
      if (!excDirty) f.exc.value = autoExcerpt(html);

      var date = f.date.value, slug = slugify(f.title.value);
      var file = (date || '0000-00-00') + '-' + slug + '.md';
      f.name.value = 'articles/' + file;
      var fm = ['---', 'titre: ' + JSON.stringify(f.title.value.trim())];
      if (f.sub.value.trim()) fm.push('chapo: ' + JSON.stringify(f.sub.value.trim()));
      fm.push('date: ' + date);
      if (f.cat.value.trim()) fm.push('rubrique: ' + JSON.stringify(f.cat.value.trim()));
      if (f.exc.value.trim() && f.exc.value.trim() !== autoExcerpt(html)) fm.push('resume: ' + JSON.stringify(f.exc.value.trim()));
      if (f.cover.value.trim()) fm.push('vignette: ' + f.cover.value.trim());
      fm.push('---', '');
      f.md.value = fm.join('\n') + '\n' + f.body.value.replace(/\s+$/, '') + '\n';
      var replaced = (data.articles || []).some(function (a) { return a.file === file; });

      var problems = [];
      if (!f.title.value.trim()) problems.push('Ajoutez un titre.');
      if (!date) problems.push('Choisissez une date.');
      if (!f.body.value.trim()) problems.push('Le texte est vide.');
      if (/NOM-DE-L-IMAGE/.test(f.body.value)) problems.push('Remplacez « NOM-DE-L-IMAGE.jpg » par le nom réel de votre image (déposée dans le dossier images).');
      if (replaced) problems.push('Un article portant ce nom existe déjà : il sera remplacé.');
      f.warn.innerHTML = problems.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    }

    ['title', 'date', 'cat', 'sub', 'cover', 'body'].forEach(function (k) { f[k].addEventListener('input', update); });
    f.exc.addEventListener('input', function () { excDirty = true; update(); });

    // Coller depuis Word
    function onPaste(ev) {
      var cd = ev.clipboardData; if (!cd) return;
      var html = cd.getData('text/html'), text = cd.getData('text/plain');
      ev.preventDefault();
      if (html) {
        var r = htmlToMarkdown(html);
        f.body.value = r.markdown;
        if (r.title && !f.title.value) f.title.value = r.title;
        if (r.subtitle && !f.sub.value) f.sub.value = r.subtitle;
      } else {
        f.body.value = text.replace(/\r\n?/g, '\n').replace(/\n(?!\n)/g, '\n\n');
      }
      update();
      f.paste.textContent = 'Texte converti. Vérifiez-le dans la zone « Texte » ci-dessous.';
    }
    f.paste.addEventListener('paste', onPaste);

    [].forEach.call(d.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var src = $('#' + btn.getAttribute('data-copy'));
        var done = function () { var t = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(function () { btn.textContent = t; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(src.value).then(done, function () { src.select(); d.execCommand('copy'); done(); });
        else { src.select(); d.execCommand('copy'); done(); }
      });
    });
    update();
  }

  /* ------------------------------------------------------------------ */
  window.Carnet = { renderMarkdown: renderMarkdown, htmlToMarkdown: htmlToMarkdown, typo: typo };

  loadPrefs();
  applyPrefs();

  var page = d.body && d.body.getAttribute('data-page');
  if (page) {
    getJSON().then(function (data) {
      if (page === 'home') renderHome(data);
      else if (page === 'article') renderArticle(data);
      else if (page === 'add') initAdd(data);
    }).catch(fail);
  }
})();
