"use client";

import { useEffect, useRef, useState } from "react";
import { api, Btn, C, Field, inputStyle, Notice } from "./ui";

export interface EmailContentUI { subject: string; preheader?: string; body: string; ctaLabel?: string; ctaUrl?: string }

export function EmailFields({ value, onChange, compact }: { value: EmailContentUI; onChange: (v: EmailContentUI) => void; compact?: boolean }) {
  const set = (k: keyof EmailContentUI) => (e: any) => onChange({ ...value, [k]: e.target.value });
  return (
    <div>
      <Field label="Subject"><input style={inputStyle} value={value.subject} onChange={set("subject")} placeholder="e.g. 3 deals worth a second look this week" /></Field>
      <Field label="Preview text" hint="Shows next to the subject in the inbox."><input style={inputStyle} value={value.preheader || ""} onChange={set("preheader")} /></Field>
      <Field label="Body" hint={<>Blank line = new paragraph. <code>- </code> bullets, <code>**bold**</code>, <code>[link](https://...)</code>. Merge tags: <code>{"{{firstName|there}}"}</code>, <code>{"{{email}}"}</code>.</>}>
        <textarea style={{ ...inputStyle, minHeight: compact ? 150 : 240, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.55 }} value={value.body} onChange={set("body")} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <Field label="Button label"><input style={inputStyle} value={value.ctaLabel || ""} onChange={set("ctaLabel")} placeholder="Upload an OM" /></Field>
        <Field label="Button link"><input style={inputStyle} value={value.ctaUrl || ""} onChange={set("ctaUrl")} placeholder="https://www.scoreom.com/workspace/upload" /></Field>
      </div>
    </div>
  );
}

export function EmailPreview({ content }: { content: EmailContentUI }) {
  const [html, setHtml] = useState("");
  const [err, setErr] = useState("");
  const t = useRef<any>(null);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(async () => {
      try { const r = await api({ body: { action: "preview", content } }); setHtml(r.html); setErr(""); }
      catch (e: any) { setErr(e.message); }
    }, 500);
    return () => clearTimeout(t.current);
  }, [content.subject, content.preheader, content.body, content.ctaLabel, content.ctaUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Notice tone="error">{err}</Notice>;
  return <iframe title="Email preview" srcDoc={html} style={{ width: "100%", height: 560, border: `1px solid ${C.line}`, borderRadius: 10, background: "#f1f5f9" }} />;
}

export function TestSend({ content }: { content: EmailContentUI }) {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api({ body: { action: "testEmail", content, to: to || undefined } });
      setMsg(r.sent ? "Test sent." : `Not sent: ${r.errors?.[0] || "unknown error"}`);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input style={{ ...inputStyle, width: 240 }} placeholder="Test to (defaults to you)" value={to} onChange={e => setTo(e.target.value)} />
      <Btn onClick={go} disabled={busy || !content.subject}>{busy ? "Sending..." : "Send test"}</Btn>
      {msg && <span style={{ fontSize: 12, color: msg.startsWith("Test sent") ? C.limeDark : C.red }}>{msg}</span>}
    </div>
  );
}

export function AiDraft({ kind, channels, onDraft }: { kind: "email" | "post"; channels?: string[]; onDraft: (d: any) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { onDraft(await api({ body: { action: "aiDraft", kind, prompt, channels } })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ background: "#F7FEE7", border: "1px solid #D9F99D", borderRadius: 10, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.limeDark, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Draft with AI</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={inputStyle} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") go(); }}
          placeholder={kind === "email" ? "e.g. Announce multi-document uploads. Push people to add rent rolls and T-12s." : "e.g. Why OM NOI is usually overstated, and how ScoreOM rebuilds it"} />
        <Btn kind="primary" onClick={go} disabled={busy}>{busy ? "Writing..." : "Draft"}</Btn>
      </div>
      {err && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{err}</div>}
    </div>
  );
}
