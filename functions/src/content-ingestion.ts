import admin from 'firebase-admin';
import fetch from 'node-fetch';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';

/**
 * Content Ingestion Pipeline
 * Fetches CRE news from RSS feeds, summarizes with AI,
 * categorizes, and publishes articles with confidence scoring.
 * Scheduled: Daily at 5:00 AM ET
 */

// ─── RSS FEED SOURCES ────────────────────────────────────────────────

interface FeedSource {
  name: string;
  url: string;
  category: string;
  priority: number;
}

const RSS_FEEDS: FeedSource[] = [
  { name: 'GlobeSt', url: 'https://www.globest.com/feed/', category: 'market_update', priority: 1 },
  { name: 'Commercial Observer', url: 'https://commercialobserver.com/feed/', category: 'market_update', priority: 1 },
  { name: 'Connect CRE', url: 'https://www.connectcre.com/feed/', category: 'market_update', priority: 2 },
  { name: 'REjournals', url: 'https://www.rejournals.com/feed', category: 'market_update', priority: 2 },
  { name: 'Bisnow', url: 'https://www.bisnow.com/feed', category: 'deal_breakdown', priority: 1 },
  { name: 'The Net Lease Advisor', url: 'https://thenetleaseadvisor.com/feed/', category: 'deal_breakdown', priority: 1 },
  { name: 'Federal Reserve News', url: 'https://www.federalreserve.gov/feeds/press_all.xml', category: 'risk_alert', priority: 1 },
  { name: 'Calculated Risk', url: 'https://www.calculatedriskblog.com/feeds/posts/default?alt=rss', category: 'market_update', priority: 2 },
];

// ─── RSS PARSER ─────────────────────────────────────────────────────

interface RawFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author?: string;
  source: string;
  category: string;
}

function parseRssFeed(xml: string, source: FeedSource): RawFeedItem[] {
  const items: RawFeedItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2] || '';
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractAttr(block, 'link', 'href');
    const description = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    const author = extractTag(block, 'author') || extractTag(block, 'dc:creator');

    if (title && link) {
      items.push({
        title: stripHtml(title).trim(),
        link: link.trim(),
        description: stripHtml(description || '').trim().slice(0, 500),
        pubDate: pubDate || new Date().toISOString(),
        author: author ? stripHtml(author).trim() : source.name,
        source: source.name,
        category: source.category,
      });
    }
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = block.match(regex);
  return m ? m[1] : '';
}

function extractAttr(block: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const m = block.match(regex);
  return m ? m[1] : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── DEDUP ──────────────────────────────────────────────────────────

function contentHash(title: string, source: string): string {
  return crypto.createHash('md5').update(`${title.toLowerCase()}:${source}`).digest('hex');
}

async function isDuplicate(hash: string): Promise<boolean> {
  const db = admin.firestore();
  const snap = await db.collection('articles').where('contentHash', '==', hash).limit(1).get();
  return !snap.empty;
}

// ─── AI SUMMARIZATION ───────────────────────────────────────────────

async function aiProcessArticle(item: RawFeedItem): Promise<{
  dek: string;
  summary: string;
  tags: string[];
  type: string;
  confidenceScore: number;
}> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return {
      dek: item.description.slice(0, 120),
      summary: item.description.slice(0, 300),
      tags: extractBasicTags(item.title + ' ' + item.description),
      type: item.category,
      confidenceScore: 0.5,
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `You are a CRE news editor for NNNTripleNet, a platform for NNN (triple net) lease investing. Analyze the article and return JSON with:
- "dek": compelling 1-sentence subtitle (max 120 chars)
- "summary": 2-3 sentence summary for NNN investors
- "tags": array of 3-5 tags from: [cap-rates, treasury, fed-policy, nnn-leases, retail, industrial, office, credit-risk, deal-flow, interest-rates, cmbs, 1031-exchange, tenant-news, market-outlook, risk-alert]
- "type": one of [market_update, deal_breakdown, risk_alert, guide, tool_spotlight, featured_analysis]
- "confidence": float 0-1 for NNN relevance (0.8+ = auto-publish)
Return ONLY valid JSON.`,
          },
          {
            role: 'user',
            content: `Title: ${item.title}\nSource: ${item.source}\nContent: ${item.description}`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API returned ${response.status}`);

    const data = (await response.json()) as Record<string, any>;
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content);

    return {
      dek: parsed.dek || item.description.slice(0, 120),
      summary: parsed.summary || item.description.slice(0, 300),
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      type: parsed.type || item.category,
      confidenceScore: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (error) {
    logger.error('AI processing failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      dek: item.description.slice(0, 120),
      summary: item.description.slice(0, 300),
      tags: extractBasicTags(item.title + ' ' + item.description),
      type: item.category,
      confidenceScore: 0.4,
    };
  }
}

function extractBasicTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  const tagMap: Record<string, string[]> = {
    'cap-rates': ['cap rate', 'capitalization'],
    'treasury': ['treasury', '10-year', '10y'],
    'fed-policy': ['federal reserve', 'fed ', 'fomc', 'interest rate'],
    'nnn-leases': ['triple net', 'nnn', 'net lease'],
    'retail': ['retail', 'store', 'restaurant', 'pharmacy'],
    'industrial': ['industrial', 'warehouse', 'logistics'],
    'office': ['office', 'coworking'],
    'credit-risk': ['credit', 'downgrade', 'default'],
    'deal-flow': ['deal', 'transaction', 'acquisition', 'sale'],
    'interest-rates': ['rate', 'yield', 'mortgage'],
    'tenant-news': ['tenant', 'lessee'],
    'risk-alert': ['risk', 'warning', 'caution'],
  };
  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some((kw) => lower.includes(kw))) tags.push(tag);
  }
  return tags.slice(0, 5);
}

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    .replace(/-+/g, '-').slice(0, 80).replace(/-$/, '');
}

// ─── MAIN INGESTION ─────────────────────────────────────────────────

export async function ingestContent(): Promise<{
  success: boolean;
  fetched: number;
  duplicates: number;
  stored: number;
  autoPublished: number;
  errors: string[];
}> {
  logger.info('Starting content ingestion pipeline');

  const db = admin.firestore();
  let fetched = 0, duplicates = 0, stored = 0, autoPublished = 0;
  const errors: string[] = [];
  const threshold = parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.8');

  for (const feed of RSS_FEEDS) {
    try {
      logger.info('Fetching feed', { name: feed.name });

      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'NNNTripleNet/1.0 (Content Aggregator)' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) { errors.push(`${feed.name}: HTTP ${response.status}`); continue; }

      const xml = await response.text();
      const items = parseRssFeed(xml, feed);
      fetched += items.length;

      for (const item of items.slice(0, 5)) {
        const hash = contentHash(item.title, item.source);
        if (await isDuplicate(hash)) { duplicates++; continue; }

        const ai = await aiProcessArticle(item);
        const slug = generateSlug(item.title);
        const slugCheck = await db.collection('articles').where('slug', '==', slug).limit(1).get();
        const finalSlug = slugCheck.empty ? slug : `${slug}-${Date.now().toString(36)}`;

        const shouldPublish = ai.confidenceScore >= threshold;

        await db.collection('articles').add({
          title: item.title,
          slug: finalSlug,
          dek: ai.dek,
          summary: ai.summary,
          body: item.description,
          type: ai.type,
          status: shouldPublish ? 'published' : 'draft',
          tags: ai.tags,
          sources: [item.source],
          sourceUrl: item.link,
          coverImage: '',
          readingTime: Math.max(1, Math.ceil(item.description.split(' ').length / 200)),
          aiConfidenceScore: ai.confidenceScore,
          aiGenerated: true,
          contentHash: hash,
          ingestedFrom: feed.name,
          originalPubDate: item.pubDate,
          views: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(shouldPublish && { publishedAt: admin.firestore.FieldValue.serverTimestamp() }),
        });

        stored++;
        if (shouldPublish) autoPublished++;

        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (error) {
      errors.push(`${feed.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await db.collection('ingestion_logs').add({
    type: 'content', runAt: admin.firestore.FieldValue.serverTimestamp(),
    fetched, duplicates, stored, autoPublished, errors,
  });

  logger.info('Content ingestion complete', { fetched, duplicates, stored, autoPublished });
  return { success: true, fetched, duplicates, stored, autoPublished, errors };
}
