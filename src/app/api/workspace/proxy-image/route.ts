/**
 * Image proxy for client-side cropping.
 *
 * GET /api/workspace/proxy-image?url=<encoded url>
 *   -> the image bytes, streamed back with CORS-safe headers
 *
 * Why this exists: the image editor on the property page needs to read pixels
 * from the hero image into a <canvas> so it can produce a cropped blob. Canvas
 * reads are blocked by the browser unless the source image was served with
 * CORS headers (Access-Control-Allow-Origin). Our hero images come from a mix
 * of sources: firebasestorage.googleapis.com, lh3.googleusercontent.com
 * (Places photos), maps.googleapis.com (Street View / static map). Only
 * Firebase is reliably CORS-friendly. Fetching server-side and re-streaming
 * to the client with our own CORS headers sidesteps the browser check.
 *
 * Allow-list: we only proxy hosts we already render on the property page, to
 * avoid turning this into an open image fetcher.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = [
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "lh3.googleusercontent.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "maps.googleapis.com",
  "maps.gstatic.com",
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

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "host_not_allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "DealSignals-ImageProxy/1.0" },
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "upstream_error", status: upstream.status },
        { status: 502 }
      );
    }
    const buf = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.warn("[proxy-image] failed:", err?.message || err);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
