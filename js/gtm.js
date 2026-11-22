// Google Tag Manager (container GTM-M2Q3D6CV, account "Atvents"), which loads Google
// Analytics 4 (G-PV3S6RRGKQ). Google's usual snippet is an inline script; it lives in this
// file instead so the CSP can keep scripts to files (server/http.mjs, securityHeaders). It runs
// only on the live site, atvents.com, so local copies and the staging Worker send nothing.
// The static build's CSP lets Google's tag and analytics hosts in (analytics option).
(function () {
  var host = location.hostname;
  if (host !== 'atvents.com' && host !== 'www.atvents.com') return;
  var id = 'GTM-M2Q3D6CV';
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtm.js?id=' + id;
  document.head.appendChild(s);
})();
