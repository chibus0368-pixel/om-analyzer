"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ── Types ─────────────────────────────────────────────── */
type Action = "reposition" | "risks" | "noi" | "tenant";

interface AskDealResult {
  title: string;
  bullets: string[];
  confidence: "high" | "medium" | "low";
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AskDealPanelProps {
  propertyId: string;
  userTier: string; // "free" | "pro" | "pro_plus"
}

/* ── Action button config ──────────────────────────────── */
const ACTIONS: { key: Action; label: string; icon: string; desc: string }[] = [
  { key: "reposition", label: "Reposition", icon: "🔄", desc: "Value-add strategy" },
  { key: "risks", label: "Find Risks", icon: "⚠️", desc: "Downside & red flags" },
  { key: "noi", label: "Improve NOI", icon: "📈", desc: "Financial optimization" },
  { key: "tenant", label: "Tenant Mix", icon: "🏪", desc: "Leasing ideas" },
];

const CONFIDENCE_COLORS: Record<string, { bg: string; color: string }> = {
  high: { bg: "#D1FAE5", color: "#065F46" },
  medium: { bg: "#FEF3C7", color: "#92400E" },
  low: { bg: "#FDE8EA", color: "#9B1C1C" },
};

/* ══════════════════════════════════════════════════════════ */
/*  ASK THE DEAL PANEL                                       */
/* ══════════════════════════════════════════════════════════ */
export default function AskDealPanel({ propertyId, userTier }: AskDealPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [results, setResults] = useState<Record<string, AskDealResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionsUsed, setActionsUsed] = useState<Set<string>>(new Set());

  // Phase 2: Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFree = userTier === "free";
  const freeLimit = 1;
  const freeActionsRemaining = Math.max(0, freeLimit - actionsUsed.size);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  /* ── Phase 1: Action button handler ──────────────────── */
  const handleAction = useCallback(async (action: Action) => {
    // Check cache first
    if (results[`${propertyId}_${action}`]) {
      setActiveAction(action);
      setError(null);
      return;
    }

    // Free tier limit
    if (isFree && actionsUsed.size >= freeLimit && !actionsUsed.has(action)) {
      setError("Free plan allows 1 analysis per property. Upgrade to Pro for unlimited.");
      return;
    }

    setLoading(true);
    setActiveAction(action);
    setError(null);

    try {
      const res = await fetch("/api/ai/ask-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }

      const result: AskDealResult = await res.json();
      setResults(prev => ({ ...prev, [`${propertyId}_${action}`]: result }));
      setActionsUsed(prev => new Set(prev).add(action));
      setShowChat(true); // Enable Phase 2 chat after first action
    } catch (err: any) {
      setError(err.message || "Unable to analyze this deal right now");
    } finally {
      setLoading(false);
    }
  }, [propertyId, results, isFree, actionsUsed, freeLimit]);

  /* ── Phase 2: Chat handler ──────────────────────────── */
  const handleChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    // Free tier: no chat access
    if (isFree) {
      setError("Chat follow-ups are a Pro feature. Upgrade to continue the conversation.");
      return;
    }

    // Max messages
    if (chatMessages.length >= 10) {
      setError("Maximum conversation length reached. Insights are saved above.");
      return;
    }

    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      // Collect previous action responses for context
      const previousResponses = Object.entries(results).map(([key, val]) => ({
        action: key.split("_").pop(),
        ...val,
      }));

      const res = await fetch("/api/ai/deal-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          messages: newMessages,
          previousResponses,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }

      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.content }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chatInput, chatLoading, chatMessages, isFree, propertyId, results]);

  const currentResult = activeAction ? results[`${propertyId}_${activeAction}`] : null;

  return (
    <>
      <style>{`
        .atd-action-btn { transition: all 0.15s ease; }
        .atd-action-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .atd-action-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
        .atd-chat-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(132,204,22,0.15); }
      `}</style>

      {/* ── Collapsed trigger button ── */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            position: "fixed", right: 24, bottom: 24, zIndex: 90,
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 20px", borderRadius: 50,
            background: "#0f172a", color: "#fff",
            border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
            boxShadow: "0 8px 32px rgba(15,23,42,0.3)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(15,23,42,0.4)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 8px 32px rgba(15,23,42,0.3)"; }}
        >
          <span style={{ fontSize: 16 }}>⚡</span>
          Ask the Deal
        </button>
      )}

      {/* ── Expanded panel (right sidebar drawer) ── */}
      {expanded && (
        <div style={{
          position: "fixed", right: 0, top: 0, bottom: 0, width: 380,
          background: "#fff", zIndex: 100,
          boxShadow: "-8px 0 40px rgba(0,0,0,0.1)",
          display: "flex", flexDirection: "column",
          animation: "slideInRight 0.25s ease-out",
        }}>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

          {/* Header */}
          <div style={{
            padding: "16px 20px", borderBottom: "1px solid #e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1e293b" }}>Ask the Deal</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Strategic insights from your data</div>
              </div>
            </div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 6, borderRadius: 8, color: "#94a3b8",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>

            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {ACTIONS.map(a => {
                const cached = !!results[`${propertyId}_${a.key}`];
                const isActive = activeAction === a.key;
                const disabled = loading && activeAction !== a.key;

                return (
                  <button
                    key={a.key}
                    className="atd-action-btn"
                    onClick={() => handleAction(a.key)}
                    disabled={disabled}
                    style={{
                      padding: "12px 14px", borderRadius: 12,
                      border: isActive ? "1.5px solid #4D7C0F" : "1.5px solid #e2e8f0",
                      background: isActive ? "rgba(132,204,22,0.04)" : "#fff",
                      cursor: disabled ? "not-allowed" : "pointer",
                      textAlign: "left", position: "relative",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 14 }}>{a.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#4D7C0F" : "#1e293b" }}>{a.label}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{a.desc}</div>
                    {cached && (
                      <div style={{
                        position: "absolute", top: 6, right: 6, width: 6, height: 6,
                        borderRadius: "50%", background: "#059669",
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Free tier notice */}
            {isFree && (
              <div style={{
                padding: "8px 12px", borderRadius: 8,
                background: "#FEF3C7", border: "1px solid #FDE68A",
                fontSize: 11, color: "#92400E", marginBottom: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 13 }}>💡</span>
                {freeActionsRemaining > 0
                  ? `${freeActionsRemaining} free analysis remaining`
                  : "Upgrade to Pro for unlimited analysis"
                }
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: "#FDE8EA", border: "1px solid #FECACA",
                fontSize: 12, color: "#9B1C1C", marginBottom: 12,
              }}>
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{
                padding: "24px 16px", textAlign: "center",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 28, height: 28,
                  border: "3px solid #e2e8f0", borderTopColor: "#4D7C0F",
                  borderRadius: "50%", animation: "spin 0.8s linear infinite",
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Analyzing deal...</span>
              </div>
            )}

            {/* Result card */}
            {!loading && currentResult && (
              <div style={{
                background: "#f8fafc", borderRadius: 14, padding: 20,
                border: "1px solid #e2e8f0", marginBottom: 16,
                animation: "fadeIn 0.25s ease",
              }}>
                <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>
                    {currentResult.title}
                  </h4>
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
                    padding: "3px 8px", borderRadius: 4,
                    background: CONFIDENCE_COLORS[currentResult.confidence]?.bg || "#f1f5f9",
                    color: CONFIDENCE_COLORS[currentResult.confidence]?.color || "#64748b",
                  }}>
                    {currentResult.confidence} confidence
                  </span>
                </div>

                <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {currentResult.bullets.map((bullet, i) => (
                    <li key={i} style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 2: Chat */}
            {showChat && !loading && (
              <>
                {/* Chat messages */}
                {chatMessages.length > 0 && (
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 8,
                    marginBottom: 12, maxHeight: 300, overflow: "auto",
                    padding: "4px 0",
                  }}>
                    {chatMessages.map((msg, i) => (
                      <div key={i} style={{
                        padding: "10px 14px", borderRadius: 12,
                        background: msg.role === "user" ? "#0f172a" : "#f8fafc",
                        color: msg.role === "user" ? "#fff" : "#475569",
                        fontSize: 13, lineHeight: 1.6,
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "90%",
                        border: msg.role === "assistant" ? "1px solid #e2e8f0" : "none",
                      }}>
                        {msg.content}
                      </div>
                    ))}
                    {chatLoading && (
                      <div style={{
                        padding: "10px 14px", borderRadius: 12,
                        background: "#f8fafc", border: "1px solid #e2e8f0",
                        alignSelf: "flex-start",
                      }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[0, 1, 2].map(i => (
                            <div key={i} style={{
                              width: 6, height: 6, borderRadius: "50%", background: "#94a3b8",
                              animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
                            }} />
                          ))}
                        </div>
                        <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Chat input */}
                <div style={{
                  display: "flex", gap: 8, alignItems: "center",
                  padding: "10px 12px", borderRadius: 12,
                  border: "1.5px solid #e2e8f0", background: "#fff",
                  transition: "border-color 0.15s",
                }}>
                  <input
                    ref={inputRef}
                    className="atd-chat-input"
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleChat(); }}
                    placeholder={isFree ? "Upgrade to Pro for chat..." : "Ask a follow-up question..."}
                    disabled={isFree || chatLoading}
                    style={{
                      flex: 1, border: "none", background: "none",
                      fontSize: 13, color: "#1e293b", fontFamily: "inherit",
                      padding: 0, outline: "none",
                    }}
                  />
                  <button
                    onClick={handleChat}
                    disabled={!chatInput.trim() || chatLoading || isFree}
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: chatInput.trim() && !chatLoading && !isFree ? "#4D7C0F" : "#e2e8f0",
                      border: "none", cursor: chatInput.trim() && !chatLoading && !isFree ? "pointer" : "not-allowed",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, transition: "background 0.15s",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim() && !isFree ? "#fff" : "#94a3b8"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>

                {chatMessages.length >= 10 && (
                  <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 6 }}>
                    Max conversation length reached
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
