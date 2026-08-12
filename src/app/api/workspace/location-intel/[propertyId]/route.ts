import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { pplxChat, getPerplexityKey, type PplxMessage } from "@/lib/perplexity";
import { loadOmText } from "@/lib/workspace/load-om-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Per-property Location Intelligence brief, powered by Perplexity sonar-pro
 * and sonar-reasoning with rich deal context.
 *
 * Quality bar (enforced both in-prompt and via post-processing):
 *   - No apologies, no "I cannot provide", no "the search results don't
 *     contain" type explanations.
 *   - No generic punts ("broker should pull from CoStar", "consult a local
 *     broker"). Cards must do work, not redirect.
 *   - Every bullet must be backed by a specific number AND a cited source.
 *     Bullets that fail this are scrubbed; if a card has < 2 surviving
 *     bullets, it is set to null and hidden by the UI.
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
    "You are a senior CRE market analyst writing for an institutional buyer.\n\n" +
    "HARD RULES (the entire card is rejected if violated):\n" +
    "1. NEVER apologize, explain what data is missing, or describe what the search results contain. Do NOT write phrases like 'I cannot provide', 'I am unable to', 'the search results do not contain', 'no data is available', 'I don't have'.\n" +
    "2. NEVER recommend external tools or actions. Do NOT write 'broker should pull from CoStar', 'consult Real Capital Analytics', 'pull from RCA', 'consult a local broker', 'we recommend ordering a report', 'verify with a third-party'.\n" +
    "3. OMIT, don't apologize. If you cannot back a bullet with a specific number AND a cited source with a publication date, leave that bullet out.\n" +
    "4. If you cannot produce at least 2 bullets that each have a specific number AND a cited source, output exactly the single token INSUFFICIENT_DATA and nothing else (no markdown, no commentary).\n" +
    "5. No generic boilerplate. Every bullet must contain a specific number, name, date, or address tied to THIS deal's location.\n" +
    "6. If a source is older than 12 months, label it (e.g. 'as of Q3 2024').\n\n" +
    "Format: tight markdown bullets only. No preamble, no closing summary, no recommendations, no caveats about your sources.";

  const submarket: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

Produce a Submarket Fundamentals brief (2-6 bullets) that BENCHMARKS the deal against current market data. Only include bullets you can back with a specific number AND a cited source with publication date. Topics to consider (skip any you can't source):
- ${assetType} vacancy rate in this submarket (current quarter + 12-month trend) and how the subject's occupancy compares
- Asking and effective rent levels (PSF or per unit) for comparable ${assetType} product and how the subject's rent compares
- Net absorption vs new supply / construction pipeline (last 4 quarters)
- Recent ${assetType} cap rate range for trades in this submarket and how the subject's stated cap compares
- Submarket-specific dynamics (flight to quality, A vs B class spread, owner-user demand)

If you cannot supply at least 2 such bullets, return only INSUFFICIENT_DATA. Cap at ~250 words.`
    },
  ];

  const demographics: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

Produce a Trade Area / Demographics snapshot (2-6 bullets) tuned to ${assetType}. Only include bullets you can back with a specific number AND a cited source with publication date. Topics to consider (skip any you can't source):
- Population for the city/zip and 5-year growth %
- Median household income and 5-year trajectory
- ${assetType === "retail" ? "Daytime population, top employers, retail spending per household" : assetType === "industrial" ? "Industrial employment base, distribution / logistics infrastructure access" : assetType === "multifamily" ? "Renter household formation, rent-to-income ratio" : "Employer base and industry concentration"}
- Education attainment / household composition where it matters for ${assetType}
- Migration patterns (in/out flow)

If you cannot supply at least 2 such bullets, return only INSUFFICIENT_DATA. Cap at ~200 words.`
    },
  ];

  const comps: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

List up to 6 RECENT (last 24 months) ${assetType} comps in this submarket. Prefer SALES; include lease comps only if sales are sparse.

For each comp include: address (street + city), price (or $/SF / $/unit), cap rate if disclosed, sale date, buyer/seller if reported, and a one-sentence note on why it's a comp (similar SF / vintage / tenancy / submarket).

Then add a 2-sentence comparison stating where THIS deal sits vs the comp set (above market / at market / below market) using the deal stats above.

If you cannot supply at least 2 specific, sourced comps, return only INSUFFICIENT_DATA. Do NOT recommend the broker pull from CoStar, RCA, or any external tool. Cap at ~300 words.`
    },
  ];

  const news: PplxMessage[] = [
    { role: "system", content: baseSystem },
    {
      role: "user",
      content:
`${ctx}

Surface news from the last 12 months that materially affects this deal. Sort by impact, most material first. Each item must include a specific date and a cited source.

Categories to scan (skip any you can't source with a specific dated article):
- Major new ${assetType} construction starts or deliveries within 5 miles (supply impact)
- Anchor tenant moves: signings, closures, relocations (especially relevant for retail / office)
- Zoning, entitlement, infrastructure changes (highway projects, transit, rezoning)
- Major employer expansions or layoffs in this MSA
- Local political / regulatory shifts (rent control, property tax revaluation)

If you cannot supply at least 2 dated, sourced items, return only INSUFFICIENT_DATA. Cap at ~300 words.`
    },
  ];

  return { submarket, demographics, comps, news };
}

function buildSynthesisPrompt(ctx: string, assetType: string): PplxMessage[] {
  const sys =
    "You are a senior acquisitions analyst pressure-testing a deal for an institutional buyer.\n\n" +
    "HARD RULES (the entire output is rejected if violated):\n" +
    "1. NEVER apologize, explain what data is missing, or describe what the search results contain. No 'I cannot provide', 'unable to', 'results do not contain'.\n" +
    "2. NEVER recommend external tools. No 'broker should pull from CoStar', 'consult RCA', 'order a third-party report'.\n" +
    "3. Every highlight and red flag must be backed by a specific number, OM-quoted figure, or named cited source. If you can't back it, omit it.\n" +
    "4. Broker questions must be specific to THIS deal (quote OM numbers or named tenants). No generic 'what is the rent escalation schedule?' filler.\n" +
    "5. Cite sources for any market claim with publication date. Use bullets, numbers in every claim where possible.\n" +
    "6. If you cannot produce at least 2 highlights AND 2 red flags backed by specific numbers, output exactly the single token INSUFFICIENT_DATA and nothing else.";

  const user =
`${ctx}

Produce a deal-level synthesis. Format your response EXACTLY as this JSON object (no extra prose, no markdown fence, no commentary outside the JSON):

{
  "highlights": [
    "3-5 bullets. Things the BUYER should be excited about. Each bullet quotes a specific OM number AND benchmarks it against a cited market source. Omit any bullet you can't back."
  ],
  "redFlags": [
    "3-5 bullets. Things that should worry the buyer: OM-vs-market discrepancies, lease structure risks, supply pressure, tenant credit concerns, deferred maintenance signals from the OM. Each bullet must reference a specific number, claim, or source. Omit any bullet you can't back."
  ],
  "brokerQuestions": [
    "5-7 questions specific to THIS deal. Quote OM numbers or named tenants. Example: 'Why is the OM cap rate 6.2% when comparable ${assetType} trades in this submarket are clearing at 7.0-7.5% (CBRE Q4 2024)?'"
  ],
  "body": "A 200-word synthesis paragraph an investment committee could read in 60 seconds. Lead with the verdict (proceed / pass / proceed-at-discount), then bull case, bear case, then a closer on the price discipline. Every claim must be specific to this deal."
}

Rules:
- Every market claim must have an inline citation with publication date.
- Compare OM claims to market data. If the OM says occupancy is 95% but the submarket is 88%, flag the divergence.
- If the OM excerpt is missing, lean harder on extracted_fields.
- Do NOT invent numbers. Do NOT write '[unverified]' as a placeholder. Just omit the bullet.
- Do NOT recommend external tools or third-party reports.
- Output VALID JSON only. No trailing commas. If insufficient data, output the literal string INSUFFICIENT_DATA instead of the JSON.`;

  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// ── Post-processors: scrub refusals and generic punts ──────────
const REFUSAL_PATTERNS: RegExp[] = [
  /\bi (?:cannot|can\s*not|can't|am unable|am not able|do not have|don't have|am sorry)\b/i,
  /\b(?:cannot|can't|unable to) (?:provide|generate|produce|deliver|offer|create|find|locate|supply|give)\b/i,
  /\bsearch results (?:provided|you provided|above|here)?\s*(?:contain|include|do not|don't|only|appear)/i,
  /\bthe (?:provided|given|available)\s+(?:search\s+)?(?:results|data|sources)\b/i,
  /\b(?:no|insufficient|limited|sparse) (?:data|information|coverage|results|comps|sources?) (?:is|are|was|were)?\s*(?:available|present|provided|found)?\b/i,
  /\bdata (?:is|was) not (?:available|provided|present)\b/i,
  /\bresults (?:do not|don't) (?:include|contain|provide|cover|address)\b/i,
  /\bnecessary for (?:a |the )?(?:retail|industrial|office|multifamily|cre|comprehensive)\b/i,
  /\bi'?m sorry\b/i,
  /\bapologi[sz]e\b/i,
  /\bbeyond (?:the |my )?scope\b/i,
];

const PUNT_PATTERNS: RegExp[] = [
  /\b(?:broker|buyer|investor|user|you|client) should (?:pull|order|consult|engage|hire|contact|reach out|verify|obtain|request)\b/i,
  /\b(?:recommend|suggest|advise) (?:that )?(?:the )?(?:broker|buyer|investor|user|you|client)\b/i,
  /\b(?:pull|order|obtain) (?:from|via|through) (?:costar|real capital analytics|rca|yardi|reis|crexi|loopnet|cushman|cbre|jll|colliers|newmark)\b/i,
  /\bconsult (?:a |an |the )?(?:local |third-?party |independent )?(?:broker|appraiser|analyst|specialist|advisor|professional)\b/i,
  /\b(?:pull|engage|order|commission) (?:a |an )?(?:third-?party|independent|professional|formal|appraisal|market study|broker price opinion|bpo)\b/i,
  /\brecommend(?:ation)?:\s*(?:broker|buyer|investor|client|you|user)\b/i,
  /\bfor (?:verified |confirmed |authoritative )?comps?,?\s+(?:pull|consult|use|order|reach out)\b/i,
];

const INSUFFICIENT_MARK = /\bINSUFFICIENT_DATA\b/;

function lineIsRefusalOrPunt(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  for (const re of REFUSAL_PATTERNS) if (re.test(trimmed)) return true;
  for (const re of PUNT_PATTERNS) if (re.test(trimmed)) return true;
  return false;
}

/**
 * Scrub a card body. Drops refusal/punt sentences. Returns "" if the
 * remaining body has fewer than 2 numeric, multi-word bullets — signalling
 * the caller should null the card.
 */
function scrubCardBody(text: string | null | undefined): string {
  if (!text) return "";
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!out) return "";
  if (INSUFFICIENT_MARK.test(out) && out.length < 80) return "";

  const lines = out.split(/\n/);
  const kept: string[] = [];
  let dropHeading = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Drop "Recommendation" / "Note" headings whose body is a punt.
    if (/^#{1,6}\s*(recommendations?|note|caveat|disclaimer|next steps?)\b/i.test(line)) {
      const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim().length > 0) || "";
      if (lineIsRefusalOrPunt(nextNonEmpty) || /^(?:broker|buyer|investor|client|you|user)\b/i.test(nextNonEmpty.trim())) {
        dropHeading = true;
        continue;
      }
    }

    if (dropHeading && line.trim() === "") { dropHeading = false; continue; }
    if (dropHeading) {
      if (lineIsRefusalOrPunt(line) || /^(?:broker|buyer|investor|client|you|user)\b/i.test(line.trim())) continue;
      dropHeading = false;
    }

    if (lineIsRefusalOrPunt(line)) continue;
    kept.push(line);
  }

  out = kept.join("\n").trim();

  // Count bullets that have at least one digit and >= 8 words.
  const bulletLines = out.split(/\n/).filter((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l));
  const meaty = bulletLines.filter((l) => /\d/.test(l) && l.trim().split(/\s+/).length >= 8);
  if (meaty.length < 2) return "";

  return out;
}

/** Filter array bullets (highlights / redFlags). Each must have a digit. */
function scrubFactArray(arr: string[]): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 20)
    .filter((s) => !lineIsRefusalOrPunt(s))
    .filter((s) => /\d/.test(s));
}

/** Filter broker-question array. Allows non-numeric items but blocks generic punts. */
function scrubQuestionArray(arr: string[]): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 20)
    .filter((s) => !lineIsRefusalOrPunt(s));
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
    const cleaned = scrubCardBody(r.content);
    if (!cleaned) {
      console.warn(`[location-intel] ${title}: scrubbed to empty (refusal or low-confidence). Setting card to null.`);
      return null;
    }
    return {
      title,
      body: cleaned,
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
    const r = await pplxChat(messages, {
      model: "sonar-reasoning",
      temperature: 0.1,
      maxTokens: 1500,
      returnCitations: true,
    });
    let text = (r.content || "").trim();
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    if (INSUFFICIENT_MARK.test(text) && text.length < 120) {
      console.warn("[location-intel] synthesis: model returned INSUFFICIENT_DATA");
      return null;
    }

    const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (fence) text = fence[1].trim();
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) text = text.slice(objStart, objEnd + 1);
    const parsed = JSON.parse(text);

    const highlights = scrubFactArray(parsed.highlights);
    const redFlags = scrubFactArray(parsed.redFlags);
    const brokerQuestions = scrubQuestionArray(parsed.brokerQuestions);
    const body = String(parsed.body || "").trim();
    const bodyClean = lineIsRefusalOrPunt(body) ? "" : body;

    if (highlights.length < 2 && redFlags.length < 2 && bodyClean.length < 120) {
      console.warn("[location-intel] synthesis: scrubbed to empty (low-confidence). Setting synthesis to null.");
      return null;
    }

    return {
      highlights,
      redFlags,
      brokerQuestions,
      body: bodyClean,
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
