import { NextRequest, NextResponse } from "next/server";
import { runScoreEngine } from "@/lib/workspace/score-engine";

/**
 * Score API Route — thin wrapper around the score engine.
 * The actual logic lives in @/lib/workspace/score-engine so it can
 * be called directly from the process pipeline without HTTP self-fetch.
 */
export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
    const { userId, overrides, analysisType, propertyId, projectId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const pid = propertyId && typeof propertyId === "string" && propertyId.trim() ? propertyId.trim() : undefined;
    const projId = (projectId && typeof projectId === "string" && projectId.trim()) ? projectId.trim() : "workspace-default";

    if (projId === "workspace-default" && !pid) {
      return NextResponse.json({ error: "Must provide projectId or propertyId" }, { status: 400 });
    }

    const result = await runScoreEngine({
      propertyId: pid,
      projectId: projId,
      userId,
      analysisType,
      overrides,
    });

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: result.error || "Scoring failed" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Scoring route error:", error?.message || error, "| propertyId:", body?.propertyId);
    return NextResponse.json({ error: error.message || "Scoring failed" }, { status: 500 });
  }
}
