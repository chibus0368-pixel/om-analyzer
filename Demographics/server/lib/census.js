/**
 * Census ACS 5-Year adapter.
 *
 * Pulls every metric the reference SiteMap CRE demographics panel surfaces.
 * Two parallel calls per (state, county) keep the request count minimal:
 *
 *   1. acs5/profile (Data Profile) - the bulk of variables:
 *        DP05_0001E  Total population
 *        DP02_0001E  Total households
 *        DP03_0062E  Median household income (USD)
 *        DP05_0018E  Median age
 *        DP04_0047PE Renter-occupied housing units (%)
 *        DP02_0068PE Pop 25+ with Bachelor's+ (%)
 *        DP04_0089E  Median value of owner-occupied units (USD)
 *        DP03_0004E  Employed civilian population 16+ (daytime workforce proxy)
 *
 *   2. acs5 (detailed table C27007) - Medicaid / means-tested public coverage:
 *        C27007_001E  Civilian noninstitutionalized pop (universe)
 *        C27007_004E  Male, under 19, with Medicaid
 *        C27007_007E  Male, 19-64,   with Medicaid
 *        C27007_010E  Male, 65+,     with Medicaid
 *        C27007_014E  Female, <19,   with Medicaid
 *        C27007_017E  Female, 19-64, with Medicaid
 *        C27007_020E  Female, 65+,   with Medicaid
 *
 * Docs:
 *   https://api.census.gov/data/2022/acs/acs5/profile/variables.html
 *   https://api.census.gov/data/2022/acs/acs5/variables.html
 *
 * Framework-free so it can be reused by any Node project.
 */
const { TTLCache } = require('./cache');

const cache = new TTLCache();

const PROFILE_VARS = {
  population: 'DP05_0001E',
  households: 'DP02_0001E',
  medIncome: 'DP03_0062E',
  medAge: 'DP05_0018E',
  rentersPct: 'DP04_0047PE',
  educationPct: 'DP02_0068PE',
  homeValue: 'DP04_0089E',
  daytimeWorkers: 'DP03_0004E',
};

const MEDICAID_UNIVERSE = 'C27007_001E';
const MEDICAID_COMPONENTS = [
  'C27007_004E',
  'C27007_007E',
  'C27007_010E',
  'C27007_014E',
  'C27007_017E',
  'C27007_020E',
];

const PROFILE_VAR_LIST = Object.values(PROFILE_VARS);

function cleanNum(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  // Census uses large negative sentinels (-666666666, -888888888) for
  // missing / suppressed data.
  return Number.isFinite(n) && n > -1e8 ? n : null;
}

function acsKey() {
  return process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : '';
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Census request failed ${res.status} ${url}\n${body.slice(0, 200)}`);
  }
  return res.json();
}

function rowsToMap(rows) {
  const headers = rows[0];
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const out = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const geoid = `${r[idx.state]}${r[idx.county]}${r[idx.tract]}`;
    out.set(geoid, { row: r, idx });
  }
  return out;
}

/**
 * Fetch ALL metrics for every tract in (state, county).
 * Returns a Map<geoid, metrics> where metrics has every key used by the UI.
 */
async function fetchTractsForCounty(stateFips, countyFips, year = process.env.ACS_YEAR || '2022') {
  const cacheKey = `acs:${year}:${stateFips}:${countyFips}`;
  return cache.wrap(cacheKey, async () => {
    const profileUrl =
      `https://api.census.gov/data/${year}/acs/acs5/profile` +
      `?get=NAME,${PROFILE_VAR_LIST.join(',')}` +
      `&for=tract:*&in=state:${stateFips}%20county:${countyFips}${acsKey()}`;
    const medicaidVars = [MEDICAID_UNIVERSE, ...MEDICAID_COMPONENTS];
    const medicaidUrl =
      `https://api.census.gov/data/${year}/acs/acs5` +
      `?get=NAME,${medicaidVars.join(',')}` +
      `&for=tract:*&in=state:${stateFips}%20county:${countyFips}${acsKey()}`;

    const [profileRows, medicaidRows] = await Promise.all([
      fetchJson(profileUrl),
      fetchJson(medicaidUrl),
    ]);

    const profile = rowsToMap(profileRows);
    const medicaid = rowsToMap(medicaidRows);

    const out = new Map();
    for (const [geoid, { row, idx }] of profile) {
      const rec = { GEOID: geoid, NAME: row[idx.NAME] };
      for (const [name, variable] of Object.entries(PROFILE_VARS)) {
        rec[name] = cleanNum(row[idx[variable]]);
      }
      const m = medicaid.get(geoid);
      if (m) {
        const universe = cleanNum(m.row[m.idx[MEDICAID_UNIVERSE]]);
        const covered = MEDICAID_COMPONENTS.reduce(
          (s, v) => s + (cleanNum(m.row[m.idx[v]]) || 0),
          0
        );
        rec.medicaidCount = covered;
        rec.medicaidUniverse = universe;
        rec.medicaidPct =
          universe && universe > 0
            ? Math.round((covered / universe) * 1000) / 10
            : null;
      } else {
        rec.medicaidCount = null;
        rec.medicaidUniverse = null;
        rec.medicaidPct = null;
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
async function fetchTractsForCounties(pairs, year) {
  const unique = new Set(pairs.map(p => `${p.state}:${p.county}`));
  const combined = new Map();
  for (const key of unique) {
    const [state, county] = key.split(':');
    const rows = await fetchTractsForCounty(state, county, year);
    for (const [geoid, rec] of rows) combined.set(geoid, rec);
  }
  return combined;
}

module.exports = { fetchTractsForCounty, fetchTractsForCounties };
