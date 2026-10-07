// The page around a screen or a decoration layer the remote's agent wrote (lib/remote-ops.ts: design.scenes,
// design.decor). The wall and the remote put it in an <iframe sandbox="allow-scripts" srcdoc>, so its code runs in a
// throwaway origin: it can't reach the wall's page, its storage or the remote's code. The CSP below lets it load only
// fonts, the wall's own files, pictures in the wall's storage and libraries from two public CDNs (no fetch at all);
// a CSP the agent's HTML adds can only narrow it.
(function () {
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  /** html: the agent's page; o.store: the origin of the wall's picture storage; o.lang: he or en; o.transparent: the
   *  decoration layer (no background of its own). */
  window.customDoc = function (html, o) {
    o = o || {};
    var self = location.origin, store = /^https:\/\/[\w.-]+$/.test(o.store || '') ? ' ' + o.store : '';
    var csp = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
      "style-src 'unsafe-inline' " + self + " https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; " +
      'font-src ' + self + ' https://fonts.gstatic.com data:; img-src ' + self + store + ' data: blob:; media-src ' + self + store + ' blob:';
    // Its own document tags go: the page below is the document, with the CSP first.
    var body = String(html || '').replace(/<!doctype[^>]*>/ig, '').replace(/<\/?(html|head|body)\b[^>]*>/ig, '');
    var en = o.lang === 'en';
    return '<!doctype html><html lang="' + (en ? 'en' : 'he') + '" dir="' + (en ? 'ltr' : 'rtl') + '"><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="' + esc(csp) + '">' +
      '<link rel="stylesheet" href="' + self + '/assets/fonts/v4/fonts.css">' +
      '<style>html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden;font-family:Heebo,system-ui,sans-serif;color:#e6f1ff;' +
      (o.transparent ? 'background:transparent' : 'background:#040914') + '}*{box-sizing:border-box}</style></head><body>' + body + '</body></html>';
  };
})();
