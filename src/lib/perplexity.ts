/**
 * Perplexity API helper.
 *
 * One source of truth for hitting api.perplexity.ai. Used by:
 *   - /api/workspace/deal-coach (streaming chat)
 *   - /api/ai/deal-chat (non-streaming chat)
 *   - /api/workspace/location-intel/[propertyId] (multi-card brief)
 *
 * Env: PERPLEXITY_API_KEY (preferred). Falls back to perplexity_API
 * because the key was originally provisioned with that casing on Vercel.
 *
 * Models we use:
 *   sonar           - fast, cheap, web-grounded; good for quick lookups
 *   sonar-pro       - default for chat; better synthesis, returns citations
 *   sonar-reasoning - slower multi-step reasoner for the location brief
 */

export type PplxRole = "system" | "user" | "assistant";
export interface PplxMessage {
  role: PplxRole;
  content: string;
}

export interface PplxResponse {
  content: string;
  citations: string[];
  raw: any;
}

const ENDPOINT = "https://api.perplexity.ai/chat/completions";

export function getPerplexityKey(): string | null {
  return (
    process.env.PERPLEXITY_API_KEY ||
    (process.env as any).perplexity_API ||
    null
  );
}

export interface PplxOpts {
  model?: "sonar" | "sonar-pro" | "sonar-reasoning";
  temperature?: number;
  maxTokens?: number;
  searchRecencyFilter?: "day" | "week" | "month" | "year";
  returnCitations?: boolean;
}

/**
 * Non-streaming chat completion. Used by location-intel and the
 * legacy /api/ai/deal-chat where we want the whole response back
 * before responding to the client.
 */
export async function pplxChat(
  messages: PplxMessage[],
  opts: PplxOpts = {},
): Promise<PplxResponse> {
  const key = getPerplexityKey();
  if (!key) throw new Error("PERPLEXITY_API_KEY missing");

  const body: Record<string, any> = {
    model: opts.model || "sonar-pro",
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1500,
    return_citations: opts.returnCitations ?? true,
  };
  if (opts.searchRecencyFilter) body.search_recency_filter = opts.searchRecencyFilter;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Perplexity ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const citations: string[] = Array.isArray(data?.citations) ? data.citations : [];
  return { content, citations, raw: data };
}

/**
 * Streaming chat completion. Returns the upstream Response so the
 * caller can pipe it through to the browser as SSE.
 *
 * Perplexity stream chunks include `citations` on the final delta.
 * The route reads them and appends a synthetic
 *   data: {"event":"citations","items":[...]}
 * frame so the React client can render footnotes after the streaming
 * text settles.
 */
export async function pplxStream(
  messages: PplxMessage[],
  opts: PplxOpts = {},
): Promise<Response> {
  const key = getPerplexityKey();
  if (!key) throw new Error("PERPLEXITY_API_KEY missing");

  const body: Record<string, any> = {
    model: opts.model || "sonar-pro",
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1500,
    stream: true,
    return_citations: opts.returnCitations ?? true,
  };
  if (opts.searchRecencyFilter) body.search_recency_filter = opts.searchRecencyFilter;

  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
}
