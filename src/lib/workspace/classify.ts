/**
 * Shared analysis-type classifier.
 *
 * Extracted from /api/workspace/classify so both the web upload route
 * and the Chrome-extension upload route can call it as a direct function
 * import. Never self-fetch - per ARCHITECTURE LOCK in CLAUDE.md, Vercel
 * serverless cannot reliably call its own routes over HTTP.
 */

export type AnalysisType = "retail" | "industrial" | "office" | "land" | "multifamily";

/**
 * Whether the uploaded document is a direct-ownership offering we can
 * actually underwrite (standard OM, flyer, broker package) versus an
 * LP/GP syndication or fund deck that needs its own analysis model.
 * We do not currently support syndication underwriting, but we still
 * want to ingest the file, flag it, and show the user a friendly note
 * instead of silently running the CRE model on incompatible content.
 */
export type DealStructure = "direct_asset" | "syndication" | "unknown";

export interface ClassifyResult {
  detected_type: AnalysisType;
  confidence: number;
  reason: string;
  /** Heuristic flag; present on all results. */
  deal_structure: DealStructure;
  /** When deal_structure is "syndication", short hint on what matched. */
  deal_structure_reason?: string;
}

/**
 * Fast regex-based syndication-deck detector. Zero latency, zero cost.
 * Looks for the cluster of LP/GP / private-placement terminology that
 * is nearly always present in a syndication offering and nearly never
 * present in a direct-deal broker OM. Returns a short matched-terms
 * string so the UI can explain why it was flagged.
 */
export function detectDealStructure(text: string): { structure: DealStructure; reason: string } {
  if (!text || typeof text !== "string") return { structure: "unknown", reason: "" };
  const sample = text.slice(0, 20000).toLowerCase();

  // Individually weak signals. We require >= 2 distinct matches to
  // flag as syndication, which keeps false positives low on standard
  // OMs that happen to mention one of these terms in passing.
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\blimited partner(ship)?s?\b/, label: "limited partners" },
    { re: /\bgeneral partner(ship)?s?\b/, label: "general partners" },
    { re: /\bprivate placement( memorandum)?\b|\bppm\b/, label: "private placement / PPM" },
    { re: /\bsubscription agreement\b/, label: "subscription agreement" },
    { re: /\baccredited investors?\b/, label: "accredited investors" },
    { re: /\bpreferred return\b|\bpref\b/, label: "preferred return" },
    { re: /\bwaterfall\b.*\b(promote|carry|catch-?up)\b|\b(promote|carry)\b.*\bwaterfall\b/, label: "waterfall / promote" },
    { re: /\b(gp )?promote\b/, label: "GP promote" },
    { re: /\bcapital call(s)?\b/, label: "capital calls" },
    { re: /\bhurdle rate\b/, label: "hurdle rate" },
    { re: /\breg(ulation)? d\b|\brule 506\s*\(?[bc]\)?/, label: "Regulation D / 506" },
    { re: /\bsponsor\b.*\binvestor\b|\binvestor\b.*\bsponsor\b/, label: "sponsor / investor" },
    { re: /\bco-?invest(ment)?\b/, label: "co-investment" },
    { re: /\bminimum investment\b/, label: "minimum investment" },
    { re: /\btargeted? (net )?(irr|return)\b.*\b(to (investors?|lp))/, label: "target IRR to LPs" },
    { re: /\bfund\s+(?:i|ii|iii|iv|v|[0-9]+)\b/, label: "fund series" },
  ];

  const matched: string[] = [];
  for (const p of patterns) {
    if (p.re.test(sample) && !matched.includes(p.label)) matched.push(p.label);
    if (matched.length >= 4) break; // plenty to report
  }

  if (matched.length >= 2) {
    return { structure: "syndication", reason: matched.slice(0, 3).join(", ") };
  }
  return { structure: "direct_asset", reason: "" };
}

const CLASSIFY_PROMPT = `You classify commercial real estate offering materials into one analysis type.

Return only valid JSON.

Choose exactly one:
retail, industrial, office, land, multifamily

Rules:
- retail = retail assets broadly, including single-tenant net lease, absolute NNN, ground lease retail, sale-leaseback with one main retail tenant, multi-tenant retail strip center, neighborhood center, or small-shop retail
- industrial = warehouse, flex industrial, distribution, manufacturing, industrial outdoor storage if tied to building utility
- office = professional office, medical office, clinic, suburban office, office condo portfolio
- land = raw land, development land, redevelopment land, outparcel, pad site, parcel marketed primarily as land
- multifamily = apartment buildings, apartment complexes, garden-style apartments, mid-rise/high-rise residential, student housing, senior housing/assisted living, affordable housing, workforce housing, mixed-use with primarily residential units, townhome portfolios, duplex/triplex/fourplex portfolios`;

const VALID_TYPES: AnalysisType[] = ["retail", "industrial", "office", "land", "multifamily"];

/**
 * Classify a document's analysis type using GPT-4o. Returns a safe
 * default ("retail" with confidence 0) on any failure so callers never
 * have to branch on errors - the pipeline keeps flowing.
 */
export async function classifyDocument(documentText: string): Promise<ClassifyResult> {
  // Run the syndication heuristic first so every return path carries the
  // flag, including fallbacks. Cheap regex pass, no network.
  const ds = detectDealStructure(documentText || "");

  const fallback: ClassifyResult = {
    detected_type: "retail",
    confidence: 0,
    reason: "Classification unavailable, defaulting to retail",
    deal_structure: ds.structure,
    deal_structure_reason: ds.reason || undefined,
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
      deal_structure: ds.structure,
      deal_structure_reason: ds.reason || undefined,
    };
  } catch (err: any) {
    console.error("[classify] Error:", err?.message || err);
    return fallback;
  }
}
