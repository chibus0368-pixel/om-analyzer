# DealSignals Technical Architecture

## Overview

DealSignals is a Next.js App Router application deployed on Vercel that parses commercial real estate (CRE) documents (OMs, flyers, rent rolls), extracts structured data using GPT-4o, scores the deal, and presents interactive analysis tools. The stack is Next.js + Firebase (Auth + Firestore) + OpenAI + Google Cloud Storage.

---

## The Engine: Three Layers

The "engine" is three distinct layers with different coupling levels. This matters for reuse.

### Layer 1: Pure Analysis Modules (NO database dependency -- most portable)

These are pure TypeScript functions. They take structured input, return structured output, and never touch Firestore or any external service. You can drop them into another project as-is.

| Module | File | What It Does |
|--------|------|-------------|
| Quick Screen | `src/lib/analysis/quick-screen.ts` | Takes purchase price, NOI, SF, asset type. Returns go/no-go verdict with levered returns, DSCR, cap rate analysis, risk flags. Pure math. |
| OM Reverse Pricing | `src/lib/analysis/om-reverse-pricing.ts` | Deconstructs broker assumptions, solves for max purchase price at a target IRR. Returns price sensitivity table, rent growth x exit cap heatmap, bid range. |
| Value-Add Lens | `src/lib/analysis/value-add-lens.ts` | Detects when a deal is value-add (vacant/unstabilized), separates in-place vs stabilized NOI, re-weights scoring so vacant deals aren't penalized as broken stabilized assets. |
| Asset Profiles | `src/lib/analysis/asset-profiles.ts` | Cap bands, vacancy floors, OpEx ratios, CapEx reserves, replacement costs per asset type (retail, industrial, office, multifamily, land, medical office). 2026 rate environment. |
| Scoring Models | `src/lib/workspace/scoring-models.ts` | Weighted category scoring for industrial, office, land, multifamily. Takes a flat field map, returns score/band/recommendation. Retail scoring is inline in score-engine.ts. |
| Classifier | `src/lib/workspace/classify.ts` | Determines analysis type (retail/industrial/office/land/multifamily) and deal structure (direct asset vs syndication). |

**To reuse these:** Copy the `src/lib/analysis/` directory and `scoring-models.ts`. They import from each other but nothing outside. You just need to feed them the right input shape.

### Layer 2: GPT-4o Extraction + Scoring Engines (coupled to Firestore + OpenAI)

These are the heavy-lift modules. They call OpenAI and read/write Firestore.

**Parse Engine** (`src/lib/workspace/parse-engine.ts`)

```
Input:  { userId, documentText, analysisType, propertyId? }
Output: { success, fieldsExtracted, brief, fields, stages }
```

Runs 3 GPT-4o stages:
1. **Stage 1 - Extract**: Raw fact extraction from document text (property info, pricing, income, expenses, tenants, brief). Different prompts for land vs income-producing.
2. **Stage 2 - Underwrite**: Calculates first-pass underwriting from Stage 1 output (debt sizing, cap rates, DSCR, breakeven, exit analysis, signals).
3. **Stage 3 - Asset Addons**: Asset-type-specific extraction (industrial: clear height, dock count, rail; office: suite count, parking ratio, TI/LC; multifamily: unit mix, rent/unit; land: zoning, utilities, entitlements).

Side effects:
- Writes each extracted field individually to `workspace_extracted_fields` collection
- Creates a parser run record in `workspace_parser_runs`
- Updates the property doc in `workspace_properties` (name, address, card metrics)

**Dependencies:** OpenAI API (GPT-4o), Firebase Admin SDK (Firestore).

**Score Engine** (`src/lib/workspace/score-engine.ts`)

```
Input:  { propertyId, userId, analysisType? }
Output: { success, totalScore, scoreBand, recommendation, categories }
```

Reads extracted fields from Firestore, runs the scoring model for the asset type, applies value-add lens adjustments, writes the score to `workspace_scores`.

For retail: uses hardcoded weighted scoring (pricing 15, cashflow 15, upside 10, tenant 12, rollover 10, vacancy 8, location 10, physical 8, redevelopment 5, confidence 7).

For other types: delegates to `scoring-models.ts` which has type-specific category definitions.

**Dependencies:** Firebase Admin SDK (Firestore), scoring-models.ts, value-add-lens.ts.

### Layer 3: Orchestration + API Routes (coupled to Next.js + Vercel)

**Process Pipeline** (`src/app/api/workspace/process/route.ts`)

The main orchestrator. Called after file upload. Runs: parse -> generate brief -> score. All as direct function imports (NOT HTTP self-fetch -- this is a hard Vercel constraint).

```
POST /api/workspace/process
Body: { userId, propertyId, documentText, analysisType, dealStructure }
```

After scoring completes, fires off a background research enrichment call to `/api/workspace/research/[propertyId]` for location intel.

---

## Database: Firebase Firestore

Single Firestore database. All collections are top-level (no nested subcollections for the core data).

### Core Collections

| Collection | Purpose | Key Fields |
|-----------|---------|-----------|
| `workspace_properties` | One doc per deal. Card data, status, scores. | propertyName, askingPrice, address, overallScore, scoreBand, analysisType, processingStatus, heroImageUrl, shareId |
| `workspace_extracted_fields` | Individual parsed fields. One doc per field per property. | propertyId, fieldGroup, fieldName, rawValue, normalizedValue, confidenceScore, isUserOverridden, userOverrideValue |
| `workspace_scores` | Score snapshots. Multiple per property (keeps history). | propertyId, totalScore, scoreBand, recommendation, categoryScores, isCurrent |
| `workspace_parser_runs` | Parser execution logs. | projectId, runStatus, fieldsExtractedCount, parserVersion |
| `workspace_notes` | Investment briefs, user notes. | propertyId, noteType, content, isPinned |
| `workspace_boards` | Kanban boards for deal pipeline. | userId, columns, propertyOrder |

### Field Groups in `workspace_extracted_fields`

Fields are stored as individual documents with a `fieldGroup` + `fieldName` key. Groups include:
- `property_basics` - name, address, GLA, year built, occupancy, etc.
- `pricing_deal_terms` - asking price, cap rate, price/SF
- `expenses` - NOI, total expenses, management fee, reserves
- `rent_roll` - tenant details, WALE
- `debt_assumptions` - LTV, DSCR, debt service
- `returns` - IRR, cash-on-cash, exit value
- `signals` - traffic, risk flags, recommendation text
- `asset_addons` - type-specific fields (clear height, unit mix, etc.)

### Auth

Firebase Auth with email/password. User records in a `users` collection. Auth state managed client-side via `useWorkspaceAuth()` hook. Server-side routes use Firebase Admin SDK to verify tokens or use service account access.

---

## All API Endpoints (60+)

### Core Engine (what you'd reuse)
- `POST /api/workspace/process` - Full parse -> score pipeline
- `POST /api/workspace/parse` - Parse only (thin wrapper around runParseEngine)
- `POST /api/workspace/score` - Score only (thin wrapper around runScoreEngine)
- `POST /api/workspace/classify` - Detect asset type from document text

### Property CRUD
- `GET/POST /api/workspace/properties` - List/create properties
- `GET/PATCH/DELETE /api/workspace/properties/[id]` - Single property ops

### File Upload (3-step signed URL flow for Vercel's 4.5MB limit)
- `POST /api/workspace/upload/external/init` - Get signed GCS upload URL
- `POST /api/workspace/upload/external/finalize` - Confirm upload, trigger processing
- `POST /api/workspace/upload` - Direct upload (smaller files)

### AI / Chat
- `POST /api/ai/ask-deal` - One-shot deal Q&A
- `POST /api/ai/deal-chat` - Multi-turn deal chat
- `POST /api/workspace/deal-coach` - AI deal coaching with history

### Share / Public
- `GET /api/share/[id]` - Full property data for shared dealboard
- `GET /api/share/[id]/download` - PDF/XLSX export for shared view
- `GET /api/public/property/[id]` - Limited teaser data (no auth required)

### Research Enrichment
- `POST /api/workspace/research/[propertyId]` - Google Places + Census data
- `GET /api/workspace/location-intel/[propertyId]` - Demographics overlay
- `POST /api/workspace/submarket-brief` - AI submarket analysis
- `GET /api/demographics` - Census data proxy
- `GET /api/geocode` - Geocoding proxy

### Auth / Admin / Stripe
- Various auth routes (bootstrap, profile, verify-email, etc.)
- Admin routes (backfill, beta-access, leads, users)
- Stripe subscription routes

---

## Reuse Strategy: Running the Engine on Another Site

### Option A: Shared Backend, New Frontend (easiest)

Keep the same Firestore database and API routes. Build a new frontend that calls the existing `/api/workspace/process` endpoint. The engine writes to the same collections, and you query them from your new UI.

**Pros:** Zero engine work. Everything just works.
**Cons:** Tightly couples both sites to one Firestore instance. Auth/billing need coordination.

### Option B: Extract the Engine as a Standalone Package (cleanest for real separation)

The engine has a clear extraction boundary:

**What you'd extract into a package:**

1. **Pure analysis modules** (copy as-is):
   - `quick-screen.ts`, `om-reverse-pricing.ts`, `value-add-lens.ts`, `asset-profiles.ts`, `scoring-models.ts`, `classify.ts`

2. **Parse engine core** (needs refactoring):
   - The GPT-4o prompts and JSON parsing logic in `parse-engine.ts` are the real IP. Currently they're interleaved with Firestore writes. You'd refactor to separate the "call GPT and parse response" from "write to database."
   - Target signature: `parseDocument(text, analysisType) -> { fields, brief, stages }` with no side effects.

3. **Score engine core** (needs refactoring):
   - Currently reads fields from Firestore. Refactor to accept fields as input.
   - Target signature: `scoreFields(fields, analysisType) -> { score, band, recommendation, categories }`

**What stays site-specific:**
- Firestore read/write layer
- File upload / GCS signed URL flow
- Auth (Firebase Auth)
- AI chat (deal-coach, ask-deal)
- Research enrichment (Google Places, Census)
- Share/export system
- All frontend components

### Option C: API Gateway (middle ground)

Deploy the engine routes as a standalone API service (not inside a Next.js app). The process route becomes a microservice that accepts document text and returns structured output. Each site calls the same API.

**Rough shape:**
```
POST /engine/parse   { documentText, analysisType } -> { fields, brief }
POST /engine/score   { fields, analysisType }       -> { score, categories }
POST /engine/analyze { fields }                     -> { quickScreen, reversePricing }
```

This requires splitting the Firestore writes out of the engine functions, which is the same refactoring work as Option B but deployed as a service instead of a library.

---

## Key External Dependencies

| Service | What For | Can You Swap? |
|---------|---------|--------------|
| OpenAI GPT-4o | Document parsing (Stage 1-3) | Yes, any LLM with JSON mode. Prompts are the IP. |
| Firebase Firestore | All data storage | Yes, any document DB. Field structure is well-defined. |
| Firebase Auth | User authentication | Yes, any auth provider. Decoupled from engine. |
| Google Cloud Storage | File uploads (PDFs, images) | Yes, any blob store. Only used for upload flow. |
| Google Places API | Location enrichment | Optional. Not part of core engine. |
| Census API | Demographics | Optional. Not part of core engine. |
| Vercel | Hosting + serverless | Engine doesn't depend on Vercel. The "no self-fetch" constraint goes away if you're not on Vercel. |

---

## The Bottom Line

The core engine is ~2,500 lines across 6 files. The valuable parts are:

1. **The GPT-4o prompts** in parse-engine.ts (Stage 1, 2, 3 for each asset type) -- these are finely tuned for CRE extraction and represent most of the iteration work.
2. **The scoring models** that weight categories by asset type and handle value-add lens adjustments.
3. **The analysis calculators** (quick screen, reverse pricing) that produce investor-grade output from extracted fields.

To reuse on another site, the minimum work is: refactor `runParseEngine` and `runScoreEngine` to accept/return data without Firestore side effects, then wrap them in whatever API layer your new site uses. The pure analysis modules (`src/lib/analysis/*`) need zero changes.
