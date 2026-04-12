# DealSignals — Platform Specification & Architecture

**Last updated:** April 11, 2026
**Commit checkpoint:** `4415bab` (main)
**Repository:** github.com/chibus0368-pixel/om-analyzer
**Production URL:** https://www.dealsignals.app

---

## 1. What DealSignals Is

DealSignals is a commercial real estate (CRE) deal analysis platform that lets investors upload Offering Memorandums, flyers, rent rolls, and other deal documents, then automatically extracts financials, scores the investment opportunity, and organizes deals into DealBoards for comparison and tracking.

The product has three entry points:

- **Pro (workspace)** — Full dashboard with DealBoards, property detail pages, scoreboard, map view, upload, and shareable links. Requires Firebase auth login.
- **OM Analyzer (try-me)** — Public single-upload analyzer with no login required. Gated by usage limits tied to tier (free/pro).
- **Crexi Chrome Extension** — One-click save from Crexi.com property listings into a DealBoard. Downloads the PDF, parses, scores, and files the deal automatically.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.1 (App Router) |
| Runtime | Vercel Serverless (Node 18+) |
| Frontend | React 19, TypeScript |
| Auth | Firebase Auth (client SDK) |
| Database | Firestore (Firebase Admin SDK) |
| File Storage | Firebase Cloud Storage |
| AI / LLM | OpenAI GPT-4o (parsing, scoring, classification, OCR) |
| Payments | Stripe (subscriptions, webhooks) |
| Email | Resend |
| Maps | Leaflet |
| Excel Export | ExcelJS |
| PDF Parsing | pdf-parse v2 + GPT-4o Vision OCR fallback |
| Extension | Chrome MV3 (content script + service worker) |

---

## 3. Project Structure

```
src/
  app/
    api/                    # API routes (see section 6)
    workspace/              # Pro dashboard
      page.tsx              # DealBoard main page (property cards)
      layout.tsx            # Sidebar + header nav + workspace switcher
      scoreboard/           # Leaderboard / table toggle
      properties/[id]/      # Property detail page
      upload/               # Single + bulk upload
      map/                  # Leaflet map view
      share/                # Shareable link management
      profile/              # User profile
      settings/             # Workspace settings
      compare/              # Side-by-side deal comparison
      admin/                # Admin panel
    om-analyzer/            # Public try-me analyzer
    share/[id]/             # Public shared deal view
    contact/                # Contact / lead capture
  lib/
    workspace/
      workspace-context.tsx # React context: workspaces, switching, CRUD
      firestore.ts          # All Firestore CRUD helpers
      types.ts              # TypeScript interfaces for every entity
      parse-engine.ts       # GPT-4o document parsing (direct import)
      score-engine.ts       # GPT-4o deal scoring (direct import)
      classify.ts           # Analysis type classifier (retail/industrial/office/land)
      extension-pipeline.ts # Shared pipeline for extension uploads
      auth.ts               # Auth hooks and helpers
      propertyNameUtils.ts  # Smart property name extraction
      image-extractor.ts    # Hero image extraction from PDF (client-side)
    firebase-admin.ts       # getAdminDb(), getAdminAuth(), getAdminStorage()
    stripe/                 # Stripe config and helpers
  components/
    billing/                # TrialStatusBar, UpgradeModal

crexi-extension/            # Chrome MV3 extension
  manifest.json
  background.js             # Service worker (3-step upload, PDF fetch, board fetch)
  content.js                # Crexi page injection (overlay, metadata scrape, save flow)
  injected.js               # MAIN world script for network sniffing (CSP bypass)
  popup.html / popup.js     # Settings UI (API key, base URL, default board)
  overlay.css               # Extension UI styles
```

---

## 4. Architecture Lock (CRITICAL)

### Parsing Pipeline

The parsing pipeline calls parse and score engines as **direct function imports** — NOT via HTTP self-fetch. Vercel serverless cannot reliably self-fetch. This was a hard-won fix.

```
process route  ─→  import runParseEngine()   (not fetch /api/parse)
               ─→  import runScoreEngine()   (not fetch /api/score)
```

Files involved:
- `src/lib/workspace/parse-engine.ts` — all GPT-4o parsing logic
- `src/lib/workspace/score-engine.ts` — all scoring logic
- `src/app/api/workspace/process/route.ts` — imports and calls both directly
- `src/lib/workspace/extension-pipeline.ts` — same pattern for extension uploads

**NEVER reintroduce `fetch()` calls from process route to parse/score routes on the same deployment.**

### Extension Upload: Three-Step Signed URL Flow

Vercel has a hard 4.5 MB request body limit. Real OMs are 5-20 MB. The extension bypasses this:

```
1. POST /api/workspace/upload/external/init
   → Creates property row in Firestore
   → Returns V4 signed GCS PUT URL (15-min TTL)

2. PUT <signed URL>
   → Extension uploads PDF bytes directly to Firebase Storage
   → Bypasses Vercel entirely — no size limit

3. POST /api/workspace/upload/external/finalize
   → Server downloads PDF from GCS
   → Runs full pipeline via after(): extract → classify → parse → generate → score
   → Returns fast acknowledgment
```

### Idempotency

Extension uploads use a two-layer dedup system:
- **Nonce**: Content script generates a unique nonce per save click, used as Firestore doc ID. Retries with same nonce are idempotent merges.
- **Source URL**: Re-saving the same Crexi listing finds the existing property by `sourceUrl` and reuses it.

---

## 5. Data Model (Firestore Collections)

### workspace_properties
The primary entity. One row per deal/property.

| Field | Type | Notes |
|-------|------|-------|
| projectId | string | Always "workspace-default" |
| workspaceId | string | DealBoard ID |
| userId | string | Firebase UID |
| propertyName | string | Parser-improved name |
| sourceUrl | string | Crexi listing URL (if from extension) |
| source | string | "crexi_extension" or "web_upload" |
| heroImageUrl | string | Property photo URL |
| analysisType | string | retail, industrial, office, land |
| parseStatus | string | pending, parsed |
| processingStatus | string | uploading, extracting, parsing, scoring, complete, error |
| parseError | string | Error message if failed |
| scoreTotal | number | 0-100 |
| scoreBand | string | strong_buy, buy, hold, pass, strong_reject |
| createdAt | string | ISO timestamp |

### workspaces
DealBoard definitions. Doc ID format: `{userId}__{workspaceId}`.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Short workspace ID |
| userId | string | Owner |
| name | string | Display name |
| slug | string | URL-safe name |
| analysisType | string | Default analysis type |

### workspace_documents
Uploaded files linked to properties (ProjectDocument).

| Field | Type | Notes |
|-------|------|-------|
| propertyId | string | Parent property |
| originalFilename | string | User-facing name |
| storedFilename | string | GCS object name |
| storagePath | string | Full GCS path |
| fileExt | string | pdf, xlsx, docx |
| mimeType | string | application/pdf etc. |
| fileSizeBytes | number | File size |
| parserStatus | string | uploaded, parsed |
| isArchived | boolean | Soft delete flag |
| isDeleted | boolean | Hard delete flag |

### workspace_extracted_fields
Individual parsed data points from documents.

### workspace_scores
Score history for properties.

### workspace_notes
User and system-generated notes (investment_thesis, general, risk).

### workspace_parser_runs
Audit log of parse engine executions.

---

## 6. API Routes

### Workspace APIs (`/api/workspace/`)

| Route | Method | Purpose |
|-------|--------|---------|
| boards/ | GET/POST | List/create DealBoards |
| boards/external/ | GET | Extension: list boards (X-API-Key auth) |
| upload/external/init/ | POST | Extension: create property + signed URL |
| upload/external/finalize/ | POST | Extension: trigger pipeline |
| upload/external/ | POST | DEPRECATED (returns 410) |
| process/ | POST | Web: run parse+score pipeline |
| parse/ | POST | Thin wrapper around runParseEngine |
| score/ | POST | Thin wrapper around runScoreEngine |
| classify/ | POST | Detect analysis type from text |
| properties/ | GET/POST | CRUD for properties |
| extracted-fields/ | GET/POST | CRUD for parsed fields |
| generate/ | POST | Generate reports/briefs |
| share/ | POST | Create shareable links |
| usage/ | GET | Check upload limits |
| deep-research/ | POST | Extended AI research on a deal |
| ocr/ | POST | OCR endpoint |
| duplicate/ | POST | Clone a property |
| cleanup/ | POST | Maintenance operations |

### Other APIs

| Route | Method | Purpose |
|-------|--------|---------|
| /api/auth/ | POST | Auth flows |
| /api/stripe/ | POST | Stripe webhooks, subscription management |
| /api/om-analyzer/ | POST | Public OM analyzer |
| /api/geocode/ | GET | Address geocoding |
| /api/share/ | GET | Public shared deal data |
| /api/health/ | GET | Health check |
| /api/leads/ | POST | Lead management |
| /api/contact/ | POST | Contact form |

---

## 7. Chrome Extension Architecture

### Files

| File | World | Role |
|------|-------|------|
| background.js | Service Worker | HTTP requests, PDF fetching, message routing |
| content.js | Isolated (content script) | DOM injection, metadata scraping, overlay UI |
| injected.js | MAIN (page context) | Network interception for PDF URL sniffing (CSP bypass) |
| popup.html/js | Extension popup | Settings: API key, base URL, default board |

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| ds:upload | content → background | Full upload flow (init → PUT → finalize) |
| ds:fetchPdf | content → background | Fetch PDF bytes from Crexi CDN |
| ds:fetchBoards | content → background | Get DealBoard list from server |
| ds:getSettings | content → background | Read chrome.storage settings |
| ds:installSniffer | content → background | Inject injected.js into MAIN world |

### Auth

Extension uses a shared API key (`X-API-Key` header) matching `EXTENSION_API_KEY` env var. All uploads are attributed to `EXTENSION_USER_ID`. This bypasses Firebase Auth since the extension runs outside the app's auth context.

### Key Behaviors

- **PDF detection**: Watches for `<embed>`, `<iframe>`, `<object>` with PDF sources. Also intercepts fetch/XHR via MAIN world script.
- **Hero image scraping**: Pulls from JSON-LD → og:image → first large gallery img. Re-scrapes at save time for lazy-loaded images.
- **Popover API**: Uses `popover="manual"` to render above Crexi's `<dialog>.showModal()` PDF viewer (top-layer ordering).
- **safeSendMessage**: All chrome.runtime.sendMessage calls wrapped to handle extension context invalidation gracefully.

---

## 8. Processing Pipeline (Detailed)

When a document is uploaded (web or extension), this sequence runs:

```
1. EXTRACT TEXT
   └─ pdf-parse (fast path, ~1s)
   └─ GPT-4o Vision OCR fallback (if pdf-parse returns < 100 chars)
      └─ Sends raw PDF as base64 inline file to chat completions API
      └─ Handles scanned/image-only PDFs up to 28 MB

2. CLASSIFY
   └─ classifyDocument() → GPT-4o prompt
   └─ Returns: { detected_type: retail|industrial|office|land, confidence, reason }
   └─ Falls back to "retail" confidence 0 on failure

3. PARSE (runParseEngine)
   └─ GPT-4o structured extraction
   └─ Extracts: property details, financials, tenants, lease terms
   └─ Writes extracted fields to workspace_extracted_fields
   └─ Updates property name from parsed address
   └─ Returns: { success, fieldsExtracted, fields, brief }

4. GENERATE
   └─ Saves first-pass investment brief as pinned note
   └─ noteType: "investment_thesis"

5. SCORE (runScoreEngine)
   └─ Reads extracted fields from Firestore
   └─ GPT-4o scoring across multiple dimensions
   └─ Writes score to workspace_scores
   └─ Updates property with scoreTotal, scoreBand
   └─ Bands: strong_buy (80+), buy (65-79), hold (50-64), pass (35-49), strong_reject (<35)
```

---

## 9. Environment Variables

### Required for Production

| Variable | Purpose |
|----------|---------|
| FIREBASE_SERVICE_ACCOUNT_KEY | Firebase Admin SDK credentials (JSON) |
| OPENAI_API_KEY | GPT-4o API access |
| EXTENSION_API_KEY | Shared secret for extension auth |
| EXTENSION_USER_ID | Firebase UID for extension uploads |
| NEXT_PUBLIC_FIREBASE_* | Client-side Firebase config (7 vars) |
| STRIPE (various) | Stripe keys and webhook secrets |
| RESEND_API_KEY | Email sending |
| APP_BASE_URL | Base URL for links in emails/shares |

### Optional

| Variable | Purpose |
|----------|---------|
| FRED_API_KEY | Federal Reserve economic data |
| AI_CONFIDENCE_THRESHOLD | Min confidence for auto-accept |
| ADMIN_PASSWORD / ADMIN_SECRET | Admin panel auth |

---

## 10. Key UI Components

### DealBoard Main Page (`/workspace`)
Property cards in a grid. Each card shows: hero image, property name, city/state, file count, score badge (color-coded by band), ANALYZED/PENDING status. Cards link to property detail. Actions: duplicate, delete.

### Property Detail Page (`/workspace/properties/[id]`)
Full deal view with: deal summary, financial highlights table, parsed fields (editable), source documents panel, notes, score breakdown, map, workbook (XLSX) and brief (DOC) export buttons.

### Scoreboard (`/workspace/scoreboard`)
Leaderboard / Table toggle view. Ranks all properties by score. DO NOT remove the toggle.

### DealBoard Switcher
Dropdown in both sidebar and header nav. Selecting a board now navigates to `/workspace` and loads that board's properties.

---

## 11. Deployment

- **Platform**: Vercel
- **Branch**: `main` → auto-deploy to production
- **Max duration**: 180s for pipeline routes, 30s for lightweight routes
- **Body limit**: 4.5 MB (hard Vercel cap — bypassed by signed URL flow for extension)
- **`after()` usage**: Pipeline routes use `next/server` `after()` to run heavy processing after HTTP response is flushed

---

## 12. Recent Work (This Session)

### Commits (oldest → newest)

1. **72a1d68** — Persist DealBoards to Firestore (localStorage-only was losing boards on cache wipe)
2. **a9cbd82** — Initial Crexi Chrome extension + external upload endpoint
3. **e503de9** — Fix ghost dealboards in dropdown (read real workspaces collection)
4. **ee73f9e** — Add Vision OCR fallback for scanned PDFs
5. **162f20c** — Fast-ack with `after()` + pipeline parity with web portal
6. **bae3021** — Upload PDF to Storage + write canonical ProjectDocument fields (fixed Source Documents panel)
7. **8213003** — Three-step signed URL flow (fixed 413 FUNCTION_PAYLOAD_TOO_LARGE on >4.5 MB PDFs)
8. **9b6ef52** — Scrape Crexi hero image into heroImageUrl
9. **541e291** — safeSendMessage wrapper (fixed crash on extension context invalidation)
10. **869e2e6** — Route all messaging through safeSendMessage (fixed boards not loading)
11. **627ff0c** — sourceUrl dedup (first attempt, composite index issue)
12. **e1c2dca** — Two-layer idempotency: nonce doc ID + single-field sourceUrl dedup
13. **4415bab** — DealBoard switcher navigates to /workspace on selection

### Known Issues / Next Steps

- **Duplicate properties**: Two-layer idempotency deployed but not yet confirmed working in production. Root cause of double /init calls still unidentified.
- **Hero images**: Scraping logic deployed; depends on Crexi page having og:image or gallery imgs. Not yet confirmed working.
- **Extension context invalidation**: safeSendMessage handles it gracefully, but user must still refresh the Crexi page after reloading the extension (MV3 limitation).
- **TypeScript errors**: ~20 pre-existing TS errors (leaflet types, stripe types, om-analyzer page) — none in extension or workspace pipeline code.

---

## 13. Lessons Learned

1. **Never HTTP self-fetch on Vercel serverless.** Import functions directly.
2. **Vercel has a hard 4.5 MB body limit.** Use signed URLs for large file uploads.
3. **Firestore compound queries need composite indexes.** Use single-field queries with client-side filtering when possible.
4. **Chrome MV3 service workers die.** Wrap all chrome.runtime calls in try/catch. Users must refresh pages after extension reload.
5. **Crexi CSP blocks inline scripts.** Use `chrome.scripting.executeScript({world: "MAIN"})` from the service worker.
6. **Crexi's PDF viewer uses `<dialog>.showModal()`.** Only `popover="manual"` with `showPopover()` renders above it (top-layer stack).
7. **pdf-parse fails on scanned PDFs.** Always have a Vision OCR fallback.
8. **Firestore field names must match exactly.** The property detail page reads `originalFilename`, `fileSizeBytes`, `storagePath` — writing `filename` or `fileSize` silently drops the document from the UI.
9. **`after()` from next/server** is the correct way to run background work on Vercel. The function stays alive past the response flush.
10. **Nonce-as-doc-ID** is the most reliable idempotency pattern for Firestore. No index needed, no race conditions.
