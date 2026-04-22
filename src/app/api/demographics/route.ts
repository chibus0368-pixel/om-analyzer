import { NextRequest, NextResponse } from "next/server";
import { fetchTractsInBBox, extractCountyPairs } from "@/lib/demographics/tiger";
import { fetchTractsForCounties } from "@/lib/demographics/census";
import { buildTractIndex, aggregateAt, type RingAggregate } from "@/lib/demographics/aggregate";

/**
 * GET /api/demographics?lat=&lng=&radii=1,3,5
 *
 * Returns everything the panel + choropleth need in one round-trip:
 *   {
 *     center: { lat, lng },
 *     radii:  [1, 3, 5],
 *     rings:  { "1": RingAggregate, "3": ..., "5": ... },
 *     tracts: FeatureCollection with per-tract metrics in properties
 *   }
 *
 * Powers the demographics overlay used in the Pro map and the DealBoard
 * sharing map. Cached server-side per (state, county) for 6 hours, so
 * scrubbing properties around a metro area should hit cache after the
 * first request.
 */
export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const radiiParam = req.nextUrl.searchParams.get("radii") || "1,3,5";
  const radii = radiiParam
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng query parameters are required" }, { status: 400 });
  }
  if (radii.length === 0) {
    return NextResponse.json({ error: "at least one radius required" }, { status: 400 });
  }
  const maxRadius = radii[radii.length - 1];

  try {
    const fc = await fetchTractsInBBox(lat, lng, maxRadius);
    const counties = extractCountyPairs(fc);
    const metrics = await fetchTractsForCounties(counties);
    const index = buildTractIndex(fc, metrics);

    const rings: Record<string, RingAggregate> = {};
    for (const r of radii) {
      rings[String(r)] = aggregateAt({ lat, lng }, index, r);
    }

    // Glue per-tract metrics onto the GeoJSON so the client can color tracts.
    for (const feature of fc.features || []) {
      const geoid = feature.properties?.GEOID;
      const m = geoid ? metrics.get(geoid) : null;
      if (m) {
        feature.properties = { ...feature.properties, ...m };
      }
    }

    return NextResponse.json({
      center: { lat, lng },
      radii,
      rings,
      tracts: fc,
    });
  } catch (err: any) {
    console.error("[demographics] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load demographics" },
      { status: 502 },
    );
  }
}
