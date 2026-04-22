/**
 * GET /api/tracts?lat=&lng=&radius=
 *
 * Returns a FeatureCollection of Census tract polygons that intersect the
 * bounding box around (lat,lng, radius miles). Used by the frontend to paint
 * the choropleth on the map.
 */
const express = require('express');
const router = express.Router();
const { fetchTractsInBBox } = require('../lib/tiger');

router.get('/', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius ?? 5);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat/lng required' });
    }
    const fc = await fetchTractsInBBox(lat, lng, radius);
    res.json(fc);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
