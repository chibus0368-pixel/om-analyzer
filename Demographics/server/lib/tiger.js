/**
 * TIGERweb adapter - census tract polygons.
 *
 * Uses the free ArcGIS REST service hosted by the Census Bureau:
 *   https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0
 *
 * Returns GeoJSON FeatureCollection of every tract that intersects a bounding
 * box around (lat,lng, radiusMiles). Also returns the set of (state, county)
 * FIPS pairs involved, so the caller can fetch ACS data for exactly those
 * counties.
 */
const { TTLCache } = require('./cache');

const cache = new TTLCache();

const MILES_PER_DEG_LAT = 69.0;

function bboxAround(lat, lng, miles) {
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
 * Fetch tract polygons in a bbox. Returns GeoJSON FeatureCollection where
 * each feature has properties { GEOID, STATE, COUNTY, TRACT, BASENAME }.
 */
async function fetchTractsInBBox(lat, lng, radiusMiles) {
  // Pad the bbox a touch so we don't clip tracts that straddle the ring.
  const pad = Math.max(radiusMiles * 0.15, 0.5);
  const bbox = bboxAround(lat, lng, radiusMiles + pad);
  const key = `tracts:${bbox.minLat.toFixed(3)}:${bbox.minLng.toFixed(3)}:${bbox.maxLat.toFixed(3)}:${bbox.maxLng.toFixed(3)}`;
  return cache.wrap(key, async () => {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({
        xmin: bbox.minLng,
        ymin: bbox.minLat,
        xmax: bbox.maxLng,
        ymax: bbox.maxLat,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'GEOID,STATE,COUNTY,TRACT,BASENAME,CENTLAT,CENTLON',
      outSR: '4326',
      returnGeometry: 'true',
      f: 'geojson',
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
 * Extract the unique (state, county) FIPS pairs from a FeatureCollection,
 * so the ACS adapter can bulk-fetch those counties.
 */
function extractCountyPairs(featureCollection) {
  const pairs = new Set();
  for (const f of featureCollection.features || []) {
    const p = f.properties || {};
    if (p.STATE && p.COUNTY) pairs.add(`${p.STATE}:${p.COUNTY}`);
  }
  return Array.from(pairs).map(s => {
    const [state, county] = s.split(':');
    return { state, county };
  });
}

module.exports = { fetchTractsInBBox, extractCountyPairs, bboxAround };
