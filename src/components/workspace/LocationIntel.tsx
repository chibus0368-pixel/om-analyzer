"use client";

/**
 * LocationIntel
 *
 * Per-property location/market brief tab. Pulls a four-card brief
 * (submarket / demographics / comps / news+pipeline) from
 * /api/workspace/location-intel/[propertyId], which is backed by
 * Perplexity sonar-pro with citations.
 *
 * On mount: GET to load any cached doc (instant). Empty state shows
 * a single "Generate brief" button that POSTs and polls for ~30s.
 * Refresh button forces a re-run (force=true) and busts the 7-day cache.
 */

import React, { useEffect, useState, useCallback } from "react";

interface LocationCard {
  title: string;
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
}

interface Props {
  propertyId: string;
  getToken: () => Promise<string | null>;
}

const CARD_META: Array<{ key: keyof LocationIntelDoc["cards"]; label: string; icon: string; eyebrow: string }> = [
  { key: "submarket",    label: "Submarket Fundamentals",   eyebrow: "Vacancy / rents / supply", icon: "M3 21l4-9 5 5 8-12" },
  { key: "demographics", label: "Demographics & Trade Area", eyebrow: "Population, income, employment", icon: "M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m3 5.87a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6-12a4 4 0 1 0 0-2" },
  { key: "comps",        label: "Recent Comps",              eyebrow: "Sales + leases, last 24 mo", icon: "M3 3v18h18M7 14l3-3 4 4 5-6" },
  { key: "news",         label: "News & Dev Pipeline",       eyebrow: "Civic, employer, construction", icon: "M4 6h16M4 12h16M4 18h10" },
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

/** Light markdown renderer - just bullets, bold, and paragraphs. */
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
function inlineFormat(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#0369A1;text-decoration:none">$1</a>');
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
        <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
          Pull live submarket fundamentals, demographics, recent comps, and news from the web. Cached for 7 days.
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
          Hitting Perplexity for submarket, demographics, comps, and news. ~20-40 seconds.
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
            Powered by Perplexity sonar-pro
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
