"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Btn, C, Card, Empty, Field, fromLocalInput, inputStyle, Notice, Pill, toLocalInput, when } from "./ui";
import { AiDraft, EmailFields, EmailPreview, TestSend } from "./EmailEditor";
import { SegmentBuilder, type SegmentUI } from "./SegmentBuilder";

interface B {
  id?: string; name?: string; subject: string; preheader?: string; body: string; ctaLabel?: string; ctaUrl?: string;
  segment: SegmentUI; status: string; scheduledAt?: string | null; sentAt?: string | null; createdAt?: string;
  stats?: { recipients: number; sent: number; failed: number; skipped: number } | null; lastError?: string | null;
}

const blank = (): B => ({ name: "", subject: "", preheader: "", body: "Hi {{firstName|there}},\n\n\n\nBrody", ctaLabel: "", ctaUrl: "https://www.scoreom.com/workspace", segment: { audience: "all", deals: "any" }, status: "draft" });

export default function Broadcasts() {
  const [items, setItems] = useState<B[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<B | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api({ view: "broadcasts" })).broadcasts); setErr(""); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (edit) return <Editor initial={edit} onClose={() => { setEdit(null); load(); }} />;

  return (
    <Card title="Broadcasts" right={<Btn kind="primary" onClick={() => setEdit(blank())}>+ New broadcast</Btn>}>
      {err && <Notice tone="error">{err}</Notice>}
      {loading ? <Empty>Loading...</Empty> : items.length === 0 ? <Empty>No broadcasts yet. Write one to your users, leads or a segment.</Empty> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: C.faint, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <th style={{ padding: "6px 8px" }}>Subject</th><th>Status</th><th>When</th><th>Sent</th><th></th>
          </tr></thead>
          <tbody>
            {items.map(b => (
              <tr key={b.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "10px 8px", fontWeight: 600, color: C.ink }}>{b.name ? <><div>{b.name}</div><div style={{ fontWeight: 400, color: C.sub }}>{b.subject}</div></> : b.subject}</td>
                <td><Pill s={b.status} />{b.lastError && <div style={{ fontSize: 11, color: C.red, maxWidth: 220 }}>{b.lastError}</div>}</td>
                <td style={{ color: C.sub }}>{b.status === "sent" ? when(b.sentAt) : b.status === "scheduled" ? when(b.scheduledAt) : when(b.createdAt)}</td>
                <td style={{ color: C.sub }}>{b.stats ? `${b.stats.sent} / ${b.stats.recipients}` : "--"}</td>
                <td style={{ textAlign: "right" }}><Btn onClick={() => setEdit(b)}>{["sent", "sending"].includes(b.status) ? "View" : "Edit"}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Editor({ initial, onClose }: { initial: B; onClose: () => void }) {
  const [b, setB] = useState<B>(initial);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const locked = ["sent", "sending"].includes(initial.status);

  const save = async (status: "draft" | "scheduled"): Promise<string | null> => {
    if (status === "scheduled" && !b.scheduledAt) { setMsg({ tone: "warn", text: "Pick a send time first." }); return null; }
    setBusy("save"); setMsg(null);
    try {
      const r = await api({ body: { action: "saveBroadcast", broadcast: { ...b, status } } });
      setB(x => ({ ...x, id: r.id, status }));
      setMsg({ tone: "ok", text: status === "scheduled" ? `Scheduled for ${when(b.scheduledAt)}.` : "Draft saved." });
      return r.id;
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); return null; } finally { setBusy(""); }
  };

  const sendNow = async () => {
    if (!window.confirm("Send this broadcast now to everyone in the segment? This can't be undone.")) return;
    const id = await save("draft");
    if (!id) return;
    setBusy("send");
    try {
      const r = await api({ body: { action: "sendBroadcast", id } });
      setMsg({ tone: "ok", text: `Sent to ${r.stats?.sent ?? 0} of ${r.stats?.recipients ?? 0}.${r.stats?.failed ? ` ${r.stats.failed} failed.` : ""}` });
      setB(x => ({ ...x, status: "sent" }));
    } catch (e: any) { setMsg({ tone: "error", text: e.message }); } finally { setBusy(""); }
  };

  const del = async () => {
    if (!b.id || !window.confirm("Delete this draft?")) return;
    try { await api({ body: { action: "deleteBroadcast", id: b.id } }); onClose(); } catch (e: any) { setMsg({ tone: "error", text: e.message }); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Btn onClick={onClose}>&larr; All broadcasts</Btn>
        <Pill s={b.status} />
        {initial.stats && <span style={{ fontSize: 13, color: C.sub }}>Sent {initial.stats.sent} of {initial.stats.recipients}</span>}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1fr)", gap: 16, alignItems: "start" }} className="mk-split">
        <Card>
          {!locked && <AiDraft kind="email" onDraft={d => setB(x => ({ ...x, subject: d.subject || x.subject, preheader: d.preheader || x.preheader, body: d.body || x.body, ctaLabel: d.ctaLabel || x.ctaLabel, ctaUrl: d.ctaUrl || x.ctaUrl }))} />}
          <Field label="Internal name (optional)"><input style={inputStyle} value={b.name || ""} onChange={e => setB({ ...b, name: e.target.value })} placeholder="e.g. Sept product update" /></Field>
          <EmailFields value={b} onChange={v => setB({ ...b, ...v })} />
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.6, margin: "6px 0 6px" }}>Recipients</div>
          <SegmentBuilder value={b.segment} onChange={segment => setB({ ...b, segment })} />
          {!locked && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", margin: "16px 0 12px" }}>
                <Field label="Send at (your time)" style={{ marginBottom: 0 }}>
                  <input type="datetime-local" style={{ ...inputStyle, width: 220 }} value={toLocalInput(b.scheduledAt)} onChange={e => setB({ ...b, scheduledAt: fromLocalInput(e.target.value) })} />
                </Field>
                <Btn kind="dark" onClick={() => save("scheduled")} disabled={!!busy}>Schedule</Btn>
                <Btn onClick={() => save("draft")} disabled={!!busy}>{busy === "save" ? "Saving..." : "Save draft"}</Btn>
                <Btn kind="primary" onClick={sendNow} disabled={!!busy || !b.subject}>{busy === "send" ? "Sending..." : "Send now"}</Btn>
                {b.id && <Btn kind="danger" onClick={del} disabled={!!busy}>Delete</Btn>}
              </div>
              <TestSend content={b} />
            </>
          )}
        </Card>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Preview</div>
          <EmailPreview content={b} />
        </div>
      </div>
    </div>
  );
}
