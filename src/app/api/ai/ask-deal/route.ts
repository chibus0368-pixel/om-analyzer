import { NextRequest, NextResponse } from "next/server";
import { getProperty, getPropertyExtractedFields, getPropertyNotes } from "@/lib/workspace/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 60;

/* ── Helper: call OpenAI ───────────────────────────────── */
async function callOpenAI(
  messages: { role: string; content: string }[],
  maxTokens = 2500,
  temperature = 0.4,
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "gpt-4o", messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/* ── Helper: extract field value ───────────────────────── */
function gf(fields: any[], group: string, name: string): any {
  const f = fields.find((x: any) => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

/* ══════════════════════════════════════════════════════════ */
/*  CONTEXT ANALYZER — pre-digests deal data into narrative  */
/*  intelligence so prompts are specific, not generic        */
/* ══════════════════════════════════════════════════════════ */
function analyzeDealContext(property: any, fields: any[], notes: any[], deepResearch: any) {
  const g = (group: string, name: string) => gf(fields, group, name);

  // ── Core property facts ──
  const city = property.city || "";
  const state = property.state || "";
  const address = [property.address1, city, state, property.zip].filter(Boolean).join(", ");
  const assetType = property.assetType || g("property_basics", "asset_type") || "Unknown";
  const sf = Number(g("property_basics", "building_sf")) || 0;
  const yearBuilt = g("property_basics", "year_built");
  const lotAcres = Number(g("property_basics", "lot_acres")) || 0;
  const occupancy = Number(g("tenant_occupancy", "occupancy_pct") || g("property_basics", "occupancy_pct")) || 0;
  const tenantCount = Number(g("tenant_occupancy", "tenant_count")) || 0;
  const wale = Number(g("tenant_occupancy", "wale")) || 0;

  // ── Financials ──
  const price = Number(g("pricing_deal_terms", "asking_price")) || 0;
  const capRate = Number(g("pricing_deal_terms", "cap_rate_om")) || 0;
  const noi = Number(g("expenses", "noi_om")) || 0;
  const pricePSF = sf > 0 && price > 0 ? price / sf : 0;
  const dscr = Number(g("debt_assumptions", "dscr")) || 0;
  const debtYield = Number(g("debt_assumptions", "debt_yield")) || 0;
  const cashOnCash = Number(g("debt_assumptions", "cash_on_cash")) || 0;
  const rentPSF = Number(g("tenant_occupancy", "avg_rent_psf") || g("pricing_deal_terms", "price_per_sf")) || 0;

  // ── Score & signals ──
  const scoreTotal = (property as any).scoreTotal || null;
  const scoreBand = (property as any).scoreBand || "";
  const scoreCategories = (property as any).scoreCategories || [];
  const signals = (property as any).signals || {};

  // ── Rent roll / tenants ──
  const rentRollFields = fields.filter((f: any) => f.fieldGroup === "rent_roll");
  const tenantNames = rentRollFields
    .filter((f: any) => f.fieldName?.includes("tenant_name"))
    .map((f: any) => f.normalizedValue || f.rawValue)
    .filter(Boolean);
  const leaseEnds = rentRollFields
    .filter((f: any) => f.fieldName?.includes("lease_end") || f.fieldName?.includes("expiration"))
    .map((f: any) => f.normalizedValue || f.rawValue)
    .filter(Boolean);

  // ── Notes / investment thesis ──
  const thesis = notes.find((n: any) => n.noteType === "investment_thesis")?.content || "";
  const userNotes = notes
    .filter((n: any) => n.noteType === "user_note")
    .map((n: any) => n.content)
    .filter(Boolean)
    .slice(0, 3);

  // ── Deep research / location intel ──
  let locationIntel = "";
  if (deepResearch?.sections) {
    for (const section of deepResearch.sections) {
      if (section.findings?.length) {
        locationIntel += `\n[${section.title}]\n`;
        for (const f of section.findings.slice(0, 4)) {
          locationIntel += `- ${f.label}: ${f.finding} (${f.signal})\n`;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  //  BUILD PRICING INTELLIGENCE
  // ══════════════════════════════════════════════════════════
  const pricingIntel: string[] = [];
  if (capRate > 0) {
    if (capRate < 5) pricingIntel.push(`Cap rate ${capRate.toFixed(2)}% is AGGRESSIVE — this is core/trophy pricing. Buyer is paying for credit tenant and location, not yield.`);
    else if (capRate < 6) pricingIntel.push(`Cap rate ${capRate.toFixed(2)}% is market-rate for investment-grade NNN. Stable but not a value play.`);
    else if (capRate < 7.5) pricingIntel.push(`Cap rate ${capRate.toFixed(2)}% offers moderate yield — typical for well-located secondary assets or value-add.`);
    else pricingIntel.push(`Cap rate ${capRate.toFixed(2)}% signals either higher risk, shorter lease, or a genuine value opportunity. Investigate why yield is elevated.`);
  }
  if (pricePSF > 0) {
    if (assetType.toLowerCase().includes("retail")) {
      if (pricePSF > 400) pricingIntel.push(`$${pricePSF.toFixed(0)}/SF is premium retail pricing — only justified by credit tenant, long lease, or irreplaceable location.`);
      else if (pricePSF > 200) pricingIntel.push(`$${pricePSF.toFixed(0)}/SF is mid-market retail basis. Check replacement cost in this market.`);
      else pricingIntel.push(`$${pricePSF.toFixed(0)}/SF is below typical replacement cost — attractive basis with built-in downside protection.`);
    } else if (assetType.toLowerCase().includes("industrial")) {
      if (pricePSF > 150) pricingIntel.push(`$${pricePSF.toFixed(0)}/SF is elevated for industrial — premium location or specialized facility.`);
      else if (pricePSF > 80) pricingIntel.push(`$${pricePSF.toFixed(0)}/SF is market-rate industrial pricing.`);
      else pricingIntel.push(`$${pricePSF.toFixed(0)}/SF is well below replacement cost for industrial — strong downside protection.`);
    }
  }
  if (dscr > 0) {
    if (dscr < 1.2) pricingIntel.push(`DSCR ${dscr.toFixed(2)}x is THIN — lender will be cautious, any income disruption threatens debt service.`);
    else if (dscr < 1.35) pricingIntel.push(`DSCR ${dscr.toFixed(2)}x is adequate but leaves little cushion for rate increases or vacancy.`);
    else pricingIntel.push(`DSCR ${dscr.toFixed(2)}x provides comfortable debt coverage with room for rate movement.`);
  }

  // ══════════════════════════════════════════════════════════
  //  BUILD TENANT INTELLIGENCE
  // ══════════════════════════════════════════════════════════
  const tenantIntel: string[] = [];
  if (tenantCount === 1 && tenantNames.length > 0) {
    tenantIntel.push(`SINGLE-TENANT ASSET: ${tenantNames[0]}. All income depends on one credit. If they leave, income goes to zero.`);
  } else if (tenantCount > 1) {
    tenantIntel.push(`MULTI-TENANT (${tenantCount} tenants): ${tenantNames.slice(0, 5).join(", ")}. Diversified income stream reduces single-tenant risk.`);
  }
  if (wale > 0) {
    if (wale < 3) tenantIntel.push(`WALE ${wale.toFixed(1)} years is SHORT — significant near-term rollover exposure. Budget for re-tenanting costs and downtime.`);
    else if (wale < 5) tenantIntel.push(`WALE ${wale.toFixed(1)} years is moderate — some leases rolling in the near term. Analyze which tenants are expiring and their renewal likelihood.`);
    else if (wale < 8) tenantIntel.push(`WALE ${wale.toFixed(1)} years provides solid runway. Limited near-term rollover risk.`);
    else tenantIntel.push(`WALE ${wale.toFixed(1)} years is LONG — excellent income stability. Low management burden but limited mark-to-market opportunity.`);
  }
  if (occupancy < 100 && occupancy > 0) {
    const vacantPct = 100 - occupancy;
    tenantIntel.push(`${vacantPct.toFixed(0)}% vacancy (${occupancy}% occupied). Vacant space is both risk (carrying cost) and opportunity (lease-up upside at market rents).`);
  }
  if (leaseEnds.length > 0) {
    tenantIntel.push(`Lease expirations: ${leaseEnds.slice(0, 4).join(", ")}. Stagger analysis needed to assess concentration of rollover.`);
  }

  // ══════════════════════════════════════════════════════════
  //  BUILD LOCATION INTELLIGENCE
  // ══════════════════════════════════════════════════════════
  const locationSummary: string[] = [];
  locationSummary.push(`Market: ${city}, ${state}`);
  if (locationIntel) {
    locationSummary.push(`Location research available:\n${locationIntel}`);
  }
  const traffic = g("property_basics", "traffic_count") || g("location", "traffic_count");
  if (traffic) locationSummary.push(`Traffic count: ${traffic}`);

  // ══════════════════════════════════════════════════════════
  //  BUILD PHYSICAL CONDITION INTELLIGENCE
  // ══════════════════════════════════════════════════════════
  const physicalIntel: string[] = [];
  if (yearBuilt) {
    const age = new Date().getFullYear() - Number(yearBuilt);
    if (age > 30) physicalIntel.push(`Built ${yearBuilt} (${age} years old) — likely needs significant capex: roof, HVAC, parking lot, ADA compliance.`);
    else if (age > 20) physicalIntel.push(`Built ${yearBuilt} (${age} years old) — approaching major capex cycle. Budget $5-15/SF for deferred maintenance.`);
    else if (age > 10) physicalIntel.push(`Built ${yearBuilt} (${age} years old) — mid-life asset. Cosmetic updates may be needed but major systems should be sound.`);
    else physicalIntel.push(`Built ${yearBuilt} (${age} years old) — relatively new construction. Minimal near-term capex expected.`);
  }
  if (sf > 0) physicalIntel.push(`${sf.toLocaleString()} SF on ${lotAcres > 0 ? `${lotAcres} acres` : "unknown acreage"}.`);

  // ══════════════════════════════════════════════════════════
  //  AGGREGATE SIGNAL ASSESSMENT
  // ══════════════════════════════════════════════════════════
  const signalSummary: string[] = [];
  if (scoreTotal) {
    signalSummary.push(`Deal Signals Score: ${scoreTotal}/100 (${scoreBand.replace("_", " ")})`);
  }
  if (signals.overall_signal || signals.overall) {
    signalSummary.push(`Overall signal: ${signals.overall_signal || signals.overall}`);
  }
  // Include individual signals
  for (const [key, val] of Object.entries(signals)) {
    if (key !== "overall" && key !== "overall_signal" && val) {
      signalSummary.push(`${key.replace(/_/g, " ")}: ${val}`);
    }
  }
  // Include score categories
  if (scoreCategories.length > 0) {
    const weakest = [...scoreCategories].sort((a: any, b: any) => (a.score || 0) - (b.score || 0)).slice(0, 3);
    const strongest = [...scoreCategories].sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).slice(0, 3);
    signalSummary.push(`Weakest areas: ${weakest.map((c: any) => `${c.name} (${c.score})`).join(", ")}`);
    signalSummary.push(`Strongest areas: ${strongest.map((c: any) => `${c.name} (${c.score})`).join(", ")}`);
  }

  return {
    // Structured for the prompt
    summary: `${property.propertyName} — ${assetType} at ${address}`,
    pricing: pricingIntel.join("\n"),
    tenants: tenantIntel.join("\n"),
    location: locationSummary.join("\n"),
    physical: physicalIntel.join("\n"),
    signals: signalSummary.join("\n"),
    thesis: thesis ? `Investment thesis from OM: ${thesis.slice(0, 600)}` : "",
    userNotes: userNotes.length > 0 ? `User notes: ${userNotes.join("; ")}` : "",
    // Raw numbers for action prompts
    raw: { price, capRate, noi, pricePSF, dscr, debtYield, cashOnCash, rentPSF, sf, occupancy, wale, tenantCount, yearBuilt, assetType, city, state, tenantNames },
  };
}

/* ══════════════════════════════════════════════════════════ */
/*  SMART PROMPT BUILDER — action-specific, data-aware      */
/* ══════════════════════════════════════════════════════════ */
function buildSmartPrompt(action: string, ctx: ReturnType<typeof analyzeDealContext>): { system: string; user: string } {
  const { raw } = ctx;

  // Shared context block injected into every prompt
  const contextBlock = `
═══ DEAL SNAPSHOT ═══
${ctx.summary}

═══ PRICING ANALYSIS ═══
${ctx.pricing || "Limited pricing data available."}

═══ TENANT PROFILE ═══
${ctx.tenants || "Limited tenant data available."}

═══ LOCATION & MARKET ═══
${ctx.location || `${raw.city}, ${raw.state} — no deep research available yet.`}

═══ PHYSICAL CONDITION ═══
${ctx.physical || "No physical data available."}

═══ DEAL SIGNALS SCORE ═══
${ctx.signals || "No scoring data available."}

${ctx.thesis ? `═══ INVESTMENT THESIS (from OM) ═══\n${ctx.thesis}` : ""}
${ctx.userNotes ? `═══ USER NOTES ═══\n${ctx.userNotes}` : ""}`;

  const system = `You are a senior CRE acquisitions analyst with 20+ years experience in ${raw.assetType.toLowerCase().includes("retail") ? "retail and net lease" : raw.assetType.toLowerCase().includes("industrial") ? "industrial and logistics" : raw.assetType.toLowerCase().includes("office") ? "office and mixed-use" : "commercial real estate"} investments.

You've analyzed thousands of deals in markets like ${raw.city}, ${raw.state}. You think like a principal — not a broker. You identify what others miss.

RULES:
- Reference SPECIFIC numbers from the deal data (cap rates, $/SF, WALE, etc.)
- Name specific tenant types, renovation strategies, or market comparables
- If data is weak or missing, say so — don't fill gaps with assumptions
- Be opinionated. Take a position. "It depends" is not an answer.
- ${raw.capRate > 0 ? `This deal is priced at a ${raw.capRate.toFixed(2)}% cap — calibrate all advice to this pricing level.` : ""}
- ${raw.occupancy > 0 && raw.occupancy < 95 ? `This property has vacancy — factor that into every recommendation.` : ""}

IMPORTANT: Always respond with valid JSON:
{
  "title": "string - specific title referencing this deal",
  "bullets": ["string - each bullet is one specific, actionable insight with numbers"],
  "confidence": "high" | "medium" | "low"
}

Return 3-5 bullets. Each bullet should be 1-2 sentences max. Use dollar amounts, percentages, and timeframes.`;

  let userPrompt = "";

  switch (action) {
    case "reposition":
      userPrompt = `TASK: Develop a repositioning strategy for this ${raw.assetType} asset.

${contextBlock}

ANALYSIS REQUIREMENTS:
${raw.occupancy < 95 ? `- There's ${(100 - raw.occupancy).toFixed(0)}% vacancy. What tenant types would fill this space and at what rent?` : "- Fully occupied. How do you create value without vacancy?"}
${raw.wale < 4 ? `- WALE is only ${raw.wale.toFixed(1)} years. Near-term rollovers are a repositioning opportunity — which leases do you renegotiate vs. replace?` : `- WALE is ${raw.wale.toFixed(1)} years. Limited near-term rollover. Focus on physical repositioning and rent escalation strategies.`}
${raw.pricePSF > 0 ? `- At $${raw.pricePSF.toFixed(0)}/SF, what renovations would be accretive? What's the realistic $/SF capex budget?` : ""}
${raw.tenantNames.length > 0 ? `- Current tenants: ${raw.tenantNames.slice(0, 5).join(", ")}. Which stay, which go, and who replaces them?` : ""}
- What does the exit look like in 3-5 years? Target cap rate and valuation.`;
      break;

    case "risks":
      userPrompt = `TASK: Identify the deal-killers and key risks in this ${raw.assetType} acquisition.

${contextBlock}

DIG INTO THESE SPECIFICALLY:
${raw.tenantCount === 1 ? `- SINGLE TENANT RISK: What happens if ${raw.tenantNames[0] || "the tenant"} vacates? What's the realistic downtime and re-tenanting cost?` : `- TENANT CONCENTRATION: Are any of these ${raw.tenantCount} tenants >40% of rent? What's the weakest credit?`}
${raw.capRate > 0 ? `- PRICING RISK: At a ${raw.capRate.toFixed(2)}% cap, what does a 50-100bp cap rate expansion do to equity? Is the basis defensible?` : ""}
${raw.wale > 0 ? `- ROLLOVER RISK: ${raw.wale < 4 ? `WALE is only ${raw.wale.toFixed(1)} years — which leases are expiring first and what's the renewal probability?` : `WALE ${raw.wale.toFixed(1)} years is decent, but what happens at expiration?`}` : ""}
${raw.yearBuilt ? `- PHYSICAL RISK: Built ${raw.yearBuilt}. What deferred maintenance or capex surprises are lurking?` : ""}
- MARKET RISK: Is ${raw.city}, ${raw.state} growing or contracting? Any supply pipeline concerns?
- INTEREST RATE RISK: ${raw.dscr > 0 ? `DSCR is ${raw.dscr.toFixed(2)}x — what happens if rates move 100bp?` : "How rate-sensitive is this deal?"}`;
      break;

    case "noi":
      userPrompt = `TASK: Build a realistic NOI improvement plan for this ${raw.assetType} asset.

${contextBlock}

BE SPECIFIC ON THESE:
${raw.noi > 0 ? `- Current NOI is $${Math.round(raw.noi).toLocaleString()}. What's a realistic 12-month NOI target and the path to get there?` : ""}
${raw.rentPSF > 0 ? `- Average rent is $${raw.rentPSF.toFixed(2)}/SF. What's market rent in ${raw.city}? Is there a mark-to-market opportunity?` : `- What's achievable market rent in ${raw.city} for this asset class?`}
${raw.occupancy < 100 && raw.occupancy > 0 ? `- ${(100 - raw.occupancy).toFixed(0)}% is vacant. At market rents, what does full occupancy add to NOI?` : "- Fully occupied. Focus on rent bumps, CAM recoveries, and expense reduction."}
- What expense line items are typically bloated in ${raw.assetType.toLowerCase()} assets? Where do you cut?
- Are there ancillary income opportunities (pylon signage, ATM placement, antenna leases, storage, vending)?
${raw.capRate > 0 && raw.noi > 0 ? `- At a ${raw.capRate.toFixed(2)}% cap, every $10K of NOI improvement creates $${Math.round(10000 / (raw.capRate / 100)).toLocaleString()} in value. What's the highest-impact move?` : ""}`;
      break;

    case "tenant":
      userPrompt = `TASK: Design an optimal tenant mix strategy for this ${raw.assetType} in ${raw.city}, ${raw.state}.

${contextBlock}

REQUIREMENTS:
${raw.tenantNames.length > 0 ? `- Current tenants: ${raw.tenantNames.slice(0, 6).join(", ")}. Which complement each other? Which are mismatched?` : "- No tenant data available. Propose a fresh tenant mix for this asset type and location."}
${raw.occupancy < 100 ? `- ${(100 - raw.occupancy).toFixed(0)}% vacancy to fill. What specific tenant categories should you target for the vacant space?` : "- Fully leased. Which tenants would you replace at rollover and why?"}
- Name SPECIFIC tenant brands or categories (not just "retail" — say "urgent care clinic like CityMD" or "fast-casual like Chipotle/Cava")
- What rent/SF can each tenant type support in this market?
- How do they drive traffic to each other? What's the synergy play?
${raw.sf > 0 ? `- Total ${raw.sf.toLocaleString()} SF. What's the right suite size mix? Any spaces need to be combined or demised?` : ""}
- What tenant categories are growing in ${raw.city}, ${raw.state} right now?`;
      break;

    default:
      userPrompt = `Analyze this deal:\n${contextBlock}`;
  }

  return { system, user: userPrompt };
}

/* ── POST handler ──────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { propertyId, action } = body;

    if (!propertyId || !action) {
      return NextResponse.json({ error: "Missing propertyId or action" }, { status: 400 });
    }
    if (!["reposition", "risks", "noi", "tenant"].includes(action)) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    // Load all data in parallel
    const property = await getProperty(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const [fields, notes, deepResearchDoc] = await Promise.all([
      getPropertyExtractedFields(propertyId),
      getPropertyNotes(propertyId),
      getAdminDb().collection("workspace_deep_research").doc(propertyId).get().catch(() => null),
    ]);

    const deepResearch = deepResearchDoc?.exists ? deepResearchDoc.data() : null;

    // Pre-analyze the deal context
    const ctx = analyzeDealContext(property, fields, notes, deepResearch);

    // Build smart, context-aware prompts
    const { system, user } = buildSmartPrompt(action, ctx);

    // Call OpenAI
    const raw = await callOpenAI([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    // Parse response
    let result;
    try {
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      result = {
        title: `${ctx.summary} — ${action === "reposition" ? "Repositioning" : action === "risks" ? "Risk Assessment" : action === "noi" ? "NOI Strategy" : "Tenant Mix"}`,
        bullets: raw.split("\n").filter((l: string) => l.trim().length > 10).slice(0, 5),
        confidence: "medium",
      };
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[ask-deal] Error:", err);
    return NextResponse.json({ error: "Unable to analyze this deal right now" }, { status: 500 });
  }
}
