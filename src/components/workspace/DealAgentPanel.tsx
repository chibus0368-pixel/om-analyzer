"use client";

/**
 * Deal Agent panel (deal page). The user activates the agent; it works in the
 * background through four prescreen tasks and this panel shows it checking
 * them off, then the results: memo, number checks, tenant + location, and
 * broker questions. Polls /api/workspace/agent/[propertyId] while running.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type StepId = "numbers" | "market" | "questions" | "memo";
const STEPS: { id: StepId; label: string; desc: string }[] = [
  { id: "numbers", label: "Check the numbers", desc: "Cap math, rent roll vs. OM, occupancy, rollover" },
  { id: "market", label: "Tenant + location check", desc: "Tenant credit and news, submarket context" },
  { id: "questions", label: "Broker questions", desc: "What to ask and what documents to request" },
  { id: "memo", label: "Prescreen memo", desc: "Does it deserve a real underwrite?" },
];

const LIME = "#84CC16", NAVY = "#0F172A", SUB = "#64748B", LINE = "#E5E7EB";

function Spinner({ size = 14, color = "#4D7C0F" }: { size?: number; color?: string }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${color}33`, borderTopColor: color, display: "inline-block", animation: "daSpin .8s linear infinite", flexShrink: 0 }} />;
}

function StepIcon({ status }: { status: string }) {
  if (status === "running") return <Spinner size={18} />;
  if (status === "done") return (
    <span style={{ width: 20, height: 20, borderRadius: "50%", background: LIME, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
    </span>
  );
  if (status === "failed") return <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#FEE2E2", color: "#B91C1C", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>!</span>;
  return <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${LINE}`, flexShrink: 0 }} />;
}

const CHECK_STYLE: Record<string, [string, string, string]> = {
  ok: ["#15803D", "#DCFCE7", "OK"], warn: ["#B45309", "#FEF3C7", "Check"], fail: ["#B91C1C", "#FEE2E2", "Flag"], info: ["#1D4ED8", "#DBEAFE", "Info"],
};
const RISK_STYLE: Record<string, [string, string]> = { low: ["#15803D", "#DCFCE7"], medium: ["#B45309", "#FEF3C7"], high: ["#B91C1C", "#FEE2E2"] };
const VERDICT_STYLE: Record<string, [string, string]> = { underwrite: ["#3F6212", "#ECFCCB"], needs_info: ["#92400E", "#FEF3C7"], below_criteria: ["#991B1B", "#FEE2E2"] };

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: "18px 0 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: SUB }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }); }}
      style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: `1px solid ${LINE}`, background: "#fff", color: done ? "#15803D" : NAVY, cursor: "pointer", fontFamily: "inherit" }}>
      {done ? "Copied" : label}
    </button>
  );
}

const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
};

export default function DealAgentPanel({ propertyId, getToken, onAsk, activateSignal }: {
  propertyId: string;
  getToken: () => Promise<string>;
  onAsk?: () => void;
  /** Increment to activate from elsewhere (e.g. the hero button). */
  activateSignal?: number;
}) {
  const [run, setRun] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const timer = useRef<any>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchRun = useCallback(async () => {
    try {
      const token = await getToken();
      const r = await fetch(`/api/workspace/agent/${propertyId}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (r.ok) setRun(j.run);
    } catch { /* keep last state */ } finally { setLoaded(true); }
  }, [propertyId, getToken]);

  useEffect(() => { fetchRun(); }, [fetchRun]);

  // Poll while the agent is working
  useEffect(() => {
    clearTimeout(timer.current);
    if (run?.status === "running") timer.current = setTimeout(fetchRun, 2500);
    return () => clearTimeout(timer.current);
  }, [run, fetchRun]);

  const activate = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const token = await getToken();
      const r = await fetch(`/api/workspace/agent/${propertyId}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the agent");
      setRun(j.run);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }, [propertyId, getToken]);

  const lastSignal = useRef(activateSignal || 0);
  useEffect(() => {
    if (activateSignal && activateSignal !== lastSignal.current) {
      lastSignal.current = activateSignal;
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (run?.status !== "running") activate();
    }
  }, [activateSignal, activate, run?.status]);

  const running = run?.status === "running";
  const steps = run?.steps || {};
  const doneCount = STEPS.filter(s => steps[s.id]?.status === "done" || steps[s.id]?.status === "failed").length;
  const memo = steps.memo?.result;
  const numbers = steps.numbers?.result;
  const market = steps.market?.result;
  const questions = steps.questions?.result;

  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 14, padding: "20px 22px", marginBottom: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.05)", scrollMarginTop: 90 };

  return (
    <div ref={rootRef} id="deal-agent" style={card}>
      <style>{`@keyframes daSpin { to { transform: rotate(360deg) } } @keyframes daPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(132,204,22,.45) } 50% { box-shadow: 0 0 0 8px rgba(132,204,22,0) } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: running ? "daPulse 1.6s ease-in-out infinite" : undefined }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4" /><circle cx="12" cy="3" r="1" /><circle cx="9" cy="13" r="1.2" fill={LIME} /><circle cx="15" cy="13" r="1.2" fill={LIME} /><path d="M2 12v3M22 12v3" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
            Deal Agent
            {running && <span style={{ fontSize: 11, fontWeight: 700, color: "#3F6212", background: "#ECFCCB", padding: "3px 9px", borderRadius: 99 }}>Working {doneCount}/4</span>}
            {run?.status === "done" && <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D", background: "#DCFCE7", padding: "3px 9px", borderRadius: 99 }}>Done {ago(run.finishedAt)}</span>}
          </div>
          <div style={{ fontSize: 13, color: SUB, marginTop: 2 }}>
            {running ? "Working through the prescreen. You can leave this page; it keeps going." : run ? "Your agent's prescreen of this deal." : "Activate an agent to prescreen this deal for you. It works in the background, about 1 to 2 minutes."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onAsk && run && (
            <button type="button" onClick={onAsk} style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${LINE}`, background: "#fff", color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Ask the agent
            </button>
          )}
          {!running && (
            <button type="button" onClick={activate} disabled={busy || !loaded}
              style={{ padding: "9px 16px", borderRadius: 8, border: 0, background: run ? NAVY : LIME, color: run ? "#fff" : NAVY, fontSize: 12.5, fontWeight: 800, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {busy ? <Spinner size={13} color={run ? "#fff" : NAVY} /> : null}
              {run ? "Run again" : "Activate agent"}
            </button>
          )}
        </div>
      </div>
      {err && <div style={{ marginTop: 12, fontSize: 13, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

      {/* Task list */}
      {(run || !loaded) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 18, marginBottom: run?.status === "done" ? 6 : 0 }}>
          {STEPS.map(s => {
            const st = steps[s.id]?.status || "pending";
            return (
              <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 12px", borderRadius: 10, border: `1px solid ${st === "running" ? "#BEF264" : LINE}`, background: st === "running" ? "#F7FEE7" : "#FAFBFC", opacity: st === "pending" ? 0.6 : 1 }}>
                <StepIcon status={st} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{s.label}</div>
                  <div style={{ fontSize: 11.5, color: SUB, marginTop: 2, lineHeight: 1.4 }}>{st === "failed" ? (steps[s.id]?.error || "Couldn't finish this step") : s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Idle state: what it will do */}
      {loaded && !run && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 18 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ padding: "12px 12px", borderRadius: 10, border: `1px dashed ${LINE}`, background: "#FAFBFC" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#4D7C0F" }}>TASK {i + 1}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginTop: 2 }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: SUB, marginTop: 2, lineHeight: 1.4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      )}

      {/* Memo */}
      {memo && (
        <Section title="Prescreen memo">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 11px", borderRadius: 99, color: (VERDICT_STYLE[memo.verdict] || VERDICT_STYLE.needs_info)[0], background: (VERDICT_STYLE[memo.verdict] || VERDICT_STYLE.needs_info)[1] }}>{memo.verdictLabel}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{memo.headline}</span>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#334155", margin: "0 0 12px" }}>{memo.summary}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[["Strengths", memo.strengths, "#15803D"], ["Concerns", memo.concerns, "#B91C1C"], ["What would change the read", memo.wouldChange, "#1D4ED8"]].map(([t, list, c]) => (list as string[])?.length ? (
              <div key={t as string}>
                <div style={{ fontSize: 12, fontWeight: 800, color: c as string, marginBottom: 6 }}>{t as string}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "#334155" }}>{(list as string[]).map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
              </div>
            ) : null)}
          </div>
        </Section>
      )}

      {/* Number checks */}
      {numbers?.checks?.length > 0 && (
        <Section title="Number checks" right={<span style={{ fontSize: 12, color: SUB }}>{numbers.counts.ok} OK · {numbers.counts.warn} to check · {numbers.counts.fail} flagged</span>}>
          <div style={{ display: "grid", gap: 6 }}>
            {(showAll ? numbers.checks : numbers.checks.filter((c: any) => c.status !== "ok").concat(numbers.checks.filter((c: any) => c.status === "ok")).slice(0, 6)).map((c: any) => {
              const [col, bg, lab] = CHECK_STYLE[c.status] || CHECK_STYLE.info;
              return (
                <div key={c.id} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13, padding: "8px 10px", borderRadius: 8, background: "#FAFBFC" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: col, background: bg, padding: "2px 8px", borderRadius: 99, flexShrink: 0, minWidth: 44, textAlign: "center" }}>{lab}</span>
                  <span style={{ fontWeight: 700, color: NAVY, flexShrink: 0 }}>{c.label}</span>
                  <span style={{ color: "#475569" }}>{c.detail}</span>
                </div>
              );
            })}
          </div>
          {numbers.checks.length > 6 && (
            <button type="button" onClick={() => setShowAll(v => !v)} style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#4D7C0F", background: "none", border: 0, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
              {showAll ? "Show fewer" : `Show all ${numbers.checks.length} checks`}
            </button>
          )}
        </Section>
      )}

      {/* Tenant + location */}
      {market && (
        <Section title="Tenant + location">
          {market.tenants?.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
              {market.tenants.map((t: any, i: number) => {
                const [c, bg] = RISK_STYLE[t.risk] || RISK_STYLE.medium;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: c, background: bg, padding: "2px 8px", borderRadius: 99, flexShrink: 0, textTransform: "capitalize", minWidth: 58, textAlign: "center" }}>{t.risk} risk</span>
                    <span style={{ fontWeight: 700, color: NAVY, flexShrink: 0 }}>{t.name}</span>
                    <span style={{ color: "#475569" }}>{t.summary}</span>
                  </div>
                );
              })}
            </div>
          )}
          {market.location?.summary && <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#334155", margin: "0 0 10px" }}>{market.location.summary}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {market.location?.positives?.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 800, color: "#15803D", marginBottom: 6 }}>Positives</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "#334155" }}>{market.location.positives.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
            {market.location?.concerns?.length > 0 && <div><div style={{ fontSize: 12, fontWeight: 800, color: "#B91C1C", marginBottom: 6 }}>Concerns</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, color: "#334155" }}>{market.location.concerns.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
          </div>
          {market.citations?.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: SUB, display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
              Sources: {market.citations.map((u: string, i: number) => {
                let host = u; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { /* raw */ }
                return <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: "#4D7C0F" }}>{host}</a>;
              })}
            </div>
          )}
        </Section>
      )}

      {/* Broker questions */}
      {questions?.questions?.length > 0 && (
        <Section title="Broker questions" right={<CopyBtn text={questions.questions.map((q: any, i: number) => `${i + 1}. ${q.q}`).join("\n")} label="Copy questions" />}>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.55, color: NAVY }}>
            {questions.questions.map((q: any, i: number) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>{q.q}</span>
                {q.why && <div style={{ fontSize: 12, color: SUB, marginTop: 1 }}>{q.why}</div>}
              </li>
            ))}
          </ol>
          {questions.email?.body && (
            <div style={{ marginTop: 12, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", background: "#FAFBFC" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: NAVY }}>Document request email <span style={{ fontWeight: 500, color: SUB }}>· you send it</span></div>
                <CopyBtn text={`Subject: ${questions.email.subject}\n\n${questions.email.body}`} label="Copy email" />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#334155", marginBottom: 4 }}>Subject: {questions.email.subject}</div>
              <div style={{ fontSize: 12.5, color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{questions.email.body}</div>
            </div>
          )}
        </Section>
      )}

      {run?.status === "done" && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: "#94A3B8" }}>
          The agent's prescreen is a first pass to help you decide where to spend time. Verify anything important before you rely on it.
        </div>
      )}
    </div>
  );
}
