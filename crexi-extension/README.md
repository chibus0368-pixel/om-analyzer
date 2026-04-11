# DealSignals · Save from Crexi (Chrome extension MVP)

A tiny Chrome extension that adds a **"Save to DealSignals"** button to
Crexi property pages. Drop a Crexi flyer/OM PDF into the overlay and it
ships straight into a DealBoard, where it gets parsed and scored by the
regular pipeline.

This is a personal-use MVP — a single shared API key grants access to a
single Firebase user.

---

## 1. Server setup (one-time, on Vercel)

The extension talks to `POST /api/workspace/upload/external`. That route
requires two env vars:

| Env var             | What it is                                             |
| ------------------- | ------------------------------------------------------ |
| `EXTENSION_API_KEY` | A random opaque string. The extension stores a copy.  |
| `EXTENSION_USER_ID` | Your Firebase UID. All extension uploads attribute here. |

1. Generate a random key, e.g. `openssl rand -hex 32`.
2. In Vercel → Settings → Environment Variables, add both values for
   Production (and Preview if you want to test against preview builds).
3. Redeploy so the new env vars are live.

---

## 2. Load the extension

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and pick the `crexi-extension/` folder in this
   repo.
4. Pin the extension so its icon is visible in the toolbar.

---

## 3. Configure the extension

Click the DealSignals icon in the toolbar and fill in:

- **Base URL** — `https://www.dealsignals.app` for prod, or
  `http://localhost:3000` when running `next dev`.
- **API key** — the exact value of `EXTENSION_API_KEY` on the server.
- **Default DealBoard** — the workspace id (slug) you want new deals
  landing in. Use `default` if you're not sure.
- **Analysis type** — default asset type (retail/industrial/etc).

Hit **Save settings**.

---

## 4. Use it

There are two ways to save a deal, depending on what's on your screen.

### A) One-click from the Crexi PDF viewer (preferred)

1. Navigate to any Crexi property, e.g.
   `https://www.crexi.com/properties/2285672/wisconsin-walgreens---franklin-wi`.
2. Click the property's **Offering Memorandum / Flyer** thumbnail on
   Crexi — it opens the PDF in Crexi's built-in viewer overlay.
3. The floating **Save to DealSignals** pill in the bottom-right corner
   turns **green and pulsing** with the label **"Save this PDF to
   DealSignals"** once it detects the open PDF.
4. Click the pill. The overlay opens with the captured PDF already
   attached, plus any address/price/NOI we could scrape.
5. Confirm the target DealBoard + analysis type and click
   **Save to DealBoard**. The server fetches, parses, and scores it.
6. The button becomes **"Open in DealSignals →"** — click to jump to the
   new property page on your board.

### B) Manual drop (fallback)

If the auto-detection misses the PDF (rare — usually means Crexi shoved
it into an iframe we can't read), you can still:

1. Download the flyer/OM from Crexi the usual way.
2. Click the **Save to DealSignals** pill on the property page.
3. Drag-and-drop the downloaded PDF into the overlay, or click
   "browse your files".
4. Continue from step 5 above.

---

## 5. What's in the box

```
crexi-extension/
  manifest.json    MV3 manifest — content script on crexi.com, popup, SW
  background.js    Service worker — handles ds:upload + ds:getSettings
  content.js       Injects pill button + overlay on Crexi pages
  overlay.css      Scoped styles for the injected UI
  popup.html       Settings popup markup
  popup.js         Settings popup logic (chrome.storage.local)
  README.md        This file
```

And on the server side:

```
src/app/api/workspace/upload/external/route.ts
  Multipart POST endpoint. API-key auth. Runs runParseEngine +
  runScoreEngine directly (matching the in-app upload path).
```

---

## 6. Known MVP limitations

- PDF **bytes** are not persisted — we only keep the extracted text +
  metadata row. Re-download from Crexi if you need the raw flyer.
- Auth is a single shared API key mapped to `EXTENSION_USER_ID`. No
  multi-user support yet.
- Scraping is best-effort (JSON-LD + og:title + body regex). Always
  double-check the pre-filled fields before saving.
- No queue / retry — one click, one upload.

---

## 7. Troubleshooting

- **"Missing API key"** in the overlay → open the popup, save your key,
  reload the Crexi tab.
- **401 Unauthorized** → the key on the server and the key in the popup
  don't match. Re-check the Vercel env var.
- **"Could not extract text from PDF"** → the file is image-only /
  scanned. We don't OCR in this MVP.
- **Button doesn't appear** → Crexi soft-navigated. Reload the page; the
  MutationObserver should re-inject on the next render.
- **Pill doesn't turn green when PDF is open** → Crexi rendered the PDF
  inside a sandboxed iframe we can't inspect. Use flow **B** (download
  the PDF, drag-drop). Let me know which page so we can widen detection.
