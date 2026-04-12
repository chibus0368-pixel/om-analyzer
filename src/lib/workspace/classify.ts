/**
 * Shared analysis-type classifier.
 *
 * Extracted from /api/workspace/classify so both the web upload route
 * and the Chrome-extension upload route can call it as a direct function
 * import. Never self-fetch — per ARCHITECTURE LOCK in CLAUDE.md, Vercel
 * serverless cannot reliably call its own routes over HTTP.
 */

export type AnalysisType = "retail" | "industrial" | "office" | "land";

export interface ClassifyResult {
  detected_type: AnalysisType;
  confidence: number;
  reason: string;
}

const CLASSIFY_PROMPT = `You classify commercial real estate offering materials into one analysis type.

Return only valid JSON.

Choose exactly one:
retail, industrial, office, land

Rules:
- retail = retail assets broadly, including single-tenant net lease, absolute NNN, ground lease retail, sale-leaseback with one main retail tenant, multi-tenant retail strip center, neighborhood center, or small-shop retail
- industrial = warehouse, flex industrial, distribution, manufacturing, industrial outdoor storage if tied to building utility
- office = professional office, medical office, clinic, suburban office, office condo portfolio
- land = raw land, development land, redevelopment land, outparcel, pad site, parcel marketed primarily as land`;

const VALID_TYPES: AnalysisType[] = ["retail", "industrial", "office", "land"];

/**
 * Classify a document's analysis type using GPT-4o. Returns a safe
 * default ("retail" with confidence 0) on any failure so callers never
 * have to branch on errors — the pipeline keeps flowing.
 */
export async function classifyDocument(documentText: string): Promise<ClassifyResult> {
  const fallback: ClassifyResult = {
    detected_type: "retail",
    confidence: 0,
    reason: "Classification unavailable, defaulting to retail",
  };

  if (!documentText || typeof documentText !== "string") return fallback;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[classify] OPENAI_API_KEY not set; using fallback");
    return fallback;
  }

  const trimmedText = documentText.slice(0, 4000);

  try {
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
          {
            role: "user",
            content:
              `Classify this document using the content below.\n\nReturn JSON in this form only:\n{\n  "detected_type": "",\n  "confidence": 0.0,\n  "reason": ""\n}\n\nDocument text:\n${trimmedText}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[classify] OpenAI error:", response.status, errText.slice(0, 200));
      return fallback;
    }

    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content || "";
    const jsonStr = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    const detected = String(parsed?.detected_type || "").toLowerCase() as AnalysisType;
    if (!VALID_TYPES.includes(detected)) return fallback;

    return {
      detected_type: detected,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
      reason: String(parsed?.reason || ""),
    };
  } catch (err: any) {
    console.error("[classify] Error:", err?.message || err);
    return fallback;
  }
}
