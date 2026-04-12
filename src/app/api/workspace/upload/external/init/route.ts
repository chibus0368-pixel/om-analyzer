import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";

/**
 * External Upload — step 1 of 3: INIT.
 *
 * Why three steps? Vercel serverless has a hard 4.5 MB request body
 * limit (FUNCTION_PAYLOAD_TOO_LARGE) and Crexi PDFs routinely exceed
 * that. To sidestep it we:
 *
 *   1. /init      → create the property row, return a V4 signed URL
 *                   that lets the extension PUT raw bytes directly to
 *                   Firebase Storage (no Vercel hop).
 *   2. PUT        → extension uploads the PDF straight to GCS.
 *   3. /finalize  → server pulls bytes back from GCS and runs the
 *                   parse/score pipeline via `after()`.
 *
 * Auth: same shared X-API-Key / EXTENSION_USER_ID as the legacy route.
 */

export const maxDuration = 30;
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

  const fileName = String(body?.fileName || "crexi-upload.pdf");
  const workspaceId = String(body?.workspaceId || "default");
  const fallbackAnalysisType = String(body?.analysisType || "retail");
  const propertyNameIn = String(body?.propertyName || "").trim();
  const sourceUrl = String(body?.sourceUrl || "").trim();
  const heroImageUrlIn = String(body?.heroImageUrl || "").trim();

  // Create the property row up front so the extension has something to
  // link to immediately. Pro polls workspace_properties and lights the
  // card up as each pipeline stage writes back.
  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const initialName =
    propertyNameIn || fileName.replace(/\.[^.]+$/, "").trim() || "Untitled Property";

  let propertyId: string;
  try {
    const propertyRef = await db.collection("workspace_properties").add({
      projectId: "workspace-default",
      workspaceId,
      userId,
      propertyName: initialName,
      sourceUrl: sourceUrl || null,
      source: "crexi_extension",
      parseStatus: "pending",
      processingStatus: "uploading",
      analysisType: fallbackAnalysisType,
      // Crexi CDN images are publicly readable so we pass the URL
      // straight through instead of rehosting. If empty, the property
      // page falls back to a static map tile based on the address.
      ...(heroImageUrlIn ? { heroImageUrl: heroImageUrlIn } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    propertyId = propertyRef.id;
  } catch (err: any) {
    return json(
      req,
      { error: `Failed to create property row: ${err?.message || err}` },
      { status: 500 },
    );
  }

  // Build a storage path that matches the web upload convention so the
  // property detail page's Source Documents panel can open it via
  // getDownloadURL(ref(storage, doc.storagePath)).
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${Date.now()}_${safeName}`;
  const storagePath = `workspace/${userId}/workspace-default/${propertyId}/inputs/${storedFilename}`;

  // Generate a V4 signed PUT URL. 15-minute TTL is plenty for even the
  // largest OMs on a slow connection.
  let uploadUrl: string;
  try {
    const bucket = getAdminStorage().bucket();
    const [signed] = await bucket.file(storagePath).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType: "application/pdf",
    });
    uploadUrl = signed;
  } catch (err: any) {
    console.error("[external/init] signed URL failed:", err?.message);
    return json(
      req,
      { error: `Could not issue upload URL: ${err?.message || err}` },
      { status: 500 },
    );
  }

  return json(req, {
    success: true,
    propertyId,
    propertyName: initialName,
    storagePath,
    uploadUrl,
    // The extension MUST send this header on the PUT or GCS rejects it.
    uploadHeaders: { "Content-Type": "application/pdf" },
    url: `/workspace/properties/${propertyId}`,
  });
}
