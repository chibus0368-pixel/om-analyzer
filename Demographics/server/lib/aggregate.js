/**
 * Radius aggregation.
 *
 * Given tract geometries + ACS metrics + a center point, aggregate the
 * tracts whose centroid falls inside each requested radius (miles). This
 * mirrors how the reference CRE tool aggregates - tracts either count or
 * they don't, no fractional clipping. Simple and defensible.
 *
 * For counts (population, households, daytime workers) we sum.
 * For medians and percentages we compute a population-weighted average,
 * which is a standard CRE industry approximation.
 */

const EARTH_MILES = 3958.8;

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(a));
}

/**
 * Compute the centroid of a polygon ring (simple average of vertices).
 * Good enough for tract-scale geometry used only to decide inside/outside.
 */
function ringCentroid(coords) {
  let x = 0,
    y = 0,
    n = 0;
  for (const [lng, lat] of coords) {
    x += lng;
    y += lat;
    n += 1;
  }
  return n > 0 ? [x / n, y / n] : [0, 0];
}

function featureCentroid(feature) {
  // Prefer TIGERweb's precomputed interior point when available.
  const p = feature.properties || {};
  if (p.CENTLAT && p.CENTLON) {
    return [Number(p.CENTLON), Number(p.CENTLAT)];
  }
  const g = feature.geometry;
  if (!g) return [0, 0];
  if (g.type === 'Polygon') return ringCentroid(g.coordinates[0]);
  if (g.type === 'MultiPolygon') {
    // pick the largest ring by vertex count
    let best = null;
    for (const poly of g.coordinates) {
      const ring = poly[0];
      if (!best || ring.length > best.length) best = ring;
    }
    return best ? ringCentroid(best) : [0, 0];
  }
  return [0, 0];
}

/**
 * Attach centroid coordinates and population for fast aggregation.
 */
function buildTractIndex(featureCollection, metricsByGeoid) {
  const out = [];
  for (const f of featureCollection.features || []) {
    const geoid = f.properties && f.properties.GEOID;
    if (!geoid) continue;
    const metrics = metricsByGeoid.get(geoid);
    if (!metrics) continue;
    const [cLng, cLat] = featureCentroid(f);
    out.push({ geoid, cLat, cLng, metrics });
  }
  return out;
}

/**
 * Aggregate metrics inside `radiusMiles` of (lat,lng).
 */
function aggregateAt(center, index, radiusMiles) {
  const { lat, lng } = center;
  const tracts = index.filter(t => haversine(lat, lng, t.cLat, t.cLng) <= radiusMiles);

  let population = 0;
  let households = 0;
  let daytimeWorkers = 0;
  let wIncomeNum = 0,
    wIncomeDen = 0;
  let wAgeNum = 0,
    wAgeDen = 0;
  let wRentersNum = 0,
    wRentersDen = 0;
  let wEduNum = 0,
    wEduDen = 0;
  let wMedicaidNum = 0,
    wMedicaidDen = 0;
  let wHomeNum = 0,
    wHomeDen = 0;

  for (const t of tracts) {
    const m = t.metrics;
    const pop = Number(m.population) || 0;
    const hh = Number(m.households) || 0;
    population += pop;
    households += hh;
    daytimeWorkers += Number(m.daytimeWorkers) || 0;

    if (m.medIncome != null && hh > 0) {
      wIncomeNum += m.medIncome * hh;
      wIncomeDen += hh;
    }
    if (m.medAge != null && pop > 0) {
      wAgeNum += m.medAge * pop;
      wAgeDen += pop;
    }
    if (m.rentersPct != null && hh > 0) {
      wRentersNum += m.rentersPct * hh;
      wRentersDen += hh;
    }
    if (m.educationPct != null && pop > 0) {
      wEduNum += m.educationPct * pop;
      wEduDen += pop;
    }
    if (m.medicaidPct != null && pop > 0) {
      wMedicaidNum += m.medicaidPct * pop;
      wMedicaidDen += pop;
    }
    if (m.homeValue != null && hh > 0) {
      wHomeNum += m.homeValue * hh;
      wHomeDen += hh;
    }
  }

  const areaSqMi = Math.PI * radiusMiles * radiusMiles;
  const popDensity = areaSqMi > 0 ? population / areaSqMi : 0;

  // Walkability proxy on EPA National Walkability Index scale (1-20).
  // Calibrated so dense urban (~50k/sqmi) -> ~19, suburban (~3k/sqmi) -> ~8,
  // rural (~100/sqmi) -> ~4. For exact EPA values, swap in epa.js fetch.
  const walkability = Math.max(
    1,
    Math.min(20, Math.round(Math.log10(Math.max(popDensity, 1)) * 2.3 * 10) / 10)
  );

  return {
    radiusMiles,
    tractCount: tracts.length,
    population,
    households,
    daytimeWorkers,
    popDensity: Math.round(popDensity),
    medIncome: wIncomeDen ? Math.round(wIncomeNum / wIncomeDen) : null,
    medAge: wAgeDen ? Math.round((wAgeNum / wAgeDen) * 10) / 10 : null,
    rentersPct: wRentersDen ? Math.round((wRentersNum / wRentersDen) * 10) / 10 : null,
    educationPct: wEduDen ? Math.round((wEduNum / wEduDen) * 10) / 10 : null,
    medicaidPct: wMedicaidDen ? Math.round((wMedicaidNum / wMedicaidDen) * 10) / 10 : null,
    homeValue: wHomeDen ? Math.round(wHomeNum / wHomeDen) : null,
    walkability,
    tractGeoids: tracts.map(t => t.geoid),
  };
}

module.exports = { buildTractIndex, aggregateAt, haversine };
