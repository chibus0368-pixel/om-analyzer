import { NextRequest, NextResponse } from "next/server";
import { runParseEngine } from "@/lib/workspace/parse-engine";

// Allow up to 120 seconds for two-stage parsing
export const maxDuration = 120;

/**
 * Parse API Route — thin wrapper around the parse engine.
 * The actual logic lives in @/lib/workspace/parse-engine so it can
 * be called directly from the process pipeline without HTTP self-fetch.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, propertyId, userId, documentText, analysisType = "retail" } = body;

    if (!userId || !documentText) {
      return NextResponse.json({ error: "Missing userId or documentText" }, { status: 400 });
    }

    const result = await runParseEngine({
      projectId,
      propertyId,
      userId,
      documentText,
      analysisType,
    });

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.error || "Parser failed" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Parser route error:", error);
    return NextResponse.json({ error: error.message || "Parser failed. Try again." }, { status: 500 });
  }
}
