/**
 * DealSignals Crexi extension — page-context network sniffer.
 *
 * Runs in the page's main world (not the isolated content-script world)
 * so it can monkey-patch window.fetch and XMLHttpRequest on Crexi's own
 * JS runtime. Any time a request to a URL ending in .pdf flies by, we
 * post the URL back to the content script via window.postMessage.
 *
 * This file is loaded via a <script src="chrome-extension://..."> tag
 * (not inline) so Crexi's CSP doesn't block it.
 */

(function () {
  if (window.__dsPdfSniffInstalled) return;
  window.__dsPdfSniffInstalled = true;

  const post = (url) => {
    try {
      window.postMessage({ __dsPdfSniff: true, url: String(url) }, "*");
    } catch (_) {}
  };

  const isPdfUrl = (u) => {
    try { return /\.pdf(\?|#|$)/i.test(String(u)); } catch (_) { return false; }
  };

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (input, init) {
      try {
        const u = typeof input === "string" ? input : (input && input.url) || "";
        if (isPdfUrl(u)) post(u);
      } catch (_) {}
      return origFetch.apply(this, arguments);
    };
  }

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (isPdfUrl(url)) post(url);
    } catch (_) {}
    return origOpen.apply(this, arguments);
  };
})();
