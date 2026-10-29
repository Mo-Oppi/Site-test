/* Le Carnet — petits comportements facultatifs : le site fonctionne sans JavaScript. */
(function () {
  var d = document;

  /* Apparition douce des entrées de la liste au défilement */
  var entries = [].slice.call(d.querySelectorAll('.entry'));
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (entries.length && 'IntersectionObserver' in window && !calm) {
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    entries.forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add('reveal');
        io.observe(el);
      }
    });
  }

  /* Filtre par rubrique */
  var bar = d.querySelector('.filters');
  var feed = d.querySelector('.feed');
  if (bar && feed) {
    bar.hidden = false;
    var apply = function (f) {
      var label = null, count = 0, items = feed.children;
      for (var i = 0; i < items.length; i++) {
        var li = items[i];
        if (li.hasAttribute('data-month')) {
          if (label) label.hidden = count === 0;
          label = li; count = 0;
        } else {
          var show = f === '*' || li.getAttribute('data-cat') === f;
          li.hidden = !show;
          if (show) { count++; li.classList.add('in'); }
        }
      }
      if (label) label.hidden = count === 0;
    };
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('.chip');
      if (!b) return;
      [].forEach.call(bar.querySelectorAll('.chip'), function (c) {
        c.setAttribute('aria-pressed', c === b ? 'true' : 'false');
      });
      apply(b.getAttribute('data-filter'));
    });
  }

  /* Barre de progression de lecture */
  var prog = d.querySelector('.progress');
  var art = d.querySelector('.article');
  if (prog && art) {
    var update = function () {
      var r = art.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      prog.style.setProperty('--p', p);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }
})();
