"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Btn, C, Card, Empty, Field, inputStyle, Notice, Pill } from "./ui";
import { EmailFields, EmailPreview, TestSend, type EmailContentUI } from "./EmailEditor";

interface Step extends EmailContentUI { delayDays: number; onlyIf?: "always" | "no_deals" | "has_deals" | "free" }
interface D {
  id?: string; name: string; trigger: "signup" | "lead"; active: boolean; includeExisting?: boolean; steps: Step[];
  counts?: { enrolled: number; done: number }; startFrom?: string | null;
}

const COND: Record<string, string> = { always: "Always send", no_deals: "Only if no deals uploaded yet", has_deals: "Only if they've uploaded a deal", free: "Only if on the free plan" };
const newStep = (delayDays = 0): Step => ({ delayDays, onlyIf: "always", subject: "", preheader: "", body: "Hi {{firstName|there}},\n\n\n\nBrody", ctaLabel: "", ctaUrl: "" });

export default function Drips() {
  const [items, setItems] = useState<D[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<D | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api({ view: "drips" })).drips); setErr(""); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const seed = async () => { try { await api({ body: { action: "seedWelcome" } }); load(); } catch (e: any) { setErr(e.message); } };
  const toggle = async (d: D) => {
    if (!d.active && !window.confirm(`Turn on "${d.name}"? New ${d.trigger === "signup" ? "signups" : "leads"} from now on will start getting these emails.`)) return;
    try { await api({ body: { action: "saveDrip", drip: { ...d, active: !d.active } } }); load(); } catch (e: any) { setErr(e.message); }
  };

  if (edit) return <Editor initial={edit} onClose={() => { setEdit(null); load(); }} />;

  return (
    <Card title="Automated drips" right={<div style={{ display: "flex", gap: 8 }}>
      <Btn onClick={seed}>+ Starter welcome series</Btn>
      <Btn kind="primary" onClick={() => setEdit({ name: "", trigger: "signup", active: false, steps: [newStep(1)] })}>+ New drip</Btn>
    </div>}>
      <Notice tone="info">Drips run on the scheduler every 15 minutes. New signups already get the transactional welcome email at signup, so drips should start on day 1 or later. Turning a drip on only enrolls people who join after that moment.</Notice>
      {err && <Notice tone="error">{err}</Notice>}
      {loading ? <Empty>Loading...</Empty> : items.length === 0 ? <Empty>No drips yet. Start with the welcome series template.</Empty> : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: C.sub }}>
                  Trigger: {d.trigger === "signup" ? "new registered user" : "new lead"} · {d.steps.length} email{d.steps.length === 1 ? "" : "s"} over {Math.max(...d.steps.map(s => s.delayDays))} days · {d.counts?.enrolled || 0} enrolled, {d.counts?.done || 0} finished
                </div>
              </div>
              <Pill s={d.active ? "active" : "paused"} />
              <Btn onClick={() => toggle(d)}>{d.active ? "Pause" : "Turn on"}</Btn>
              <Btn onClick={() => setEdit(d)}>Edit</Btn>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Editor({ initial, onClose }: { initial: D; onClose: () => void }) {
  const [d, setD] = useState<D>(initial);
  const [open, setOpen] = useState(0);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const setStep = (i: number, s: Step) => setD({ ...d, steps: d.steps.map((x, j) => (j === i ? s : x)) });

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const steps = [...d.steps].sort((a, b) => a.delayDays - b.delayDays);
      const r = await api({ body: { action: "saveDrip", drip: { ...d, steps } } });
      setD({ ...d, id: r.id, steps }); setMsg({ tone: "ok", text: "Saved." });
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!d.id || !window.confirm("Delete this drip and its enrollment history?")) return;
    try { await api({ body: { action: "deleteDrip", id: d.id } }); onClose(); } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  };
  const step = d.steps[open];

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <Btn onClick={onClose}>&larr; All drips</Btn>
        <Pill s={d.active ? "active" : "paused"} />
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Field label="Name"><input style={inputStyle} value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="Starts when">
            <select style={inputStyle} value={d.trigger} onChange={e => setD({ ...d, trigger: e.target.value as any })}>
              <option value="signup">Someone registers</option>
              <option value="lead">A lead is captured</option>
            </select>
          </Field>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.sub, marginBottom: 14 }}>
          <input type="checkbox" checked={!!d.includeExisting} onChange={e => setD({ ...d, includeExisting: e.target.checked })} />
          Also enroll everyone who already matches (existing users or leads) when turned on
        </label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {d.steps.map((s, i) => (
            <button key={i} type="button" onClick={() => setOpen(i)} style={{
              padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${i === open ? C.lime : C.line}`, background: i === open ? "#F7FEE7" : "#fff", color: C.ink,
            }}>Day {s.delayDays}: {s.subject ? s.subject.slice(0, 26) : "(no subject)"}</button>
          ))}
          <Btn onClick={() => { setD({ ...d, steps: [...d.steps, newStep((d.steps.at(-1)?.delayDays || 0) + 3)] }); setOpen(d.steps.length); }}>+ Add email</Btn>
        </div>
        {step && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }} className="mk-split">
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr auto", gap: 10, alignItems: "end" }}>
                <Field label="Send on day"><input type="number" min={0} style={inputStyle} value={step.delayDays} onChange={e => setStep(open, { ...step, delayDays: Math.max(0, parseInt(e.target.value, 10) || 0) })} /></Field>
                <Field label="Condition">
                  <select style={inputStyle} value={step.onlyIf || "always"} onChange={e => setStep(open, { ...step, onlyIf: e.target.value as any })}>
                    {Object.entries(COND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Btn kind="danger" style={{ marginBottom: 12 }} disabled={d.steps.length < 2} onClick={() => { setD({ ...d, steps: d.steps.filter((_, j) => j !== open) }); setOpen(0); }}>Remove</Btn>
              </div>
              <EmailFields compact value={step} onChange={v => setStep(open, { ...step, ...v })} />
              <TestSend content={step} />
            </div>
            <EmailPreview content={step} />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Btn kind="primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save drip"}</Btn>
          {d.id && <Btn kind="danger" onClick={del}>Delete drip</Btn>}
        </div>
      </Card>
    </div>
  );
}
