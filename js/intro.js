// The opening animation (#atv-intro in index.html, its CSS inline in <head>). A plain script,
// loaded in <head> before the page draws, so it can skip the animation before it is seen:
// it plays once per tab, on the first load, and never for visitors who ask for less motion.
// Without this file the animation still plays and clears itself (it is CSS alone); this only
// skips it, lands the logo on the nav logo, and takes the overlay out of the page after.
(function () {
  var root = document.documentElement;
  var seen = false;
  try { seen = sessionStorage.getItem('atv-intro') === '1'; sessionStorage.setItem('atv-intro', '1'); } catch (e) { /* storage off: play it */ }
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || still) { root.classList.add('atv-seen'); return; }
  var t0 = performance.now();
  document.addEventListener('DOMContentLoaded', function () {
    var intro = document.getElementById('atv-intro');
    if (!intro) return;
    // Where the logo lands: the nav logo, if it is on screen and the glide has not started.
    // Otherwise the logo stays where it is and fades with the overlay.
    var lk = intro.querySelector('.lk'), logo = document.querySelector('#nav .logo-img');
    if (lk && logo && performance.now() - t0 < 1700) {
      var a = lk.getBoundingClientRect(), b = logo.getBoundingClientRect();
      if (a.width && b.width && b.bottom > 0 && b.top < innerHeight) {
        lk.style.setProperty('--s', b.width / a.width);
        lk.style.setProperty('--tx', (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px');
        lk.style.setProperty('--ty', (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px');
      }
    }
    setTimeout(function () { intro.remove(); }, Math.max(0, 2800 - (performance.now() - t0)));
  });
})();
