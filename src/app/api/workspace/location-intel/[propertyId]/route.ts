import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { pplxChat, getPerplexityKey, type PplxMessage } from "@/lib/perplexity";
import { loadOmText } from "@/lib/workspace/load-om-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Per-property Location Intelligence brief, powered by Perplexity sonar-pro
 * and sonar-reasoning with rich deal context. The route loads:
 *   - the property doc + extracted_fields (asking price, cap rate, NOI, SF,
 *     tenant mix, occupancy, year built, etc)
 *   - the OM document text (capped at 12 KB) via loadOmText() so the model
 *     can quote specifics like "the OM claims X but trailing-12 actuals
 *     suggest Y"
 *   - the property's address + asset type
 *
 * Then runs 5 parallel Perplexity calls:
 *   - submarket          (sonar-pro, recency=year)   ~700 tokens
 *   - demographics       (sonar-pro, recency=year)   ~600 tokens
 *   - comps              (sonar-pro, recency=year)   ~800 tokens
 *   - news               (sonar-pro, recency=month)  ~700 tokens
 *   - synthesis          (sonar-reasoning)           ~900 tokens (this card
 *                                                     reads the deal
 *                                                     context AND drives
 *                                                     Highlights + Red
 *                                                     Flags + Questions
 *                                                     for broker)
 *
 * Cached per-property in workspace_location_intel/{propertyId}, 7-day TTL,
 * busted with body { force: true }.
 */

const FRESHNESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OM_EXCERPT_CHARS = 12_000; // ~3k tokens of raw OM text per call

interface LocationCard {
  title: string;
  body: string;
  citations: string[];
  generatedAt: string;
}
interface SynthesisOutput {
  highlights: string[];
  redFlags: string[];
  brokerQuestions: string[];
  body: string;        // full prose
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
    submarket:    LocationCard | null;
    demographics: LocationCard | null;
    comps:        LocationCard | null;
    news:         LocationCard | null;
  };
  synthesis: SynthesisOutput | null;
}

// ── Build the deal-specific context block reused by every prompt ──
function buildContextBlock(args: {
  address: string;
  assetType: string;
  fields: Record<string, any>;
  prop: any;
  omExcerpt: string | null;
}) {
  const { address, assetType, fields, prop, omExcerpt } = args;

  // Pluck the most relevant fields per asset type. The prompt will quote
  // these explicitly so Perplexity benchmarks against them.
  const f = (group: string, name: string) => {
    const v = fields[`${group}.${name}`];
    if (v == null || v === "") return null;
    return v;
  };
  const fmt$ = (v: any) => v == null ? null : `$${Number(v).toLocaleString()}`;
  const fmtPct = (v: any) => v == null ? null : `${v}%`;
  const fmtSF = (v: any) => v == null ? null : `${Number(v).toLocaleString()} SF`;

  const dealStats = [
    ["Address", address],
    ["Asset type", assetType],
    ["Asking price", fmt$(f("pricing_deal_terms", "asking_price") || prop.cardAskingPrice)],
    ["Cap rate (OM)", fmtPct(f("pricing_deal_terms", "cap_rate_om") || prop.cardCapRate)],
    ["NOI (OM)", fmt$(f("expenses", "noi_om") || prop.cardNoi)],
    ["Building SF", fmtSF(f("property_basics", "building_sf") || prop.cardBuildingSf)],
    ["Occupancy", fmtPct(f("property_basics", "occupancy_pct") || prop.occupancyPct)],
    ["Year built", f("property_basics", "year_built")],
    ["WALE", f("property_basics", "wale_years") ? `${f("property_basics", "wale_years")} yrs` : null],
    ["Tenant count", f("property_basics", "tenant_count")],
    ["Lot acres", f("property_basics", "lot_acres")],
    ["Zoning", f("land_zoning", "current_zoning")],
  ].filter(([, v]) => v != null && v !== "");

  const dealLines = dealStats.map(([k, v]) => `- ${k}: ${v}`).join("\n");

  // Tenant snapshot for the synthesis prompt
  const tenantLines: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const name = f("rent_roll", `tenant_${i}_name`);
    if (!name) break;
    const sf = f("rent_roll", `tenant_${i}_sf`);
    const rent = f("rent_roll", `tenant_${i}_rent`) || f("rent_roll", `tenant_${i}_monthly_rent`);
    const end = f("rent_roll", `tenant_${i}_lease_end`);
    tenantLines.push(`  - ${name}${sf ? ` (${sf} SF)` : ""}${rent ? ` rent ${rent}` : ""}${end ? ` lease ends ${end}` : ""}`);
  }
  const tenantBlock = tenantLines.length
    ? `\nTop tenants:\n${tenantLines.join("\n")}`
    : "";

  const omBlock = omExcerpt
    ? `\n\nOM EXCERPT (verbatim, first ~12 KB; use to quote specific claims back to the user):\n"""\n${omExcerpt.slice(0, OM_EXCERPT_CHARS)}\n"""`
    : "";

  return `DEAL CONTEXT
============
${dealLines}${tenantBlock}${omBlock}`;
}

// ── Per-card prompt builders ───────────────────────────────────
function buildPrompts(ctx: string, address: string, assetType: string) {
  const baseSystem =
    "You are a senior CRE market analyst writing for an institutional buyer. " +
    "Be specific. Use numbers, dates, and sources. Compare market data to the deal's own metrics where you have both. " +
    "If a source is older than 12 months, label it (e.g. 'as of Q3 2024'). " +
    "Never guess. If you don't have data for a claim, say so explicitly. " +
    "Format: tight markdown with short sections, bullets, and a measurable number in every bullet where possible.";

  const submarket: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

Produce a Submarket Fundamentals brief (4-6 bullets) that BENCHMARKS the deal against current market data:
1. ${assetType} vacancy rate in this submarket (current quarter + 12-month trend) — and how the subject's occupancy compares.
2. Asking and effective rent levels (PSF or per unit) for comparable ${assetType} product in this submarket — and how the subject's rent compares.
3. Net absorption vs new supply / construction pipeline (last 4 quarters).
4. Recent ${assetType} cap rate range for trades in this submarket — and how the subject's stated cap compares.
5. Notable submarket-specific dynamics (e.g. flight to quality, A vs B class spread, owner-user demand).

Cite a source for EVERY number with publication date in parentheses. Cap at ~250 words.`
    },
  ];

  const demographics: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

Produce a Trade Area / Demographics snapshot (4-6 bullets) tuned to ${assetType}:
1. Population for the city/zip and 5-year growth %.
2. Median household income and 5-year trajectory.
3. ${assetType === "retail" ? "Daytime population, top employers, retail spending per household" : assetType === "industrial" ? "Industrial employment base, distribution / logistics infrastructure access" : assetType === "multifamily" ? "Renter household formation, rent-to-income ratio" : "Employer base and industry concentration"}.
4. Education attainment / household composition where it matters for ${assetType}.
5. Migration patterns (in/out flow) if relevant.

Anchor every number with a citation + publication date. Cap at ~200 words.`
    },
  ];

  const comps: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

List up to 6 RECENT (last 24 months) ${assetType} comps in this submarket. Prefer SALES; include lease comps only if sales are sparse.

For each: address (street + city), price (or $/SF / $/unit), cap rate if disclosed, sale date, buyer/seller if reported, and a one-sentence note on why it's a comp (similar SF / vintage / tenancy / submarket).

Then write a 2-sentence comparison stating where THIS deal sits vs the comp set (above market / at market / below market) using the deal stats above.

If you cannot find recent comps, say so explicitly and suggest the broker pulls CoStar/Real Capital Analytics. Cap at ~300 words.`
    },
  ];

  const news: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

Surface news from the last 12 months that materially affects this deal. Sort by impact, most material first. For each include the date.

Categories to scan:
- Major new ${assetType} construction starts or deliveries within 5 miles (supply impact).
- Anchor tenant moves: signings, closures, relocations (especially relevant for retail / office).
- Zoning, entitlement, infrastructure changes (highway projects, transit, rezoning).
- Major employer expansions or layoffs in this MSA.
- Local political / regulatory shifts (rent control, property tax revaluation).

Include source publication + date for each. Cap at ~300 words.`
    },
  ];

  return { submarket, demographics, comps, news };
}

function buildSynthesisPrompt(ctx: string, assetType: string): PplxMessage[] {
  const sys =
    "You are a senior acquisitions analyst pressure-testing a deal for an institutional buyer. " +
    "Read the deal context carefully (especially the OM excerpt) and the live market signals you find. " +
    "Be skeptical: brokers exaggerate. Look for places the OM's claims diverge from market reality. " +
    "Cite sources for any market claim with publication date. Use tight bullets, numbers in every claim where possible.";

  const user =
`${ctx}

Produce a deal-level synthesis. Format your response EXACTLY as this JSON object (no extra prose, no markdown fence, no commentary outside the JSON):

{
  "highlights": [
    "3-5 bullets. Things the BUYER should be excited about. Be specific to THIS deal — quote OM numbers and benchmark them. Each bullet stands alone."
  ],
  "redFlags": [
    "3-5 bullets. Things that should worry the buyer. Include OM-vs-market discrepancies, lease structure risks, supply pressure, tenant credit concerns, deferred maintenance signals from the OM. Each bullet must reference a specific number, claim, or source."
  ],
  "brokerQuestions": [
    "5-7 questions the buyer should ask the broker BEFORE bidding. Specific, not generic. E.g. 'Why is the OM cap rate 6.2% when comparable ${assetType} trades in this submarket are clearing at 7.0-7.5% (CBRE Q4 2024)? Is there hidden value or aggressive underwriting?'"
  ],
  "body": "A 200-word synthesis paragraph an investment committee could read in 60 seconds. Lead with the verdict (proceed / pass / proceed-at-discount), then 3-4 sentences on the bull case, 3-4 on the bear case, then a closer on the price discipline."
}

Rules:
- Every market claim must have an inline citation: "[Source: CBRE H2 2024 Industrial Report]" style.
- Compare OM claims to market data. If the OM says occupancy is 95% but the submarket is 88%, flag the divergence.
- If the OM excerpt is missing, lean harder on extracted_fields.
- Do NOT invent numbers. If you don't know, write "[unverified]" not a fake number.
- Output VALID JSON only. No trailing commas.`;

  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

async function runOneCard(title: string, messages: PplxMessage[], recency?: "year" | "month"): Promise<LocationCard | null> {
  try {
    const r = await pplxChat(messages, {
      model: "sonar-pro",
      temperature: 0.15,
      maxTokens: title === "comps" ? 900 : 750,
      returnCitations: true,
      searchRecencyFilter: recency,
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

async function runSynthesis(messages: PplxMessage[]): Promise<SynthesisOutput | null> {
  try {
    // sonar-reasoning gives chain-of-thought + better synthesis. Slower
    // (~30s) but the headline card warrants it.
    const r = await pplxChat(messages, {
      model: "sonar-reasoning",
      temperature: 0.1,
      maxTokens: 1500,
      returnCitations: true,
    });
    // Parse JSON. Strip markdown fences and any think-tags from sonar-reasoning.
    let text = (r.content || "").trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (fence) text = fence[1].trim();
    // Try to find a top-level JSON object even if there's trailing prose
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) text = text.slice(objStart, objEnd + 1);
    const parsed = JSON.parse(text);
    return {
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.map(String) : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String) : [],
      brokerQuestions: Array.isArray(parsed.brokerQuestions) ? parsed.brokerQuestions.map(String) : [],
      body: String(parsed.body || ""),
      citations: r.citations || [],
      generatedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.warn("[location-intel] synthesis failed:", e?.message);
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
  } catch { return null; }
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
  if ((doc as any).userId && (doc as any).userId !== userId) {
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

  // Cache check (skip if force)
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

  // Load extracted_fields
  const fieldsSnap = await db
    .collection("workspace_extracted_fields")
    .where("propertyId", "==", propertyId)
    .get();
  const fields: Record<string, any> = {};
  fieldsSnap.docs.forEach((d) => {
    const data = d.data() as any;
    const key = `${data.fieldGroup}.${data.fieldName}`;
    fields[key] = data.isUserOverridden
      ? data.userOverrideValue
      : (data.normalizedValue ?? data.rawValue);
  });

  // Load OM text excerpt (lazy, may return null for old deals)
  const omText = await loadOmText(propertyId).catch(() => null);

  const ctx = buildContextBlock({ address: addr, assetType, fields, prop, omExcerpt: omText });
  const prompts = buildPrompts(ctx, addr, assetType);
  const synthesisPrompt = buildSynthesisPrompt(ctx, assetType);

  const [submarket, demographics, comps, news, synthesis] = await Promise.all([
    runOneCard("submarket", prompts.submarket, "year"),
    runOneCard("demographics", prompts.demographics, "year"),
    runOneCard("comps", prompts.comps, "year"),
    runOneCard("news", prompts.news, "month"),
    runSynthesis(synthesisPrompt),
  ]);

  const doc: LocationIntelDoc = {
    propertyId,
    userId,
    refreshedAt: new Date().toISOString(),
    address: addr,
    assetType,
    cards: { submarket, demographics, comps, news },
    synthesis,
  };

  await db.collection("workspace_location_intel").doc(propertyId).set(doc);
  return NextResponse.json({ ...doc, cached: false });
}
