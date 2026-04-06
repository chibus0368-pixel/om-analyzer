import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Background Processing Endpoint
 *
 * Handles the full parse → score → generate pipeline server-side
 * so the client can safely navigate away after file upload.
 *
 * This runs as a single long-lived request. The client fires it
 * and does NOT need to await the response.
 */
export const maxDuration = 120; // 2 minutes for full pipeline

/* ── Retry helper ── */
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  { retries = 2, label = "fetch" }: { retries?: number; label?: string } = {}
): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || res.status < 500) return res; // Don't retry 4xx
      const body = await res.text().catch(() => "");
      console.warn(`[process] ${label} attempt ${attempt + 1} returned ${res.status}: ${body.substring(0, 200)}`);
      lastErr = new Error(`${res.status}: ${body.substring(0, 200)}`);
    } catch (err: any) {
      console.warn(`[process] ${label} attempt ${attempt + 1} threw:`, err?.message);
      lastErr = err;
    }
    // Wait before retry (1s, then 2s)
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  let propertyId = "";
  try {
    const body = await req.json();
    const {
      userId,
      documentText,
      analysisType = "retail",
    } = body;
    propertyId = body.propertyId;

    if (!propertyId || !userId || !documentText) {
      return NextResponse.json({ error: "propertyId, userId, and documentText are required" }, { status: 400 });
    }

    const db = getAdminDb();
    // Resolve base URL for internal API calls
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_ENV === "production" ? "https://www.dealsignals.app" : null)
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";
    console.log("[process] Starting pipeline for property:", propertyId, "baseUrl:", baseUrl, "textLen:", documentText.length);

    // Mark property as processing
    await db.collection("workspace_properties").doc(propertyId).set({
      processingStatus: "parsing",
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});

    let fieldsExtracted = 0;
    let parsedData: any = null;
    let parseError = "";

    // ── Step 1: Parse (with retry) ──
    try {
      console.log("[process] Step 1: Calling parse...");
      const parseRes = await fetchWithRetry(
        `${baseUrl}/api/workspace/parse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: "workspace-default",
            propertyId,
            userId,
            documentText,
            analysisType,
          }),
        },
        { retries: 2, label: "parse" }
      );

      if (parseRes.ok) {
        const parseData = await parseRes.json();
        fieldsExtracted = parseData.fieldsExtracted || 0;
        parsedData = parseData.fields;
        console.log("[process] Parse success:", fieldsExtracted, "fields extracted");

        // Update property name if parsed
        if (parsedData) {
          const p = parsedData.property || {};
          const parsedName = p.name || p.property_name
            || parsedData.property_basics?.property_name?.value;
          const parsedAddress = p.address
            || parsedData.property_basics?.address?.value;
          const parsedCity = p.city || parsedData.property_basics?.city?.value;
          const parsedState = p.state || parsedData.property_basics?.state?.value;

          if (parsedName && parsedName !== "Unknown Property") {
            const { buildSmartPropertyName } = await import("@/lib/workspace/propertyNameUtils");
            const smartName = buildSmartPropertyName(parsedName, parsedAddress, parsedCity, parsedState);

            await db.collection("workspace_properties").doc(propertyId).set({
              propertyName: smartName,
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          }
        }
      } else {
        const errText = await parseRes.text().catch(() => "unknown");
        parseError = `Parse returned ${parseRes.status}: ${errText.substring(0, 200)}`;
        console.error("[process] Parse failed:", parseError);
      }
    } catch (err: any) {
      parseError = err?.message || "Parse threw exception";
      console.error("[process] Parse error after retries:", parseError);
    }

    // ── Step 2: Generate output files (only if we got fields) ──
    if (parsedData && fieldsExtracted > 0) {
      try {
        console.log("[process] Step 2: Calling generate...");
        await db.collection("workspace_properties").doc(propertyId).set({
          processingStatus: "generating",
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});

        await fetchWithRetry(
          `${baseUrl}/api/workspace/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyId, userId, parsedData }),
          },
          { retries: 1, label: "generate" }
        );
        console.log("[process] Generate complete");
      } catch (err: any) {
        console.error("[process] Generate error (non-blocking):", err?.message);
      }
    } else {
      console.log("[process] Skipping generate — no parsed data or 0 fields");
    }

    // ── Step 3: Score (ALWAYS runs, even if parse returned few fields) ──
    try {
      console.log("[process] Step 3: Calling score...");
      await db.collection("workspace_properties").doc(propertyId).set({
        processingStatus: "scoring",
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});

      const scoreRes = await fetchWithRetry(
        `${baseUrl}/api/workspace/score`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, userId, analysisType }),
        },
        { retries: 2, label: "score" }
      );

      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        console.log("[process] Score complete:", scoreData.totalScore, scoreData.scoreBand);
      } else {
        const errText = await scoreRes.text().catch(() => "unknown");
        console.error("[process] Score failed:", scoreRes.status, errText.substring(0, 200));
      }
    } catch (err: any) {
      console.error("[process] Score error after retries:", err?.message);
    }

    // ── Done ──
    const finalStatus = fieldsExtracted > 0 ? "parsed" : "pending";
    await db.collection("workspace_properties").doc(propertyId).set({
      processingStatus: "complete",
      parseStatus: finalStatus,
      ...(parseError ? { parseError } : {}),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});

    console.log("[process] Pipeline complete:", { propertyId, fieldsExtracted, parseStatus: finalStatus });

    return NextResponse.json({
      success: true,
      fieldsExtracted,
      propertyId,
      parseError: parseError || undefined,
    });
  } catch (err: any) {
    console.error("[process] Fatal error:", err);
    // Still try to mark property as failed
    if (propertyId) {
      try {
        const db = getAdminDb();
        await db.collection("workspace_properties").doc(propertyId).set({
          processingStatus: "error",
          parseStatus: "pending",
          parseError: err?.message || "Processing failed",
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch { /* last resort */ }
    }
    return NextResponse.json({ error: err?.message || "Processing failed" }, { status: 500 });
  }
}
