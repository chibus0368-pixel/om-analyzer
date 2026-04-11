import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { runParseEngine } from "@/lib/workspace/parse-engine";
import { runScoreEngine } from "@/lib/workspace/score-engine";
import {
  buildSmartPropertyName,
  extractShortStreetAddress,
} from "@/lib/workspace/propertyNameUtils";

/**
 * External Upload Endpoint — Chrome extension / bookmarklet entry point.
 *
 * Accepts a PDF (multipart) plus Crexi-scraped metadata and kicks off the
 * same parse → score pipeline the web uploader uses. Auth is via a simple
 * shared API key header (EXTENSION_API_KEY env var) — NOT Firebase Auth —
 * because the extension lives outside the app's auth context.
 *
 * The env vars required on Vercel:
 *   EXTENSION_API_KEY   — a random opaque string the extension also stores
 *   EXTENSION_USER_ID   — the Firebase UID that every extension upload is
 *                         attributed to (MVP: single-user / personal use)
 *
 * Request:
 *   POST /api/workspace/upload/external
 *   Headers: X-API-Key: <EXTENSION_API_KEY>
 *   Body: multipart/form-data
 *     - file:          the PDF (required)
 *     - workspaceId:   target DealBoard id (required; use "default" for default)
 *     - analysisType:  retail | industrial | office | multifamily | land (default "retail")
 *     - propertyName:  optional — pre-fill from scraped page
 *     - address:       optional
 *     - city:          optional
 *     - state:         optional
 *     - zip:           optional
 *     - sourceUrl:     optional — the Crexi property URL
 *     - askingPrice:   optional numeric string
 *     - capRate:       optional numeric string
 *     - noi:           optional numeric string
 *
 * Response:
 *   { success, propertyId, propertyName, fieldsExtracted, scoreTotal, scoreBand }
 */

// Allow up to 3 min for big OMs — parse+score is the slow part.
export const maxDuration = 180;
// Disable Next.js body parsing; we read the raw multipart ourselves via formData().
export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = [
  /^chrome-extension:\/\/.+$/,
  /^moz-extension:\/\/.+$/,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.some(re => re.test(origin))
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

function json(
  req: NextRequest,
  data: any,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...corsHeaders(req.headers.get("origin")), ...(init?.headers || {}) },
  });
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 * Returns the first ~25k chars which is what the parse engine expects.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    // TextResult exposes a concatenated doc string under `text` (and per-page pages[])
    const text = String((result as any)?.text || "").trim();
    // Hard cap to protect the LLM from pathologically long documents.
    return text.slice(0, 80_000);
  } catch (err: any) {
    console.error("[external upload] pdf-parse failed:", err?.message);
    return "";
  }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");

  // ── Auth: shared API key (MVP single-user) ──
  const apiKey = req.headers.get("x-api-key") || "";
  const expected = process.env.EXTENSION_API_KEY || "";
  if (!expected) {
    return json(req, { error: "EXTENSION_API_KEY not configured on server" }, { status: 500 });
  }
  if (!apiKey || apiKey !== expected) {
    return json(req, { error: "Unauthorized" }, { status: 401 });
  }

  const userId = process.env.EXTENSION_USER_ID || "";
  if (!userId) {
    return json(req, { error: "EXTENSION_USER_ID not configured on server" }, { status: 500 });
  }

  // ── Parse multipart body ──
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err: any) {
    return json(req, { error: `Invalid multipart body: ${err?.message || err}` }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return json(req, { error: "file is required" }, { status: 400 });
  }
  const blob = file as File;
  const fileName = blob.name || "crexi-upload.pdf";

  const workspaceId = String(form.get("workspaceId") || "default");
  const analysisType = String(form.get("analysisType") || "retail");
  const propertyNameIn = String(form.get("propertyName") || "").trim();
  const addressIn = String(form.get("address") || "").trim();
  const cityIn = String(form.get("city") || "").trim();
  const stateIn = String(form.get("state") || "").trim();
  const zipIn = String(form.get("zip") || "").trim();
  const sourceUrl = String(form.get("sourceUrl") || "").trim();
  const askingPrice = String(form.get("askingPrice") || "").trim();
  const capRate = String(form.get("capRate") || "").trim();
  const noi = String(form.get("noi") || "").trim();

  // ── Read the PDF bytes and extract text ──
  let buffer: Buffer;
  try {
    const arr = await blob.arrayBuffer();
    buffer = Buffer.from(arr);
  } catch (err: any) {
    return json(req, { error: `Failed to read file: ${err?.message || err}` }, { status: 400 });
  }

  const sizeKb = Math.round(buffer.length / 1024);
  console.log(`[external upload] file=${fileName} size=${sizeKb}KB ws=${workspaceId} src=${sourceUrl}`);

  const documentText = await extractPdfText(buffer);
  if (!documentText) {
    return json(req, { error: "Could not extract text from PDF" }, { status: 422 });
  }

  // ── Create the property row ──
  const db = getAdminDb();
  const nowIso = new Date().toISOString();

  const initialName =
    propertyNameIn ||
    extractShortStreetAddress(addressIn) ||
    (fileName.replace(/\.[^.]+$/, "").trim() || "Untitled Property");

  const propertyRef = await db.collection("workspace_properties").add({
    projectId: "workspace-default",
    workspaceId,
    userId,
    propertyName: initialName,
    address1: addressIn,
    city: cityIn,
    state: stateIn,
    zip: zipIn,
    sourceUrl: sourceUrl || null,
    source: "crexi_extension",
    parseStatus: "pending",
    processingStatus: "parsing",
    analysisType,
    // Pre-fill any scraped numerics as hints for the scorer (strings for now)
    ...(askingPrice ? { scrapedAskingPrice: askingPrice } : {}),
    ...(capRate ? { scrapedCapRate: capRate } : {}),
    ...(noi ? { scrapedNoi: noi } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  const propertyId = propertyRef.id;

  // ── Create a document row pointing at the source URL (PDF bytes not stored
  //    in Storage for MVP — we already have the extracted text we need). ──
  try {
    await db.collection("workspace_documents").add({
      projectId: "workspace-default",
      propertyId,
      workspaceId,
      userId,
      filename: fileName,
      fileSize: buffer.length,
      docCategory: "om",
      source: "crexi_extension",
      sourceUrl: sourceUrl || null,
      uploadedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      textExtracted: true,
      textLength: documentText.length,
    });
  } catch (err: any) {
    console.warn("[external upload] document row failed (non-blocking):", err?.message);
  }

  // ── Run parse engine directly ──
  let fieldsExtracted = 0;
  let parsedData: any = null;
  let parseError = "";
  try {
    const parseResult = await runParseEngine({
      projectId: "workspace-default",
      propertyId,
      userId,
      documentText,
      analysisType,
    });
    if (parseResult.success) {
      fieldsExtracted = parseResult.fieldsExtracted || 0;
      parsedData = parseResult.fields;
      if (parsedData) {
        const p = parsedData.property || {};
        const parsedName = p.name || p.property_name;
        const parsedAddress = p.address;
        const parsedCity = p.city;
        const parsedState = p.state;
        const shortStreet = extractShortStreetAddress(parsedAddress);
        const finalName =
          shortStreet ||
          (parsedName && parsedName !== "Unknown Property"
            ? buildSmartPropertyName(parsedName, parsedAddress, parsedCity, parsedState)
            : null);
        if (finalName) {
          await db
            .collection("workspace_properties")
            .doc(propertyId)
            .set({ propertyName: finalName, updatedAt: new Date().toISOString() }, { merge: true })
            .catch(() => {});
        }
      }
    } else {
      parseError = parseResult.error || "Parse returned success=false";
    }
  } catch (err: any) {
    parseError = err?.message || "Parse threw";
    console.error("[external upload] parse error:", parseError);
  }

  // ── Save brief as a pinned note if present ──
  if (parsedData?.brief) {
    try {
      const n = new Date().toISOString();
      await db.collection("workspace_notes").add({
        projectId: "workspace-default",
        propertyId,
        userId,
        noteType: "investment_thesis",
        title: "First-Pass Investment Brief",
        content: parsedData.brief,
        isPinned: true,
        createdAt: n,
        updatedAt: n,
      });
    } catch { /* non-blocking */ }
  }

  // ── Run score engine ──
  let scoreTotal = 0;
  let scoreBand = "";
  try {
    await db
      .collection("workspace_properties")
      .doc(propertyId)
      .set({ processingStatus: "scoring", updatedAt: new Date().toISOString() }, { merge: true })
      .catch(() => {});
    const scoreResult = await runScoreEngine({
      propertyId,
      projectId: "workspace-default",
      userId,
      analysisType,
    });
    if (scoreResult.success) {
      scoreTotal = scoreResult.totalScore || 0;
      scoreBand = scoreResult.scoreBand || "";
    }
  } catch (err: any) {
    console.error("[external upload] score error:", err?.message);
  }

  // ── Finalize ──
  const finalStatus = fieldsExtracted > 0 ? "parsed" : "pending";
  await db
    .collection("workspace_properties")
    .doc(propertyId)
    .set(
      {
        processingStatus: "complete",
        parseStatus: finalStatus,
        ...(parseError ? { parseError } : {}),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
    .catch(() => {});

  // Read the final name back for the response
  let finalName = initialName;
  try {
    const snap = await db.collection("workspace_properties").doc(propertyId).get();
    const data = snap.data() as any;
    if (data?.propertyName) finalName = data.propertyName;
  } catch { /* fall through */ }

  return json(req, {
    success: true,
    propertyId,
    propertyName: finalName,
    fieldsExtracted,
    scoreTotal,
    scoreBand,
    parseError: parseError || undefined,
    url: `/workspace/properties/${propertyId}`,
  });
}
