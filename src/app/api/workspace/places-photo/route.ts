/**
 * Google Places Photo lookup.
 *
 * GET /api/workspace/places-photo?address=<encoded address>
 *   → { url: "https://lh3.googleusercontent.com/..." }   // success
 *   → 404 { error: "no_photo" }                          // no place or no photo
 *   → 503 { error: "places_unavailable" }                // API key missing / upstream down
 *
 * Why this exists: when we can't pull a hero photo out of the uploaded PDF
 * (design-heavy OMs, scanned flyers, photoless broker decks), we want a
 * Google Places photo of the actual building as the fallback before we
 * drop to Street View / satellite. Places photos are usually much nicer
 * than Street View for commercial buildings, and they're consistent across
 * the product surface (property cards, detail page, email shares).
 *
 * The route runs server-side so we can use the non-public GOOGLE_MAPS_API_KEY
 * and so the final googleusercontent URL (which has no key in it) is safe to
 * store in Firestore and render anywhere.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FindPlaceResponse = {
  status: string;
  candidates?: Array<{
    place_id?: string;
    photos?: Array<{ photo_reference: string; width: number; height: number }>;
  }>;
};

type PlaceDetailsResponse = {
  status: string;
  result?: {
    photos?: Array<{ photo_reference: string; width: number; height: number }>;
  };
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const maxWidth = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("maxwidth") || "1200", 10) || 1200, 200),
    1600
  );

  if (!address) {
    return NextResponse.json({ error: "missing_address" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "places_unavailable" }, { status: 503 });
  }

  try {
    // 1. Find the place. We request photos directly on findplacefromtext;
    //    for many addresses this returns a photo_reference without a second
    //    round-trip to Place Details.
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(address)}` +
      `&inputtype=textquery` +
      `&fields=place_id,photos` +
      `&key=${key}`;

    const findRes = await fetch(findUrl, { signal: AbortSignal.timeout(6000) });
    if (!findRes.ok) {
      return NextResponse.json({ error: "places_unavailable" }, { status: 503 });
    }
    const findData = (await findRes.json()) as FindPlaceResponse;
    if (findData.status !== "OK" || !findData.candidates?.length) {
      return NextResponse.json({ error: "no_place" }, { status: 404 });
    }

    const candidate = findData.candidates[0];
    let photoRef = candidate.photos?.[0]?.photo_reference;

    // 2. If findplacefromtext didn't return photos (common - the photos field
    //    isn't always populated on text search), fall back to Place Details
    //    which is more reliable for photo lookup.
    if (!photoRef && candidate.place_id) {
      const detailsUrl =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${candidate.place_id}` +
        `&fields=photos` +
        `&key=${key}`;
      const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(6000) });
      if (detailsRes.ok) {
        const detailsData = (await detailsRes.json()) as PlaceDetailsResponse;
        photoRef = detailsData.result?.photos?.[0]?.photo_reference;
      }
    }

    if (!photoRef) {
      return NextResponse.json({ error: "no_photo" }, { status: 404 });
    }

    // 3. Resolve photo_reference to the actual googleusercontent URL.
    //    The Places Photo endpoint always 302-redirects to a key-less
    //    lh3.googleusercontent.com URL that's publicly viewable, cacheable,
    //    and safe to store. We follow the redirect manually so we can return
    //    the final URL as JSON instead of streaming the image.
    const photoUrl =
      `https://maps.googleapis.com/maps/api/place/photo` +
      `?maxwidth=${maxWidth}` +
      `&photo_reference=${photoRef}` +
      `&key=${key}`;

    const photoRes = await fetch(photoUrl, { redirect: "manual", signal: AbortSignal.timeout(6000) });
    // 302 = redirect to googleusercontent URL
    const location = photoRes.headers.get("location");
    if (location && location.startsWith("http")) {
      return NextResponse.json({ url: location, placeId: candidate.place_id });
    }

    // If Google didn't redirect for some reason, the direct photo URL still
    // works as a stable endpoint (it just requires the API key in the URL,
    // which is the same public key used client-side for Street View).
    return NextResponse.json({ url: photoUrl, placeId: candidate.place_id });
  } catch (err: any) {
    console.warn("[places-photo] lookup failed:", err?.message || err);
    return NextResponse.json({ error: "places_unavailable" }, { status: 503 });
  }
}
