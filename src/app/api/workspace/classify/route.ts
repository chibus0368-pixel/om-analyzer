import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const CLASSIFY_PROMPT = `You classify commercial real estate offering materials into one analysis type.

Return only valid JSON.

Choose exactly one:
retail, industrial, office, land

Rules:
- retail = retail assets broadly, including single-tenant net lease, absolute NNN, ground lease retail, sale-leaseback with one main retail tenant, multi-tenant retail strip center, neighborhood center, or small-shop retail
- industrial = warehouse, flex industrial, distribution, manufacturing, industrial outdoor storage if tied to building utility
- office = professional office, medical office, clinic, suburban office, office condo portfolio
- land = raw land, development land, redevelopment land, outparcel, pad site, parcel marketed primarily as land`;

export async function POST(req: NextRequest) {
  try {
    const { documentText } = await req.json();

    if (!documentText || typeof documentText !== "string") {
      return NextResponse.json({ error: "Missing documentText" }, { status: 400 });
    }

    // Trim to first ~4000 chars (classification only needs first pages)
    const trimmedText = documentText.slice(0, 4000);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          { role: "system", content: CLASSIFY_PROMPT },
          { role: "user", content: `Classify this document using the content below.\n\nReturn JSON in this form only:\n{\n  "detected_type": "",\n  "confidence": 0.0,\n  "reason": ""\n}\n\nDocument text:\n${trimmedText}` },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[classify] OpenAI error:", err);
      return NextResponse.json({ error: "Classification failed" }, { status: 502 });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(jsonStr);

    // Validate detected_type
    const validTypes = ["retail", "industrial", "office", "land"];
    if (!validTypes.includes(result.detected_type)) {
      result.detected_type = "retail"; // Safe fallback
      result.confidence = 0;
      result.reason = "Classification uncertain, defaulting to retail";
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[classify] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Classification failed", details: err?.message },
      { status: 500 }
    );
  }
}
