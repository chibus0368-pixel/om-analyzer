import admin from 'firebase-admin';
import fetch from 'node-fetch';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';

/**
 * Deal Data Aggregation Pipeline
 * Ingests NNN deal data from multiple RSS feeds, API sources, and public filings.
 * Normalizes, deduplicates, and stores in Firestore.
 * Scheduled: Daily at 5:30 AM ET
 *
 * Sources:
 * 1. Net Lease Advisor RSS — NNN-focused deal commentary
 * 2. CRE Daily RSS — General CRE transaction news
 * 3. GlobeSt RSS — Major CRE transactions and market news
 * 4. Commercial Observer RSS — NY/national deal coverage
 * 5. Connect CRE RSS — Regional transaction reporting
 * 6. REjournals RSS — Midwest/regional CRE deals
 * 7. SEC EDGAR RSS — REIT acquisition filings (8-K)
 */

interface RawDeal {
  tenant: string;
  property: string;
  location: string;
  market: string;
  price: number;
  capRate: number;
  leaseTerm: number;
  sqft: number;
  type: string;
  source: string;
  sourceUrl: string;
  publishedDate?: string;
}

// ─── RSS DEAL SOURCES ─────────────────────────────────────────────────

const RSS_DEAL_SOURCES = [
  { name: 'Net Lease Advisor', url: 'https://thenetleaseadvisor.com/feed/' },
  { name: 'CRE Daily', url: 'https://www.credaily.com/feed/' },
  { name: 'GlobeSt', url: 'https://www.globest.com/feed/' },
  { name: 'Commercial Observer', url: 'https://commercialobserver.com/feed/' },
  { name: 'Connect CRE', url: 'https://www.connectcre.com/feed/' },
  { name: 'REjournals', url: 'https://rejournals.com/feed/' },
  { name: 'Bisnow', url: 'https://www.bisnow.com/feed' },
];

// SEC EDGAR REIT 8-K filings (acquisition disclosures)
const SEC_REIT_TICKERS = [
  { ticker: 'O', name: 'Realty Income' },
  { ticker: 'NNN', name: 'NNN REIT' },
  { ticker: 'STORE', name: 'STORE Capital' },
  { ticker: 'SRC', name: 'Spirit Realty' },
  { ticker: 'EPRT', name: 'Essential Properties' },
  { ticker: 'ADC', name: 'Agree Realty' },
  { ticker: 'BNL', name: 'Broadstone Net Lease' },
  { ticker: 'FCPT', name: 'Four Corners Property' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────

function extractTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = block.match(regex);
  return m ? m[1].trim() : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Enhanced deal detection — looks for NNN-relevant transaction signals
 */
function looksLikeDeal(text: string): boolean {
  const nnnSignals = ['nnn', 'net lease', 'single tenant', 'single-tenant', 'triple net', 'absolute net'];
  const dealSignals = ['sold', 'acquired', 'purchase', 'transaction', 'closed', 'cap rate', 'sale-leaseback'];
  const priceSignals = ['million', '$', 'price'];
  const propertySignals = ['sf', 'sq ft', 'square feet', 'acre', 'lease term', 'year lease'];

  const lower = text.toLowerCase();
  const hasNnn = nnnSignals.some((s) => lower.includes(s));
  const hasDeal = dealSignals.filter((s) => lower.includes(s)).length >= 1;
  const hasPrice = priceSignals.some((s) => lower.includes(s));
  const hasProperty = propertySignals.some((s) => lower.includes(s));

  // Must have at least one NNN signal + one deal signal, OR deal + price + property
  return (hasNnn && hasDeal) || (hasDeal && hasPrice && hasProperty) || (hasNnn && hasPrice);
}

/**
 * Known NNN tenant names for smarter extraction
 */
const KNOWN_TENANTS = [
  'Walgreens', 'CVS', 'Dollar General', 'Dollar Tree', 'Family Dollar',
  "O'Reilly Auto Parts", 'AutoZone', 'Advance Auto', 'NAPA',
  'Chick-fil-A', "McDonald's", 'Taco Bell', 'Wendy\'s', "Raising Cane's",
  'Starbucks', 'Dunkin\'', 'Chipotle', 'Wingstop', 'Popeyes',
  '7-Eleven', 'Wawa', 'Sheetz', 'Circle K', 'QuikTrip',
  'FedEx', 'DHL', 'Amazon', 'Prologis',
  'DaVita', 'Fresenius', 'Aspen Dental', 'Heartland Dental',
  'Hobby Lobby', 'Tractor Supply', 'Rural King', 'Bass Pro',
  'Realty Income', 'NNN REIT', 'Spirit Realty', 'Essential Properties',
  'Agree Realty', 'STORE Capital', 'Broadstone', 'Four Corners',
  "Lowe's", 'Home Depot', 'Best Buy', 'Costco', 'Walmart',
  'Aldi', 'Lidl', 'Trader Joe\'s', 'Whole Foods',
  'Planet Fitness', 'LA Fitness', 'Anytime Fitness',
  'Bank of America', 'Chase', 'Wells Fargo', 'PNC',
];

function parseDealFromText(title: string, desc: string, link: string, sourceName: string): RawDeal | null {
  const rawDesc = stripHtml(desc);
  const text = `${title} ${rawDesc}`;

  // Extract price
  const priceMatch = text.match(/\$\s*([\d,.]+)\s*(million|m\b)/i)
    || text.match(/\$\s*([\d,.]+)\s*(billion|b\b)/i);
  let price = 0;
  if (priceMatch) {
    price = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (priceMatch[2].toLowerCase().startsWith('b')) price *= 1000;
  }

  // Extract cap rate
  const capMatch = text.match(/([\d.]+)\s*%?\s*cap\s*rate/i)
    || text.match(/cap\s*rate\s*(?:of\s*)?(?:at\s*)?([\d.]+)\s*%?/i)
    || text.match(/([\d.]+)\s*%\s*(?:cap|yield)/i);
  const capRate = capMatch ? parseFloat(capMatch[1]) : 0;

  // Extract lease term
  const leaseMatch = text.match(/([\d.]+)\s*[-–]?\s*year\s*(?:remaining\s*)?(?:initial\s*)?lease/i)
    || text.match(/lease\s*(?:term\s*)?(?:of\s*)?([\d.]+)\s*years/i);
  const leaseTerm = leaseMatch ? parseFloat(leaseMatch[1]) : 0;

  // Extract square footage
  const sqftMatch = text.match(/([\d,]+)\s*(?:sf|sq\s*ft|square\s*feet)/i);
  const sqft = sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : 0;

  // Must have at least price or cap rate to be useful
  if (price === 0 && capRate === 0) return null;

  // Extract tenant — try known names first
  let tenant = '';
  const titleLower = title.toLowerCase();
  const textLower = text.toLowerCase();
  for (const name of KNOWN_TENANTS) {
    if (textLower.includes(name.toLowerCase())) {
      tenant = name;
      break;
    }
  }

  // Fallback to regex patterns
  if (!tenant) {
    const tenantPatterns = [
      /(?:sold|acquired|leased|purchased)\s+(?:a\s+)?(?:new\s+)?([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){0,3})/,
      /([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){0,3})\s+(?:nnn|net lease|single.tenant|property|store|location)/i,
      /tenant:\s*([A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+){0,3})/i,
    ];
    for (const p of tenantPatterns) {
      const m = title.match(p);
      if (m) { tenant = m[1].trim(); break; }
    }
  }
  if (!tenant) tenant = 'Undisclosed Tenant';

  // Extract location
  const locationMatch = text.match(/(?:in|located\s+in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s*[A-Z]{2})/)
    || text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/);
  const location = locationMatch ? locationMatch[1] : '';

  // Classify property type
  const typeKeywords: Record<string, string[]> = {
    'QSR': ['qsr', 'quick service', 'fast food', 'chick-fil-a', "mcdonald's", 'taco bell', "wendy's", "raising cane's", 'popeyes', 'wingstop', 'chipotle'],
    'Pharmacy': ['pharmacy', 'walgreens', 'cvs', 'rite aid'],
    'Convenience': ['convenience', '7-eleven', 'wawa', 'sheetz', 'circle k'],
    'Auto Parts': ['auto parts', "o'reilly", 'autozone', 'advance auto', 'napa'],
    'Discount Retail': ['dollar general', 'dollar tree', 'family dollar', 'discount'],
    'Industrial': ['industrial', 'warehouse', 'distribution', 'logistics', 'fedex', 'amazon'],
    'Medical': ['medical', 'healthcare', 'hospital', 'dialysis', 'davita', 'fresenius', 'dental'],
    'Office': ['office', 'corporate'],
    'Grocery': ['grocery', 'aldi', 'lidl', 'whole foods', "trader joe's"],
    'Fitness': ['fitness', 'gym', 'planet fitness', 'la fitness'],
    'Bank': ['bank', 'chase', 'wells fargo', 'pnc', 'bank of america'],
    'Retail': ['retail', 'store', 'restaurant', 'coffee', 'starbucks'],
  };
  let propertyType = 'Retail';
  const lower = text.toLowerCase();
  for (const [type, kws] of Object.entries(typeKeywords)) {
    if (kws.some((kw) => lower.includes(kw))) { propertyType = type; break; }
  }

  // Extract publish date
  let publishedDate: string | undefined;
  const dateMatch = text.match(/(\w+ \d{1,2},?\s*\d{4})/);
  if (dateMatch) publishedDate = dateMatch[1];

  return {
    tenant,
    property: title.slice(0, 120),
    location,
    market: location.split(',')[1]?.trim() || '',
    price,
    capRate,
    leaseTerm,
    sqft,
    type: propertyType,
    source: sourceName,
    sourceUrl: link,
    publishedDate,
  };
}

function formatPrice(p: number): string {
  if (p >= 1000) return `$${(p / 1000).toFixed(2)}B`;
  if (p >= 1) return `$${p.toFixed(2)}M`;
  return `$${(p * 1000).toFixed(0)}K`;
}

function dealHash(d: RawDeal): string {
  return crypto.createHash('md5').update(`${d.tenant}:${d.location}:${d.price}:${d.capRate}:${d.source}`).digest('hex');
}

// ─── RSS INGESTION ────────────────────────────────────────────────────

async function ingestFromRSS(
  source: { name: string; url: string },
  db: admin.firestore.Firestore,
): Promise<{ fetched: number; stored: number; duplicates: number; errors: string[] }> {
  let fetched = 0, stored = 0, duplicates = 0;
  const errors: string[] = [];

  try {
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'NNNTripleNet/1.0 (CRE Market Intelligence)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      errors.push(`${source.name}: HTTP ${response.status}`);
      return { fetched, stored, duplicates, errors };
    }

    const xml = await response.text();
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = extractTag(block, 'title');
      const desc = extractTag(block, 'description');
      const link = extractTag(block, 'link');
      const pubDate = extractTag(block, 'pubDate');

      if (looksLikeDeal(`${title} ${desc}`.toLowerCase())) {
        const deal = parseDealFromText(title, desc, link, source.name);
        if (!deal) continue;

        if (pubDate) deal.publishedDate = pubDate;
        fetched++;

        const hash = dealHash(deal);
        const existing = await db.collection('deals').where('contentHash', '==', hash).limit(1).get();
        if (!existing.empty) { duplicates++; continue; }

        const typeBadges: Record<string, string> = {
          Retail: 'green', Industrial: 'blue', Office: 'purple', Healthcare: 'gold',
          QSR: 'red', Pharmacy: 'blue', Convenience: 'indigo', 'Auto Parts': 'amber',
          'Discount Retail': 'green', Medical: 'pink', Grocery: 'emerald', Fitness: 'orange',
          Bank: 'slate',
        };

        await db.collection('deals').add({
          tenant: deal.tenant,
          property: deal.property,
          location: deal.location,
          market: deal.market,
          price: formatPrice(deal.price),
          priceRaw: deal.price,
          capRate: deal.capRate > 0 ? `${deal.capRate.toFixed(2)}%` : 'N/A',
          capRateRaw: deal.capRate,
          leaseTerm: deal.leaseTerm > 0 ? `${deal.leaseTerm} yrs` : 'N/A',
          leaseTermRaw: deal.leaseTerm,
          sqft: deal.sqft,
          type: deal.type,
          typeBadge: typeBadges[deal.type] || 'gray',
          source: deal.source,
          sourceUrl: deal.sourceUrl,
          publishedDate: deal.publishedDate || null,
          contentHash: hash,
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        stored++;
      }
    }
  } catch (error) {
    errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { fetched, stored, duplicates, errors };
}

// ─── SEC EDGAR REIT FILINGS ──────────────────────────────────────────

async function ingestFromSEC(
  db: admin.firestore.Firestore,
): Promise<{ fetched: number; stored: number; duplicates: number; errors: string[] }> {
  let fetched = 0, stored = 0, duplicates = 0;
  const errors: string[] = [];

  for (const reit of SEC_REIT_TICKERS) {
    try {
      // EDGAR full-text search RSS for 8-K filings (acquisition disclosures)
      const url = `https://efts.sec.gov/LATEST/search-index?q=%22acquisition%22+%22net+lease%22&dateRange=custom&startdt=${getRecentDate(7)}&enddt=${getRecentDate(0)}&forms=8-K&from=${reit.ticker}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NNNTripleNet research@nnntriplenet.com',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as any;
      const hits = data?.hits?.hits || [];

      for (const hit of hits.slice(0, 5)) {
        const title = hit._source?.file_description || hit._source?.display_names?.[0] || '';
        const desc = hit._source?.file_description || '';
        const filingUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${reit.ticker}&type=8-K&dateb=&owner=include&count=10`;

        if (looksLikeDeal(`${reit.name} ${title} ${desc} acquisition net lease`.toLowerCase())) {
          const deal = parseDealFromText(`${reit.name}: ${title}`, desc, filingUrl, `SEC EDGAR (${reit.name})`);
          if (!deal) continue;

          deal.tenant = reit.name;
          fetched++;

          const hash = dealHash(deal);
          const existing = await db.collection('deals').where('contentHash', '==', hash).limit(1).get();
          if (!existing.empty) { duplicates++; continue; }

          await db.collection('deals').add({
            tenant: deal.tenant,
            property: deal.property,
            location: deal.location || 'Multiple Markets',
            market: deal.market || 'National',
            price: deal.price > 0 ? formatPrice(deal.price) : 'Undisclosed',
            priceRaw: deal.price,
            capRate: deal.capRate > 0 ? `${deal.capRate.toFixed(2)}%` : 'N/A',
            capRateRaw: deal.capRate,
            leaseTerm: deal.leaseTerm > 0 ? `${deal.leaseTerm} yrs` : 'N/A',
            leaseTermRaw: deal.leaseTerm,
            sqft: deal.sqft,
            type: 'REIT Acquisition',
            typeBadge: 'purple',
            source: `SEC EDGAR (${reit.name})`,
            sourceUrl: filingUrl,
            contentHash: hash,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          stored++;
        }
      }
    } catch (error) {
      // SEC errors are non-critical, just log
      errors.push(`SEC ${reit.ticker}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { fetched, stored, duplicates, errors };
}

// ─── MAIN INGESTION FUNCTION ────────────────────────────────────────

export async function ingestDeals(): Promise<{
  success: boolean;
  fetched: number;
  stored: number;
  duplicates: number;
  errors: string[];
  sources: { name: string; fetched: number; stored: number }[];
}> {
  logger.info('Starting deal ingestion pipeline');
  const db = admin.firestore();
  let totalFetched = 0, totalStored = 0, totalDuplicates = 0;
  const allErrors: string[] = [];
  const sourceResults: { name: string; fetched: number; stored: number }[] = [];

  // 1. Ingest from all RSS sources in parallel (batch of 3 to avoid overwhelming)
  for (let i = 0; i < RSS_DEAL_SOURCES.length; i += 3) {
    const batch = RSS_DEAL_SOURCES.slice(i, i + 3);
    const results = await Promise.all(batch.map((source) => ingestFromRSS(source, db)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      totalFetched += r.fetched;
      totalStored += r.stored;
      totalDuplicates += r.duplicates;
      allErrors.push(...r.errors);
      sourceResults.push({ name: batch[j].name, fetched: r.fetched, stored: r.stored });
    }
  }

  // 2. Ingest from SEC EDGAR
  const secResult = await ingestFromSEC(db);
  totalFetched += secResult.fetched;
  totalStored += secResult.stored;
  totalDuplicates += secResult.duplicates;
  allErrors.push(...secResult.errors);
  sourceResults.push({ name: 'SEC EDGAR', fetched: secResult.fetched, stored: secResult.stored });

  // 3. Log the ingestion run
  await db.collection('ingestion_logs').add({
    type: 'deals',
    runAt: admin.firestore.FieldValue.serverTimestamp(),
    fetched: totalFetched,
    stored: totalStored,
    duplicates: totalDuplicates,
    errors: allErrors,
    sources: sourceResults,
  });

  logger.info('Deal ingestion complete', { fetched: totalFetched, stored: totalStored, duplicates: totalDuplicates, sources: sourceResults.length });
  return { success: true, fetched: totalFetched, stored: totalStored, duplicates: totalDuplicates, errors: allErrors, sources: sourceResults };
}

// ─── UTILITIES ────────────────────────────────────────────────────────

function getRecentDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().split('T')[0];
}
