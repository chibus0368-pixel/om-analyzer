import admin from 'firebase-admin';
import fetch from 'node-fetch';
import { logger } from 'firebase-functions';

interface RateDataPoint {
  timestamp: number;
  date: string;
  value: number;
  source: string;
  change?: number;
  direction?: 'up' | 'down' | 'hold';
}

interface MarketRates {
  tenYearTreasury: number;
  fedFundsRate: number;
  mortgageRate30y: number;
  cmbsSpreads: number;
  nnnCapRate: number;
  nnnSpread: number;
  creLoanVolume: number;
  avgLeaseTerm: number;
}

// ─── FRED API CONFIG ────────────────────────────────────────────────────

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * FRED Series IDs for market data
 * Free API key at: https://fred.stlouisfed.org/docs/api/api_key.html
 */
const FRED_SERIES = {
  TREASURY_10Y: 'DGS10',         // 10-Year Treasury Constant Maturity Rate
  FED_FUNDS: 'DFF',              // Federal Funds Effective Rate
  MORTGAGE_30Y: 'MORTGAGE30US',  // 30-Year Fixed Rate Mortgage Average
  BAA_SPREAD: 'BAAFFM',         // Moody's BAA Corporate Bond Spread (proxy for CMBS)
} as const;

/**
 * Fetch a single FRED series — latest observation
 */
async function fetchFredSeries(seriesId: string): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    logger.warn('FRED_API_KEY not set, using fallback data');
    return null;
  }

  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5&observation_start=${getRecentDate(30)}`;
    const response = await fetch(url);

    if (!response.ok) {
      logger.error('FRED API error', { seriesId, status: response.status });
      return null;
    }

    const data = (await response.json()) as Record<string, any>;
    const observations = data.observations || [];

    // Find the most recent non-"." value (FRED uses "." for missing data)
    for (const obs of observations) {
      if (obs.value && obs.value !== '.') {
        const value = parseFloat(obs.value);
        if (!isNaN(value)) {
          logger.info('FRED data fetched', { seriesId, value, date: obs.date });
          return value;
        }
      }
    }

    logger.warn('No valid FRED data found', { seriesId });
    return null;
  } catch (error) {
    logger.error('FRED fetch failed', {
      seriesId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Fetch all market rates from FRED + derived metrics
 * Falls back to previous values if API unavailable
 */
async function fetchCurrentRates(): Promise<MarketRates> {
  logger.info('Fetching current market rates from FRED');

  // Fetch from FRED in parallel
  const [treasury10y, fedFunds, mortgage30y, baaSpread] = await Promise.all([
    fetchFredSeries(FRED_SERIES.TREASURY_10Y),
    fetchFredSeries(FRED_SERIES.FED_FUNDS),
    fetchFredSeries(FRED_SERIES.MORTGAGE_30Y),
    fetchFredSeries(FRED_SERIES.BAA_SPREAD),
  ]);

  // Get previous values for fallback
  const db = admin.firestore();
  let previousRates: Partial<MarketRates> = {};

  try {
    const prevDoc = await db.collection('market_data').doc('latest_rates').get();
    if (prevDoc.exists) {
      previousRates = prevDoc.data() as Partial<MarketRates>;
    }
  } catch (e) {
    logger.warn('Could not fetch previous rates for fallback');
  }

  // Use fetched values or fall back to previous or seed defaults
  const tenYearTreasury = treasury10y ?? previousRates.tenYearTreasury ?? 4.25;
  const fedFundsRate = fedFunds ?? previousRates.fedFundsRate ?? 4.50;
  const mortgageRate30y = mortgage30y ?? previousRates.mortgageRate30y ?? 6.75;
  const cmbsSpreads = baaSpread ?? previousRates.cmbsSpreads ?? 1.85;

  // Derived NNN metrics (modeled from treasury + typical spreads)
  const nnnCapRate = parseFloat((tenYearTreasury + 1.85).toFixed(2));  // Treasury + 185bps typical spread
  const nnnSpread = parseFloat((nnnCapRate - tenYearTreasury).toFixed(2));
  const creLoanVolume = previousRates.creLoanVolume ?? 14.2; // In billions, updated less frequently
  const avgLeaseTerm = previousRates.avgLeaseTerm ?? 12.5;   // Years, updated less frequently

  const rates: MarketRates = {
    tenYearTreasury,
    fedFundsRate,
    mortgageRate30y,
    cmbsSpreads,
    nnnCapRate,
    nnnSpread,
    creLoanVolume,
    avgLeaseTerm,
  };

  // Store latest rates for future fallback
  await db.collection('market_data').doc('latest_rates').set({
    ...rates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    sources: {
      treasury: treasury10y !== null ? 'fred' : 'fallback',
      fedFunds: fedFunds !== null ? 'fred' : 'fallback',
      mortgage: mortgage30y !== null ? 'fred' : 'fallback',
      cmbs: baaSpread !== null ? 'fred' : 'fallback',
    },
  }, { merge: true });

  logger.info('Rates compiled', rates);
  return rates;
}

/**
 * Idempotency check — has today's data been stored?
 */
async function hasTodaysData(seriesId: string): Promise<boolean> {
  const db = admin.firestore();
  const today = new Date().toISOString().split('T')[0];

  try {
    const snapshot = await db
      .collection('series')
      .doc(seriesId)
      .collection('points')
      .where('date', '==', today)
      .limit(1)
      .get();

    return !snapshot.empty;
  } catch (error) {
    logger.error('Error checking existing data', { seriesId, error });
    return false;
  }
}

/**
 * Store a rate data point in the time series
 */
async function storeRateDataPoint(seriesId: string, point: RateDataPoint): Promise<void> {
  const db = admin.firestore();
  await db
    .collection('series')
    .doc(seriesId)
    .collection('points')
    .add({
      ...point,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  logger.info('Data point stored', { seriesId, date: point.date, value: point.value });
}

/**
 * Get previous day's value to calculate change
 */
async function getPreviousValue(seriesId: string): Promise<number | null> {
  const db = admin.firestore();
  try {
    const snapshot = await db
      .collection('series')
      .doc(seriesId)
      .collection('points')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs[0].data().value;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Update the ticker_config and market_snapshot documents
 * These drive the live UI on the homepage
 */
async function updateLiveMarketData(rates: MarketRates): Promise<void> {
  const db = admin.firestore();

  // Get previous values for change calculation
  const [prevTreasury, prevFed, prevCap, prevCmbs, prevLoan, prevLease] = await Promise.all([
    getPreviousValue('treasury-10y'),
    getPreviousValue('fed-funds-rate'),
    getPreviousValue('nnn-cap-rate'),
    getPreviousValue('cmbs-spreads'),
    getPreviousValue('cre-loan-volume'),
    getPreviousValue('avg-lease-term'),
  ]);

  function calcChange(current: number, previous: number | null): { change: string; direction: 'up' | 'down' | 'hold' } {
    if (previous === null) return { change: '—', direction: 'hold' };
    const diff = current - previous;
    if (Math.abs(diff) < 0.005) return { change: '—', direction: 'hold' };
    const sign = diff > 0 ? '+' : '';
    return {
      change: `${sign}${diff.toFixed(2)}%`,
      direction: diff > 0 ? 'up' : 'down',
    };
  }

  const tickerItems = [
    {
      name: '10Y Treasury',
      value: `${rates.tenYearTreasury.toFixed(2)}%`,
      ...calcChange(rates.tenYearTreasury, prevTreasury),
    },
    {
      name: 'Fed Funds',
      value: `${rates.fedFundsRate.toFixed(2)}%`,
      ...calcChange(rates.fedFundsRate, prevFed),
    },
    {
      name: 'NNN Avg Cap',
      value: `${rates.nnnCapRate.toFixed(2)}%`,
      ...calcChange(rates.nnnCapRate, prevCap),
    },
    {
      name: 'CRE Loan Vol',
      value: `$${rates.creLoanVolume.toFixed(1)}B`,
      ...calcChange(rates.creLoanVolume, prevLoan),
    },
    {
      name: 'CMBS Spread',
      value: `${rates.cmbsSpreads.toFixed(0)} bps`,
      ...calcChange(rates.cmbsSpreads, prevCmbs),
    },
    {
      name: 'NNN Spread',
      value: `${(rates.nnnSpread * 100).toFixed(0)} bps`,
      change: '—',
      direction: 'hold',
    },
  ];

  const snapshotItems = [
    {
      label: 'NNN Avg Cap Rate',
      value: `${rates.nnnCapRate.toFixed(2)}%`,
      ...calcChange(rates.nnnCapRate, prevCap),
    },
    {
      label: '10Y Treasury',
      value: `${rates.tenYearTreasury.toFixed(2)}%`,
      ...calcChange(rates.tenYearTreasury, prevTreasury),
    },
    {
      label: 'NNN Spread',
      value: `${(rates.nnnSpread * 100).toFixed(0)} bps`,
      change: '—',
      direction: 'hold',
    },
    {
      label: 'CRE Loan Vol',
      value: `$${rates.creLoanVolume.toFixed(1)}B`,
      ...calcChange(rates.creLoanVolume, prevLoan),
    },
    {
      label: 'Avg Lease Term',
      value: `${rates.avgLeaseTerm.toFixed(1)} yrs`,
      ...calcChange(rates.avgLeaseTerm, prevLease),
    },
  ];

  // Write to Firestore
  const batch = db.batch();

  batch.set(db.collection('ticker_config').doc('current'), {
    items: tickerItems,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(db.collection('market_snapshot').doc('current'), {
    items: snapshotItems,
    tickers: tickerItems,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  logger.info('Live market data updated');
}

// ─── MAIN INGESTION FUNCTION ────────────────────────────────────────────

/**
 * Main ingestion — called by Cloud Function scheduler daily at 6am ET
 * Idempotent: skips if today's data already exists
 */
export async function ingestMarketData(): Promise<{
  success: boolean;
  dataPointsAdded: number;
  skipped: boolean;
}> {
  logger.info('Starting market data ingestion');

  const today = new Date().toISOString().split('T')[0];

  // Quick idempotency check on primary series
  const alreadyDone = await hasTodaysData('treasury-10y');
  if (alreadyDone) {
    logger.info('Data already ingested today, skipping', { date: today });
    return { success: true, dataPointsAdded: 0, skipped: true };
  }

  try {
    // Fetch all rates
    const rates = await fetchCurrentRates();

    // Store individual time series data points
    const seriesMap: [string, number][] = [
      ['treasury-10y', rates.tenYearTreasury],
      ['fed-funds-rate', rates.fedFundsRate],
      ['mortgage-30y', rates.mortgageRate30y],
      ['cmbs-spreads', rates.cmbsSpreads],
      ['nnn-cap-rate', rates.nnnCapRate],
      ['cre-loan-volume', rates.creLoanVolume],
      ['avg-lease-term', rates.avgLeaseTerm],
    ];

    let dataPointsAdded = 0;

    for (const [seriesId, value] of seriesMap) {
      const exists = await hasTodaysData(seriesId);
      if (!exists) {
        const prevValue = await getPreviousValue(seriesId);
        const diff = prevValue !== null ? value - prevValue : 0;

        await storeRateDataPoint(seriesId, {
          timestamp: Date.now(),
          date: today,
          value,
          source: 'fred-api',
          change: parseFloat(diff.toFixed(4)),
          direction: Math.abs(diff) < 0.005 ? 'hold' : diff > 0 ? 'up' : 'down',
        });
        dataPointsAdded++;
      }
    }

    // Update live ticker and snapshot for the homepage
    await updateLiveMarketData(rates);

    logger.info('Market data ingestion complete', { date: today, dataPointsAdded });
    return { success: true, dataPointsAdded, skipped: false };
  } catch (error) {
    logger.error('Market ingestion failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, dataPointsAdded: 0, skipped: false };
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────

function getRecentDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().split('T')[0];
}
