"use client";

/**
 * DealCoachChat
 *
 * Floating chat panel anchored to the bottom-right of the property
 * detail page. Talks to /api/workspace/deal-coach which streams an
 * OpenAI response with the property's data already loaded as system
 * context.
 *
 * Design notes:
 *  - Two states: closed (just the lime bolt button) and open (380px
 *    wide × ~520px tall card with header + scroll body + input).
 *  - Prebaked starter questions (asset-type-aware) so the user has
 *    a one-click first prompt instead of staring at a blank box.
 *  - Streaming: we read text/event-stream chunks and append to the
 *    last assistant message in state so the UI feels reactive.
 *  - History persistence is in-memory per-property only (resets on
 *    page reload). Firestore persistence is a follow-up if useful.
 */

import { useState, useRef, useEffect, useMemo } from "react";

interface Props {
  propertyId: string;
  propertyName: string;
  analysisType?: string;
  /** Bearer token for the deal-coach API. */
  getToken: () => Promise<string | null>;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS_BY_TYPE: Record<string, string[]> = {
  retail: [
    "Is this cap rate aggressive vs. comps in this submarket?",
    "What 3 things would most worry an institutional buyer here?",
    "Draft an LOI at 8% below asking with 60-day inspection.",
    "Summarize the rent roll risk in 4 bullets.",
  ],
  industrial: [
    "What's the biggest risk in this rent roll?",
    "Is the price/SF reasonable for this market?",
    "Walk me through a value-add scenario at 10% below asking.",
    "What would a logistics-focused buyer pay?",
  ],
  office: [
    "How does occupancy stack up vs. submarket trends?",
    "What's the path to stabilization here?",
    "Which tenants are flight risks and why?",
    "Run a 'what-if' at 75% occupancy and 6% cap.",
  ],
  multifamily: [
    "What's the loss-to-lease here and how do I close it?",
    "Is this a heavy-lift value-add or stabilized buy?",
    "Draft a bid at $X/unit that hits a 7% yield-on-cost.",
    "Top 3 rent comps I should pull this week.",
  ],
  land: [
    "What are the top 3 highest-and-best uses for this site?",
    "Is the $/acre aggressive vs. similar parcels?",
    "Walk me through an entitlement strategy and timeline.",
    "What surrounding business mix would justify retail here?",
  ],
};

const FALLBACK_STARTERS = [
  "What are the top 3 risks on this deal?",
  "Is this priced right vs. the market?",
  "Draft an LOI 10% below asking.",
  "What's the highest-and-best use for this site?",
];

export default function DealCoachChat({
  propertyId,
  propertyName,
  analysisType,
  getToken,
}: Props) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const starters = useMemo(() => {
    const k = (analysisType || "").toLowerCase();
    return STARTERS_BY_TYPE[k] || FALLBACK_STARTERS;
  }, [analysisType]);

  // Auto-scroll body to the latest message when content changes.
  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setError(null);
    setDraft("");

    // Push the user message + an empty assistant placeholder that we'll
    // append streamed deltas into.
    const nextHistory: Msg[] = [...msgs, { role: "user", content: trimmed }];
    setMsgs([...nextHistory, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/workspace/deal-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId,
          message: trimmed,
          history: nextHistory.slice(0, -1), // exclude the latest user msg, server tacks it on
        }),
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
            const delta: string = parsed?.delta || "";
            if (delta) {
              setMsgs((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = { role: "assistant", content: last.content + delta };
                }
                return copy;
              });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || "Coach unavailable");
      // Drop the empty assistant placeholder we added optimistically.
      setMsgs((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === "assistant" && !last.content) return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open Deal Coach"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: "50%",
          background: "#84CC16", color: "#0F172A",
          border: "1px solid rgba(132,204,22,0.6)",
          boxShadow: "0 6px 22px rgba(132,204,22,0.45), 0 2px 8px rgba(0,0,0,0.18)",
          cursor: "pointer", padding: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.12s ease",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.05)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
      >
        {/* Chat bubble icon with a small lightning accent. */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Deal Coach"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        width: 380, maxWidth: "calc(100vw - 32px)",
        height: 560, maxHeight: "calc(100vh - 100px)",
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #E2E8F0",
        boxShadow: "0 24px 60px rgba(15,23,43,0.25)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        background: "#0F172A", color: "#FFFFFF",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "#84CC16", color: "#0F172A",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.09 12.97a.5.5 0 0 0 .39.81H10l-1.5 8.22a.5.5 0 0 0 .89.39L20 11.41a.5.5 0 0 0-.39-.81H14l1-7.81A.5.5 0 0 0 13 2z" /></svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Deal Coach</div>
            <div style={{ fontSize: 11, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {propertyName}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          style={{
            background: "transparent", color: "#FFFFFF",
            border: "none", cursor: "pointer", padding: 4,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            opacity: 0.7,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{
        flex: 1, minHeight: 0, overflow: "auto", padding: 14,
        background: "#F8FAFC",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {msgs.length === 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, lineHeight: 1.5 }}>
              I&apos;ve got this deal&apos;s data loaded. Ask me anything — or pick a starter:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  style={{
                    textAlign: "left", padding: "9px 12px",
                    background: "#FFFFFF", color: "#0F172A",
                    border: "1px solid #E2E8F0", borderRadius: 10,
                    fontSize: 12, fontWeight: 500, cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "border-color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(132,204,22,0.5)";
                    (e.currentTarget as HTMLElement).style.background = "rgba(132,204,22,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#E2E8F0";
                    (e.currentTarget as HTMLElement).style.background = "#FFFFFF";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: "9px 12px",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              background: m.role === "user" ? "#0F172A" : "#FFFFFF",
              color: m.role === "user" ? "#FFFFFF" : "#0F172A",
              border: m.role === "user" ? "none" : "1px solid #E2E8F0",
            }}
          >
            {m.content || (m.role === "assistant" && busy ? "…" : "")}
          </div>
        ))}

        {error && (
          <div style={{
            alignSelf: "stretch", padding: "8px 10px",
            background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 8, color: "#991B1B", fontSize: 12,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: 10, borderTop: "1px solid #E2E8F0", background: "#FFFFFF",
        display: "flex", alignItems: "flex-end", gap: 8,
      }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter inserts newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(draft);
            }
          }}
          placeholder={busy ? "Thinking…" : "Ask anything about this deal…"}
          disabled={busy}
          rows={1}
          style={{
            flex: 1, resize: "none",
            border: "1px solid #E2E8F0", borderRadius: 10,
            padding: "9px 12px", fontSize: 13, lineHeight: 1.4,
            fontFamily: "inherit", color: "#0F172A",
            outline: "none",
            maxHeight: 120,
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 120) + "px";
          }}
        />
        <button
          type="button"
          onClick={() => sendMessage(draft)}
          disabled={busy || !draft.trim()}
          style={{
            padding: "9px 14px",
            background: busy || !draft.trim() ? "#CBD5E1" : "#84CC16",
            color: "#FFFFFF",
            border: "none", borderRadius: 10,
            fontWeight: 700, fontSize: 13,
            cursor: busy || !draft.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
