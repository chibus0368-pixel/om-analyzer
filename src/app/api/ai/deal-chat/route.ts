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

/* ── System prompt with context injection ──────────────── */
function buildSystemPrompt(context: any, previousResponses: any[]) {
  return `You are a CRE deal analyst.

You have full access to:
- extracted property data
- financial metrics
- deal score
- user notes

DEAL CONTEXT:
${JSON.stringify(context, null, 2)}

${previousResponses.length > 0 ? `PREVIOUS ANALYSIS IN THIS SESSION:
${previousResponses.map(r => `[${r.action}] ${r.title}: ${r.bullets?.join("; ") || ""}`).join("\n")}` : ""}

Answer questions using ONLY this context.
Be specific and actionable.
If data is missing, say so clearly.
Do not guess numbers - only reference data that is provided.
Keep responses concise (3-5 bullet points or 2-3 short paragraphs).`;
}

/* ── POST handler ──────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { propertyId, messages, previousResponses } = body;

    if (!propertyId || !messages?.length) {
      return NextResponse.json({ error: "Missing propertyId or messages" }, { status: 400 });
    }

    // Enforce max message limit (10 messages)
    if (messages.length > 10) {
      return NextResponse.json({ error: "Maximum conversation length reached. Please reset." }, { status: 400 });
    }

    // Load property data
    const property = await getProperty(propertyId);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const [fields, notes] = await Promise.all([
      getPropertyExtractedFields(propertyId),
      getPropertyNotes(propertyId),
    ]);

    // Build context
    const context = {
      property: {
        name: property.propertyName,
        address: [property.address1, property.city, property.state, property.zip].filter(Boolean).join(", "),
        assetType: property.assetType || gf(fields, "property_basics", "asset_type") || "Unknown",
        squareFeet: gf(fields, "property_basics", "building_sf"),
        occupancy: gf(fields, "tenant_occupancy", "occupancy_pct"),
        yearBuilt: gf(fields, "property_basics", "year_built"),
        wale: gf(fields, "tenant_occupancy", "wale"),
      },
      financials: {
        price: gf(fields, "pricing_deal_terms", "asking_price"),
        capRate: gf(fields, "pricing_deal_terms", "cap_rate_om"),
        noi: gf(fields, "expenses", "noi_om"),
        dscr: gf(fields, "debt_assumptions", "dscr"),
      },
      score: {
        total: (property as any).scoreTotal || null,
        band: (property as any).scoreBand || null,
      },
      signals: (property as any).signals || null,
      notes: notes.map((n: any) => ({
        type: n.noteType,
        content: typeof n.content === "string" ? n.content.slice(0, 300) : "",
      })),
    };

    const systemPrompt = buildSystemPrompt(context, previousResponses || []);

    // Build messages array for OpenAI
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-8).map((m: any) => ({
        role: m.role as string,
        content: m.content as string,
      })),
    ];

    const response = await callOpenAI(chatMessages, 1500, 0.4);

    return NextResponse.json({ content: response });
  } catch (err: any) {
    console.error("[deal-chat] Error:", err);
    return NextResponse.json(
      { error: "Unable to respond right now. Please try again." },
      { status: 500 },
    );
  }
}
