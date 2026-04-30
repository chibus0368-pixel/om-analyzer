import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { pplxChat, getPerplexityKey, type PplxMessage } from "@/lib/perplexity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Per-property location intelligence brief, powered by Perplexity.
 *
 * GET  /api/workspace/location-intel/[propertyId]
 *      -> Returns the cached brief if any (404 otherwise).
 *
 * POST /api/workspace/location-intel/[propertyId]
 *      body: { force?: boolean }
 *      -> Runs four parallel Perplexity calls (submarket fundamentals,
 *         demographics + trade area, recent comps, news + dev pipeline).
 *         Caches the result in workspace_location_intel/{propertyId}
 *         with a 7-day TTL. If a fresh result exists, returned without
 *         re-querying unless force=true.
 *
 * Costs: ~4 sonar-pro calls per generation. We keep prompts tight and
 * cap responses at 700 tokens each so the per-deal generation stays
 * well under a dollar.
 */

const FRESHNESS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LocationCard {
  title: string;
  body: string;
  citations: string[];
  generatedAt: string;
}
interface LocationIntelDoc {
  propertyId: string;
  userId: string;
  refreshedAt: string;
  address: string;
  assetType: string;
  cards: {
    submarket: LocationCard | null;
    demographics: LocationCard | null;
    comps: LocationCard | null;
    news: LocationCard | null;
  };
}

function buildPrompts(addr: string, assetType: string) {
  // Each prompt is one focused ask. Perplexity sonar-pro does best when
  // we tell it exactly what shape we want and what NOT to do.
  const baseSystem =
    "You are a CRE market analyst. Respond in tight markdown with short sections and bullets. " +
    "Cite numbers only if you found them in a source - never guess. If a source is older than 12 months, label it.";

  const submarket: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
        `Property: ${addr}\nAsset type: ${assetType}\n\n` +
        `Give a submarket-fundamentals brief (3-6 bullets):\n` +
        `- Vacancy rate (current and trend)\n` +
        `- Asking and effective rent levels with $/SF or $/unit if known\n` +
        `- Net absorption vs new supply / pipeline\n` +
        `- Cap rate range for recent ${assetType} trades\n` +
        `Cap at ~250 words. Source every number.`,
    },
  ];

  const demographics: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
        `Property: ${addr}\n\n` +
        `Give a trade-area / demographic snapshot (3-5 bullets):\n` +
        `- Population and 5-year growth (city or zip)\n` +
        `- Median household income and income trajectory\n` +
        `- Daytime vs residential population if relevant for ${assetType}\n` +
        `- Notable employer base or industry concentration\n` +
        `Cap at ~200 words. Source every number.`,
    },
  ];

  const comps: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
        `Property: ${addr}\nAsset type: ${assetType}\n\n` +
        `List up to 5 recent (last 24 months) ${assetType} sales or notable lease comps in this submarket.\n` +
        `For each: address, $ price OR $/SF, cap rate (if disclosed), sale date.\n` +
        `Bullet format. If you cannot find recent comps, say so explicitly.\n` +
        `Cap at ~250 words.`,
    },
  ];

  const news: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
        `Property: ${addr}\nAsset type: ${assetType}\n\n` +
        `Surface news from the last 12 months that would matter to a buyer:\n` +
        `- Major development announcements (new construction, redevelopment)\n` +
        `- Anchor tenant moves (signings, closures, relocations)\n` +
        `- Zoning, entitlement, or major civic / infrastructure changes\n` +
        `- Notable employer expansions or layoffs in the area\n` +
        `Bullet format with date. Cap at ~250 words.`,
    },
  ];

  return { submarket, demographics, comps, news };
}

async function runOneCard(title: string, messages: PplxMessage[]): Promise<LocationCard | null> {
  try {
    const r = await pplxChat(messages, {
      model: "sonar-pro",
      temperature: 0.2,
      maxTokens: 700,
      returnCitations: true,
      // News/comps benefit from fresher results; the others are fine without.
      searchRecencyFilter: title === "news" || title === "comps" ? "year" : undefined,
    });
    return {
      title,
      body: r.content,
      citations: r.citations || [],
      generatedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.warn(`[location-intel] ${title} failed:`, e?.message);
    return null;
  }
}

async function authedUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { propertyId: string } }) {
  const userId = await authedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const propertyId = params.propertyId;
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  const db = getAdminDb();
  const snap = await db.collection("workspace_location_intel").doc(propertyId).get();
  if (!snap.exists) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const doc = snap.data() as LocationIntelDoc;
  if (doc.userId && doc.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(doc);
}

export async function POST(req: NextRequest, { params }: { params: { propertyId: string } }) {
  const userId = await authedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const propertyId = params.propertyId;
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  if (!getPerplexityKey()) {
    return NextResponse.json({ error: "PERPLEXITY_API_KEY missing" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const force = !!body?.force;

  const db = getAdminDb();
  const propSnap = await db.collection("workspace_properties").doc(propertyId).get();
  if (!propSnap.exists) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  const prop = propSnap.data() as any;
  if (prop.userId && prop.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check cache unless force=true
  if (!force) {
    const cached = await db.collection("workspace_location_intel").doc(propertyId).get();
    if (cached.exists) {
      const doc = cached.data() as LocationIntelDoc;
      const age = Date.now() - new Date(doc.refreshedAt || 0).getTime();
      if (age < FRESHNESS_TTL_MS) {
        return NextResponse.json({ ...doc, cached: true });
      }
    }
  }

  const addr = [prop.address1, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
  if (!addr) {
    return NextResponse.json({ error: "Property has no address - cannot run location intel" }, { status: 400 });
  }
  const assetType = String(prop.analysisType || "commercial").toLowerCase();

  const prompts = buildPrompts(addr, assetType);
  const [submarket, demographics, comps, news] = await Promise.all([
    runOneCard("submarket", prompts.submarket),
    runOneCard("demographics", prompts.demographics),
    runOneCard("comps", prompts.comps),
    runOneCard("news", prompts.news),
  ]);

  const doc: LocationIntelDoc = {
    propertyId,
    userId,
    refreshedAt: new Date().toISOString(),
    address: addr,
    assetType,
    cards: { submarket, demographics, comps, news },
  };

  await db.collection("workspace_location_intel").doc(propertyId).set(doc);
  return NextResponse.json({ ...doc, cached: false });
}
