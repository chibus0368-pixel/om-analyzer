/**
 * Census ACS 5-Year adapter.
 *
 * Pulls every metric the SiteMap CRE demographics panel surfaces, using
 * two parallel calls per (state, county):
 *
 *   1. acs5/profile (Data Profile): population, households, income, age,
 *      renters, education, home value, daytime workers.
 *   2. acs5 detailed table C27007: Medicaid / means-tested public coverage.
 *
 * Framework-free so it can be reused by any Node project.
 */
import { TTLCache } from "./cache";

const cache = new TTLCache();

const PROFILE_VARS: Record<string, string> = {
  population: "DP05_0001E",
  households: "DP02_0001E",
  medIncome: "DP03_0062E",
  medAge: "DP05_0018E",
  rentersPct: "DP04_0047PE",
  educationPct: "DP02_0068PE",
  homeValue: "DP04_0089E",
  daytimeWorkers: "DP03_0004E",
};

const MEDICAID_UNIVERSE = "C27007_001E";
const MEDICAID_COMPONENTS = [
  "C27007_004E",
  "C27007_007E",
  "C27007_010E",
  "C27007_014E",
  "C27007_017E",
  "C27007_020E",
];

const PROFILE_VAR_LIST = Object.values(PROFILE_VARS);

export interface TractMetrics {
  GEOID: string;
  NAME: string;
  population: number | null;
  households: number | null;
  medIncome: number | null;
  medAge: number | null;
  rentersPct: number | null;
  educationPct: number | null;
  homeValue: number | null;
  daytimeWorkers: number | null;
  medicaidCount: number | null;
  medicaidUniverse: number | null;
  medicaidPct: number | null;
}

function cleanNum(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  // Census uses large negative sentinels (-666666666, -888888888) for
  // missing / suppressed data.
  return Number.isFinite(n) && n > -1e8 ? n : null;
}

function acsKey(): string {
  return process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : "";
}

async function fetchJson(url: string): Promise<any[][]> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Census request failed ${res.status} ${url}\n${body.slice(0, 200)}`);
  }
  return res.json();
}

interface RowMapEntry {
  row: any[];
  idx: Record<string, number>;
}

function rowsToMap(rows: any[][]): Map<string, RowMapEntry> {
  const headers = rows[0];
  const idx: Record<string, number> = Object.fromEntries(
    headers.map((h: string, i: number) => [h, i]),
  );
  const out = new Map<string, RowMapEntry>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const geoid = `${r[idx.state]}${r[idx.county]}${r[idx.tract]}`;
    out.set(geoid, { row: r, idx });
  }
  return out;
}

/**
 * Fetch ALL metrics for every tract in (state, county).
 * Returns a Map<geoid, TractMetrics>.
 */
export async function fetchTractsForCounty(
  stateFips: string,
  countyFips: string,
  year: string = process.env.ACS_YEAR || "2022",
): Promise<Map<string, TractMetrics>> {
  const cacheKey = `acs:${year}:${stateFips}:${countyFips}`;
  return cache.wrap(cacheKey, async () => {
    const profileUrl =
      `https://api.census.gov/data/${year}/acs/acs5/profile` +
      `?get=NAME,${PROFILE_VAR_LIST.join(",")}` +
      `&for=tract:*&in=state:${stateFips}%20county:${countyFips}${acsKey()}`;
    const medicaidVars = [MEDICAID_UNIVERSE, ...MEDICAID_COMPONENTS];
    const medicaidUrl =
      `https://api.census.gov/data/${year}/acs/acs5` +
      `?get=NAME,${medicaidVars.join(",")}` +
      `&for=tract:*&in=state:${stateFips}%20county:${countyFips}${acsKey()}`;

    const [profileRows, medicaidRows] = await Promise.all([
      fetchJson(profileUrl),
      fetchJson(medicaidUrl),
    ]);

    const profile = rowsToMap(profileRows);
    const medicaid = rowsToMap(medicaidRows);

    const out = new Map<string, TractMetrics>();
    for (const [geoid, { row, idx }] of profile) {
      const rec: TractMetrics = {
        GEOID: geoid,
        NAME: String(row[idx.NAME]),
        population: null,
        households: null,
        medIncome: null,
        medAge: null,
        rentersPct: null,
        educationPct: null,
        homeValue: null,
        daytimeWorkers: null,
        medicaidCount: null,
        medicaidUniverse: null,
        medicaidPct: null,
      };
      for (const [name, variable] of Object.entries(PROFILE_VARS)) {
        (rec as any)[name] = cleanNum(row[idx[variable]]);
      }
      const m = medicaid.get(geoid);
      if (m) {
        const universe = cleanNum(m.row[m.idx[MEDICAID_UNIVERSE]]);
        const covered = MEDICAID_COMPONENTS.reduce(
          (s, v) => s + (cleanNum(m.row[m.idx[v]]) || 0),
          0,
        );
        rec.medicaidCount = covered;
        rec.medicaidUniverse = universe;
        rec.medicaidPct =
          universe && universe > 0
            ? Math.round((covered / universe) * 1000) / 10
            : null;
      }
      out.set(geoid, rec);
    }
    return out;
  });
}

/**
 * Fetch a union of tract records for multiple (state, county) pairs.
 * Map is keyed by GEOID.
 */
export async function fetchTractsForCounties(
  pairs: Array<{ state: string; county: string }>,
  year?: string,
): Promise<Map<string, TractMetrics>> {
  const unique = new Set(pairs.map((p) => `${p.state}:${p.county}`));
  const combined = new Map<string, TractMetrics>();
  for (const key of unique) {
    const [state, county] = key.split(":");
    const rows = await fetchTractsForCounty(state, county, year);
    for (const [geoid, rec] of rows) combined.set(geoid, rec);
  }
  return combined;
}
