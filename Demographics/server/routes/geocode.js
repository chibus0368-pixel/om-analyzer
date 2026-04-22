/**
 * GET /api/geocode?address=...
 *
 * Proxies the free Census Geocoder (no key required).
 * Returns { lat, lng, matchedAddress, state, county }.
 */
const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const address = (req.query.address || '').toString().trim();
    if (!address) return res.status(400).json({ error: 'address is required' });

    const params = new URLSearchParams({
      address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`geocoder ${r.status}`);
    const body = await r.json();
    const match = body?.result?.addressMatches?.[0];
    if (!match) return res.status(404).json({ error: 'no match' });
    return res.json({
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      matchedAddress: match.matchedAddress,
      state: match.addressComponents?.state,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
