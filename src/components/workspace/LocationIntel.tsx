"use client";

/**
 * LocationIntel
 *
 * Per-property location/market brief tab. Pulls from
 * /api/workspace/location-intel/[propertyId], which fans out to Perplexity
 * sonar-pro (4 narrow cards) and sonar-reasoning (1 synthesis card with
 * Highlights / Red Flags / Broker Questions).
 *
 * Layout:
 *   [Synthesis card: Highlights / Red Flags / Broker Questions / Verdict]
 *   [Submarket]    [Demographics]
 *   [Comps]        [News & Pipeline]
 */

import React, { useEffect, useState, useCallback } from "react";

interface LocationCard {
  title: string;
  body: string;
  citations: string[];
  generatedAt: string;
}
interface SynthesisOutput {
  highlights: string[];
  redFlags: string[];
  brokerQuestions: string[];
  body: string;
  citations: string[];
  generatedAt: string;
}
interface LocationIntelDoc {
  propertyId: string;
  refreshedAt: string;
  address: string;
  assetType: string;
  cards: {
    submarket: LocationCard | null;
    demographics: LocationCard | null;
    comps: LocationCard | null;
    news: LocationCard | null;
  };
  synthesis: SynthesisOutput | null;
}

interface Props {
  propertyId: string;
  getToken: () => Promise<string | null>;
}

const CARD_META: Array<{ key: keyof LocationIntelDoc["cards"]; label: string; icon: string; eyebrow: string }> = [
  { key: "submarket",    label: "Submarket Fundamentals",   eyebrow: "Vacancy / rents / supply",       icon: "M3 21l4-9 5 5 8-12" },
  { key: "demographics", label: "Demographics & Trade Area", eyebrow: "Population, income, employment", icon: "M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m3 5.87a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6-12a4 4 0 1 0 0-2" },
  { key: "comps",        label: "Recent Comps",              eyebrow: "Sales + leases, last 24 mo",     icon: "M3 3v18h18M7 14l3-3 4 4 5-6" },
  { key: "news",         label: "News & Dev Pipeline",       eyebrow: "Civic, employer, construction",  icon: "M4 6h16M4 12h16M4 18h10" },
];

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CitationsList({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: "#6B7280", textTransform: "uppercase", marginBottom: 6 }}>
        Sources
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
        {items.map((url, i) => {
          let host = url;
          try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
          return (
            <li key={`${i}-${url}`} style={{ marginBottom: 3 }}>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#0369A1", textDecoration: "none" }}>
                {host}
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function inlineFormat(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#0369A1;text-decoration:none">$1</a>');
}

function renderMarkdown(text: string): React.ReactElement[] {
  const lines = text.split("\n");
  const out: React.ReactElement[] = [];
  let bullets: string[] = [];
  const flushBullets = (key: string) => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${key}`} style={{ margin: "6px 0 12px", paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: "#1F2937" }}>
          {bullets.map((b, i) => (
            <li key={`${key}-${i}`} dangerouslySetInnerHTML={{ __html: inlineFormat(b) }} />
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("- ") || line.startsWith("* ")) {
      bullets.push(line.slice(2));
    } else if (line.startsWith("#")) {
      flushBullets(`pre-h-${i}`);
      out.push(
        <div key={`h-${i}`} style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginTop: 10, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}
          dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^#+\s*/, "")) }} />
      );
    } else if (line.length === 0) {
      flushBullets(`pre-br-${i}`);
    } else {
      flushBullets(`pre-p-${i}`);
      out.push(
        <p key={`p-${i}`} style={{ margin: "4px 0 8px", fontSize: 13, lineHeight: 1.6, color: "#1F2937" }}
          dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      );
    }
  });
  flushBullets("end");
  return out;
}

// ── Synthesis card: highlights / red flags / broker questions ─────
function SynthesisCard({ s }: { s: SynthesisOutput }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
      borderRadius: 14,
      padding: 22,
      color: "#FFFFFF",
      boxShadow: "0 4px 16px rgba(15,23,43,0.18)",
      marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 8, background: "rgba(132,204,22,0.18)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#84CC16", letterSpacing: 0.8, textTransform: "uppercase" }}>
            AI Synthesis · Powered by Perplexity sonar-reasoning
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF" }}>
            Deal Verdict
          </div>
        </div>
      </div>

      {s.body && (
        <div style={{
          fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.92)",
          padding: "12px 14px", marginBottom: 16,
          background: "rgba(255,255,255,0.05)", borderLeft: "3px solid #84CC16",
          borderRadius: 4,
        }}
        dangerouslySetInnerHTML={{ __html: inlineFormat(s.body) }} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {/* Highlights */}
        {s.highlights?.length > 0 && (
          <div style={{
            background: "rgba(34,197,94,0.10)",
            borderRadius: 10,
            padding: 14,
            border: "1px solid rgba(34,197,94,0.25)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{"✨"}</span>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#86EFAC", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Highlights
              </div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.92)" }}>
              {s.highlights.map((h, i) => (
                <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: inlineFormat(h) }} />
              ))}
            </ul>
          </div>
        )}

        {/* Red Flags */}
        {s.redFlags?.length > 0 && (
          <div style={{
            background: "rgba(239,68,68,0.10)",
            borderRadius: 10,
            padding: 14,
            border: "1px solid rgba(239,68,68,0.30)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{"⚠️"}</span>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#FCA5A5", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Red Flags
              </div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.92)" }}>
              {s.redFlags.map((r, i) => (
                <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: inlineFormat(r) }} />
              ))}
            </ul>
          </div>
        )}

        {/* Broker Questions */}
        {s.brokerQuestions?.length > 0 && (
          <div style={{
            background: "rgba(132,204,22,0.10)",
            borderRadius: 10,
            padding: 14,
            border: "1px solid rgba(132,204,22,0.30)",
            gridColumn: "1 / -1",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{"❓"}</span>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#BEF264", letterSpacing: 0.6, textTransform: "uppercase" }}>
                Questions for the Broker
              </div>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.55, color: "rgba(255,255,255,0.92)" }}>
              {s.brokerQuestions.map((q, i) => (
                <li key={i} style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: inlineFormat(q) }} />
              ))}
            </ol>
          </div>
        )}
      </div>

      {s.citations?.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
            Sources
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {s.citations.map((url, i) => {
              let host = url;
              try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
              return (
                <a key={`${i}-${url}`} href={url} target="_blank" rel="noopener noreferrer"
                  style={{
                    fontSize: 11, color: "#BEF264", textDecoration: "none",
                    padding: "3px 8px", borderRadius: 4, background: "rgba(132,204,22,0.10)",
                  }}>
                  {host}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LocationIntel({ propertyId, getToken }: Props) {
  const [doc, setDoc] = useState<LocationIntelDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCached = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError("Sign-in required"); return; }
      const res = await fetch(`/api/workspace/location-intel/${propertyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
      } else if (res.status === 404) {
        setDoc(null);
      } else {
        setError(`Couldn't load location brief (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [propertyId, getToken]);

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError("Sign-in required"); return; }
      const res = await fetch(`/api/workspace/location-intel/${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ force }),
      });
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err?.error || `Generation failed (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setError(e?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [propertyId, getToken]);

  useEffect(() => { void loadCached(); }, [loadCached]);

  if (loading && !doc) {
    return (
      <div style={{ padding: "24px 12px", color: "#6B7280", fontSize: 13 }}>
        Loading location brief...
      </div>
    );
  }

  if (!doc && !generating) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "#374151" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          No location brief yet
        </div>
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          Generates a deal-aware market intelligence brief: highlights and red flags pressure-tested against the OM, plus submarket fundamentals, demographics, recent comps, and news. Cached for 7 days.
        </div>
        {error && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button
          onClick={() => generate(false)}
          style={{
            padding: "10px 20px", background: "#0F172A", color: "#FFFFFF",
            border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700,
            letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Generate brief
        </button>
      </div>
    );
  }

  if (generating) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          Pulling fresh location intelligence...
        </div>
        <div style={{ fontSize: 12, color: "#6B7280" }}>
          Synthesizing OM excerpts, submarket data, demographics, comps, and news. ~30-60 seconds.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header strip with refresh control */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", letterSpacing: 0.6, textTransform: "uppercase" }}>
            Powered by Perplexity (sonar-pro + sonar-reasoning)
          </div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
            {doc?.address || ""} · refreshed {formatTimestamp(doc?.refreshedAt)}
          </div>
        </div>
        <button
          onClick={() => generate(true)}
          disabled={generating}
          style={{
            padding: "6px 12px", background: "#FFFFFF", color: "#0F172A",
            border: "1px solid rgba(15,23,43,0.15)", borderRadius: 6,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
            cursor: generating ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#991B1B", fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Synthesis card on top */}
      {doc?.synthesis && <SynthesisCard s={doc.synthesis} />}

      {/* Four detail cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {CARD_META.map((meta) => {
          const card = doc?.cards?.[meta.key];
          return (
            <div
              key={meta.key}
              style={{
                background: "#FFFFFF",
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: 12,
                padding: 16,
                boxShadow: "0 1px 4px rgba(15,23,43,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: 6, background: "rgba(132,204,22,0.12)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d={meta.icon} />
                  </svg>
                </span>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#84CC16", letterSpacing: 0.6, textTransform: "uppercase" }}>
                    {meta.eyebrow}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                    {meta.label}
                  </div>
                </div>
              </div>

              {card ? (
                <>
                  <div>{renderMarkdown(card.body)}</div>
                  <CitationsList items={card.citations || []} />
                </>
              ) : (
                <div style={{ fontSize: 12, color: "#9CA3AF", padding: "8px 0" }}>
                  This card couldn't be generated this run. Try Refresh.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
