/**
 * DealSignals Crexi extension — background service worker.
 *
 * Responsibilities:
 *  - Provide a single message channel ("ds:upload") the content script uses
 *    to ship a PDF into DealSignals. The upload is a THREE-STEP flow because
 *    Vercel serverless has a hard 4.5 MB request body cap and real OMs are
 *    routinely 5–20 MB:
 *
 *       1. POST /api/workspace/upload/external/init  → returns a V4 signed
 *          GCS PUT URL and a property row id.
 *       2. PUT  <signed GCS URL>                     → raw PDF bytes go
 *          straight to Firebase Storage, bypassing Vercel entirely.
 *       3. POST /api/workspace/upload/external/finalize → triggers the
 *          extract → classify → parse → score pipeline via `after()`.
 *
 *  - Expose "ds:getSettings", "ds:fetchPdf", "ds:fetchBoards" helpers.
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

  // payload.fileBytes arrives as a plain number array (JSON-safe) because
  // chrome.runtime messaging can't send ArrayBuffers directly.
  const bytes = new Uint8Array(payload.fileBytes);
  const fileName = payload.fileName || "crexi.pdf";
  const workspaceId = payload.workspaceId || settings.workspaceId || "default";
  const analysisType = payload.analysisType || settings.analysisType || "retail";

  // ── Step 1: init ── create property row + signed upload URL
  let initData;
  try {
    const initRes = await fetch(`${baseUrl}/api/workspace/upload/external/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": settings.apiKey,
      },
      body: JSON.stringify({
        fileName,
        workspaceId,
        analysisType,
        propertyName: payload.propertyName || "",
        sourceUrl: payload.sourceUrl || "",
        heroImageUrl: payload.heroImageUrl || "",
        nonce: payload.nonce || "",
      }),
    });
    const txt = await initRes.text();
    try { initData = JSON.parse(txt); } catch { initData = null; }
    if (!initRes.ok || !initData || !initData.uploadUrl) {
      return {
        ok: false,
        status: initRes.status,
        error: (initData && initData.error) || `init HTTP ${initRes.status}: ${txt.slice(0, 200)}`,
      };
    }
  } catch (err) {
    return { ok: false, error: "init failed: " + ((err && err.message) || String(err)) };
  }

  // ── Step 2: PUT raw bytes directly to Firebase Storage ──
  try {
    const putRes = await fetch(initData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: bytes,
    });
    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => "");
      return {
        ok: false,
        status: putRes.status,
        error: `Storage PUT failed: HTTP ${putRes.status} ${errText.slice(0, 200)}`,
      };
    }
  } catch (err) {
    return { ok: false, error: "Storage PUT threw: " + ((err && err.message) || String(err)) };
  }

  // ── Step 3: finalize — triggers the background pipeline ──
  let finData;
  try {
    const finRes = await fetch(`${baseUrl}/api/workspace/upload/external/finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": settings.apiKey,
      },
      body: JSON.stringify({
        propertyId: initData.propertyId,
        storagePath: initData.storagePath,
        fileName,
        workspaceId,
        analysisType,
      }),
    });
    const txt = await finRes.text();
    try { finData = JSON.parse(txt); } catch { finData = null; }
    if (!finRes.ok) {
      return {
        ok: false,
        status: finRes.status,
        error: (finData && finData.error) || `finalize HTTP ${finRes.status}: ${txt.slice(0, 200)}`,
      };
    }
  } catch (err) {
    return { ok: false, error: "finalize failed: " + ((err && err.message) || String(err)) };
  }

  return {
    ok: true,
    propertyId: initData.propertyId,
    propertyName: initData.propertyName,
    url: `${baseUrl}${initData.url || "/workspace"}`,
  };
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
