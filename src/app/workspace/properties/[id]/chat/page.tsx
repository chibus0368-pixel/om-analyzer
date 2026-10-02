"use client";

/**
 * Ask the agent: full-page chat for one deal.
 *
 * Replaces the small floating panel. Same backend as before
 * (/api/workspace/deal-coach streams the answer with the deal's data loaded
 * as context; /history keeps one conversation per deal), with:
 *  - the deal's key numbers carried in beside the chat
 *  - a wide, readable column with labels and bullets rendered properly
 *  - the previous conversation picked up where it left off, or "New chat"
 *  - "Save to notes" on any answer; saved notes are listed here and are
 *    added to the Brief download on the deal page
 *  - a paced reveal so answers arrive at reading speed instead of in bursts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWorkspaceAuth } from "@/lib/workspace/auth";
import { getProperty, getPropertyNotes, createNote, deleteNote } from "@/lib/workspace/firestore";
import type { Property, Note } from "@/lib/workspace/types";

interface Msg { role: "user" | "assistant"; content: string }

const FALLBACK_STARTERS = [
  "What are the top 3 risks on this deal?",
  "Is this priced right vs. the market?",
  "Draft an LOI 10% below asking.",
  "What should I ask the broker before I spend more time on this?",
];

const NAVY = "#0F172A";
const LIME = "#4D7C0F";
const LINE = "#E2E8F0";
const SUB = "#64748B";

/* ── formatting helpers ─────────────────────────────────── */
const money = (n?: number | null) => {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

function inline(text: string, key: string) {
  // **bold** only; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
      : <span key={`${key}-${i}`}>{p}</span>,
  );
}

/**
 * Turn the agent's plain-text answer into readable blocks: short "Label:"
 * lines become headings, "- " and "1." lines become lists, the rest are
 * paragraphs. Stray markdown heading marks are treated as labels.
 */
function AnswerBody({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;
  const flushPara = () => {
    if (para.length) { blocks.push(<p key={k++} className="ac-p">{inline(para.join(" "), `p${k}`)}</p>); para = []; }
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${k}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k++} className="ac-list">{items}</ol> : <ul key={k++} className="ac-list">{items}</ul>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const label = !bullet && !numbered && /^\**[A-Z0-9][^.!?]{0,56}:\**$/.test(line.trim());
    if (heading || label) {
      flushPara(); flushList();
      const t = (heading ? heading[1] : line.trim()).replace(/\*\*/g, "").replace(/:$/, "");
      blocks.push(<div key={k++} className="ac-label">{t}</div>);
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ? bullet[1] : numbered![1]).trim());
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList();
  return <>{blocks}</>;
}

/* ══════════════════════════════════════════════════════════ */
export default function DealChatPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = String(params?.id || "");
  const { user, loading: authLoading } = useWorkspaceAuth();

  const [property, setProperty] = useState<Property | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [resumedAt, setResumedAt] = useState<string | null>(null); // set when an earlier conversation was loaded
  const [resumedCount, setResumedCount] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [starters, setStarters] = useState<string[]>(FALLBACK_STARTERS);
  const [showStarters, setShowStarters] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedIdx, setSavedIdx] = useState<Record<number, boolean>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Paced reveal: streamed text lands in `pending` and is typed out on a timer.
  const pending = useRef("");
  const streamDone = useRef(true);

  const getToken = useCallback(async () => {
    try { return user ? await user.getIdToken() : null; } catch { return null; }
  }, [user]);

  /* ── load deal, notes, history, suggestions ── */
  useEffect(() => {
    if (!user || !propertyId) return;
    let cancelled = false;
    (async () => {
      const [p, n] = await Promise.all([getProperty(propertyId).catch(() => null), getPropertyNotes(propertyId).catch(() => [])]);
      if (cancelled) return;
      setProperty(p);
      setNotes((n || []).filter((x) => x.noteType === "general"));
    })();
    (async () => {
      try {
        const t = await user.getIdToken();
        const h = { Authorization: `Bearer ${t}` };
        const q = `propertyId=${encodeURIComponent(propertyId)}`;
        const [hist, sug] = await Promise.all([
          fetch(`/api/workspace/deal-coach/history?${q}`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/workspace/deal-coach/suggestions?${q}`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (cancelled) return;
        if (Array.isArray(hist?.messages) && hist.messages.length) {
          const prior: Msg[] = hist.messages
            .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
            .map((m: any) => ({ role: m.role, content: m.content }));
          setMsgs(prior);
          setResumedCount(prior.length);
          setResumedAt(hist.updatedAt || null);
        }
        if (Array.isArray(sug?.suggestions) && sug.suggestions.length) setStarters(sug.suggestions);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, propertyId]);

  /* ── paced reveal of the streamed answer ── */
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => {
      const backlog = pending.current.length;
      if (!backlog) {
        if (streamDone.current) setBusy(false);
        return;
      }
      // About 100 characters a second at rest; a little faster if the
      // answer is far ahead of what's on screen so it never drags.
      const n = backlog > 1200 ? 8 : backlog > 300 ? 5 : 3;
      const chunk = pending.current.slice(0, n);
      pending.current = pending.current.slice(n);
      setMsgs((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: last.content + chunk };
        return copy;
      });
    }, 30);
    return () => clearInterval(id);
  }, [busy]);

  /* ── keep the latest message in view ── */
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: busy ? "auto" : "smooth" });
  }, [msgs, busy]);

  /* ── save the conversation after each finished exchange ── */
  const persist = useCallback(async (messages: Msg[]) => {
    const t = await getToken();
    if (!t) return;
    await fetch("/api/workspace/deal-coach/history", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ propertyId, messages }),
    }).catch(() => {});
  }, [getToken, propertyId]);

  useEffect(() => {
    if (!historyLoaded || busy || msgs.length === 0) return;
    const id = setTimeout(() => { persist(msgs); }, 600);
    return () => clearTimeout(id);
  }, [msgs, busy, historyLoaded, persist]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setDraft("");
    setShowStarters(false);
    const history = msgs;
    setMsgs([...history, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    pending.current = "";
    streamDone.current = false;
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/workspace/deal-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ propertyId, message: trimmed, history }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail || errBody?.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data: ")) continue;
          const payload = t.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.delta) pending.current += parsed.delta;
            const saved = parsed?.saved_field;
            if (saved) {
              setToast(`Saved ${saved.name} = ${saved.value} to the deal.`);
              window.dispatchEvent(new Event("workspace-properties-changed"));
            }
          } catch { /* skip a malformed chunk */ }
        }
      }
    } catch (e: any) {
      setError(e?.message || "The agent is unavailable right now. Try again.");
      pending.current = "";
      setMsgs((prev) => {
        const last = prev[prev.length - 1];
        return last && last.role === "assistant" && !last.content ? prev.slice(0, -1) : prev;
      });
    } finally {
      streamDone.current = true; // the reveal timer ends `busy` once it has typed everything out
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function newChat() {
    if (busy) return;
    if (msgs.length && !window.confirm("Start a new chat? This clears the current conversation for this deal. Saved notes are kept.")) return;
    setMsgs([]); setResumedAt(null); setResumedCount(0); setSavedIdx({}); setError(null);
    await persist([]);
    inputRef.current?.focus();
  }

  async function saveToNotes(i: number) {
    if (!user || savedIdx[i]) return;
    const answer = msgs[i]?.content;
    if (!answer) return;
    const question = [...msgs.slice(0, i)].reverse().find((m) => m.role === "user")?.content || "Agent note";
    const now = new Date().toISOString();
    const data: any = {
      projectId: (property as any)?.projectId || "",
      propertyId,
      workspaceId: (property as any)?.workspaceId || null,
      userId: user.uid,
      noteType: "general",
      title: question.length > 90 ? `${question.slice(0, 87)}...` : question,
      content: answer,
      source: "agent_chat",
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const id = await createNote(data);
      setNotes((prev) => [{ id, ...data } as Note, ...prev]);
      setSavedIdx((prev) => ({ ...prev, [i]: true }));
      setToast("Saved to this deal's notes.");
    } catch {
      setToast("Couldn't save the note. Try again.");
    }
  }

  async function removeNote(id: string) {
    if (!window.confirm("Remove this note?")) return;
    try { await deleteNote(id); setNotes((prev) => prev.filter((n) => n.id !== id)); } catch { setToast("Couldn't remove the note."); }
  }

  async function copy(i: number) {
    try { await navigator.clipboard.writeText(msgs[i].content); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500); } catch { /* clipboard blocked */ }
  }

  const dealHref = `/workspace/properties/${propertyId}`;
  const facts = useMemo(() => {
    const p: any = property || {};
    const out: [string, string][] = [];
    if (p.scoreTotal) out.push(["Score", `${Math.round(p.scoreTotal)} of 100`]);
    const price = money(p.cardAskingPrice); if (price) out.push(["Asking price", price]);
    if (p.cardCapRate) out.push(["Cap rate", `${Number(p.cardCapRate).toFixed(2)}%`]);
    const noi = money(p.cardNoi); if (noi) out.push(["NOI", noi]);
    const sf = p.cardBuildingSf || p.buildingSf; if (sf) out.push(["Building", `${Math.round(sf).toLocaleString()} SF`]);
    if (p.occupancyPct) out.push(["Occupancy", `${Math.round(p.occupancyPct)}%`]);
    if (p.analysisType) out.push(["Model", String(p.analysisType).replace(/^./, (c: string) => c.toUpperCase())]);
    return out;
  }, [property]);
  const address = property ? [property.address1, (property as any).city, (property as any).state].filter(Boolean).join(", ") : "";
  const lastActive = resumedAt ? new Date(resumedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  const empty = historyLoaded && msgs.length === 0;

  if (authLoading) return <div style={{ padding: 60, textAlign: "center", color: SUB }}>Loading...</div>;
  if (!user) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <p style={{ color: SUB, fontSize: 14 }}>Sign in to ask the agent about this deal.</p>
      <Link href="/workspace/login" prefetch={false} style={{ color: LIME, fontWeight: 700 }}>Sign in</Link>
    </div>
  );

  return (
    <div className="ac-page">
      <style>{`
        .ac-page { max-width: 1160px; width: 100%; margin: 0 auto; padding: 0 20px; box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; color: ${NAVY}; }
        .ac-top { display: flex; align-items: center; gap: 12px; padding: 16px 0 14px; flex-wrap: wrap; }
        .ac-back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: ${LIME}; text-decoration: none; }
        .ac-h1 { font-size: 20px; font-weight: 800; margin: 0; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ac-ghost { height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid ${LINE}; background: #fff; color: ${NAVY}; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit; }
        .ac-ghost:hover:not(:disabled) { border-color: #94A3B8; }
        .ac-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
        .ac-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; }
        .ac-rail { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 14px; }
        .ac-card { background: #fff; border: 1px solid ${LINE}; border-radius: 12px; padding: 14px 16px; }
        .ac-card h3 { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: ${SUB}; margin: 0 0 10px; }
        .ac-deal-name { font-size: 15px; font-weight: 800; line-height: 1.3; margin: 0 0 2px; }
        .ac-deal-addr { font-size: 12.5px; color: ${SUB}; margin: 0 0 10px; }
        .ac-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin: 0; }
        .ac-facts dt { font-size: 11px; color: ${SUB}; margin: 0; }
        .ac-facts dd { font-size: 14px; font-weight: 700; margin: 0; }
        .ac-note { border-top: 1px solid ${LINE}; padding: 9px 0; }
        .ac-note:first-of-type { border-top: 0; padding-top: 0; }
        .ac-note-title { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 0; font: inherit; font-size: 13px; font-weight: 700; color: ${NAVY}; cursor: pointer; line-height: 1.4; }
        .ac-note-body { font-size: 12.5px; line-height: 1.55; color: #334155; margin-top: 6px; }
        .ac-note-meta { font-size: 11px; color: ${SUB}; margin-top: 4px; display: flex; gap: 10px; align-items: center; }
        .ac-link { background: none; border: 0; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: ${SUB}; cursor: pointer; text-decoration: underline; }
        .ac-link:hover { color: ${NAVY}; }
        .ac-chat { min-width: 0; display: flex; flex-direction: column; min-height: calc(100vh - 150px); }
        .ac-thread { flex: 1 1 auto; display: flex; flex-direction: column; gap: 18px; padding-bottom: 18px; }
        .ac-divider { display: flex; align-items: center; gap: 10px; font-size: 12px; color: ${SUB}; }
        .ac-divider::before, .ac-divider::after { content: ""; flex: 1; height: 1px; background: ${LINE}; }
        .ac-user { align-self: flex-end; max-width: 80%; background: ${NAVY}; color: #fff; padding: 10px 14px; border-radius: 14px 14px 4px 14px; font-size: 15px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
        .ac-bot { align-self: stretch; background: #fff; border: 1px solid ${LINE}; border-radius: 14px; padding: 16px 18px 10px; font-size: 15.5px; line-height: 1.7; color: #1E293B; overflow-wrap: anywhere; }
        .ac-p { margin: 0 0 12px; }
        .ac-label { font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: ${LIME}; margin: 14px 0 6px; }
        .ac-bot > .ac-label:first-child { margin-top: 0; }
        .ac-list { margin: 0 0 12px; padding-left: 22px; }
        .ac-list li { margin: 0 0 6px; padding-left: 2px; }
        .ac-actions { display: flex; gap: 14px; align-items: center; border-top: 1px solid #F1F5F9; margin-top: 4px; padding-top: 8px; }
        .ac-save { background: none; border: 0; padding: 0; font: inherit; font-size: 12.5px; font-weight: 700; color: ${LIME}; cursor: pointer; }
        .ac-save:disabled { color: ${SUB}; cursor: default; }
        .ac-typing { display: inline-block; width: 8px; height: 16px; background: #94A3B8; border-radius: 2px; vertical-align: text-bottom; animation: acBlink 1s steps(2) infinite; }
        @keyframes acBlink { 50% { opacity: 0; } }
        .ac-empty { text-align: center; padding: 28px 0 8px; }
        .ac-empty h2 { font-size: 22px; font-weight: 800; margin: 0 0 6px; }
        .ac-empty p { font-size: 14px; color: ${SUB}; margin: 0 0 18px; }
        .ac-starters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ac-starter { text-align: left; background: #fff; border: 1px solid ${LINE}; border-radius: 12px; padding: 12px 14px; font: inherit; font-size: 14px; line-height: 1.45; color: ${NAVY}; cursor: pointer; }
        .ac-starter:hover { border-color: #84CC16; background: #F7FEE7; }
        .ac-composer { position: sticky; bottom: 0; background: linear-gradient(to bottom, rgba(247,248,250,0), #F7F8FA 22%); padding: 18px 0 16px; }
        .ac-box { display: flex; align-items: flex-end; gap: 8px; background: #fff; border: 1.5px solid #CBD5E1; border-radius: 14px; padding: 8px 8px 8px 14px; box-shadow: 0 4px 16px rgba(15,23,43,0.06); }
        .ac-box:focus-within { border-color: #84CC16; }
        .ac-input { flex: 1; border: 0; outline: 0; resize: none; font: inherit; font-size: 16px; line-height: 1.5; color: ${NAVY}; background: transparent; max-height: 180px; padding: 6px 0; }
        .ac-send { height: 40px; padding: 0 16px; border-radius: 10px; border: 0; background: ${LIME}; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
        .ac-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .ac-hint { display: flex; justify-content: space-between; gap: 12px; font-size: 11.5px; color: ${SUB}; margin-top: 6px; padding: 0 4px; }
        .ac-error { background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; font-size: 13px; border-radius: 10px; padding: 10px 12px; }
        .ac-toast { position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%); background: ${NAVY}; color: #fff; font-size: 13px; font-weight: 600; padding: 9px 14px; border-radius: 10px; z-index: 50; box-shadow: 0 8px 24px rgba(15,23,43,0.25); }
        @media (max-width: 900px) {
          .ac-page { padding: 0 14px; }
          .ac-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
          .ac-rail { position: static; order: -1; }
          .ac-rail .ac-notes-card { display: none; }
          .ac-facts { grid-template-columns: repeat(3, 1fr); }
          .ac-facts > div:nth-child(n+4) { display: none; }
          .ac-rail .ac-card { padding: 12px 14px; }
          .ac-open-full { display: none; }
          .ac-hint span:last-child { display: none; }
          .ac-top { padding: 12px 0 10px; gap: 8px; }
          .ac-starters { grid-template-columns: 1fr; }
          .ac-user { max-width: 90%; }
          .ac-bot { padding: 14px 14px 8px; font-size: 15px; }
          .ac-chat { min-height: 0; }
          .ac-h1 { font-size: 17px; }
        }
      `}</style>

      <div className="ac-top">
        <Link href={dealHref} prefetch={false} className="ac-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          Back to deal
        </Link>
        <h1 className="ac-h1">Ask the agent</h1>
        <button type="button" className="ac-ghost" onClick={() => setShowStarters((v) => !v)} disabled={busy || empty}>Suggestions</button>
        <button type="button" className="ac-ghost" onClick={newChat} disabled={busy || msgs.length === 0}>New chat</button>
      </div>

      <div className="ac-grid">
        {/* ── Chat ── */}
        <div className="ac-chat">
          <div className="ac-thread" aria-live="polite">
            {empty && (
              <div className="ac-empty">
                <h2>What do you want to know about this deal?</h2>
                <p>The agent already has the numbers, rent roll and documents for this deal loaded.</p>
              </div>
            )}
            {(empty || showStarters) && (
              <div className="ac-starters">
                {starters.slice(0, 6).map((s) => (
                  <button key={s} type="button" className="ac-starter" onClick={() => send(s)} disabled={busy}>{s}</button>
                ))}
              </div>
            )}

            {msgs.map((m, i) => {
              const streaming = busy && i === msgs.length - 1 && m.role === "assistant";
              return (
                <div key={i} style={{ display: "contents" }}>
                  {resumedCount > 0 && i === resumedCount && (
                    <div className="ac-divider">Picking up where you left off{lastActive ? ` (last active ${lastActive})` : ""}</div>
                  )}
                  {m.role === "user" ? (
                    <div className="ac-user">{m.content}</div>
                  ) : (
                    <div className="ac-bot">
                      <AnswerBody text={m.content} />
                      {streaming && <span className="ac-typing" aria-label="Agent is writing" />}
                      {!streaming && m.content && (
                        <div className="ac-actions">
                          <button type="button" className="ac-save" onClick={() => saveToNotes(i)} disabled={!!savedIdx[i]}>
                            {savedIdx[i] ? "Saved to notes" : "Save to notes"}
                          </button>
                          <button type="button" className="ac-link" onClick={() => copy(i)}>{copiedIdx === i ? "Copied" : "Copy"}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {resumedCount > 0 && msgs.length === resumedCount && (
              <div className="ac-divider">Picking up where you left off{lastActive ? ` (last active ${lastActive})` : ""}</div>
            )}
            {error && <div className="ac-error" role="alert">{error}</div>}
            <div ref={endRef} />
          </div>

          <div className="ac-composer">
            <form className="ac-box" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
              <textarea
                ref={inputRef}
                className="ac-input"
                rows={1}
                value={draft}
                placeholder={msgs.length ? "Ask a follow-up..." : "Ask about price, risks, the rent roll, an offer..."}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); }
                }}
                aria-label="Message the agent"
              />
              <button type="submit" className="ac-send" disabled={busy || !draft.trim()}>{busy ? "Working..." : "Send"}</button>
            </form>
            <div className="ac-hint">
              <span>Enter to send, Shift+Enter for a new line</span>
              <span>First-pass guidance, not investment advice</span>
            </div>
          </div>
        </div>

        {/* ── Deal context + notes ── */}
        <aside className="ac-rail">
          <div className="ac-card">
            <h3>This deal</h3>
            <p className="ac-deal-name">{property?.propertyName || "Loading deal..."}</p>
            {address && <p className="ac-deal-addr">{address}</p>}
            {facts.length > 0 && (
              <dl className="ac-facts">
                {facts.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
            )}
            <div className="ac-open-full" style={{ marginTop: 12 }}>
              <button type="button" className="ac-link" onClick={() => router.push(dealHref)}>Open the full analysis</button>
            </div>
          </div>

          <div className="ac-card ac-notes-card">
            <h3>Saved notes{notes.length ? ` (${notes.length})` : ""}</h3>
            {notes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: SUB, margin: 0, lineHeight: 1.5 }}>
                Use Save to notes under any answer. Notes stay with this deal and are added to the Brief download.
              </p>
            ) : notes.map((n) => (
              <div key={n.id} className="ac-note">
                <button type="button" className="ac-note-title" onClick={() => setOpenNote(openNote === n.id ? null : n.id)} aria-expanded={openNote === n.id}>
                  {n.title || "Note"}
                </button>
                {openNote === n.id && <div className="ac-note-body"><AnswerBody text={n.content} /></div>}
                <div className="ac-note-meta">
                  <span>{n.createdAt ? new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
                  <button type="button" className="ac-link" onClick={() => removeNote(n.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </div>
  );
}
