import { NextRequest, NextResponse } from "next/server";
import { classifyDocument } from "@/lib/workspace/classify";

/**
 * Classify an offering document into one analysis type. Thin wrapper
 * around the shared `classifyDocument` helper so both the web upload
 * path and the extension upload path can share one implementation.
 */
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { documentText } = await req.json();
    if (!documentText || typeof documentText !== "string") {
      return NextResponse.json({ error: "Missing documentText" }, { status: 400 });
    }
    const result = await classifyDocument(documentText);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[classify] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Classification failed", details: err?.message },
      { status: 500 },
    );
  }
}
