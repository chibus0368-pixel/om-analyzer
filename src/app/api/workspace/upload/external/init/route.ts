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
  const nonce = String(body?.nonce || "").trim();

  const db = getAdminDb();
  const nowIso = new Date().toISOString();
  const initialName =
    propertyNameIn || fileName.replace(/\.[^.]+$/, "").trim() || "Untitled Property";

  // ── Idempotency + deduplication ──────────────────────────────────────
  //
  // Two layers of protection against duplicate property rows:
  //
  // 1. NONCE (idempotency key): the extension sends a unique nonce per
  //    save click. We use it as the Firestore document ID. If /init is
  //    called twice with the same nonce (service-worker retry, Vercel
  //    cold-start replay, etc.), the second write is an idempotent merge
  //    onto the same doc — no duplicate created.
  //
  // 2. SOURCE URL dedup: if the user intentionally re-saves the same
  //    Crexi listing later (different nonce), we find the existing
  //    property by sourceUrl and reuse it. Single-field query avoids
  //    needing a composite Firestore index.
  let propertyId = "";
  try {
    // Layer 2: sourceUrl dedup (only if no nonce match since nonce is
    // per-click and won't match across sessions)
    if (sourceUrl) {
      const existing = await db
        .collection("workspace_properties")
        .where("sourceUrl", "==", sourceUrl)
        .limit(5)
        .get();
      // Filter to this user's docs client-side (avoids composite index)
      const match = existing.docs.find(
        (d) => (d.data() as any)?.userId === userId,
      );
      if (match) {
        propertyId = match.id;
        await match.ref.set(
          {
            processingStatus: "uploading",
            parseStatus: "pending",
            parseError: null,
            workspaceId,
            analysisType: fallbackAnalysisType,
            ...(heroImageUrlIn ? { heroImageUrl: heroImageUrlIn } : {}),
            updatedAt: nowIso,
          },
          { merge: true },
        );
        console.log(`[external/init] resave: reusing property ${propertyId} for ${sourceUrl}`);
      }
    }

    // Layer 1: if no existing property, use nonce as doc ID (idempotent)
    if (!propertyId) {
      const docId = nonce || undefined; // undefined = Firestore auto-ID
      const docRef = docId
        ? db.collection("workspace_properties").doc(docId)
        : db.collection("workspace_properties").doc();
      propertyId = docRef.id;

      await docRef.set(
        {
          projectId: "workspace-default",
          workspaceId,
          userId,
          propertyName: initialName,
          sourceUrl: sourceUrl || null,
          source: "crexi_extension",
          parseStatus: "pending",
          processingStatus: "uploading",
          analysisType: fallbackAnalysisType,
          ...(heroImageUrlIn ? { heroImageUrl: heroImageUrlIn } : {}),
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }, // merge so a retry with the same nonce is a no-op
      );
    }
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
