/**
 * Radius aggregation.
 *
 * Tract-centroid-in-ring inclusion (no fractional clipping). Counts get
 * summed; medians and percentages use a population-weighted average, the
 * standard CRE-tool approximation. Walkability is a population-density
 * proxy on the EPA National Walkability Index 1-20 scale.
 */
import type { TractMetrics } from "./census";
import type { TractFeature, TractFeatureCollection } from "./tiger";

const EARTH_MILES = 3958.8;

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(a));
}

function ringCentroid(coords: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const [lng, lat] of coords) {
    x += lng;
    y += lat;
    n += 1;
  }
  return n > 0 ? [x / n, y / n] : [0, 0];
}

function featureCentroid(feature: TractFeature): [number, number] {
  const p = feature.properties || ({} as any);
  if (p.CENTLAT && p.CENTLON) {
    return [Number(p.CENTLON), Number(p.CENTLAT)];
  }
  const g = feature.geometry;
  if (!g) return [0, 0];
  if (g.type === "Polygon") return ringCentroid(g.coordinates[0]);
  if (g.type === "MultiPolygon") {
    let best: number[][] | null = null;
    for (const poly of g.coordinates) {
      const ring = poly[0];
      if (!best || ring.length > best.length) best = ring;
    }
    return best ? ringCentroid(best) : [0, 0];
  }
  return [0, 0];
}

export interface IndexedTract {
  geoid: string;
  cLat: number;
  cLng: number;
  metrics: TractMetrics;
}

export function buildTractIndex(
  fc: TractFeatureCollection,
  metricsByGeoid: Map<string, TractMetrics>,
): IndexedTract[] {
  const out: IndexedTract[] = [];
  for (const f of fc.features || []) {
    const geoid = f.properties && f.properties.GEOID;
    if (!geoid) continue;
    const metrics = metricsByGeoid.get(geoid);
    if (!metrics) continue;
    const [cLng, cLat] = featureCentroid(f);
    out.push({ geoid, cLat, cLng, metrics });
  }
  return out;
}

export interface RingAggregate {
  radiusMiles: number;
  tractCount: number;
  population: number;
  households: number;
  daytimeWorkers: number;
  popDensity: number;
  medIncome: number | null;
  medAge: number | null;
  rentersPct: number | null;
  educationPct: number | null;
  medicaidPct: number | null;
  homeValue: number | null;
  walkability: number;
  tractGeoids: string[];
}

export function aggregateAt(
  center: { lat: number; lng: number },
  index: IndexedTract[],
  radiusMiles: number,
): RingAggregate {
  const { lat, lng } = center;
  const tracts = index.filter(
    (t) => haversine(lat, lng, t.cLat, t.cLng) <= radiusMiles,
  );

  let population = 0;
  let households = 0;
  let daytimeWorkers = 0;
  let wIncomeNum = 0;
  let wIncomeDen = 0;
  let wAgeNum = 0;
  let wAgeDen = 0;
  let wRentersNum = 0;
  let wRentersDen = 0;
  let wEduNum = 0;
  let wEduDen = 0;
  let wMedicaidNum = 0;
  let wMedicaidDen = 0;
  let wHomeNum = 0;
  let wHomeDen = 0;

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

  const walkability = Math.max(
    1,
    Math.min(20, Math.round(Math.log10(Math.max(popDensity, 1)) * 2.3 * 10) / 10),
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
    medicaidPct: wMedicaidDen
      ? Math.round((wMedicaidNum / wMedicaidDen) * 10) / 10
      : null,
    homeValue: wHomeDen ? Math.round(wHomeNum / wHomeDen) : null,
    walkability,
    tractGeoids: tracts.map((t) => t.geoid),
  };
}
