/**
 * ScoreOM Deal Agent (server only).
 *
 * A prescreen agent the user activates on one deal. It works through four
 * tasks in order and saves progress after each one to
 * workspace_agent_runs/{propertyId}, so the deal page can show it working:
 *
 *   1. numbers   Check the numbers. Deterministic math on the extracted
 *                fields (no LLM), so nothing is invented.
 *   2. market    Tenant + location check. One Perplexity web search with
 *                sources, grounded in the rent roll and cached Census data.
 *   3. questions Broker questions + a document request the user sends.
 *   4. memo      Prescreen memo: is it worth a real underwrite, and what
 *                would move the score.
 *
 * Scope is prescreening only. The agent never contacts anyone, never drafts
 * offers or LOIs, and never tells the user to buy.
 */
import { getAdminDb } from "@/lib/firebase-admin";
import { pplxChat } from "@/lib/perplexity";
import { loadOmText } from "@/lib/workspace/load-om-text";

export const AGENT_RUNS = "workspace_agent_runs";
export const AGENT_DAILY_LIMIT = Number(process.env.DEAL_AGENT_DAILY_LIMIT || 25);

export type StepId = "numbers" | "market" | "questions" | "memo";
export type StepStatus = "pending" | "running" | "done" | "failed";

export const STEP_ORDER: { id: StepId; label: string }[] = [
  { id: "numbers", label: "Check the numbers" },
  { id: "market", label: "Tenant + location check" },
  { id: "questions", label: "Broker questions" },
  { id: "memo", label: "Prescreen memo" },
];

export interface AgentStep { status: StepStatus; startedAt?: string | null; finishedAt?: string | null; error?: string | null; result?: any }
export interface AgentRun {
  propertyId: string;
  userId: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  steps: Record<StepId, AgentStep>;
}

export function newRun(propertyId: string, userId: string): AgentRun {
  const steps = Object.fromEntries(STEP_ORDER.map(s => [s.id, { status: "pending" }])) as Record<StepId, AgentStep>;
  return { propertyId, userId, status: "running", startedAt: new Date().toISOString(), finishedAt: null, steps };
}

// ─────────────────────────── Context ───────────────────────────

interface Tenant { idx: number; name: string; sf: number | null; rent: number | null; leaseEnd: string | null; status?: string }
interface DealCtx {
  property: any;
  fields: Record<string, any>;
  tenants: Tenant[];
  research: any | null;
  brief: string;
  omText: string;
  docCategories: string[];
}

const num = (v: any): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  const m = s.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/[mM]$/.test(s)) n *= 1e6; else if (/[kK]$/.test(s)) n *= 1e3;
  return isFinite(n) ? n : null;
};

function pick(f: Record<string, any>, keys: string[]): number | null {
  for (const k of keys) { const n = num(f[k]); if (n != null && n !== 0) return n; }
  return null;
}

export async function loadDealContext(propertyId: string): Promise<DealCtx> {
  const db = getAdminDb();
  const [propSnap, fieldsSnap, researchSnap, notesSnap, docsSnap] = await Promise.all([
    db.collection("workspace_properties").doc(propertyId).get(),
    db.collection("workspace_extracted_fields").where("propertyId", "==", propertyId).get(),
    db.collection("workspace_research").doc(propertyId).get(),
    db.collection("workspace_notes").where("propertyId", "==", propertyId).get(),
    db.collection("workspace_documents").where("propertyId", "==", propertyId).get(),
  ]);
  const fields: Record<string, any> = {};
  fieldsSnap.docs.forEach(d => {
    const x = d.data() as any;
    fields[`${x.fieldGroup}.${x.fieldName}`] = x.isUserOverridden ? x.userOverrideValue : (x.normalizedValue ?? x.rawValue);
  });
  const byIdx: Record<string, Record<string, any>> = {};
  for (const [k, v] of Object.entries(fields)) {
    const m = k.match(/^rent_roll\.tenant_(\d+)_(.+)$/);
    if (m) (byIdx[m[1]] ||= {})[m[2]] = v;
  }
  const tenants: Tenant[] = Object.entries(byIdx).map(([i, t]) => ({
    idx: Number(i),
    name: String(t.name || t.tenant || "").trim(),
    sf: num(t.sf ?? t.square_feet),
    rent: num(t.rent ?? t.annual_rent ?? t.base_rent),
    leaseEnd: t.lease_end ? String(t.lease_end) : null,
    status: t.status ? String(t.status) : undefined,
  })).filter(t => t.name || t.sf).sort((a, b) => a.idx - b.idx);

  let brief = "";
  const notes = notesSnap.docs.map(d => d.data() as any);
  const b = notes.find(n => n.noteType === "investment_thesis") || notes.find(n => n.isPinned);
  if (b?.content) brief = String(b.content).slice(0, 3500);

  let omText = "";
  try { omText = (await loadOmText(propertyId)) || ""; } catch { /* optional */ }

  const docCategories = docsSnap.docs.map(d => d.data() as any).filter(d => !d.isDeleted && !d.isArchived).map(d => String(d.docCategory || "other"));

  return {
    property: propSnap.exists ? propSnap.data() : {},
    fields, tenants,
    research: researchSnap.exists ? researchSnap.data() : null,
    brief, omText: omText.slice(0, 12000), docCategories,
  };
}

// ─────────────────────────── 1. Numbers ───────────────────────────

type CheckStatus = "ok" | "warn" | "fail" | "info";
interface Check { id: string; label: string; status: CheckStatus; detail: string }

const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3).toLocaleString()}K` : `$${Math.round(n)}`;
const pct = (n: number) => `${n.toFixed(2)}%`;

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  if (/^(mtm|month[- ]to[- ]month)$/i.test(t)) return new Date();
  const y = t.match(/^(19|20)\d{2}$/);
  if (y) return new Date(Number(t), 11, 31);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

export function checkNumbers(ctx: DealCtx) {
  const f = ctx.fields;
  const p = ctx.property || {};
  const price = pick(f, ["pricing_deal_terms.asking_price", "pricing_deal_terms.purchase_price", "pricing_deal_terms.list_price"]) ?? num(p.cardAskingPrice);
  const noi = pick(f, ["expenses.noi_om", "expenses.noi", "expenses.net_operating_income"]) ?? num(p.cardNoi);
  const noiAdj = pick(f, ["expenses.noi_adjusted"]);
  let capStated = pick(f, ["pricing_deal_terms.cap_rate_om", "pricing_deal_terms.cap_rate_asking", "pricing_deal_terms.cap_rate_actual", "pricing_deal_terms.entry_cap_rate"]) ?? num(p.cardCapRate);
  if (capStated != null && capStated < 1) capStated *= 100;
  const sf = pick(f, ["property_basics.building_sf", "property_basics.gla"]) ?? num(p.cardBuildingSf);
  const psfStated = pick(f, ["pricing_deal_terms.price_per_sf", "pricing_deal_terms.price_psf"]);
  let occStated = pick(f, ["property_basics.occupancy_pct", "property_basics.occupancy"]) ?? num(p.occupancyPct);
  if (occStated != null && occStated <= 1) occStated *= 100;
  const incomeStated = pick(f, ["income.base_rent", "income.total_rent", "rent_roll.total_rent", "income.gross_scheduled_income"]);

  const checks: Check[] = [];
  const missing: string[] = [];
  if (!price) missing.push("asking price");
  if (!noi) missing.push("NOI");
  if (!sf) missing.push("building SF");
  if (!ctx.tenants.length) missing.push("rent roll");
  if (!ctx.docCategories.some(c => /t12|t-12|operating|financial/i.test(c))) missing.push("T-12 operating statement");

  // Cap rate math
  if (price && noi) {
    const implied = (noi / price) * 100;
    if (capStated) {
      const diff = implied - capStated;
      checks.push({ id: "cap", label: "Cap rate math", status: Math.abs(diff) <= 0.25 ? "ok" : Math.abs(diff) <= 0.75 ? "warn" : "fail",
        detail: `Stated ${pct(capStated)}; NOI ${money(noi)} / price ${money(price)} = ${pct(implied)}${Math.abs(diff) > 0.25 ? ` (${diff > 0 ? "+" : ""}${diff.toFixed(2)} pts)` : ""}.` });
    } else {
      checks.push({ id: "cap", label: "Cap rate math", status: "info", detail: `No cap rate stated; NOI / price implies ${pct(implied)}.` });
    }
  }
  // Price per SF
  if (price && sf) {
    const psf = price / sf;
    if (psfStated) {
      const d = Math.abs(psf - psfStated) / psfStated;
      checks.push({ id: "psf", label: "Price per SF", status: d <= 0.05 ? "ok" : "warn",
        detail: `Stated $${Math.round(psfStated)}/SF; price / SF = $${Math.round(psf)}/SF.` });
    } else {
      checks.push({ id: "psf", label: "Price per SF", status: "info", detail: `$${Math.round(psf)}/SF on ${Math.round(sf).toLocaleString()} SF.` });
    }
  }
  // Rent roll vs stated income
  const rrRent = ctx.tenants.reduce((a, t) => a + (t.rent || 0), 0);
  if (rrRent > 0 && incomeStated) {
    const d = (rrRent - incomeStated) / incomeStated;
    checks.push({ id: "income", label: "Rent roll vs. stated income", status: Math.abs(d) <= 0.05 ? "ok" : Math.abs(d) <= 0.12 ? "warn" : "fail",
      detail: `Rent roll totals ${money(rrRent)}; OM income ${money(incomeStated)} (${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%).` });
  }
  // Rent roll SF vs building SF, occupancy
  const rrSf = ctx.tenants.reduce((a, t) => a + (t.sf || 0), 0);
  const vacantSf = ctx.tenants.filter(t => /vacant/i.test(t.name) || /vacant/i.test(t.status || "")).reduce((a, t) => a + (t.sf || 0), 0);
  if (rrSf > 0 && sf) {
    const d = (rrSf - sf) / sf;
    checks.push({ id: "sf", label: "Rent roll SF vs. building SF", status: Math.abs(d) <= 0.05 ? "ok" : "warn",
      detail: `Rent roll covers ${Math.round(rrSf).toLocaleString()} SF of ${Math.round(sf).toLocaleString()} SF (${(d * 100).toFixed(1)}%).` });
    const leased = Math.min(1, (rrSf - vacantSf) / sf) * 100;
    if (occStated) {
      const od = leased - occStated;
      checks.push({ id: "occ", label: "Occupancy", status: Math.abs(od) <= 3 ? "ok" : "warn",
        detail: `Stated ${occStated.toFixed(0)}%; rent roll shows about ${leased.toFixed(0)}% leased.` });
    }
  }
  // Near-term rollover (24 months)
  const now = Date.now(), horizon = now + 730 * 86400000;
  const rolling = ctx.tenants.filter(t => { const d = parseDate(t.leaseEnd); return d && d.getTime() <= horizon && !/vacant/i.test(t.name); });
  if (ctx.tenants.length) {
    const rollSf = rolling.reduce((a, t) => a + (t.sf || 0), 0);
    const share = rrSf ? rollSf / rrSf : 0;
    checks.push({ id: "rollover", label: "Leases ending within 24 months", status: rolling.length === 0 ? "ok" : share >= 0.3 ? "fail" : "warn",
      detail: rolling.length ? `${rolling.length} lease${rolling.length > 1 ? "s" : ""} (${(share * 100).toFixed(0)}% of SF): ${rolling.slice(0, 4).map(t => `${t.name || "Tenant " + t.idx} (${t.leaseEnd})`).join(", ")}${rolling.length > 4 ? "…" : ""}.` : "No leases roll in the next 24 months." });
  }
  // Tenant concentration
  if (rrRent > 0) {
    const top = [...ctx.tenants].sort((a, b) => (b.rent || 0) - (a.rent || 0))[0];
    const share = (top.rent || 0) / rrRent;
    checks.push({ id: "concentration", label: "Largest tenant share of rent", status: share <= 0.25 ? "ok" : share <= 0.45 ? "warn" : "fail",
      detail: `${top.name || "Top tenant"} pays ${(share * 100).toFixed(0)}% of rent.` });
  }
  // OM NOI vs rebuilt NOI
  if (noi && noiAdj) {
    const d = (noiAdj - noi) / noi;
    checks.push({ id: "noi", label: "OM NOI vs. rebuilt NOI", status: d >= -0.05 ? "ok" : d >= -0.15 ? "warn" : "fail",
      detail: `OM ${money(noi)}; rebuilt with vacancy, expenses and reserves ${money(noiAdj)} (${(d * 100).toFixed(1)}%).` });
  }
  if (missing.length) checks.push({ id: "missing", label: "Missing inputs", status: missing.length >= 3 ? "fail" : "warn", detail: `Not found: ${missing.join(", ")}.` });

  const counts = { ok: checks.filter(c => c.status === "ok").length, warn: checks.filter(c => c.status === "warn").length, fail: checks.filter(c => c.status === "fail").length };
  return { checks, counts, missing, key: { price, noi, noiAdj, capStated, sf, occStated, rrRent: rrRent || null } };
}

// ─────────────────────────── LLM helpers ───────────────────────────

const STYLE = "Write plain, direct English for an experienced commercial real estate investor. Never use em dashes; use commas, periods or hyphens. Never recommend buying, never draft offers or LOIs. This is a prescreen, a first pass before real underwriting.";

function parseJson(text: string): any {
  const t = text.replace(/```json|```/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Model did not return JSON");
  return JSON.parse(t.slice(a, b + 1));
}

const noDash = (v: any): any => typeof v === "string" ? v.replace(/\s*—\s*/g, ", ").replace(/–/g, "-")
  : Array.isArray(v) ? v.map(noDash) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, noDash(x)])) : v;

async function openaiJson(system: string, user: string, maxTokens = 1800): Promise<any> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.DEAL_AGENT_MODEL || "gpt-4o",
      temperature: 0.2, max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `OpenAI ${r.status}`);
  return noDash(parseJson(j.choices?.[0]?.message?.content || "{}"));
}

function dealHeader(ctx: DealCtx): string {
  const p = ctx.property || {};
  const addr = [p.address1, p.city, p.state, p.zip].filter(Boolean).join(", ");
  return `Property: ${p.propertyName || "(unnamed)"}\nAddress: ${addr || "unknown"}\nAsset type: ${p.analysisType || "retail"}\nDeal score: ${p.scoreTotal ?? "n/a"}/100`;
}

// ─────────────────────────── 2. Market ───────────────────────────

export async function checkMarket(ctx: DealCtx) {
  const tenants = [...ctx.tenants].filter(t => t.name && !/vacant/i.test(t.name))
    .sort((a, b) => (b.rent || b.sf || 0) - (a.rent || a.sf || 0)).slice(0, 6).map(t => t.name);
  const anchor = ctx.fields["rent_roll.anchor_tenant"];
  if (anchor && !tenants.includes(String(anchor))) tenants.unshift(String(anchor));
  const demo = ctx.research?.demographics;
  const demoLine = demo ? `Census (tract/area): population ${demo.population ?? "?"}, median household income ${demo.medianIncome ?? "?"}, median age ${demo.medianAge ?? "?"}, unemployed ${demo.unemployed ?? "?"} of labor force ${demo.laborForce ?? "?"}.` : "";
  const nearby = (ctx.research?.nearby || []).slice(0, 15).map((n: any) => n.name).join(", ");

  const prompt = `${dealHeader(ctx)}
Tenants on the rent roll (largest first): ${tenants.length ? tenants.join("; ") : "not available"}
${demoLine}
${nearby ? `Nearby places: ${nearby}` : ""}

Research this deal for a prescreen. Use current web sources.
1. For each named tenant (max 6): who they are, credit or financial strength, and any recent store closures, bankruptcies, downsizing or expansion news. Rate risk low, medium or high.
2. For the location: the submarket's trajectory, notable nearby development or closures, and traffic or demand drivers.

Return ONLY JSON:
{"tenants":[{"name":"","summary":"one or two sentences","risk":"low|medium|high"}],
 "location":{"summary":"two or three sentences","positives":["..."],"concerns":["..."]}}
If you cannot find information on a tenant, say so briefly and rate it medium. Do not tell the user to consult other providers.`;
  const r = await pplxChat([
    { role: "system", content: `You are a CRE research analyst. ${STYLE}` },
    { role: "user", content: prompt },
  ], { model: "sonar-pro", temperature: 0.15, maxTokens: 1400, returnCitations: true });
  const data = noDash(parseJson(r.content));
  const scrub = (s: string) => !/consult|costar|i (don't|do not) have|as an ai/i.test(s);
  return {
    tenants: (data.tenants || []).slice(0, 6),
    location: {
      summary: data.location?.summary || "",
      positives: (data.location?.positives || []).filter(scrub).slice(0, 5),
      concerns: (data.location?.concerns || []).filter(scrub).slice(0, 5),
    },
    demographics: demo || null,
    citations: (r.citations || []).slice(0, 8),
  };
}

// ─────────────────────────── 3. Questions ───────────────────────────

export async function draftQuestions(ctx: DealCtx, numbers: any, market: any) {
  const issues = (numbers?.checks || []).filter((c: Check) => c.status !== "ok").map((c: Check) => `- ${c.label}: ${c.detail}`).join("\n");
  const concerns = [...(market?.location?.concerns || []), ...((market?.tenants || []).filter((t: any) => t.risk !== "low").map((t: any) => `${t.name}: ${t.summary}`))].join("\n- ");
  const user = `${dealHeader(ctx)}

Issues found checking the numbers:
${issues || "- none"}

Tenant and location concerns:
- ${concerns || "none"}

OM summary (may be partial):
${ctx.brief || ctx.omText.slice(0, 4000) || "(not available)"}

Write the questions an experienced buyer would ask the listing broker at the prescreen stage, most important first, tied to the specific issues above (not generic). Then write a short, polite document request email to the broker asking for what is missing (for example the rent roll, T-12, leases or estoppels, CAM reconciliations, as relevant).

Return JSON: {"questions":[{"q":"the question","why":"why it matters, one short sentence"}],"email":{"subject":"","body":"plain text, no signature block beyond a first name placeholder [Your name]"}}
Max 8 questions.`;
  const out = await openaiJson(`You are a senior CRE acquisitions analyst. ${STYLE}`, user, 1400);
  return { questions: (out.questions || []).slice(0, 8), email: out.email || null };
}

// ─────────────────────────── 4. Memo ───────────────────────────

export async function writeMemo(ctx: DealCtx, numbers: any, market: any) {
  const p = ctx.property || {};
  const user = `${dealHeader(ctx)}
Score band: ${p.scoreBand || "n/a"}. ScoreOM bands: 70+ strong fit, 55-69 worth review, under 55 below criteria.

Number checks:
${(numbers?.checks || []).map((c: Check) => `- [${c.status}] ${c.label}: ${c.detail}`).join("\n") || "- none"}

Tenant check:
${(market?.tenants || []).map((t: any) => `- ${t.name} (${t.risk}): ${t.summary}`).join("\n") || "- not available"}
Location: ${market?.location?.summary || "not available"}
Positives: ${(market?.location?.positives || []).join("; ")}
Concerns: ${(market?.location?.concerns || []).join("; ")}

First-pass brief:
${ctx.brief || "(not available)"}

Write a prescreen memo that answers: does this deal deserve a real underwrite?
Return JSON:
{"verdict":"underwrite|needs_info|below_criteria",
 "headline":"one sentence, max 18 words",
 "summary":"3 to 4 sentences",
 "strengths":["max 4"],
 "concerns":["max 4"],
 "wouldChange":["max 4 specific things that would raise or lower the score, e.g. 'A T-12 showing expenses under $X/SF'"],
 "keyNumbers":[{"label":"","value":""}]}
verdict meanings: underwrite = worth a real underwrite now; needs_info = can't tell without missing documents or answers; below_criteria = falls short at this price. Base it on the evidence above, and say what is unknown.`;
  const out = await openaiJson(`You are a senior CRE acquisitions analyst writing a prescreen memo. ${STYLE}`, user, 1500);
  const v = ["underwrite", "needs_info", "below_criteria"].includes(out.verdict) ? out.verdict : "needs_info";
  return {
    verdict: v,
    verdictLabel: v === "underwrite" ? "Worth a real underwrite" : v === "needs_info" ? "Needs more information" : "Below criteria at this price",
    headline: out.headline || "",
    summary: out.summary || "",
    strengths: (out.strengths || []).slice(0, 4),
    concerns: (out.concerns || []).slice(0, 4),
    wouldChange: (out.wouldChange || []).slice(0, 4),
    keyNumbers: (out.keyNumbers || []).slice(0, 6),
  };
}

// ─────────────────────────── Orchestrator ───────────────────────────

export async function runDealAgent(propertyId: string) {
  const db = getAdminDb();
  const ref = db.collection(AGENT_RUNS).doc(propertyId);
  const propRef = db.collection("workspace_properties").doc(propertyId);
  const now = () => new Date().toISOString();
  const setStep = (id: StepId, patch: Partial<AgentStep>) =>
    ref.set({ steps: { [id]: patch }, updatedAt: now() }, { merge: true });

  let ctx: DealCtx;
  try {
    ctx = await loadDealContext(propertyId);
  } catch (e: any) {
    await ref.set({ status: "failed", finishedAt: now(), error: e?.message || "Could not load deal" }, { merge: true });
    await propRef.set({ agentStatus: "failed" }, { merge: true });
    return;
  }

  const results: Partial<Record<StepId, any>> = {};
  const run = async (id: StepId, fn: () => Promise<any> | any) => {
    await setStep(id, { status: "running", startedAt: now() });
    try {
      const result = await fn();
      results[id] = result;
      await setStep(id, { status: "done", finishedAt: now(), result, error: null });
    } catch (e: any) {
      await setStep(id, { status: "failed", finishedAt: now(), error: String(e?.message || e).slice(0, 300) });
    }
  };

  await run("numbers", () => checkNumbers(ctx));
  await run("market", () => checkMarket(ctx));
  await run("questions", () => draftQuestions(ctx, results.numbers, results.market));
  await run("memo", () => writeMemo(ctx, results.numbers, results.market));

  const anyDone = Object.keys(results).length > 0;
  const finishedAt = now();
  await ref.set({ status: anyDone ? "done" : "failed", finishedAt }, { merge: true });
  await propRef.set({
    agentStatus: anyDone ? "done" : "failed",
    agentFinishedAt: finishedAt,
    agentVerdict: results.memo?.verdict || null,
  }, { merge: true });
}

/** Compact text of the latest agent findings, for the "Ask the agent" chat prompt. */
export async function agentFindingsForPrompt(propertyId: string): Promise<string> {
  try {
    const snap = await getAdminDb().collection(AGENT_RUNS).doc(propertyId).get();
    if (!snap.exists) return "";
    const r = snap.data() as AgentRun;
    const lines: string[] = [`DEAL AGENT FINDINGS (run ${r.finishedAt || r.startedAt}):`];
    const n = r.steps?.numbers?.result;
    if (n?.checks) lines.push("Number checks:", ...n.checks.map((c: any) => `- [${c.status}] ${c.label}: ${c.detail}`));
    const m = r.steps?.market?.result;
    if (m?.tenants?.length) lines.push("Tenant check:", ...m.tenants.map((t: any) => `- ${t.name} (${t.risk} risk): ${t.summary}`));
    if (m?.location?.summary) lines.push(`Location: ${m.location.summary}`);
    const memo = r.steps?.memo?.result;
    if (memo?.headline) lines.push(`Prescreen memo: ${memo.verdictLabel}. ${memo.headline} ${memo.summary}`);
    const q = r.steps?.questions?.result;
    if (q?.questions?.length) lines.push("Broker questions drafted:", ...q.questions.map((x: any) => `- ${x.q}`));
    return lines.join("\n").slice(0, 6000);
  } catch {
    return "";
  }
}
