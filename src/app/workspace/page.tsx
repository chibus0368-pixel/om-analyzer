"use client";
// Deployment marker: 2026-04-21 — force Vercel rebuild after inline-rename fix.

import { useEffect, useState, useRef, useCallback } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, deleteProperty, updateProperty } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property, ProjectDocument, Workspace } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { AnalysisTypeIcon } from "@/lib/workspace/AnalysisTypeIcon";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import PropertyHeroImage from "@/components/workspace/PropertyHeroImage";
import { setPendingUploadFiles } from "@/lib/workspace/upload-handoff";
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
      padding: "6px 14px", background: "rgba(132, 204, 22, 0.1)", color: "#4D7C0F", border: "1px solid #4D7C0F",
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
    // Canonical brand lime (#4D7C0F) as the single "good" green for pills,
    // dark lime (#4D7C0F) text so labels stay readable on the pale bg.
    strong_buy: { bg: "#F7FEE7", text: "#4D7C0F", label: "Strong Buy" },
    buy: { bg: "#F7FEE7", text: "#4D7C0F", label: "Buy" },
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
        router.push(`/workspace?ws=${encodeURIComponent(targetWs.slug)}`);
      } else {
        // Trigger a re-fetch instead of full page reload
        window.dispatchEvent(new Event("workspace-properties-changed"));
      }
    } catch (err) {
      console.error("[duplicate] Failed:", err);
    }
    setDuplicating(false);
  }

  // Score color: drive off the Signal Band so the dealboard matches the
  // property detail page (a 73 scored "Buy" shows green on the detail page,
  // so it must show green here too). Fall back to numeric thresholds only
  // when a band isn't set yet (e.g. still parsing).
  const bandNorm = (scoreBand || "").toLowerCase().replace(/_/g, " ");
  const bandIsGreen = bandNorm === "strong buy" || bandNorm === "buy";
  const bandIsYellow = bandNorm === "hold" || bandNorm === "neutral";
  const bandIsRed = bandNorm === "pass" || bandNorm === "strong reject";
  const scoreColor = bandIsGreen
    ? "#4D7C0F"
    : bandIsYellow
      ? "#D97706"
      : bandIsRed
        ? "#DC2626"
        : score != null
          ? score >= 75 ? "#4D7C0F" : score >= 50 ? "#D97706" : "#DC2626"
          : "#9CA3AF";
  const scoreBg = bandIsGreen
    ? "rgba(132,204,22,0.12)"
    : bandIsYellow
      ? "rgba(217,119,6,0.08)"
      : bandIsRed
        ? "rgba(220,38,38,0.08)"
        : score != null
          ? score >= 75 ? "rgba(132,204,22,0.12)" : score >= 50 ? "rgba(217,119,6,0.08)" : "rgba(220,38,38,0.08)"
          : "rgba(156,163,175,0.06)";

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
      {/* Hero Image - compact */}
      <div className="db-card-hero" style={{
        height: 160, background: "linear-gradient(135deg, #F3F4F6, #E5E7EB)",
        overflow: "hidden", position: "relative",
      }}>
        <PropertyHeroImage
          heroImageUrl={heroUrl}
          address={[property.address1, property.city, property.state].filter(Boolean).join(", ")}
          location={location}
          propertyName={displayName}
          persistPropertyId={property.id}
          style={{ objectPosition: "center" }}
        />


        {/* Status badge - top-left */}
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

        {/* Score circle - top-right, prominent */}
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
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#4D7C0F"; }}
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

        {/* Metrics - horizontal pills */}
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
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
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
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#4D7C0F"; }}
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
              // Fire event so parent dashboard (and layout) refetch properties.
              // NOTE: Do NOT call window.location.reload() here — if the user is
              // deleting multiple properties in quick succession, the reload from
              // the first-completed delete will abort any in-flight requests for
              // the others, leaving them un-deleted. The event-driven refetch in
              // the dashboard handles the UI refresh safely without interrupting
              // concurrent deletes.
              window.dispatchEvent(new Event("workspace-properties-changed"));
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

/* ========== Empty Dealboard Drop Zone ==========
   Real file picker + drop zone. Selected files are stashed in the
   upload-handoff module and the user is navigated to /workspace/upload,
   which consumes them on mount. Previously this was a stub that just
   redirected without capturing the file, which made the Select File
   button feel broken. */
function EmptyDealboardDropZone({ onFiles }: { onFiles: (files: FileList) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setHover(true); }}
      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setHover(false); }}
      onDrop={e => {
        e.preventDefault(); e.stopPropagation(); setHover(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
      style={{
        background: "#FFFFFF", borderRadius: 6,
        border: `2px dashed ${hover ? "#4D7C0F" : "#D8DFE9"}`,
        padding: "48px 20px", textAlign: "center", cursor: "pointer",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)", transition: "all 0.2s",
      }}
    >
      <input
        ref={inputRef} type="file" multiple
        accept=".pdf,.xls,.xlsx,.csv,.doc,.docx"
        style={{ display: "none" }}
        onChange={e => {
          console.log("[dropzone] onChange fired, files:", e.target.files?.length);
          if (e.target.files?.length) onFiles(e.target.files);
        }}
      />
      <div style={{
        width: 56, height: 56, borderRadius: "50%", background: "rgba(132, 204, 22, 0.1)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
        </svg>
      </div>
      <p style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>
        Drop your OM or flyer here
      </p>
      <p style={{ fontSize: 13, color: "#585e70", margin: "0 0 16px" }}>
        PDF, Excel, or CSV accepted (Max 50MB)
      </p>
      <button onClick={e => { e.stopPropagation(); inputRef.current?.click(); }} style={{
        padding: "12px 32px", background: "#151b2b", color: "#fff", border: "none",
        borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
      }}>
        Select File from Local
      </button>
    </div>
  );
}

/* ========== Main Dashboard ========== */
// NOTE: Inline-rename for the DealBoard title lives inside WorkspaceDashboard
// itself (state: editingTitle/titleDraft). It calls renameWorkspace() from
// WorkspaceContext so the cached workspace list updates without a full reload.
export default function WorkspaceDashboard() {
  const { user } = useAuth();
  const { activeWorkspace, workspaces, renameWorkspace } = useWorkspace();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  // Inline rename state for the DealBoard title. The pencil icon next to the
  // name toggles `editingTitle`; while editing we render an input that writes
  // through WorkspaceContext.renameWorkspace on Enter/blur.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);
  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (!activeWorkspace) { setEditingTitle(false); return; }
    if (!trimmed || trimmed === activeWorkspace.name) {
      setEditingTitle(false);
      return;
    }
    renameWorkspace(activeWorkspace.id, trimmed);
    setEditingTitle(false);
  }, [titleDraft, activeWorkspace, renameWorkspace]);
  // `loading` gates only the property grid area, not the whole page. The
  // dashboard shell (header, nav, empty state) renders immediately so the
  // user sees something within a frame instead of a blank "Loading..." page.
  const [loading, setLoading] = useState(true);
  // Page-level drag state so the dealboard accepts files dropped anywhere on
  // screen (mirrors the Try-Me landing-page behavior). dragCounter avoids the
  // flicker you get when dragenter/dragleave fire on child elements.
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragCounter = useRef(0);
  const handleGlobalFiles = useCallback((fl: FileList | null | undefined) => {
    if (!fl || !fl.length) return;
    setPendingUploadFiles(fl);
    router.push("/workspace/upload");
  }, [router]);

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    setLoading(true);
    getWorkspaceProperties(user.uid, activeWorkspace.id).then((props) => {
      setProperties(props);

      // Document counts now come inline from /api/workspace/properties
      // in a single batched admin-side query - no more N+1 round-trips.
      const counts: Record<string, number> = {};
      for (const p of props as any[]) {
        counts[p.id] = typeof p.documentCount === "number" ? p.documentCount : 0;
      }
      setDocCounts(counts);

      // Unblock the UI immediately - everything below is background cleanup.
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
    // Depend on the stable workspace id, not the object reference - otherwise
    // any parent re-render that produces a new activeWorkspace object would
    // re-trigger the loading state and re-fetch properties unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id]);

  // Refetch properties when something fires the "workspace-properties-changed"
  // event (e.g. a per-card delete completes). Avoids window.location.reload(),
  // which would abort any other in-flight deletes and leave them un-deleted.
  useEffect(() => {
    if (!user || !activeWorkspace) return;
    const refetch = async () => {
      try {
        const props = await getWorkspaceProperties(user.uid, activeWorkspace.id);
        setProperties(props);
        const counts: Record<string, number> = {};
        for (const p of props as any[]) {
          counts[p.id] = typeof p.documentCount === "number" ? p.documentCount : 0;
        }
        setDocCounts(counts);
      } catch { /* ignore */ }
    };
    window.addEventListener("workspace-properties-changed", refetch);
    return () => window.removeEventListener("workspace-properties-changed", refetch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id]);

  // Deliberately do NOT early-return on `loading`. The dashboard shell
  // (header, actions, counts) renders immediately; the property grid shows
  // a light skeleton while the API is in flight. This keeps perceived load
  // under a single frame even on cold Vercel containers.

  return (
    <div className="db-page" style={{ width: "100%", padding: "0 24px" }}
      onDragEnter={e => { e.preventDefault(); dragCounter.current++; setGlobalDragging(true); }}
      onDragOver={e => { e.preventDefault(); }}
      onDragLeave={e => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setGlobalDragging(false); } }}
      onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); handleGlobalFiles(e.dataTransfer.files); }}
    >
      {globalDragging && (
        <div
          onDragOver={e => e.preventDefault()}
          onDragLeave={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); }}
          onDrop={e => { e.preventDefault(); dragCounter.current = 0; setGlobalDragging(false); handleGlobalFiles(e.dataTransfer.files); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(13,13,20,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            padding: "48px 64px", borderRadius: 20,
            border: "2px dashed #4D7C0F", background: "rgba(132,204,22,0.05)",
            textAlign: "center",
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4D7C0F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", marginBottom: 6 }}>Drop your file anywhere</div>
            <div style={{ fontSize: 14, color: "#9ca3af" }}>PDF, Excel, or CSV. We&apos;ll start the analysis.</div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .db-card-hero { transition: none; }
        @media (max-width: 768px) {
          .db-page { padding: 0 !important; }
          .db-header { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; padding: 10px 16px 0 !important; margin-bottom: 12px !important; }
          .db-title-row { flex-wrap: wrap !important; gap: 8px !important; }
          .db-title { font-size: 22px !important; }
          .db-type-badge { font-size: 9px !important; padding: 3px 8px !important; }
          .db-edit-btn { display: none !important; }
          .db-count { font-size: 12px !important; }
          .db-actions { flex-direction: row !important; gap: 8px !important; }
          .db-actions a, .db-actions button { font-size: 10px !important; padding: 10px 10px !important; flex: 1 !important; text-align: center !important; justify-content: center !important; box-sizing: border-box !important; }
          /* Cards - full width, no border-radius, edge-to-edge */
          .db-grid { grid-template-columns: 1fr !important; gap: 10px !important; padding: 0 !important; }
          .db-card { border-radius: 14px !important; margin: 0 12px !important; }
          .db-card-hero { height: 180px !important; }
          .db-card-content { padding: 14px 16px !important; gap: 8px !important; }
          .db-card-name { font-size: 16px !important; }
          .db-card-metrics { gap: 5px !important; }
          .db-card-footer { padding: 6px 16px !important; }
          .db-clear-bar { flex-direction: column !important; gap: 8px !important; align-items: stretch !important; text-align: center !important; padding: 10px 16px !important; margin: 0 12px !important; }
        }
        @media (max-width: 480px) {
          .db-title { font-size: 20px !important; }
          .db-card-hero { height: 160px !important; }
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
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="db-title"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                  if (e.key === "Escape") { e.preventDefault(); setEditingTitle(false); }
                }}
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: "#111827",
                  background: "#F9FAFB",
                  border: "2px solid #4D7C0F",
                  borderRadius: 8,
                  padding: "4px 12px",
                  margin: 0,
                  lineHeight: 1.2,
                  outline: "none",
                  fontFamily: "inherit",
                  minWidth: 280,
                }}
              />
            ) : (
              <h1
                className="db-title"
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.2,
                  cursor: activeWorkspace ? "pointer" : "default",
                }}
                onDoubleClick={() => {
                  if (!activeWorkspace) return;
                  setTitleDraft(activeWorkspace.name);
                  setEditingTitle(true);
                }}
                title={activeWorkspace ? "Double-click to rename" : undefined}
              >
                {activeWorkspace?.name || "Default Dealboard"}
              </h1>
            )}

            {/* Edit icon button — opens inline rename. Disabled while editing
                so the click can't fight the input's focus/blur lifecycle. */}
            {!editingTitle && (
              <button
                className="db-edit-btn"
                onClick={() => {
                  if (!activeWorkspace) return;
                  setTitleDraft(activeWorkspace.name);
                  setEditingTitle(true);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: activeWorkspace ? "pointer" : "default",
                  padding: "4px 8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#9CA3AF",
                  transition: "color 0.2s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#4D7C0F"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; }}
                title="Rename dealboard"
                aria-label="Rename dealboard"
                disabled={!activeWorkspace}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}

            {/* Analysis type badge */}
            {activeWorkspace?.analysisType && (() => {
              const atColor = ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType] || "#6B7280";
              return (
                <span className="db-type-badge" style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6,
                  background: `${atColor}15`, color: atColor,
                  fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  <AnalysisTypeIcon type={activeWorkspace.analysisType} size={13} color={atColor} />
                  {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
                </span>
              );
            })()}
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
            background: "#0F172A",
            border: "none",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 900,
            color: "#ffffff",
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
              el.style.background = "#4D7C0F";
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
      {loading && properties.length === 0 ? (
        <div className="db-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 24,
          marginBottom: 24,
        }}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{
              height: 280, borderRadius: 12, background: "#F2F3FB",
              border: "1px solid #E5E7EB",
              animation: "pulse 1.4s ease-in-out infinite",
            }} />
          ))}
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }`}</style>
        </div>
      ) : properties.length === 0 ? (
        <EmptyDealboardDropZone onFiles={(fl) => {
          console.log("[dealboard] onFiles called with", fl.length, "file(s); pushing to /workspace/upload");
          setPendingUploadFiles(fl);
          router.push("/workspace/upload");
        }} />
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

      {/* Danger Zone - collapsed */}
      {properties.length > 0 && (
        <div className="db-clear-bar" style={{
          background: "#FFFFFF", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)",
          padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4D7C0F" }}>Clear DealBoard</span>
            <span style={{ fontSize: 11, color: "#585e70", marginLeft: 8 }}>Delete all properties in &ldquo;{activeWorkspace?.name}&rdquo;</span>
          </div>
          <ClearAllButton onClear={() => window.location.reload()} workspaceId={activeWorkspace?.id || ""} workspaceName={activeWorkspace?.name || "this DealBoard"} />
        </div>
      )}
    </div>
  );
}
