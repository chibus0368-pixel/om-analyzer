import { NextRequest, NextResponse, after } from "next/server";
import { runExtensionUploadPipeline } from "@/lib/workspace/extension-pipeline";

/**
 * External Upload — step 3 of 3: FINALIZE.
 *
 * The extension has already created the property row via /init and
 * PUT the PDF bytes directly to Firebase Storage. This endpoint just
 * kicks off the full extract → classify → parse → generate → score
 * pipeline via `after()` so the client can return instantly.
 *
 * The pipeline itself lives in `lib/workspace/extension-pipeline.ts`
 * and mirrors /api/workspace/process exactly (direct function imports,
 * no HTTP self-fetch — per ARCHITECTURE LOCK).
 */

export const maxDuration = 180;
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

function json(req: NextRequest, data: any, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...corsHeaders(req.headers.get("origin")),
      ...(init?.headers || {}),
    },
  });
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") || "";
  const expected = process.env.EXTENSION_API_KEY || "";
  if (!expected) {
    return json(req, { error: "EXTENSION_API_KEY not configured" }, { status: 500 });
  }
  if (!apiKey || apiKey !== expected) {
    return json(req, { error: "Unauthorized" }, { status: 401 });
  }

  const userId = process.env.EXTENSION_USER_ID || "";
  if (!userId) {
    return json(req, { error: "EXTENSION_USER_ID not configured" }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err: any) {
    return json(req, { error: `Invalid JSON body: ${err?.message || err}` }, { status: 400 });
  }

  const propertyId = String(body?.propertyId || "").trim();
  const storagePath = String(body?.storagePath || "").trim();
  const fileName = String(body?.fileName || "crexi-upload.pdf");
  const workspaceId = String(body?.workspaceId || "default");
  const fallbackAnalysisType = String(body?.analysisType || "retail");

  if (!propertyId || !storagePath) {
    return json(
      req,
      { error: "propertyId and storagePath are required" },
      { status: 400 },
    );
  }

  // Kick off the whole pipeline AFTER the response flushes so the
  // extension shows "Saved — analysis running" in well under a second.
  after(async () => {
    await runExtensionUploadPipeline({
      propertyId,
      userId,
      workspaceId,
      storagePath,
      fileName,
      fallbackAnalysisType,
    });
  });

  return json(req, {
    success: true,
    propertyId,
    status: "processing",
    url: `/workspace/properties/${propertyId}`,
  });
}
