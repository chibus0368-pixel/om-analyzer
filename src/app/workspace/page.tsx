"use client";

import { useEffect, useState, useRef } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, deleteProperty, updateProperty } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Property, ProjectDocument, Workspace } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import Link from "next/link";
import { useRouter } from "next/navigation";

function ClearAllButton({ onClear, workspaceId, workspaceName }: { onClear: () => void; workspaceId: string; workspaceName: string }) {
  const [clearing, setClearing] = useState(false);
  async function handleClear() {
    if (!confirm(`⚠️ This will delete all properties and data in "${workspaceName}".\n\nThis cannot be undone. Continue?`)) return;
    if (!confirm(`Final confirmation: Delete all properties in "${workspaceName}"?`)) return;
    setClearing(true);
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/workspace/clear", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Clear failed (${res.status})`);
      }
      const result = await res.json();
      console.log(`[ClearAll] Cleared ${result.properties} properties, ${result.deleted} total documents`);
    } catch (err: any) {
      console.error("[ClearAll] Error:", err?.message || err);
      alert("Failed to clear data. Please try again.");
    }
    setClearing(false);
    onClear();
  }
  return (
    <button onClick={handleClear} disabled={clearing} style={{
      padding: "6px 14px", background: "rgba(132, 204, 22, 0.1)", color: "#84CC16", border: "1px solid #84CC16",
      borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: clearing ? "not-allowed" : "pointer", fontFamily: "inherit",
    }}>
      {clearing ? "Clearing..." : "Clear All Data"}
    </button>
  );
}

/* ========== Property Card ========== */
function PropertyCard({ property, docCount, workspaces, activeWorkspaceId }: { property: Property; docCount: number; workspaces: Workspace[]; activeWorkspaceId: string }) {
  const router = useRouter();
  const [showDupMenu, setShowDupMenu] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const dupRef = useRef<HTMLDivElement>(null);
  const parseStatus = (property as any).parseStatus || "pending";
  const processingStatus = (property as any).processingStatus || "";
  const isProcessing = processingStatus && processingStatus !== "complete";
  const isAnalyzed = parseStatus === "parsed" || (!isProcessing && processingStatus === "complete");
  const score = (property as any).scoreTotal;
  const scoreBand = (property as any).scoreBand;
  const heroUrl = (property as any).heroImageUrl;
  const location = [property.city, property.state].filter(Boolean).join(", ");
  const displayName = cleanDisplayName(property.propertyName, property.address1, property.city, property.state);

  // Card-level summary metrics (saved at parse time)
  const cardPrice = property.cardAskingPrice;
  const cardCapRate = property.cardCapRate;
  const cardNoi = property.cardNoi;
  const cardSf = property.cardBuildingSf || property.buildingSf;
  const cardAcres = property.cardTotalAcres;
  const isLandType = property.analysisType === "land";

  const fmtPrice = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };
  const fmtSf = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K SF` : `${v.toLocaleString()} SF`;
  const fmtNoi = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 100_000 === 0 ? 0 : 1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };

  const cardMetrics: { label: string; value: string; icon: string }[] = [];
  if (cardPrice) cardMetrics.push({ label: "Asking Price", value: fmtPrice(cardPrice), icon: "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" });
  if (cardCapRate) cardMetrics.push({ label: "Cap Rate", value: `${Number(cardCapRate).toFixed(2)}%`, icon: "M22 12h-4l-3 9L9 3l-3 9H2" });
  if (cardNoi) cardMetrics.push({ label: "NOI", value: fmtNoi(cardNoi), icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" });
  if (isLandType && cardAcres) {
    cardMetrics.push({ label: "Acreage", value: `${Number(cardAcres).toFixed(1)} AC`, icon: "M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11" });
  } else if (cardSf) {
    cardMetrics.push({ label: "Building SF", value: fmtSf(cardSf), icon: "M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11" });
  }

  const bandColors: Record<string, { bg: string; text: string; label: string }> = {
    strong_buy: { bg: "#F0FDF4", text: "#059669", label: "Strong Buy" },
    buy: { bg: "#F0FDF4", text: "#059669", label: "Buy" },
    hold: { bg: "#FFFBEB", text: "#D97706", label: "Neutral" },
    pass: { bg: "#FEF2F2", text: "#EF4444", label: "Pass" },
    strong_reject: { bg: "#FEF2F2", text: "#EF4444", label: "Strong Reject" },
  };
  const band = bandColors[scoreBand] || null;

  // Close duplicate menu on outside click
  useEffect(() => {
    if (!showDupMenu) return;
    function handleClick(e: MouseEvent) {
      if (dupRef.current && !dupRef.current.contains(e.target as Node)) setShowDupMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDupMenu]);

  async function handleDuplicate(targetWorkspaceId: string) {
    setDuplicating(true);
    setShowDupMenu(false);
    try {
      // Use server-side API for reliable duplication (Admin SDK bypasses rules)
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");
      const token = await currentUser.getIdToken();

      const res = await fetch("/api/workspace/duplicate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: property.id, targetWorkspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Duplicate failed");

      console.log("[duplicate] Success:", data.newPropertyId, "copied", data.copied, "related docs");

      window.dispatchEvent(new Event("workspace-properties-changed"));
      // Navigate to the target workspace to show the duplicated property
      const targetWs = workspaces.find(w => w.id === targetWorkspaceId);
      if (targetWs && targetWs.id !== activeWorkspaceId) {
        window.location.href = `/workspace?ws=${encodeURIComponent(targetWs.slug)}`;
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error("[duplicate] Failed:", err);
    }
    setDuplicating(false);
  }

  // Score color by value
  const scoreColor = score != null ? (score >= 75 ? "#059669" : score >= 50 ? "#D97706" : "#EF4444") : "#9CA3AF";
  const scoreBg = score != null ? (score >= 75 ? "rgba(5,150,105,0.08)" : score >= 50 ? "rgba(217,119,6,0.08)" : "rgba(239,68,68,0.08)") : "rgba(156,163,175,0.06)";

  return (
    <div
      data-property-card
      onClick={() => router.push(`/workspace/properties/${property.id}`)}
      className="db-card"
      style={{
        background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)",
        overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.2s, transform 0.2s",
        display: "flex", flexDirection: "column",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
    >
      {/* Hero Image — compact */}
      <div className="db-card-hero" style={{
        height: 160, background: "linear-gradient(135deg, #F3F4F6, #E5E7EB)",
        overflow: "hidden", position: "relative",
      }}>
        {heroUrl ? (
          <img src={heroUrl} alt={displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 48, opacity: 0.25 }}>📍</span>
          </div>
        )}

        {/* Status badge — top-left */}
        <span style={{
          position: "absolute", top: 10, left: 10,
          padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
          color: "#FFFFFF",
          background: isProcessing ? "rgba(37,99,235,0.85)" : isAnalyzed ? "rgba(132,204,22,0.9)" : "rgba(156,163,175,0.8)",
          letterSpacing: "0.05em", textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 4,
          backdropFilter: "blur(4px)",
        }}>
          {isProcessing && (
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
              animation: "spin 0.8s linear infinite",
            }} />
          )}
          {isProcessing ? (
            processingStatus === "parsing" ? "Parsing" :
            processingStatus === "generating" ? "Generating" :
            processingStatus === "scoring" ? "Scoring" : "Processing"
          ) : isAnalyzed ? "Analyzed" : "Pending"}
        </span>

        {/* Score circle — top-right, prominent */}
        {score != null && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            border: `2px solid ${scoreColor}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>{Math.round(score)}</span>
            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.6)", fontWeight: 600, lineHeight: 1 }}>/100</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="db-card-content" style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Name + location */}
        <div>
          <div
            className="db-card-name"
            style={{
              fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.25,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#84CC16"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#111827"; }}
          >
            {displayName}
          </div>
          {location && (
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{location}</div>
          )}
        </div>

        {/* Score band + files row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {band && (
            <span style={{
              padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
              color: band.text, background: band.bg,
              border: `1px solid ${band.text}22`,
            }}>
              {band.label}
            </span>
          )}
          <span style={{ fontSize: 10, color: "#C4C9D4", fontWeight: 500 }}>
            {docCount} file{docCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Metrics — horizontal pills */}
        {cardMetrics.length > 0 && (
          <div className="db-card-metrics" style={{
            display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2,
          }}>
            {cardMetrics.map(m => (
              <div key={m.label} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 8px", borderRadius: 6,
                background: "#F8FAFC", border: "1px solid rgba(0,0,0,0.04)",
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
                <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, lineHeight: 1 }}>{m.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#111827", lineHeight: 1 }}>{m.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="db-card-footer" style={{
        borderTop: "1px solid rgba(0,0,0,0.04)", padding: "6px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div ref={dupRef} style={{ position: "relative" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (workspaces.length <= 1) {
                handleDuplicate(activeWorkspaceId);
              } else {
                setShowDupMenu(!showDupMenu);
              }
            }}
            disabled={duplicating}
            style={{
              background: "none", border: "none", color: "#D1D5DB", cursor: "pointer",
              fontSize: 10, fontWeight: 700, padding: "4px 0", letterSpacing: "0.05em",
              textTransform: "uppercase", transition: "color 0.2s",
              opacity: duplicating ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#84CC16"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#D1D5DB"; }}
            title="Duplicate to dealboard"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            {duplicating ? "Duplicating..." : "Duplicate"}
          </button>
          {showDupMenu && workspaces.length > 1 && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: "absolute", bottom: "100%", left: 0, marginBottom: 4,
                background: "#fff", border: "1px solid #E5E7EB", borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)", minWidth: 180, zIndex: 50,
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Duplicate to…
              </div>
              {workspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={(e) => { e.stopPropagation(); handleDuplicate(ws.id); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                    background: ws.id === activeWorkspaceId ? "#F3F4F6" : "transparent",
                    border: "none", cursor: "pointer", fontSize: 12, color: "#374151",
                    fontWeight: ws.id === activeWorkspaceId ? 600 : 400, transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F9FAFB"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ws.id === activeWorkspaceId ? "#F3F4F6" : "transparent"; }}
                >
                  {ws.name}{ws.id === activeWorkspaceId ? " (current)" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete "${property.propertyName}"? This cannot be undone.`)) return;
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = "Deleting...";
            btn.style.opacity = "0.5";
            try {
              await deleteProperty(property.id, property.projectId || "workspace-default");
              const card = btn.closest("[data-property-card]") as HTMLElement;
              if (card) { card.style.opacity = "0"; card.style.transform = "scale(0.95)"; card.style.transition = "all 0.3s ease"; }
              window.dispatchEvent(new Event("workspace-properties-changed"));
              setTimeout(() => window.location.reload(), 300);
            } catch (err) {
              console.error("[delete] Failed:", err);
              btn.disabled = false;
              btn.textContent = "Delete";
              btn.style.opacity = "1";
              alert("Failed to delete. Please try again.");
            }
          }}
          style={{
            background: "none", border: "none", color: "#D1D5DB", cursor: "pointer",
            fontSize: 10, fontWeight: 700, padding: "4px 0", letterSpacing: "0.05em",
            textTransform: "uppercase", transition: "color 0.2s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#D1D5DB"; }}
          title="Delete property"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/* ========== Upload Drop Zone ========== */
/* ========== Editable Workspace Title ========== */
function EditableWorkspaceTitle({ name, workspaceId }: { name: string; workspaceId: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setValue(name); }, [name]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name || !workspaceId) { setEditing(false); setValue(name); return; }
    try {
      await updateDoc(doc(db, "workspaces", workspaceId), { name: trimmed });
      window.location.reload();
    } catch { setValue(name); }
    setEditing(false);
  }

  if (editing) {
    return (
      <input ref={inputRef} value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(name); } }}
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: "#111827",
          background: "#f3f4f6",
          border: "2px solid #84CC16",
          borderRadius: 8,
          padding: "4px 12px",
          margin: 0,
          lineHeight: 1.2,
          outline: "none",
          fontFamily: "inherit",
          minWidth: 300,
        }}
      />
    );
  }

  return (
    <div
      data-editable-title
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
      }}
      onClick={() => setEditing(true)}
      title="Click to edit workspace name"
    />
  );
}

/* ========== Main Dashboard ========== */
export default function WorkspaceDashboard() {
  const { user } = useAuth();
  const { activeWorkspace, workspaces } = useWorkspace();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    setLoading(true);
    getWorkspaceProperties(user.uid, activeWorkspace.id).then((props) => {
      setProperties(props);

      // Document counts now come inline from /api/workspace/properties
      // in a single batched admin-side query — no more N+1 round-trips.
      const counts: Record<string, number> = {};
      for (const p of props as any[]) {
        counts[p.id] = typeof p.documentCount === "number" ? p.documentCount : 0;
      }
      setDocCounts(counts);

      // Unblock the UI immediately — everything below is background cleanup.
      setLoading(false);

      // Auto-repair (fire-and-forget): if any properties came back via
      // fallback (wrong workspaceId), silently update them. Run in parallel
      // and do NOT block the dashboard on these writes.
      const orphaned = props.filter(p => p.workspaceId !== activeWorkspace.id);
      if (orphaned.length > 0 && workspaces.length <= 1) {
        console.log(`[dashboard] Auto-repairing ${orphaned.length} orphaned properties to workspace ${activeWorkspace.id}`);
        Promise.all(
          orphaned.map(p =>
            updateProperty(p.id, { workspaceId: activeWorkspace.id } as any).catch(e => {
              console.warn("[dashboard] Failed to repair property:", p.id, e);
            }),
          ),
        );
      }
    }).catch(() => setLoading(false));
    // Depend on the stable workspace id, not the object reference — otherwise
    // any parent re-render that produces a new activeWorkspace object would
    // re-trigger the loading state and re-fetch properties unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#585e70" }}>Loading dashboard...</div>;
  }

  return (
    <div className="db-page" style={{ width: "100%", padding: "0 24px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .db-card-hero { transition: none; }
        @media (max-width: 768px) {
          .db-page { padding: 0 6px !important; }
          .db-header { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; padding-top: 10px !important; margin-bottom: 12px !important; }
          .db-title-row { flex-wrap: wrap !important; gap: 8px !important; }
          .db-title { font-size: 20px !important; }
          .db-type-badge { font-size: 9px !important; padding: 3px 8px !important; }
          .db-edit-btn { display: none !important; }
          .db-count { font-size: 12px !important; }
          .db-actions { flex-direction: row !important; gap: 8px !important; }
          .db-actions a, .db-actions button { font-size: 10px !important; padding: 10px 10px !important; flex: 1 !important; text-align: center !important; justify-content: center !important; box-sizing: border-box !important; }
          /* Cards — single column, compact */
          .db-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .db-card-hero { height: 140px !important; }
          .db-card-content { padding: 12px 14px !important; gap: 6px !important; }
          .db-card-name { font-size: 14px !important; }
          .db-card-metrics { gap: 4px !important; }
          .db-card-footer { padding: 5px 14px !important; }
          .db-clear-bar { flex-direction: column !important; gap: 8px !important; align-items: stretch !important; text-align: center !important; padding: 10px 14px !important; }
        }
        @media (max-width: 480px) {
          .db-page { padding: 0 2px !important; }
          .db-title { font-size: 18px !important; }
          .db-card-hero { height: 120px !important; }
          .db-card-content { padding: 10px 12px !important; }
          .db-card-name { font-size: 13px !important; }
        }
      `}</style>
      {/* Header Section - New Design */}
      <div className="db-header" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 32,
        paddingTop: 20,
      }}>
        {/* Left side: Heading + Badge + Count */}
        <div>
          {/* Workspace name + Edit icon + Type badge */}
          <div className="db-title-row" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 className="db-title" style={{
              fontSize: 30,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
              lineHeight: 1.2,
            }}>
              {activeWorkspace?.name || "Default Dealboard"}
            </h1>

            {/* Edit icon button */}
            <button
              className="db-edit-btn"
              onClick={() => {
                const titleEl = document.querySelector("[data-editable-title]");
                if (titleEl) (titleEl as HTMLElement).click();
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9CA3AF",
                transition: "color 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#6B7280"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; }}
              title="Edit workspace name"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            {/* Analysis type badge - green for Retail */}
            {activeWorkspace?.analysisType && (
              <span className="db-type-badge" style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "5px 12px",
                borderRadius: 20,
                background: "#f0f9e8",
                color: "#84CC16",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid rgba(132,204,22,0.1)",
              }}>
                {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
              </span>
            )}
          </div>

          {/* Properties count */}
          <p className="db-count" style={{
            fontSize: 14,
            color: "#9CA3AF",
            margin: 0,
            fontWeight: 500,
          }}>
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>

        {/* Right side: Add-from-history + Add Property buttons */}
        <div className="db-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/workspace/upload/history" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            color: "#151b2b",
            textDecoration: "none",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            transition: "all 0.2s",
            cursor: "pointer",
          }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#F9FAFB";
              el.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#FFFFFF";
              el.style.transform = "none";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9" />
              <polyline points="3 4 3 12 11 12" />
            </svg>
            Add from Upload History
          </Link>

          <Link href="/workspace/upload" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 18px",
            background: "#84CC16",
            border: "none",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 900,
            color: "#000000",
            textDecoration: "none",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            transition: "all 0.2s",
            cursor: "pointer",
          }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#7EC616";
              el.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#84CC16";
              el.style.transform = "none";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Property
          </Link>
        </div>
      </div>

      {/* Property Cards Grid */}
      {properties.length === 0 ? (
        <div
          onClick={() => router.push("/workspace/upload")}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); router.push("/workspace/upload"); }}
          style={{
            background: "#FFFFFF", borderRadius: 6, border: "2px dashed #D8DFE9",
            padding: "48px 20px", textAlign: "center", cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            transition: "all 0.2s",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "rgba(132, 204, 22, 0.1)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>
            Drop your OM or flyer here
          </p>
          <p style={{ fontSize: 13, color: "#585e70", margin: "0 0 16px" }}>
            PDF, Excel, or CSV accepted (Max 50MB)
          </p>
          <button onClick={e => { e.stopPropagation(); router.push("/workspace/upload"); }} style={{
            padding: "12px 32px", background: "#151b2b", color: "#fff", border: "none",
            borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
          }}>
            Select File from Local
          </button>
        </div>
      ) : (
        <div className="db-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 24,
          marginBottom: 24,
        }}>
          {properties.map(p => (
            <PropertyCard key={p.id} property={p} docCount={docCounts[p.id] || 0} workspaces={workspaces} activeWorkspaceId={activeWorkspace?.id || ""} />
          ))}
        </div>
      )}

      {/* Danger Zone — collapsed */}
      {properties.length > 0 && (
        <div className="db-clear-bar" style={{
          background: "#FFFFFF", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)",
          padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#84CC16" }}>Clear DealBoard</span>
            <span style={{ fontSize: 11, color: "#585e70", marginLeft: 8 }}>Delete all properties in &ldquo;{activeWorkspace?.name}&rdquo;</span>
          </div>
          <ClearAllButton onClear={() => window.location.reload()} workspaceId={activeWorkspace?.id || ""} workspaceName={activeWorkspace?.name || "this DealBoard"} />
        </div>
      )}
    </div>
  );
}
