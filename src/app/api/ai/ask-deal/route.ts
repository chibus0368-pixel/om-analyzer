import { NextRequest, NextResponse } from "next/server";

/**
 * Ask the Deal - TEMPORARILY DISABLED
 * This feature is being revisited for accuracy improvements.
 * Returns a clear disabled message so the UI handles it gracefully.
 */

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Ask the Deal is temporarily disabled while we improve accuracy. Check back soon!" },
    { status: 503 },
  );
}
