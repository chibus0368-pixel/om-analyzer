import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy external upload endpoint.
 *
 * Historically this route accepted multipart PDF bodies, but Vercel's
 * 4.5 MB serverless request body limit makes that unreliable for real
 * OMs. The extension now uses a three-step flow:
 *
 *   POST /api/workspace/upload/external/init      → signed GCS URL
 *   PUT  <signed URL>                             → direct to Storage
 *   POST /api/workspace/upload/external/finalize  → runs the pipeline
 *
 * Anything still hitting this path is an outdated extension build; we
 * return a clear 410 so the user knows to reload it.
 */

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = [/^chrome-extension:\/\/.+$/, /^moz-extension:\/\/.+$/];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.some(re => re.test(origin)) ? origin : "*";
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

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error:
        "This endpoint is deprecated. Reload the DealSignals Crexi extension - " +
        "uploads now go through /init → signed PUT → /finalize to handle large PDFs.",
      upgrade: true,
    },
    { status: 410, headers: corsHeaders(req.headers.get("origin")) },
  );
}
