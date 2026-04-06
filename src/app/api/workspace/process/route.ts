import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { runParseEngine } from "@/lib/workspace/parse-engine";
import { runScoreEngine } from "@/lib/workspace/score-engine";
import { buildSmartPropertyName } from "@/lib/workspace/propertyNameUtils";

/**
 * Background Processing Endpoint
 *
 * Handles the full parse → score → generate pipeline server-side
 * so the client can safely navigate away after file upload.
 *
 * ARCHITECTURE: Calls parse and score engines DIRECTLY as imported
 * functions — no HTTP self-fetch. This is required for Vercel
 * serverless where functions cannot reliably call other functions
 * on the same deployment via HTTP.
 */
export const maxDuration = 120; // 2 minutes for full pipeline

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
    console.log("[process] Starting pipeline for property:", propertyId, "textLen:", documentText.length, "type:", analysisType);

    // Mark property as processing
    await db.collection("workspace_properties").doc(propertyId).set({
      processingStatus: "parsing",
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});

    let fieldsExtracted = 0;
    let parsedData: any = null;
    let parseError = "";

    // ── Step 1: Parse (direct function call — no HTTP) ──
    try {
      console.log("[process] Step 1: Running parse engine directly...");
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
        console.log("[process] Parse success:", fieldsExtracted, "fields extracted, runId:", parseResult.runId);

        // Update property name if parsed
        if (parsedData) {
          const p = parsedData.property || {};
          const parsedName = p.name || p.property_name;
          const parsedAddress = p.address;
          const parsedCity = p.city;
          const parsedState = p.state;

          if (parsedName && parsedName !== "Unknown Property") {
            const smartName = buildSmartPropertyName(parsedName, parsedAddress, parsedCity, parsedState);
            await db.collection("workspace_properties").doc(propertyId).set({
              propertyName: smartName,
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          }
        }
      } else {
        parseError = parseResult.error || "Parse returned success=false";
        console.error("[process] Parse failed:", parseError);
      }
    } catch (err: any) {
      parseError = err?.message || "Parse threw exception";
      console.error("[process] Parse error:", parseError);
    }

    // ── Step 2: Generate output files (only if we got fields) ──
    if (parsedData && fieldsExtracted > 0) {
      try {
        console.log("[process] Step 2: Generating output records...");
        await db.collection("workspace_properties").doc(propertyId).set({
          processingStatus: "generating",
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});

        // Generate is lightweight — just creates Firestore records
        // We can call the generate route via internal fetch since it's simple,
        // or inline it. For now, inline the essential logic.
        const now = new Date().toISOString();
        const propertyName = parsedData?.property?.name || "Property";

        // Save brief as a note if it exists
        if (parsedData?.brief) {
          try {
            await db.collection("workspace_notes").add({
              projectId: "workspace-default",
              propertyId,
              userId,
              noteType: "investment_thesis",
              title: "First-Pass Investment Brief",
              content: parsedData.brief,
              isPinned: true,
              createdAt: now,
              updatedAt: now,
            });
          } catch { /* non-blocking */ }
        }

        console.log("[process] Generate complete");
      } catch (err: any) {
        console.error("[process] Generate error (non-blocking):", err?.message);
      }
    } else {
      console.log("[process] Skipping generate — no parsed data or 0 fields");
    }

    // ── Step 3: Score (ALWAYS runs, even if parse returned few fields) ──
    try {
      console.log("[process] Step 3: Running score engine directly...");
      await db.collection("workspace_properties").doc(propertyId).set({
        processingStatus: "scoring",
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});

      const scoreResult = await runScoreEngine({
        propertyId,
        projectId: "workspace-default",
        userId,
        analysisType,
      });

      if (scoreResult.success) {
        console.log("[process] Score complete:", scoreResult.totalScore, scoreResult.scoreBand);
      } else {
        console.error("[process] Score failed:", scoreResult.error);
      }
    } catch (err: any) {
      console.error("[process] Score error:", err?.message);
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
