import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 120;

/**
 * Submarket Truth Serum brief.
 *
 * POST  → generate an asset-type-aware submarket brief for a property.
 *         Cached in Firestore collection `workspace_submarket_briefs`
 *         keyed by propertyId, so the /api/workspace/submarket-brief GET
 *         can serve the last result without another LLM call.
 *
 * GET   → return the cached brief, if any.
 *
 * The system prompt is intentionally adversarial: measurable claims only,
 * no broker vocabulary, every assumption rationalised. We ask the LLM
 * for structured JSON so the UI can render each section cleanly instead
 * of parsing prose.
 */

type AssetType = "retail" | "industrial" | "office" | "multifamily" | "land";

const STALE_DATA_DISCLAIMER =
  "Market fundamentals, rent levels, vacancy rates, and supply pipeline data reflect conditions as of training data cutoff. Always label data sources and confidence levels. User-provided or recently fetched data should override training data.";

// ── OpenAI helper ──────────────────────────────────────────────
async function callOpenAI(
  messages: { role: string; content: string }[],
  maxTokens = 12000,
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── Asset-specific lens definitions injected into the system prompt ─
const ASSET_LENS: Record<AssetType, string> = {
  multifamily: `
MULTIFAMILY LENS
Focus on:
  - Household formation vs supply
  - Rent affordability vs income
  - Concessions vs asking rent gap
  - Absorption vs deliveries
Key metrics the brief MUST discuss when data is available:
  - Rent-to-income ratio
  - Absorption-to-delivery ratio
  - Effective vs asking rent delta
Competitive set columns: Property | Year Built | Unit Count | Asking Rent | Effective Rent | Occupancy
Truth constraint: Multifamily is about absorption under supply pressure and affordability, not gross rent growth.`,
  retail: `
RETAIL LENS
Focus on tenant viability and trade area economics.
Drivers to cover when data supports:
  - Trade area population (5/10/15 min drive)
  - Household income distribution
  - Retail leakage/surplus
  - Tenant sales productivity ($/SF) if available
  - Traffic counts and access
  - Co-tenancy strength
Demand: daytime vs residential population, retail spending per household, leakage/surplus by category, e-commerce-resistant tenant share.
Supply: net new retail SF (deliveries minus closures), redevelopment pipeline.
Competitive set columns: Property | Anchor | Traffic | Est Sales/SF | Inline Rent | Vacancy
Truth constraint: Retail is driven by tenant sales productivity, not asking rent.`,
  industrial: `
INDUSTRIAL LENS
Focus on logistics functionality and location efficiency.
Drivers: highway/rail proximity, clear height and building specs, truck access and circulation, tenant type (distribution vs manufacturing), land constraints.
Demand: net absorption vs deliveries, logistics demand (3PL, e-commerce), major tenant moves.
Supply: spec vs BTS pipeline, vacancy by vintage/class.
Competitive set columns: Property | Clear Height | Year | Rent PSF | Vacancy | Tenant Type
Truth constraint: Industrial value is throughput + functionality, not rent/SF alone.`,
  office: `
OFFICE / MEDICAL OFFICE LENS
Separate traditional office from medical office when relevant.
Drivers: tenant demand by sector, lease term durability, vacancy + sublease availability, parking ratios, hospital proximity (medical).
Demand: office-using employment trends, return-to-office rates, healthcare expansion for medical office.
Supply: sublease inventory, conversion pipeline.
Competitive set columns: Property | Tenant Type | Lease Term | Rent | Vacancy | Sublease Exposure
Truth constraint: Office is a leasing-risk asset; medical office is location + referral driven.`,
  land: `
LAND LENS
Focus on entitlement, infrastructure, and usability.
Drivers: zoning and entitlement probability, power availability, topography/wetlands/floodplain, access and frontage, price per buildable acre.
Demand: buyer pool (developers, users), comparable land absorption, pricing trends per usable acre.
Supply: competing entitled sites, infrastructure timelines.
Competitive set columns: Site | Acres | Buildable % | Power | Price/Acre | Status
Truth constraint: Land value is entitlement + timing + infrastructure, not comps alone.`,
};

// ── The system prompt (Submarket Truth Serum) ─────────────────
function buildSystemPrompt(assetType: AssetType): string {
  return `You are a senior CRE market research analyst producing institutional-quality submarket briefs.
Your output is copy-paste ready for an IC memo.
You strip broker narratives and surface-level optimism to reveal what is actually happening and why, using measurable drivers — jobs, household growth, pricing, supply pipeline, rent growth — not marketing language.

Every sentence must contain:
  - a measurable claim
  - a specific data point
  - or a falsifiable prediction

Banned unless quantified: "strong fundamentals", "vibrant", "thriving", "growing market", "prime location", any adjective without a number.

STALE DATA DISCLAIMER (must be honoured): ${STALE_DATA_DISCLAIMER}
When a number is from training-era data, tag its confidence as "medium" or "low" and cite the era. Never fabricate precise figures. If you do not know, say so and tag confidence "low".

ASSET TYPE SWITCH
${ASSET_LENS[assetType]}

OUTPUT FORMAT — return a single JSON object with this exact shape. Do not include any prose outside the JSON:

{
  "bottom_line": "One sentence. The most important conclusion for the IC.",
  "executive_summary": [
    "Max 8 bullets. First bullet = bottom line. Each bullet is measurable or falsifiable.",
    "Must cover: demand trajectory, supply risk, rent outlook, pricing/cap rate, key risk, key opportunity, underwriting implication."
  ],
  "narrative": "One-page prose. Separate metro vs submarket trends. No generic language. All claims measurable or testable.",
  "snapshot_table": [
    { "metric": "string", "current": "string", "trend_3yr": "string", "forward_12_24mo": "string", "source_confidence": "high|medium|low with source" }
  ],
  "supply_pipeline": [
    { "quarter": "YYYY-Q#", "project": "string", "size": "string", "developer": "string", "stage": "string", "pre_leasing": "string", "competitive_overlap": "string" }
  ],
  "demand_drivers": {
    "summary": "2-3 sentences applying the asset-specific lens above.",
    "points": ["Each point must be measurable or cite a specific driver."]
  },
  "competitive_set": {
    "columns": ["Asset-specific column headers (see lens)"] ,
    "rows": [
      { "values": ["row values matching columns"], "confidence": "high|medium|low" }
    ]
  },
  "brokers_wont_tell_you": [
    "3-5 bullets. Each specific, measurable or observable, highlighting hidden risk or distortion."
  ],
  "outlook_12_24mo": [
    { "scenario": "Bull|Base|Bear", "rent_growth": "string", "occupancy": "string", "assumption": "string", "trigger": "string" }
  ],
  "regulatory_risk": "String. Apply asset-appropriate lens (rent control for MF, zoning for land, redevelopment constraints for retail, environmental/logistics regs for industrial). Write 'Not applicable' if none.",
  "risks_watch_items": [
    { "risk": "string", "probability": "HIGH|MEDIUM|LOW", "trigger": "string" }
  ],
  "underwriting_implications": {
    "rent_growth": { "value": "string", "rationale": "string" },
    "vacancy": { "value": "string", "rationale": "string" },
    "concessions": { "value": "string", "rationale": "string" },
    "expense_growth": { "value": "string", "rationale": "string" },
    "exit_cap_rate": { "value": "string", "rationale": "string" },
    "hold_period": { "value": "string", "rationale": "string" },
    "absorption_pace": { "value": "string", "rationale": "string" }
  },
  "data_staleness_note": "Short note stating what era the training data is from and which sections should be refreshed with live data.",
  "word_count_target_met": true
}

HARD RULES
  - Total narrative + bullets must be 1,500-2,500 words of actual content (not counting JSON scaffolding).
  - No filler. Dense and analytical.
  - Every claim measurable or falsifiable.
  - No single-point forecasts in outlook_12_24mo — always 3 scenarios.
  - Competitive set: 8-12 rows minimum when you have any confidence in the data. Fewer rows only if you cannot source them with at least medium confidence.
  - If unsure of a number, mark confidence "low" and say so. Fabricating specifics is worse than omitting them.`;
}

function buildUserPrompt(ctx: {
  propertyName: string;
  address: string;
  city: string;
  state: string;
  assetType: AssetType;
  buildingSf?: number | null;
  yearBuilt?: number | null;
  tenants?: string[];
  additional?: string | null;
}): string {
  const tenantLine = ctx.tenants && ctx.tenants.length > 0 ? `\nKey tenants: ${ctx.tenants.slice(0, 15).join(", ")}` : "";
  const sfLine = ctx.buildingSf ? `\nBuilding SF: ${ctx.buildingSf.toLocaleString()}` : "";
  const yearLine = ctx.yearBuilt ? `\nYear built: ${ctx.yearBuilt}` : "";
  const additional = ctx.additional ? `\nAdditional context: ${ctx.additional}` : "";
  return `Produce a Submarket Truth Serum brief for this deal.

Property: ${ctx.propertyName}
Address: ${ctx.address}
City / state: ${ctx.city || "unknown"}, ${ctx.state || "unknown"}
Asset type: ${ctx.assetType}${sfLine}${yearLine}${tenantLine}${additional}

Apply the ${ctx.assetType.toUpperCase()} lens and return the JSON object exactly as specified.`;
}

// ── Load property context from Firestore for the user prompt ────
async function loadPropertyCtx(propertyId: string): Promise<{
  propertyName: string;
  address: string;
  city: string;
  state: string;
  assetType: AssetType;
  buildingSf: number | null;
  yearBuilt: number | null;
  tenants: string[];
} | null> {
  try {
    const db = getAdminDb();
    const propDoc = await db.collection("workspace_properties").doc(propertyId).get();
    if (!propDoc.exists) return null;
    const prop = propDoc.data() as any;

    const fieldsSnap = await db
      .collection("workspace_properties")
      .doc(propertyId)
      .collection("extracted_fields")
      .get();
    const fields: Record<string, any> = {};
    fieldsSnap.forEach(d => {
      const f = d.data() as any;
      const key = `${f.category || ""}.${f.field_name || ""}`;
      fields[key] = f.value;
    });

    const pick = (keys: string[]): any => {
      for (const k of keys) if (fields[k] != null && fields[k] !== "") return fields[k];
      return null;
    };

    const address =
      pick(["property_basics.address", "property_basics.street_address", "property_basics.full_address"]) ||
      prop.address ||
      prop.displayAddress ||
      "";
    const city = pick(["property_basics.city"]) || prop.city || "";
    const state = pick(["property_basics.state", "property_basics.state_province"]) || prop.state || "";
    const assetRaw = (prop.analysisType || pick(["property_basics.analysis_type", "property_basics.asset_type"]) || "retail") as string;
    const assetType = (["retail", "industrial", "office", "multifamily", "land"].includes(assetRaw)
      ? assetRaw
      : "retail") as AssetType;

    const buildingSf = Number(pick(["property_basics.building_sf", "property_basics.gla"])) || null;
    const yearBuilt = Number(pick(["property_basics.year_built"])) || null;

    // Tenants — try an extracted-fields table first, fall back to empty list.
    const tenantsRaw = pick(["rent_roll.tenants", "rent_roll.tenant_list"]);
    const tenants: string[] = Array.isArray(tenantsRaw)
      ? tenantsRaw.map((t: any) => String(t?.name || t?.tenant || t)).filter(Boolean).slice(0, 20)
      : [];

    return {
      propertyName: prop.name || prop.propertyName || address || "Untitled property",
      address: address || "",
      city: city || "",
      state: state || "",
      assetType,
      buildingSf,
      yearBuilt,
      tenants,
    };
  } catch (err) {
    console.error("[submarket-brief] loadPropertyCtx failed:", err);
    return null;
  }
}

// ── POST: generate ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const propertyId: string | undefined = body.propertyId;
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const ctx = await loadPropertyCtx(propertyId);
    if (!ctx) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Caller may override the auto-detected asset type, e.g. to re-run
    // as a different lens for mixed-use properties.
    const assetType: AssetType = ["retail", "industrial", "office", "multifamily", "land"].includes(body.assetType)
      ? body.assetType
      : ctx.assetType;

    const sys = buildSystemPrompt(assetType);
    const user = buildUserPrompt({ ...ctx, assetType, additional: body.additionalContext || null });

    const raw = await callOpenAI([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("[submarket-brief] JSON parse failed:", raw.slice(0, 600));
      return NextResponse.json(
        { error: "Could not parse LLM JSON. Try regenerating." },
        { status: 502 },
      );
    }

    const record = {
      propertyId,
      assetType,
      brief: parsed,
      staleDataDisclaimer: STALE_DATA_DISCLAIMER,
      input: {
        propertyName: ctx.propertyName,
        address: ctx.address,
        city: ctx.city,
        state: ctx.state,
        tenants: ctx.tenants,
        buildingSf: ctx.buildingSf,
        yearBuilt: ctx.yearBuilt,
      },
      createdAt: new Date().toISOString(),
    };

    try {
      const db = getAdminDb();
      await db.collection("workspace_submarket_briefs").doc(propertyId).set(record);
    } catch (err) {
      // Caching failure shouldn't block the response; log and move on.
      console.warn("[submarket-brief] cache write failed:", err);
    }

    return NextResponse.json({ ok: true, ...record });
  } catch (err: any) {
    console.error("[submarket-brief] POST error:", err);
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}

// ── GET: fetch cached brief ────────────────────────────────────
export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId required" }, { status: 400 });
  }
  try {
    const db = getAdminDb();
    const doc = await db.collection("workspace_submarket_briefs").doc(propertyId).get();
    if (!doc.exists) {
      return NextResponse.json({ exists: false });
    }
    const data = doc.data();
    return NextResponse.json({ exists: true, ...data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
