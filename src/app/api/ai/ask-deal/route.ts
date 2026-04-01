import { NextRequest, NextResponse } from "next/server";
import { getProperty, getPropertyExtractedFields, getPropertyNotes } from "@/lib/workspace/firestore";

export const maxDuration = 60;

/* ── Helper: call OpenAI chat completions ──────────────── */
async function callOpenAI(
  messages: { role: string; content: string }[],
  maxTokens = 2000,
  temperature = 0.35,
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
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/* ── Helper: extract field value from extracted fields ── */
function gf(fields: any[], group: string, name: string): any {
  const f = fields.find((x: any) => x.fieldGroup === group && x.fieldName === name);
  if (!f) return null;
  return f.isUserOverridden ? f.userOverrideValue : f.normalizedValue || f.rawValue;
}

/* ── System prompt ─────────────────────────────────────── */
const SYSTEM_PROMPT = `You are a commercial real estate investment expert focused on retail strip centers, net lease assets, industrial properties, office buildings, and land deals.

Use the provided deal data to generate practical, actionable insights.

Be concise, opinionated, and specific. Avoid generic advice. Reference actual numbers from the deal data.

IMPORTANT: Always respond with valid JSON in this exact format:
{
  "title": "string - brief title for this analysis",
  "bullets": ["string - each bullet is one specific, actionable insight"],
  "confidence": "high" | "medium" | "low"
}

Return 3-5 bullets. Each bullet should be 1-2 sentences max.`;

/* ── Action-specific prompts ───────────────────────────── */
const ACTION_PROMPTS: Record<string, string> = {
  reposition: `Given this property data, provide 3 specific ways to reposition this asset to increase value.

Focus on:
- tenant mix changes
- physical improvements
- lease strategy

Be practical and realistic. Reference specific numbers from the data.`,

  risks: `Identify the top 5 risks in this deal.

Focus on:
- tenant risk
- rollover exposure
- pricing vs market
- physical condition
- market/location factors

Be direct and critical. Use specific data points.`,

  noi: `Suggest 3 ways to increase NOI for this property.

Include:
- rent adjustments with specific targets
- expense reductions
- lease restructuring opportunities

Estimate impact where possible using the actual numbers provided.`,

  tenant: `Suggest an improved tenant mix for this property.

Include:
- types of tenants that would fit
- specific categories (e.g. med spa, fitness, QSR, etc.)
- why they fit this location and demographics
- expected rent range for each

Reference the existing tenant data and location details.`,
};

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

    if (!ACTION_PROMPTS[action]) {
      return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    // Load property data
    const property = await getProperty(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Load extracted fields and notes
    const [fields, notes] = await Promise.all([
      getPropertyExtractedFields(propertyId),
      getPropertyNotes(propertyId),
    ]);

    // Build context payload
    const context = {
      property: {
        name: property.propertyName,
        address: [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", "),
        assetType: property.assetType || gf(fields, "property_basics", "asset_type") || "Unknown",
        squareFeet: gf(fields, "property_basics", "building_sf"),
        occupancy: gf(fields, "tenant_occupancy", "occupancy_pct") || gf(fields, "property_basics", "occupancy_pct"),
        yearBuilt: gf(fields, "property_basics", "year_built"),
        lotAcres: gf(fields, "property_basics", "lot_acres"),
        tenantCount: gf(fields, "tenant_occupancy", "tenant_count"),
        wale: gf(fields, "tenant_occupancy", "wale"),
      },
      financials: {
        price: gf(fields, "pricing_deal_terms", "asking_price"),
        capRate: gf(fields, "pricing_deal_terms", "cap_rate_om"),
        noi: gf(fields, "expenses", "noi_om"),
        rentPSF: gf(fields, "pricing_deal_terms", "price_per_sf"),
        dscr: gf(fields, "debt_assumptions", "dscr"),
        debtYield: gf(fields, "debt_assumptions", "debt_yield"),
      },
      rentRoll: fields
        .filter((f: any) => f.fieldGroup === "rent_roll")
        .map((f: any) => ({ field: f.fieldName, value: f.normalizedValue || f.rawValue })),
      score: {
        total: (property as any).scoreTotal || null,
        band: (property as any).scoreBand || null,
        categories: (property as any).scoreCategories || null,
      },
      signals: (property as any).signals || null,
      notes: notes.map((n: any) => ({
        type: n.noteType,
        content: typeof n.content === "string" ? n.content.slice(0, 500) : "",
      })),
    };

    // Call OpenAI
    const userPrompt = `${ACTION_PROMPTS[action]}

DEAL DATA:
${JSON.stringify(context, null, 2)}`;

    const raw = await callOpenAI([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    // Parse response
    let result;
    try {
      const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: wrap raw text as bullets
      result = {
        title: action === "reposition" ? "Repositioning Strategy" :
               action === "risks" ? "Risk Assessment" :
               action === "noi" ? "NOI Improvement" : "Tenant Mix Ideas",
        bullets: raw.split("\n").filter((l: string) => l.trim().length > 10).slice(0, 5),
        confidence: "medium",
      };
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[ask-deal] Error:", err);
    return NextResponse.json(
      { error: "Unable to analyze this deal right now" },
      { status: 500 },
    );
  }
}
