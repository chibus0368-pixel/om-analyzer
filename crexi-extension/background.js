/**
 * DealSignals Crexi extension — background service worker.
 *
 * Responsibilities:
 *  - Provide a single message channel ("ds:upload") that the content script
 *    uses to ship a PDF + scraped metadata to the DealSignals API. Doing the
 *    upload here (not the content script) keeps us outside Crexi's page CSP
 *    and avoids cross-origin headaches.
 *  - Expose a small "ds:getSettings" helper so both the content script and
 *    popup can read settings without duplicating chrome.storage plumbing.
 */

const DEFAULT_BASE_URL = "https://www.dealsignals.app";

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { baseUrl: DEFAULT_BASE_URL, apiKey: "", workspaceId: "default", analysisType: "retail" },
      resolve,
    );
  });
}

async function uploadToDealSignals(payload) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    return { ok: false, error: "Missing API key. Open the extension popup and set it." };
  }

  const baseUrl = (settings.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const url = `${baseUrl}/api/workspace/upload/external`;

  // payload.fileBytes arrives as a plain number array (JSON-safe) because
  // chrome.runtime messaging can't send ArrayBuffers directly.
  const bytes = new Uint8Array(payload.fileBytes);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const form = new FormData();
  form.append("file", blob, payload.fileName || "crexi.pdf");
  form.append("workspaceId", payload.workspaceId || settings.workspaceId || "default");
  form.append("analysisType", payload.analysisType || settings.analysisType || "retail");
  if (payload.propertyName) form.append("propertyName", payload.propertyName);
  if (payload.address)      form.append("address", payload.address);
  if (payload.city)         form.append("city", payload.city);
  if (payload.state)        form.append("state", payload.state);
  if (payload.zip)          form.append("zip", payload.zip);
  if (payload.sourceUrl)    form.append("sourceUrl", payload.sourceUrl);
  if (payload.askingPrice)  form.append("askingPrice", String(payload.askingPrice));
  if (payload.capRate)      form.append("capRate", String(payload.capRate));
  if (payload.noi)          form.append("noi", String(payload.noi));

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-API-Key": settings.apiKey },
      body: form,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-JSON error */ }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (data && data.error) || `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return {
      ok: true,
      propertyId: data && data.propertyId,
      propertyName: data && data.propertyName,
      scoreTotal: data && data.scoreTotal,
      scoreBand: data && data.scoreBand,
      fieldsExtracted: data && data.fieldsExtracted,
      url: (data && data.url && `${baseUrl}${data.url}`) || `${baseUrl}/workspace`,
    };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/**
 * Fetch a PDF (or any binary) by URL from the service worker so we can
 * pull bytes out of Crexi's embedded PDF viewer without bumping into the
 * page's CSP. The content script hands us an https:// or blob: URL and
 * we return the bytes as a plain number array (messaging-safe).
 */
async function fetchPdfBytes(url, referrer) {
  try {
    if (!url) return { ok: false, error: "No PDF URL provided" };
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      referrer: referrer || undefined,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} fetching PDF` };

    const ct = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100) return { ok: false, error: "PDF fetch returned empty body" };

    // Sanity check: real PDFs start with "%PDF-"
    const head = new Uint8Array(buf.slice(0, 5));
    const headStr = String.fromCharCode.apply(null, Array.from(head));
    if (headStr !== "%PDF-" && !ct.includes("pdf")) {
      return { ok: false, error: "That URL didn't return a PDF (got " + (ct || "unknown") + ")" };
    }

    return {
      ok: true,
      bytes: Array.from(new Uint8Array(buf)),
      size: buf.byteLength,
    };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "ds:getSettings") {
    getSettings().then(sendResponse);
    return true;
  }

  if (msg.type === "ds:upload") {
    uploadToDealSignals(msg.payload || {}).then(sendResponse);
    return true; // async
  }

  if (msg.type === "ds:fetchPdf") {
    fetchPdfBytes(msg.url, msg.referrer).then(sendResponse);
    return true; // async
  }

  if (msg.type === "ds:fetchBoards") {
    (async () => {
      try {
        const settings = await getSettings();
        if (!settings.apiKey) { sendResponse({ ok: false, error: "Missing API key" }); return; }
        const baseUrl = (settings.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/api/workspace/boards/external`, {
          method: "GET",
          headers: { "X-API-Key": settings.apiKey },
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* non-JSON */ }
        if (!res.ok) {
          sendResponse({ ok: false, error: (data && data.error) || `HTTP ${res.status}` });
          return;
        }
        sendResponse({ ok: true, boards: (data && data.boards) || [] });
      } catch (err) {
        sendResponse({ ok: false, error: (err && err.message) || String(err) });
      }
    })();
    return true; // async
  }

  if (msg.type === "ds:installSniffer") {
    // Inject the sniffer into the page's MAIN world. This path goes
    // through chrome.scripting which is not subject to the page's CSP.
    const tabId = _sender && _sender.tab && _sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, error: "No tab id" }); return true; }
    chrome.scripting.executeScript(
      { target: { tabId }, files: ["injected.js"], world: "MAIN" },
      () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true });
        }
      },
    );
    return true; // async
  }
});
