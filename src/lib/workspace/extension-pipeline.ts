import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import { runParseEngine } from "@/lib/workspace/parse-engine";
import { runScoreEngine } from "@/lib/workspace/score-engine";
import { classifyDocument } from "@/lib/workspace/classify";
import {
  buildSmartPropertyName,
  extractShortStreetAddress,
} from "@/lib/workspace/propertyNameUtils";

/**
 * Shared extension-upload background pipeline.
 *
 * Mirrors /api/workspace/process exactly: extract text → classify →
 * runParseEngine → save brief note → runScoreEngine. Lives in lib so
 * both the /init+/finalize HTTP routes and any future retry flow can
 * invoke the same code path via `after()`. All calls are direct
 * function imports — no HTTP self-fetch (per CLAUDE.md architecture
 * lock).
 */

// ────────────────────────── PDF text extraction ──────────────────────────

async function extractPdfTextFast(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = String((result as any)?.text || "").trim();
    return text.slice(0, 80_000);
  } catch (err: any) {
    console.error("[ext-pipeline] pdf-parse failed:", err?.message);
    return "";
  }
}

async function extractPdfTextViaVision(buffer: Buffer, fileName: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[ext-pipeline] OPENAI_API_KEY missing — Vision fallback skipped");
    return "";
  }
  if (buffer.length > 28 * 1024 * 1024) {
    console.warn(`[ext-pipeline] PDF ${Math.round(buffer.length / 1024 / 1024)}MB exceeds Vision inline cap`);
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
      console.error("[ext-pipeline] Vision fallback HTTP", res.status, errText.slice(0, 300));
      return "";
    }
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    return text.slice(0, 80_000);
  } catch (err: any) {
    console.error("[ext-pipeline] Vision fallback threw:", err?.message);
    return "";
  }
}

async function extractPdfText(buffer: Buffer, fileName: string): Promise<string> {
  const fast = await extractPdfTextFast(buffer);
  if (fast.length > 100) {
    console.log(`[ext-pipeline] pdf-parse extracted ${fast.length} chars`);
    return fast;
  }
  console.warn(`[ext-pipeline] pdf-parse returned ${fast.length} chars — falling back to Vision OCR`);
  const vision = await extractPdfTextViaVision(buffer, fileName);
  if (vision.length > 50) {
    console.log(`[ext-pipeline] Vision OCR extracted ${vision.length} chars`);
    return vision;
  }
  return fast;
}

// ────────────────────────── Background pipeline ──────────────────────────

export interface RunPipelineArgs {
  propertyId: string;
  userId: string;
  workspaceId: string;
  storagePath: string;
  fileName: string;
  fallbackAnalysisType: string;
}

/**
 * Runs the full extract → classify → parse → generate → score pipeline
 * on a PDF that's already been uploaded to Firebase Storage. Intended
 * to be called inside `after()` from an HTTP route so the client can
 * return fast while this work finishes in the background.
 */
export async function runExtensionUploadPipeline(args: RunPipelineArgs): Promise<void> {
  const { propertyId, userId, workspaceId, storagePath, fileName, fallbackAnalysisType } = args;
  const db = getAdminDb();

  const setStatus = (patch: Record<string, any>) =>
    db
      .collection("workspace_properties")
      .doc(propertyId)
      .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true })
      .catch(() => {});

  try {
    // ── 0. Download the PDF from Storage (server→GCS has no 4.5 MB limit) ──
    await setStatus({ processingStatus: "extracting" });
    const bucket = getAdminStorage().bucket();
    const gcsFile = bucket.file(storagePath);
    const [exists] = await gcsFile.exists();
    if (!exists) {
      await setStatus({
        processingStatus: "error",
        parseStatus: "pending",
        parseError: `PDF not found in Storage at ${storagePath}`,
      });
      return;
    }
    const [buffer] = await gcsFile.download();
    console.log(`[ext-pipeline] downloaded ${buffer.length} bytes from ${storagePath}`);

    // ── Write the ProjectDocument row with the canonical field names
    //    the web path uses so the Source Documents panel renders it. ──
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileExt = (fileName.split(".").pop() || "pdf").toLowerCase();
    const uploadedAt = new Date().toISOString();
    await db
      .collection("workspace_documents")
      .add({
        projectId: "workspace-default",
        propertyId,
        workspaceId,
        userId,
        originalFilename: fileName,
        storedFilename: safeName,
        fileExt,
        mimeType: "application/pdf",
        fileSizeBytes: buffer.length,
        storagePath,
        docCategory: "om",
        uploadSource: "crexi_extension",
        parserStatus: "uploaded",
        isArchived: false,
        isDeleted: false,
        uploadedAt,
        updatedAt: uploadedAt,
      })
      .catch((err: any) =>
        console.warn("[ext-pipeline] document row failed (non-blocking):", err?.message),
      );

    // ── 1. Extract text ──
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

    // ── 2. Classify ──
    let analysisType = fallbackAnalysisType;
    try {
      const classifyResult = await classifyDocument(documentText);
      if (classifyResult.confidence >= 0.5 && classifyResult.detected_type) {
        analysisType = classifyResult.detected_type;
      }
      console.log(
        `[ext-pipeline] classify → ${classifyResult.detected_type} (confidence ${classifyResult.confidence})`,
      );
    } catch (err: any) {
      console.warn("[ext-pipeline] classify failed, using fallback type:", err?.message);
    }
    await setStatus({ analysisType, processingStatus: "parsing" });

    // ── 3. Parse ──
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
          if (finalName) await setStatus({ propertyName: finalName });
        }
      } else {
        parseError = parseResult.error || "Parse returned success=false";
      }
    } catch (err: any) {
      parseError = err?.message || "Parse threw";
      console.error("[ext-pipeline] parse error:", parseError);
    }

    // ── 4. Save brief as pinned note ──
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

    // ── 5. Score ──
    await setStatus({ processingStatus: "scoring" });
    try {
      await runScoreEngine({
        propertyId,
        projectId: "workspace-default",
        userId,
        analysisType,
      });
    } catch (err: any) {
      console.error("[ext-pipeline] score error:", err?.message);
    }

    // ── 6. Finalize ──
    const finalStatus = fieldsExtracted > 0 ? "parsed" : "pending";
    await setStatus({
      processingStatus: "complete",
      parseStatus: finalStatus,
      ...(parseError ? { parseError } : {}),
    });
    console.log(
      `[ext-pipeline] done: property=${propertyId} fields=${fieldsExtracted} status=${finalStatus}`,
    );
  } catch (err: any) {
    console.error("[ext-pipeline] fatal:", err);
    await setStatus({
      processingStatus: "error",
      parseStatus: "pending",
      parseError: err?.message || "Background processing failed",
    });
  }
}
