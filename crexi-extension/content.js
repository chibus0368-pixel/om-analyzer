/**
 * DealSignals Crexi extension — content script.
 *
 * Runs on crexi.com/properties/* pages. Responsibilities:
 *   1. Inject a floating "Save to DealSignals" pill button.
 *   2. Scrape visible metadata (title, address, price, cap rate, NOI).
 *   3. On click, open an overlay with editable metadata + a PDF drop zone
 *      + board / analysis-type selectors + a Save button.
 *   4. On save, marshal the PDF bytes to the background worker and ship
 *      everything to /api/workspace/upload/external.
 *
 * Notes:
 *   - Crexi is an SPA, so we watch for URL changes and re-inject on soft
 *     navigation.
 *   - All UI is scoped under #ds-root with high-specificity classes so
 *     Crexi's own styles don't leak in.
 */

(function () {
  if (window.__dsCrexiInjected) return;
  window.__dsCrexiInjected = true;

  const ROOT_ID = "ds-crexi-root";
  const BTN_ID = "ds-crexi-save-btn";

  // ───────────── PDF viewer detection ─────────────
  //
  // Crexi opens OMs/flyers in an overlay that uses Chrome's built-in PDF
  // plugin. That surfaces in the DOM as either <embed type="application/pdf">,
  // <iframe src="...pdf">, or <object type="application/pdf">. We watch for
  // any of those and remember the URL so one click on the pill can ship it
  // straight to DealSignals — no manual download required.

  let detectedPdf = null; // { url, name } or null
  let pdfSniffFromNetwork = null; // { url, name } from fetch/XHR interception

  function pdfNameFromUrl(url) {
    try {
      const u = new URL(url, location.href);
      const parts = u.pathname.split("/").filter(Boolean);
      const last = parts[parts.length - 1] || "document.pdf";
      const cleaned = decodeURIComponent(last.replace(/\?.*/, ""));
      return cleaned.endsWith(".pdf") || cleaned.includes(".") ? cleaned : cleaned + ".pdf";
    } catch (_) {
      return "crexi-document.pdf";
    }
  }

  function findPdfInDom() {
    // Chrome's native PDF viewer renders as <embed type="application/pdf">
    const embed = document.querySelector('embed[type="application/pdf"], embed[src*=".pdf"]');
    if (embed && embed.src) return { url: embed.src, name: pdfNameFromUrl(embed.src) };

    // Some older/custom viewers use <object>
    const obj = document.querySelector('object[type="application/pdf"]');
    if (obj && obj.data) return { url: obj.data, name: pdfNameFromUrl(obj.data) };

    // Or a plain <iframe> pointing at a PDF
    const iframes = document.querySelectorAll("iframe");
    for (const f of iframes) {
      const src = f.src || f.getAttribute("data-src") || "";
      if (/\.pdf(\?|#|$)/i.test(src) || src.startsWith("blob:")) {
        return { url: src, name: pdfNameFromUrl(src) };
      }
    }

    return null;
  }

  function refreshPdfDetection() {
    const found = findPdfInDom() || pdfSniffFromNetwork;
    const prev = detectedPdf && detectedPdf.url;
    detectedPdf = found;
    if ((found && found.url) !== prev) updateFloatingButton();
  }

  // Best-effort: intercept fetch + XHR so we can grab PDF URLs Crexi pulls
  // down *before* they're mounted into an <embed>.
  //
  // Crexi's Content-Security-Policy bans inline scripts AND only allowlists
  // one specific chrome-extension id for script-src, so neither an inline
  // <script> nor an external <script src="chrome-extension://..."> tag can
  // load reliably from a content script. The MV3-native escape hatch is
  // `chrome.scripting.executeScript({world: "MAIN"})`, but that can only
  // be called from the service worker. So we ask the background worker to
  // run it for us and we listen for the postMessage it sends back.
  function installNetworkSniffer() {
    try {
      chrome.runtime.sendMessage({ type: "ds:installSniffer" }, (res) => {
        // Non-fatal: if the background worker refuses, DOM scanning will
        // still find embedded PDFs once the viewer mounts them.
        if (chrome.runtime.lastError) return;
        void res;
      });
    } catch (_) { /* non-fatal */ }

    window.addEventListener("message", (evt) => {
      if (!evt || !evt.data || evt.data.__dsPdfSniff !== true) return;
      const url = String(evt.data.url || "");
      if (!url) return;
      pdfSniffFromNetwork = { url, name: pdfNameFromUrl(url) };
      refreshPdfDetection();
    });
  }

  // ───────────── Metadata scraping ─────────────

  /** Return the first non-empty string from a list of possible DOM accessors. */
  function firstText(...accessors) {
    for (const fn of accessors) {
      try {
        const v = fn();
        if (v && String(v).trim()) return String(v).trim();
      } catch (_) {
        /* keep trying */
      }
    }
    return "";
  }

  function pick(selector, attr) {
    const el = document.querySelector(selector);
    if (!el) return "";
    if (attr) return el.getAttribute(attr) || "";
    return el.textContent || "";
  }

  function readJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const blocks = [];
    scripts.forEach((s) => {
      try {
        const data = JSON.parse(s.textContent || "null");
        if (Array.isArray(data)) blocks.push(...data);
        else if (data) blocks.push(data);
      } catch (_) { /* skip bad json */ }
    });
    return blocks;
  }

  function scrapeMetadata() {
    const jsonLd = readJsonLd();
    // Some Crexi pages emit Place / Product / RealEstateListing
    const listing =
      jsonLd.find((b) => b["@type"] === "RealEstateListing") ||
      jsonLd.find((b) => b["@type"] === "Place") ||
      jsonLd.find((b) => b["@type"] === "Product") ||
      jsonLd.find((b) => b.address) ||
      null;

    const ogTitle = pick('meta[property="og:title"]', "content");
    const ogDesc = pick('meta[property="og:description"]', "content");

    // Title: prefer og:title, then document title, strip " | Crexi" style suffixes
    let propertyName = firstText(
      () => listing && listing.name,
      () => ogTitle,
      () => document.title,
    )
      .replace(/\s*[|•]\s*Crexi.*$/i, "")
      .replace(/\s*[-–—]\s*Crexi.*$/i, "")
      .trim();

    // Address pieces
    let address = "", city = "", state = "", zip = "";
    if (listing && listing.address) {
      const a = listing.address;
      address = a.streetAddress || "";
      city = a.addressLocality || "";
      state = a.addressRegion || "";
      zip = a.postalCode || "";
    }
    if (!address) {
      // Try common Crexi DOM hooks — these selectors are best-effort and
      // will gracefully fall back to whatever's in og:title / <h1>.
      address = firstText(
        () => pick('[data-cy="property-address"]'),
        () => pick('[data-testid="property-address"]'),
        () => pick(".property-address"),
        () => pick(".address"),
      );
    }

    // Try to pull any numeric financial hints from the page text
    const bodyText = document.body ? document.body.innerText || "" : "";
    const match = (re) => {
      const m = bodyText.match(re);
      return m ? m[1].trim() : "";
    };
    const askingPrice = match(/(?:Asking Price|Price)[:\s]*\$?([\d,]+(?:\.\d+)?(?:\s*(?:M|K))?)/i);
    const capRate = match(/Cap Rate[:\s]*([\d.]+%?)/i);
    const noi = match(/NOI[:\s]*\$?([\d,]+(?:\.\d+)?(?:\s*(?:M|K))?)/i);

    return {
      propertyName,
      address,
      city,
      state,
      zip,
      askingPrice,
      capRate,
      noi,
      sourceUrl: location.href,
      ogDesc,
    };
  }

  // ───────────── Floating button ─────────────

  function ensureFloatingButton() {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.className = "ds-pill";
      btn.innerHTML =
        '<span class="ds-pill-dot"></span>' +
        '<span class="ds-pill-text">Save to DealSignals</span>';
      btn.addEventListener("click", openOverlay);
      btn.style.zIndex = "2147483647";
      btn.style.position = "fixed";
      // Promote into the browser's top layer via the Popover API.
      // Crexi's PDF viewer is itself in the top layer (it uses
      // <dialog>.showModal()), which sits above ANY z-index. The only
      // way to draw on top of it is to also be in the top layer.
      // popover="manual" means we control open/close and it never
      // auto-dismisses on click outside.
      if ("showPopover" in HTMLElement.prototype) {
        btn.setAttribute("popover", "manual");
      }
    }
    // Re-parent to <html> so we escape any body-level stacking context.
    const root = document.documentElement || document.body;
    if (root && btn.parentNode !== root) {
      root.appendChild(btn);
    } else if (root && root.lastElementChild !== btn) {
      root.appendChild(btn);
    }
    // Top-layer ordering is LIFO: the most recently shown popover wins.
    // So whenever the DOM churns (Crexi opens/reshuffles its own dialog),
    // we re-show our popover to pop back to the top of the stack.
    if (btn.hasAttribute("popover")) {
      try {
        if (btn.matches(":popover-open")) btn.hidePopover();
        btn.showPopover();
      } catch (_) { /* older Chrome or popover unsupported */ }
    }
    updateFloatingButton();
  }

  function updateFloatingButton() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const label = btn.querySelector(".ds-pill-text");
    if (!label) return;
    if (detectedPdf && detectedPdf.url) {
      label.textContent = "Save this PDF to DealSignals";
      btn.classList.add("ds-pill-hot");
      btn.title = "Capture: " + (detectedPdf.name || "PDF");
    } else {
      label.textContent = "Save to DealSignals";
      btn.classList.remove("ds-pill-hot");
      btn.title = "DealSignals: Save from Crexi";
    }
  }

  // ───────────── Overlay ─────────────

  let overlayEl = null;
  let pendingFile = null;

  function openOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    const meta = scrapeMetadata();

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ds-overlay-backdrop";
    root.innerHTML = `
      <div class="ds-overlay" role="dialog" aria-modal="true">
        <div class="ds-overlay-header">
          <div class="ds-brand">
            <span class="ds-brand-dot"></span>
            <span>DealSignals</span>
          </div>
          <button type="button" class="ds-close" aria-label="Close">×</button>
        </div>

        <div class="ds-overlay-body">
          <h2 class="ds-title">Save this Crexi deal to a DealBoard</h2>
          <p class="ds-subtitle">${
            detectedPdf
              ? `Captured: <strong>${escapeHtml(detectedPdf.name || "document.pdf")}</strong>. Pick a board and we'll parse &amp; score it on the server.`
              : "Drop the PDF below, pick a board, and we'll parse &amp; score it on the server."
          }</p>

          <label class="ds-field">
            <span class="ds-label">Property name</span>
            <input type="text" class="ds-input" data-field="propertyName" value="${escapeHtml(meta.propertyName || "")}" placeholder="e.g. Walgreens — Franklin, WI" />
          </label>

          <label class="ds-field">
            <span class="ds-label">DealBoard</span>
            <select class="ds-input" data-field="workspaceId" id="ds-board-select">
              <option value="default">Loading boards…</option>
            </select>
          </label>

          <div class="ds-drop" id="ds-drop">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#84CC16" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div class="ds-drop-title">Drop the Crexi PDF here</div>
            <div class="ds-drop-sub">or <button type="button" class="ds-link" id="ds-browse">browse your files</button></div>
            <input type="file" id="ds-file-input" accept=".pdf,application/pdf" hidden />
          </div>
          <div id="ds-file-info" class="ds-file-info"></div>

          <div id="ds-status" class="ds-status"></div>

          <div class="ds-actions">
            <button type="button" class="ds-btn ds-btn-ghost" id="ds-cancel">Cancel</button>
            <button type="button" class="ds-btn ds-btn-primary" id="ds-save" disabled>Save to DealBoard</button>
          </div>
        </div>
      </div>
    `;

    // Append to <html> and promote to the browser top layer via popover
    // so it renders above Crexi's own <dialog>.showModal() PDF viewer.
    (document.documentElement || document.body).appendChild(root);
    overlayEl = root;
    if ("showPopover" in HTMLElement.prototype) {
      try {
        root.setAttribute("popover", "manual");
        root.showPopover();
      } catch (_) { /* best effort */ }
    }

    // Populate the DealBoard dropdown from the server (active workspaces
    // for this user) and pre-select the default saved in extension settings.
    const boardSelect = root.querySelector("#ds-board-select");
    const settingsPromise = new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ds:getSettings" }, (s) => resolve(s || {}));
    });
    const boardsPromise = new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ds:fetchBoards" }, (res) => resolve(res || {}));
    });
    Promise.all([settingsPromise, boardsPromise]).then(([settings, res]) => {
      if (!boardSelect) return;
      const preferredId = settings.workspaceId || "default";
      if (res && res.ok && Array.isArray(res.boards) && res.boards.length > 0) {
        boardSelect.innerHTML = "";
        res.boards.forEach((b) => {
          const opt = document.createElement("option");
          opt.value = b.id || "default";
          const count = typeof b.count === "number" ? ` (${b.count})` : "";
          opt.textContent = (b.name || b.id || "default") + count;
          boardSelect.appendChild(opt);
        });
        // Make sure the preferred board is always an option, even if the
        // server hasn't seen it yet (edge case on first sync).
        if (!res.boards.some((b) => (b.id || "default") === preferredId)) {
          const opt = document.createElement("option");
          opt.value = preferredId;
          opt.textContent = preferredId;
          boardSelect.appendChild(opt);
        }
        boardSelect.value = preferredId;
      } else {
        // Fallback: at least let the user save to whatever default they
        // configured in the popup, so the extension still works when the
        // API is unreachable.
        boardSelect.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = preferredId;
        opt.textContent = preferredId + " (offline)";
        boardSelect.appendChild(opt);
        boardSelect.value = preferredId;
        if (res && !res.ok && res.error) {
          console.warn("[DealSignals] Could not load boards:", res.error);
        }
      }
    });

    // Wire up close handlers
    root.querySelector(".ds-close").addEventListener("click", closeOverlay);
    root.querySelector("#ds-cancel").addEventListener("click", closeOverlay);
    root.addEventListener("click", (e) => { if (e.target === root) closeOverlay(); });

    // File input
    const fileInput = root.querySelector("#ds-file-input");
    const dropZone = root.querySelector("#ds-drop");
    const browseBtn = root.querySelector("#ds-browse");
    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) attachFile(f);
    });
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("ds-drop-hover"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("ds-drop-hover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("ds-drop-hover");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) attachFile(f);
    });

    // Save
    root.querySelector("#ds-save").addEventListener("click", onSave);

    // If we already detected an open PDF, flag the drop zone as "captured"
    // and pre-enable the save button.
    if (detectedPdf && detectedPdf.url) {
      const info = root.querySelector("#ds-file-info");
      info.innerHTML =
        '<span class="ds-file-pill"><span class="ds-file-ext">PDF</span>' +
        escapeHtml(detectedPdf.name || "document.pdf") +
        ' <span class="ds-file-size">(captured from page)</span></span>';
      const drop = root.querySelector("#ds-drop");
      const title = drop.querySelector(".ds-drop-title");
      const sub = drop.querySelector(".ds-drop-sub");
      if (title) title.textContent = "PDF captured from Crexi viewer";
      if (sub) sub.innerHTML = 'Wrong file? <button type="button" class="ds-link" id="ds-browse-alt">pick a different one</button>';
      const browseAlt = drop.querySelector("#ds-browse-alt");
      if (browseAlt) browseAlt.addEventListener("click", () => fileInput.click());
      root.querySelector("#ds-save").disabled = false;
    }
  }

  function attachFile(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      setStatus("That doesn't look like a PDF.", "error");
      return;
    }
    pendingFile = file;
    const info = overlayEl.querySelector("#ds-file-info");
    info.innerHTML =
      '<span class="ds-file-pill"><span class="ds-file-ext">PDF</span>' +
      escapeHtml(file.name) +
      ' <span class="ds-file-size">(' + (Math.round(file.size / 1024)) + ' KB)</span></span>';
    overlayEl.querySelector("#ds-save").disabled = false;
    setStatus("", "");
  }

  function closeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    pendingFile = null;
  }

  function setStatus(msg, kind) {
    const el = overlayEl && overlayEl.querySelector("#ds-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "ds-status" + (kind ? " ds-status-" + kind : "");
  }

  function getField(name) {
    const el = overlayEl.querySelector('[data-field="' + name + '"]');
    return el ? (el.value || "").trim() : "";
  }

  async function onSave() {
    if (!pendingFile && !(detectedPdf && detectedPdf.url)) {
      setStatus("Attach a PDF first (or open one in the Crexi viewer).", "error");
      return;
    }
    const saveBtn = overlayEl.querySelector("#ds-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Uploading…";

    let fileBytes, fileName;
    if (pendingFile) {
      setStatus("Uploading and running the parser…", "info");
      try {
        const ab = await pendingFile.arrayBuffer();
        fileBytes = Array.from(new Uint8Array(ab));
        fileName = pendingFile.name;
      } catch (err) {
        setStatus("Could not read that file: " + (err && err.message || err), "error");
        saveBtn.disabled = false; saveBtn.textContent = "Save to DealBoard";
        return;
      }
    } else {
      // Pull bytes from the embedded PDF viewer via the background worker
      // (runs with host_permissions so it can hit any CDN Crexi uses).
      setStatus("Grabbing the PDF from the Crexi viewer…", "info");
      const fetchRes = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "ds:fetchPdf", url: detectedPdf.url, referrer: location.href },
          resolve,
        );
      });
      if (!fetchRes || !fetchRes.ok) {
        setStatus(
          "Couldn't fetch the PDF: " + ((fetchRes && fetchRes.error) || "no response") +
          ". Try dragging the file in manually.",
          "error",
        );
        saveBtn.disabled = false; saveBtn.textContent = "Save to DealBoard";
        return;
      }
      fileBytes = fetchRes.bytes;
      fileName = detectedPdf.name || "crexi-document.pdf";
      setStatus("Uploading and running the parser…", "info");
    }

    // Minimal payload: the user supplies name + board, everything else
    // (address, financials, analysis type) is extracted server-side when
    // the parser runs. Sending lots of half-scraped DOM text here just
    // fights the parser for which value "wins".
    const payload = {
      fileBytes,
      fileName,
      propertyName: getField("propertyName"),
      workspaceId: getField("workspaceId") || "default",
      sourceUrl: location.href,
    };

    chrome.runtime.sendMessage({ type: "ds:upload", payload }, (res) => {
      if (!res) {
        setStatus("No response from the background worker. Is the extension loaded?", "error");
        saveBtn.disabled = false; saveBtn.textContent = "Save to DealBoard";
        return;
      }
      if (!res.ok) {
        setStatus("Failed: " + (res.error || "unknown error"), "error");
        saveBtn.disabled = false; saveBtn.textContent = "Save to DealBoard";
        return;
      }
      const score = res.scoreTotal ? (" · Score " + Math.round(res.scoreTotal) + (res.scoreBand ? " (" + res.scoreBand + ")" : "")) : "";
      setStatus(
        "Saved “" + (res.propertyName || "property") + "” with " + (res.fieldsExtracted || 0) + " fields" + score + ".",
        "success",
      );
      saveBtn.textContent = "Open in DealSignals →";
      saveBtn.disabled = false;
      saveBtn.onclick = () => window.open(res.url, "_blank");
    });
  }

  // ───────────── Utils ─────────────

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ───────────── SPA navigation handling ─────────────

  let lastHref = location.href;
  const onRouteChange = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    // Give Crexi a tick to re-render
    setTimeout(ensureFloatingButton, 400);
  };
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function () {
    const r = origPush.apply(this, arguments);
    onRouteChange();
    return r;
  };
  history.replaceState = function () {
    const r = origReplace.apply(this, arguments);
    onRouteChange();
    return r;
  };
  window.addEventListener("popstate", onRouteChange);

  // Re-inject on DOM replacement (Crexi soft-mounts content a lot) and
  // check for newly-opened PDF viewers each time the tree changes.
  let moThrottle = 0;
  const mo = new MutationObserver(() => {
    // Always make sure the pill exists AND is pinned as the last child of
    // <html> so it stays above any modal Crexi opens on top of the body.
    ensureFloatingButton();
    if (moThrottle) return;
    moThrottle = setTimeout(() => {
      moThrottle = 0;
      refreshPdfDetection();
    }, 250);
  });
  if (document.body) {
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Initial inject + PDF scan
  const boot = () => {
    installNetworkSniffer();
    ensureFloatingButton();
    refreshPdfDetection();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
