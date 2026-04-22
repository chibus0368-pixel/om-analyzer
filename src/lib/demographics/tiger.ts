/**
 * TIGERweb adapter: census tract polygons.
 *
 * Uses the free ArcGIS REST service hosted by the Census Bureau:
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0
 *
 * Returns GeoJSON FeatureCollection of every tract that intersects a bounding
 * box around (lat,lng, radiusMiles). Also exposes a helper to extract the
 * unique (state, county) FIPS pairs so the ACS adapter can bulk-fetch them.
 */
import { TTLCache } from "./cache";

const cache = new TTLCache();

const MILES_PER_DEG_LAT = 69.0;

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface TractFeatureProps {
  GEOID: string;
  STATE: string;
  COUNTY: string;
  TRACT: string;
  BASENAME?: string;
  CENTLAT?: string;
  CENTLON?: string;
}

export interface TractFeature {
  type: "Feature";
  properties: TractFeatureProps;
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | null;
}

export interface TractFeatureCollection {
  type: "FeatureCollection";
  features: TractFeature[];
}

export function bboxAround(lat: number, lng: number, miles: number): BBox {
  const dLat = miles / MILES_PER_DEG_LAT;
  const milesPerDegLng = MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const dLng = miles / Math.max(milesPerDegLng, 0.0001);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

/**
 * Fetch tract polygons in a bbox around (lat,lng,radiusMiles).
 */
export async function fetchTractsInBBox(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<TractFeatureCollection> {
  const pad = Math.max(radiusMiles * 0.15, 0.5);
  const bbox = bboxAround(lat, lng, radiusMiles + pad);
  const key = `tracts:${bbox.minLat.toFixed(3)}:${bbox.minLng.toFixed(3)}:${bbox.maxLat.toFixed(3)}:${bbox.maxLng.toFixed(3)}`;
  return cache.wrap<TractFeatureCollection>(key, async () => {
    const params = new URLSearchParams({
      where: "1=1",
      geometry: JSON.stringify({
        xmin: bbox.minLng,
        ymin: bbox.minLat,
        xmax: bbox.maxLng,
        ymax: bbox.maxLat,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "GEOID,STATE,COUNTY,TRACT,BASENAME,CENTLAT,CENTLON",
      outSR: "4326",
      returnGeometry: "true",
      f: "geojson",
    });
    const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TIGERweb request failed ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  });
}

/**
 * Extract the unique (state, county) FIPS pairs from a FeatureCollection.
 */
export function extractCountyPairs(
  fc: TractFeatureCollection,
): Array<{ state: string; county: string }> {
  const pairs = new Set<string>();
  for (const f of fc.features || []) {
    const p = f.properties || ({} as TractFeatureProps);
    if (p.STATE && p.COUNTY) pairs.add(`${p.STATE}:${p.COUNTY}`);
  }
  return Array.from(pairs).map((s) => {
    const [state, county] = s.split(":");
    return { state, county };
  });
}
