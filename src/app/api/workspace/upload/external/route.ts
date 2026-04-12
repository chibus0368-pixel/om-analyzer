import { NextRequest, NextResponse, after } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { runParseEngine } from "@/lib/workspace/parse-engine";
import { runScoreEngine } from "@/lib/workspace/score-engine";
import { classifyDocument } from "@/lib/workspace/classify";
import {
  buildSmartPropertyName,
  extractShortStreetAddress,
} from "@/lib/workspace/propertyNameUtils";

/**
 * External Upload Endpoint — Chrome extension / bookmarklet entry point.
 *
 * UX contract (per user request): "simply download the PDF. Everything
 * else needs to happen behind the scenes for speed." So this route
 * returns as soon as the property row exists, and the heavy pipeline
 * (extract → classify → parse → generate → score) runs via `after()`
 * after the response is flushed. The extension shows "Saved — analysis
 * running" immediately and the user watches the record land in Pro.
 *
 * Pipeline parity: the sequence of extract → classify → runParseEngine
 * → save brief note → runScoreEngine is IDENTICAL to
 * /api/workspace/process, so the outputs match the web portal exactly.
 * This respects the ARCHITECTURE LOCK in CLAUDE.md — everything is a
 * direct function import, no HTTP self-fetch.
 *
 * Auth is a shared API key header (EXTENSION_API_KEY) because the
 * extension lives outside the app's Firebase auth context. Every
 * upload is attributed to EXTENSION_USER_ID.
 *
 * Request:
 *   POST /api/workspace/upload/external
 *   Headers: X-API-Key: <EXTENSION_API_KEY>
 *   Body: multipart/form-data
 *     - file:         the PDF (required)
 *     - workspaceId:  target DealBoard id (default "default")
 *     - propertyName: optional pre-fill
 *     - sourceUrl:    optional Crexi URL
 *
 * Response (fast):
 *   { success, propertyId, propertyName, url, status: "processing" }
 */

// Generous cap; `after()` continues running past the response flush,
// and we don't want Vercel to kill the function mid-score.
export const maxDuration = 180;
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

function json(req: NextRequest, data: any, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...corsHeaders(req.headers.get("origin")), ...(init?.headers || {}) },
  });
}

// ────────────────────────── PDF text extraction ──────────────────────────

/** Fast path: pdf-parse on the raw buffer. Returns "" on failure. */
async function extractPdfTextFast(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = String((result as any)?.text || "").trim();
    return text.slice(0, 80_000);
  } catch (err: any) {
    console.error("[external upload] pdf-parse failed:", err?.message);
    return "";
  }
}

/**
 * Vision fallback for scanned/image-only PDFs. Ships the raw PDF bytes
 * to GPT-4o as an inline base64 file part so Vision handles both the
 * text layer and OCR server-side without any canvas dependencies.
 */
async function extractPdfTextViaVision(buffer: Buffer, fileName: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[external upload] OPENAI_API_KEY missing — Vision fallback skipped");
    return "";
  }
  if (buffer.length > 28 * 1024 * 1024) {
    console.warn(`[external upload] PDF ${Math.round(buffer.length / 1024 / 1024)}MB exceeds Vision inline cap`);
    return "";
  }
  const base64 = buffer.toString("base64");
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 8000,
        messages: [
          {
            role: "system",
            content:
              "You are a document OCR specialist. Extract ALL text from the attached commercial real estate PDF. Return the raw text content organized by page when possible. Include every number, address, tenant name, lease term, financial figure, and footnote exactly as shown. Do not summarize.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract all text from this commercial real estate document (${fileName}).` },
              {
                type: "file",
                file: {
                  filename: fileName || "document.pdf",
                  file_data: `data:application/pdf;base64,${base64}`,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[external upload] Vision fallback HTTP", res.status, errText.slice(0, 300));
      return "";
    }
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    return text.slice(0, 80_000);
  } catch (err: any) {
    console.error("[external upload] Vision fallback threw:", err?.message);
    return "";
  }
}

/** pdf-parse → Vision OCR fallback. Identical coverage to the web path. */
async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  const fast = await extractPdfTextFast(buffer);
  if (fast.length > 100) {
    console.log(`[external upload] pdf-parse extracted ${fast.length} chars`);
    return fast;
  }
  console.warn(`[external upload] pdf-parse returned ${fast.length} chars — falling back to Vision OCR`);
  const vision = await extractPdfTextViaVision(buffer, fileName);
  if (vision.length > 50) {
    console.log(`[external upload] Vision OCR extracted ${vision.length} chars`);
    return vision;
  }
  return fast;
}

// ────────────────────────── Background pipeline ──────────────────────────

/**
 * The exact sequence /api/workspace/process runs, packaged so it can
 * execute after the HTTP response is flushed via `after()`.
 *
 *   1. Extract text (pdf-parse → Vision)
 *   2. Classify analysis type (retail/industrial/office/land)
 *   3. runParseEngine (direct import — no self-fetch)
 *   4. Save brief as a pinned note (generate step)
 *   5. runScoreEngine
 *   6. Mark processingStatus complete
 */
async function runBackgroundPipeline(args: {
  propertyId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
  workspaceId: string;
  fallbackAnalysisType: string;
}) {
  const { propertyId, userId, fileName, buffer, workspaceId, fallbackAnalysisType } = args;
  const db = getAdminDb();

  const setStatus = (patch: Record<string, any>) =>
    db
      .collection("workspace_properties")
      .doc(propertyId)
      .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true })
      .catch(() => {});

  try {
    // ── 1. Extract text ──
    await setStatus({ processingStatus: "extracting" });
    const documentText = await extractPdfText(buffer, fileName);

    if (!documentText) {
      await setStatus({
        processingStatus: "error",
        parseStatus: "pending",
        parseError:
          "Could not extract text from PDF (pdf-parse + Vision both empty). File may be corrupt, password-protected, or >28 MB.",
      });
      return;
    }

    // ── Upload the PDF bytes to Firebase Storage so the Source
    //    Documents section on the property page can open them,
    //    matching the web upload flow exactly. ──
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedFilename = `${Date.now()}_${safeName}`;
    const storagePath = `workspace/${userId}/workspace-default/${propertyId}/inputs/${storedFilename}`;
    let storageUploaded = false;
    try {
      const bucket = getAdminStorage().bucket();
      const gcsFile = bucket.file(storagePath);
      await gcsFile.save(buffer, {
        contentType: "application/pdf",
        resumable: false,
        metadata: { contentType: "application/pdf" },
      });
      storageUploaded = true;
      console.log(`[external upload] uploaded ${buffer.length} bytes → ${storagePath}`);
    } catch (err: any) {
      console.warn("[external upload] storage upload failed (non-blocking):", err?.message);
    }

    // ── Write a proper ProjectDocument row using the exact field
    //    names the web path writes and the property page reads:
    //    originalFilename / storedFilename / fileExt / mimeType /
    //    fileSizeBytes / storagePath / parserStatus / isArchived /
    //    isDeleted. Without these, the Source Documents panel was
    //    silently dropping the row. ──
    const nowIso2 = new Date().toISOString();
    const fileExt = (fileName.split(".").pop() || "pdf").toLowerCase();
    await db
      .collection("workspace_documents")
      .add({
        projectId: "workspace-default",
        propertyId,
        workspaceId,
        userId,
        originalFilename: fileName,
        storedFilename,
        fileExt,
        mimeType: "application/pdf",
        fileSizeBytes: buffer.length,
        storagePath,
        docCategory: "om",
        uploadSource: "crexi_extension",
        parserStatus: storageUploaded ? "uploaded" : "pending",
        isArchived: false,
        isDeleted: false,
        uploadedAt: nowIso2,
        updatedAt: nowIso2,
        textExtracted: true,
        textLength: documentText.length,
      })
      .catch((err: any) =>
        console.warn("[external upload] document row failed (non-blocking):", err?.message),
      );

    // ── 2. Classify analysis type (matches web classify step) ──
    let analysisType = fallbackAnalysisType;
    try {
      const classifyResult = await classifyDocument(documentText);
      if (classifyResult.confidence >= 0.5 && classifyResult.detected_type) {
        analysisType = classifyResult.detected_type;
      }
      console.log(
        `[external upload] classify → ${classifyResult.detected_type} (confidence ${classifyResult.confidence})`,
      );
    } catch (err: any) {
      console.warn("[external upload] classify failed, using fallback type:", err?.message);
    }
    await setStatus({ analysisType, processingStatus: "parsing" });

    // ── 3. Parse (direct function call) ──
    let parsedData: any = null;
    let fieldsExtracted = 0;
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
            await setStatus({ propertyName: finalName });
          }
        }
      } else {
        parseError = parseResult.error || "Parse returned success=false";
      }
    } catch (err: any) {
      parseError = err?.message || "Parse threw";
      console.error("[external upload] parse error:", parseError);
    }

    // ── 4. Generate: save brief as a pinned note ──
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

    // ── 5. Score (always runs, even if parse yielded few fields) ──
    await setStatus({ processingStatus: "scoring" });
    try {
      await runScoreEngine({
        propertyId,
        projectId: "workspace-default",
        userId,
        analysisType,
      });
    } catch (err: any) {
      console.error("[external upload] score error:", err?.message);
    }

    // ── 6. Finalize ──
    const finalStatus = fieldsExtracted > 0 ? "parsed" : "pending";
    await setStatus({
      processingStatus: "complete",
      parseStatus: finalStatus,
      ...(parseError ? { parseError } : {}),
    });
    console.log(
      `[external upload] pipeline done: property=${propertyId} fields=${fieldsExtracted} status=${finalStatus}`,
    );
  } catch (err: any) {
    console.error("[external upload] background pipeline fatal:", err);
    await setStatus({
      processingStatus: "error",
      parseStatus: "pending",
      parseError: err?.message || "Background processing failed",
    });
  }
}

// ────────────────────────── HTTP entry point ──────────────────────────

export async function POST(req: NextRequest) {
  // Auth
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

  // Multipart body
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
  const fallbackAnalysisType = String(form.get("analysisType") || "retail");
  const propertyNameIn = String(form.get("propertyName") || "").trim();
  const sourceUrl = String(form.get("sourceUrl") || "").trim();

  // Read bytes
  let buffer: Buffer;
  try {
    const arr = await blob.arrayBuffer();
    buffer = Buffer.from(arr);
  } catch (err: any) {
    return json(req, { error: `Failed to read file: ${err?.message || err}` }, { status: 400 });
  }

  const sizeKb = Math.round(buffer.length / 1024);
  console.log(`[external upload] file=${fileName} size=${sizeKb}KB ws=${workspaceId} src=${sourceUrl}`);

  // Create property row up front so the extension can link to it
  // immediately even before the pipeline has run. Pro polls on
  // workspace-properties-changed and will light up the card as each
  // stage completes.
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const initialName =
    propertyNameIn || fileName.replace(/\.[^.]+$/, "").trim() || "Untitled Property";

  let propertyId: string;
  try {
    const propertyRef = await db.collection("workspace_properties").add({
      projectId: "workspace-default",
      workspaceId,
      userId,
      propertyName: initialName,
      sourceUrl: sourceUrl || null,
      source: "crexi_extension",
      parseStatus: "pending",
      processingStatus: "extracting",
      analysisType: fallbackAnalysisType,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    propertyId = propertyRef.id;
  } catch (err: any) {
    return json(
      req,
      { error: `Failed to create property row: ${err?.message || err}` },
      { status: 500 },
    );
  }

  // Kick off the full pipeline AFTER the response is flushed. `after()`
  // keeps the serverless function alive without making the extension
  // wait 30-90 seconds for parse+score to complete.
  after(async () => {
    await runBackgroundPipeline({
      propertyId,
      userId,
      fileName,
      buffer,
      workspaceId,
      fallbackAnalysisType,
    });
  });

  return json(req, {
    success: true,
    propertyId,
    propertyName: initialName,
    status: "processing",
    url: `/workspace/properties/${propertyId}`,
  });
}
