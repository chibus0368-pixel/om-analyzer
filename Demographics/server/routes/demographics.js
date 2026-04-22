/**
 * GET /api/demographics?lat=&lng=&radii=1,3,5
 *
 * The main endpoint. Returns everything the frontend panel + choropleth need
 * in one round trip:
 *
 *   {
 *     center: { lat, lng },
 *     radii: [1, 3, 5],
 *     rings: { "1": {...metrics}, "3": {...}, "5": {...} },
 *     tracts: FeatureCollection with per-tract metrics glued into properties
 *   }
 */
const express = require('express');
const router = express.Router();
const { fetchTractsInBBox, extractCountyPairs } = require('../lib/tiger');
const { fetchTractsForCounties } = require('../lib/census');
const { buildTractIndex, aggregateAt } = require('../lib/aggregate');

router.get('/', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radii = (req.query.radii || '1,3,5')
      .toString()
      .split(',')
      .map(Number)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat/lng required' });
    }
    if (radii.length === 0) {
      return res.status(400).json({ error: 'at least one radius required' });
    }
    const maxRadius = radii[radii.length - 1];

    // 1. tracts in bbox
    const fc = await fetchTractsInBBox(lat, lng, maxRadius);
    // 2. ACS data for the counties those tracts live in
    const counties = extractCountyPairs(fc);
    const metrics = await fetchTractsForCounties(counties);
    // 3. build index + aggregate per ring
    const index = buildTractIndex(fc, metrics);
    const rings = {};
    for (const r of radii) rings[String(r)] = aggregateAt({ lat, lng }, index, r);

    // 4. glue metrics onto the GeoJSON so the frontend can color tracts
    for (const feature of fc.features || []) {
      const geoid = feature.properties?.GEOID;
      const m = metrics.get(geoid);
      if (m) {
        feature.properties = { ...feature.properties, ...m };
      }
    }

    res.json({ center: { lat, lng }, radii, rings, tracts: fc });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
