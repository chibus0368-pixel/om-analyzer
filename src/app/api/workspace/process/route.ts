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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      propertyId,
      userId,
      documentText,
      analysisType = "retail",
    } = body;

    if (!propertyId || !userId || !documentText) {
      return NextResponse.json({ error: "propertyId, userId, and documentText are required" }, { status: 400 });
    }

    const db = getAdminDb();
    // Resolve base URL for internal API calls
    // Priority: explicit env var > production domain > Vercel deployment URL > localhost
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_ENV === "production" ? "https://www.dealsignals.app" : null)
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || "http://localhost:3000";
    console.log("[process] baseUrl:", baseUrl, "VERCEL_ENV:", process.env.VERCEL_ENV);

    // Mark property as processing — use set/merge since doc may not exist yet (race condition)
    try {
      await db.collection("workspace_properties").doc(propertyId).set({
        processingStatus: "parsing",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch { /* non-blocking */ }

    let fieldsExtracted = 0;
    let parsedData: any = null;

    // ── Step 1: Parse ──
    try {
      const parseRes = await fetch(`${baseUrl}/api/workspace/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "workspace-default",
          propertyId,
          userId,
          documentText,
          analysisType,
        }),
      });

      if (parseRes.ok) {
        const parseData = await parseRes.json();
        fieldsExtracted = parseData.fieldsExtracted || 0;
        parsedData = parseData.fields;

        // Update property name if parsed — use smart naming (no address in title)
        if (parsedData) {
          const p = parsedData.property || {};
          const parsedName = p.name || p.property_name
            || parsedData.property_basics?.property_name?.value;
          const parsedAddress = p.address
            || parsedData.property_basics?.address?.value;
          const parsedCity = p.city || parsedData.property_basics?.city?.value;
          const parsedState = p.state || parsedData.property_basics?.state?.value;

          if (parsedName && parsedName !== "Unknown Property") {
            // Smart name: strip address duplication, keep it short
            const { buildSmartPropertyName } = await import("@/lib/workspace/propertyNameUtils");
            const smartName = buildSmartPropertyName(parsedName, parsedAddress, parsedCity, parsedState);

            try {
              await db.collection("workspace_properties").doc(propertyId).set({
                propertyName: smartName,
                processingStatus: "scoring",
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            } catch { /* non-blocking */ }
          }
        }
      } else {
        const errText = await parseRes.text().catch(() => "unknown");
        console.error(`[process] Parse failed (${parseRes.status}): URL=${baseUrl}/api/workspace/parse, response=${errText.substring(0, 300)}`);
      }
    } catch (err) {
      console.error("[process] Parse error:", err);
    }

    // ── Step 2: Generate output files ──
    if (parsedData && fieldsExtracted > 0) {
      try {
        await db.collection("workspace_properties").doc(propertyId).set({
          processingStatus: "generating",
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});

        await fetch(`${baseUrl}/api/workspace/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId, userId, parsedData }),
        });
      } catch (err) {
        console.error("[process] Generate error:", err);
      }
    }

    // ── Step 3: Score ──
    try {
      await db.collection("workspace_properties").doc(propertyId).set({
        processingStatus: "scoring",
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});

      await fetch(`${baseUrl}/api/workspace/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, userId, analysisType }),
      });
    } catch (err) {
      console.error("[process] Score error:", err);
    }

    // ── Done ──
    try {
      await db.collection("workspace_properties").doc(propertyId).set({
        processingStatus: "complete",
        parseStatus: fieldsExtracted > 0 ? "parsed" : "pending",
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      fieldsExtracted,
      propertyId,
    });
  } catch (err: any) {
    console.error("[process] Fatal error:", err);
    return NextResponse.json({ error: err?.message || "Processing failed" }, { status: 500 });
  }
}
