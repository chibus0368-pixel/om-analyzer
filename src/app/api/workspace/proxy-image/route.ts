/**
 * Image proxy for client-side cropping.
 *
 * GET /api/workspace/proxy-image?url=<encoded url>
 *   -> the image bytes, streamed back with CORS-safe headers
 *
 * Why this exists: the image editor on the property page needs to read pixels
 * from the hero image into a <canvas> so it can produce a cropped blob. Canvas
 * reads are blocked by the browser unless the source image was served with
 * CORS headers (Access-Control-Allow-Origin). Hero images come from a mix of
 * sources: firebasestorage.googleapis.com, lh3.googleusercontent.com (Places
 * photos), maps.googleapis.com (Street View / static map), OpenAI DALL-E
 * (generated heroes), and anything extracted from the uploaded OM PDFs.
 * Fetching server-side and re-streaming to the client with our own CORS
 * headers sidesteps the browser check.
 *
 * We accept any HTTPS image URL to keep this compatible with every hero
 * source we render today; the response is gated to content-types that start
 * with "image/" so the route can't be abused as a generic HTTP fetcher.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Explicitly-known image hosts we render today. Kept for readability / audit;
// the actual gate is HTTPS + image/* content-type below.
const KNOWN_IMAGE_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "maps.googleapis.com",
  "maps.gstatic.com",
  "images.unsplash.com",
  "oaidalleapiprodscus.blob.core.windows.net",
  "cdn.openai.com",
  "img.logo.dev",
]);

// Hosts that we explicitly DO NOT proxy (internal / private / metadata).
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,        // link-local / cloud metadata
  /^metadata\.google\./i,
];

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Only HTTPS so we can't be used to leak anything over plaintext.
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "https_required" }, { status: 400 });
  }

  // Block known-bad hosts (private IPs, metadata endpoints).
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(parsed.hostname))) {
    return NextResponse.json({ error: "host_blocked" }, { status: 403 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "DealSignals-ImageProxy/1.0" },
      redirect: "follow",
    });
    if (!upstream.ok) {
      console.warn("[proxy-image] upstream not ok:", parsed.hostname, upstream.status);
      return NextResponse.json(
        { error: "upstream_error", status: upstream.status },
        { status: 502 }
      );
    }

    // Gate by content-type so the route can't be abused to fetch HTML / JSON.
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      console.warn("[proxy-image] non-image content-type:", parsed.hostname, contentType);
      return NextResponse.json(
        { error: "not_an_image", contentType },
        { status: 415 }
      );
    }

    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
        "X-DS-Source-Host": parsed.hostname,
        "X-DS-Source-Known": KNOWN_IMAGE_HOSTS.has(parsed.hostname) ? "1" : "0",
      },
    });
  } catch (err: any) {
    console.warn("[proxy-image] failed:", parsed.hostname, err?.message || err);
    return NextResponse.json({ error: "fetch_failed", hostname: parsed.hostname }, { status: 502 });
  }
}
