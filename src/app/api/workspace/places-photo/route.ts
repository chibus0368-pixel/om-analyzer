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
  error_message?: string;
  candidates?: Array<{
    place_id?: string;
    photos?: Array<{ photo_reference: string; width: number; height: number }>;
  }>;
};

type PlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    photos?: Array<{ photo_reference: string; width: number; height: number }>;
  };
};

type NewPlacesSearchResponse = {
  places?: Array<{
    id?: string;
    photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  }>;
};

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const maxWidth = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("maxwidth") || "1200", 10) || 1200, 200),
    1600
  );

  if (!address) {
    return NextResponse.json({ error: "missing_address" }, { status: 400 });
  }

  // Prefer a server-only key when present so the public NEXT_PUBLIC_*
  // key (which is typically restricted by HTTP referrer) doesn't get
  // rejected by Google when called from a server-to-server context.
  // Set GOOGLE_PLACES_API_KEY in Vercel for the cleanest setup; we
  // fall back to GOOGLE_MAPS_API_KEY (server) and finally to the public
  // key so existing deployments don't break.
  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    console.warn("[places-photo] No API key configured");
    return NextResponse.json(
      { error: "places_unavailable", detail: "No GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY env var set." },
      { status: 503 }
    );
  }

  // Helper to wrap a debug payload onto error responses without
  // changing the production happy-path shape.
  const fail = (status: number, body: Record<string, any>) =>
    NextResponse.json(debug ? { ...body, address, keySource: keySourceLabel() } : body, { status });
  const keySourceLabel = () =>
    process.env.GOOGLE_PLACES_API_KEY
      ? "GOOGLE_PLACES_API_KEY"
      : process.env.GOOGLE_MAPS_API_KEY
      ? "GOOGLE_MAPS_API_KEY"
      : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (browser-restricted - may fail server-side)";

  try {
    // ── ATTEMPT 1: legacy Places API (findplacefromtext + details) ──
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(address)}` +
      `&inputtype=textquery` +
      `&fields=place_id,photos` +
      `&key=${key}`;

    const findRes = await fetch(findUrl, { signal: AbortSignal.timeout(6000) });
    if (findRes.ok) {
      const findData = (await findRes.json()) as FindPlaceResponse;
      // Google returns 200 with status=REQUEST_DENIED when the key isn't
      // authorized for legacy Places API. Surface the real reason in logs
      // and the debug payload.
      if (findData.status === "REQUEST_DENIED" || findData.status === "INVALID_REQUEST") {
        console.warn(
          `[places-photo] legacy findplace ${findData.status}: ${findData.error_message || "(no detail)"} - falling through to new Places API`
        );
      } else if (findData.status === "OK" && findData.candidates?.length) {
        const candidate = findData.candidates[0];
        let photoRef = candidate.photos?.[0]?.photo_reference;

        if (!photoRef && candidate.place_id) {
          const detailsUrl =
            `https://maps.googleapis.com/maps/api/place/details/json` +
            `?place_id=${candidate.place_id}` +
            `&fields=photos` +
            `&key=${key}`;
          const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(6000) });
          if (detailsRes.ok) {
            const detailsData = (await detailsRes.json()) as PlaceDetailsResponse;
            if (detailsData.status === "OK") {
              photoRef = detailsData.result?.photos?.[0]?.photo_reference;
            } else if (
              detailsData.status === "REQUEST_DENIED" ||
              detailsData.status === "INVALID_REQUEST"
            ) {
              console.warn(
                `[places-photo] legacy details ${detailsData.status}: ${detailsData.error_message || "(no detail)"}`
              );
            }
          }
        }

        if (photoRef) {
          const photoUrl =
            `https://maps.googleapis.com/maps/api/place/photo` +
            `?maxwidth=${maxWidth}` +
            `&photo_reference=${photoRef}` +
            `&key=${key}`;
          const photoRes = await fetch(photoUrl, { redirect: "manual", signal: AbortSignal.timeout(6000) });
          const location = photoRes.headers.get("location");
          if (location && location.startsWith("http")) {
            return NextResponse.json({ url: location, placeId: candidate.place_id, source: "places_legacy" });
          }
          return NextResponse.json({ url: photoUrl, placeId: candidate.place_id, source: "places_legacy" });
        }
      }
    }

    // ── ATTEMPT 2: new Places API (Text Search) ──
    // This is what users get if they only enabled "Places API (New)" in
    // GCP. Different request shape, different auth header, different
    // response shape, and the photo "name" needs to be passed back to a
    // /v1/{name}/media endpoint to resolve the actual image.
    const newSearchRes = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id,places.photos",
        },
        body: JSON.stringify({ textQuery: address }),
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!newSearchRes.ok) {
      const detail = await newSearchRes.text().catch(() => "");
      console.warn(`[places-photo] new Places searchText HTTP ${newSearchRes.status}:`, detail.slice(0, 300));
      return fail(503, {
        error: "places_unavailable",
        detail: `Places search failed: HTTP ${newSearchRes.status}. ${detail.slice(0, 200)}`,
      });
    }

    const newData = (await newSearchRes.json()) as NewPlacesSearchResponse;
    const newPlace = newData.places?.[0];
    const photoName = newPlace?.photos?.[0]?.name;
    if (!photoName) {
      return fail(404, { error: "no_photo", detail: "Place found but has no photos." });
    }

    // Resolve photo "name" (e.g. "places/ABC/photos/XYZ") to the actual
    // googleusercontent URL via /v1/{name}/media. We follow the redirect
    // manually to capture the final key-less URL.
    const newPhotoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&skipHttpRedirect=true`,
      {
        headers: { "X-Goog-Api-Key": key },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!newPhotoRes.ok) {
      const detail = await newPhotoRes.text().catch(() => "");
      console.warn(`[places-photo] new Places media HTTP ${newPhotoRes.status}:`, detail.slice(0, 300));
      return fail(503, {
        error: "places_unavailable",
        detail: `Places photo media failed: HTTP ${newPhotoRes.status}.`,
      });
    }
    const mediaJson = await newPhotoRes.json().catch(() => ({}));
    const mediaUrl = (mediaJson as any)?.photoUri;
    if (mediaUrl && typeof mediaUrl === "string") {
      return NextResponse.json({ url: mediaUrl, placeId: newPlace?.id, source: "places_new" });
    }

    return fail(404, { error: "no_photo", detail: "Photo found but no resolvable URL returned." });
  } catch (err: any) {
    console.warn("[places-photo] lookup failed:", err?.message || err);
    return fail(503, { error: "places_unavailable", detail: err?.message || "Unknown error" });
  }
}
