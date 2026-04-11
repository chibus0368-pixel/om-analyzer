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

  return (
    <div
      data-property-card
      onClick={() => router.push(`/workspace/properties/${property.id}`)}
      style={{
        background: "#FFFFFF", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
        overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s",
        display: "flex", flexDirection: "column",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 25px rgba(0,0,0,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
    >
      {/* Hero Image - 192px height */}
      <div style={{
        height: 192, background: "linear-gradient(135deg, #F3F4F6, #E5E7EB)",
        overflow: "hidden", position: "relative",
      }}>
        {heroUrl ? (
          <img src={heroUrl} alt={displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 56, opacity: 0.3 }}>📍</span>
          </div>
        )}

        {/* Top-left: status badge */}
        <span style={{
          position: "absolute", top: 12, left: 12,
          padding: "2.5px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          color: "#FFFFFF",
          background: isProcessing ? "rgba(37,99,235,0.85)" : isAnalyzed ? "rgba(132,204,22,0.9)" : "rgba(156,163,175,0.8)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 5,
          backdropFilter: "blur(4px)",
        }}>
          {isProcessing && (
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
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

        {/* Top-right: Score badge */}
        {score != null && (
          <span style={{
            position: "absolute", top: 12, right: 12,
            padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            color: "#FFFFFF", background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
          }}>
            {Math.round(score)}/100
          </span>
        )}
      </div>

      {/* Content Area - 20px padding, space-y 16px */}
      <div style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Property name - truncated, turns lime on hover */}
        <div
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#84CC16"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#111827"; }}
          style={{
            fontSize: 16, fontWeight: 700, color: "#111827",
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "color 0.2s",
            cursor: "pointer",
          }}>
          {displayName}
        </div>

        {/* City/State */}
        {location && (
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: -12 }}>
            {location}
          </div>
        )}

        {/* Bottom row - files count (left) and score band badge (right) */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 8,
          marginTop: "auto",
        }}>
          {/* Files count */}
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>
            📎 {docCount} file{docCount !== 1 ? "s" : ""}
          </span>

          {/* Score band badge */}
          {band && (
            <span style={{
              padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
              color: band.text, background: band.bg,
              border: `1px solid ${band.text}20`,
            }}>
              {band.label}
            </span>
          )}
        </div>
      </div>

      {/* Action row - border-top */}
      <div style={{
        borderTop: "1px solid rgba(0,0,0,0.05)",
        padding: "8px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        {/* Duplicate button */}
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
              fontSize: 10, fontWeight: 700, padding: 0, letterSpacing: "0.05em",
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

        {/* Delete button */}
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
            fontSize: 10, fontWeight: 700, padding: 0, letterSpacing: "0.05em",
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
    <div style={{ width: "100%", padding: "0 24px" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {/* Header Section - New Design */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 32,
        paddingTop: 20,
      }}>
        {/* Left side: Heading + Badge + Count */}
        <div>
          {/* Workspace name + Edit icon + Type badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{
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
              <span style={{
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
          <p style={{
            fontSize: 14,
            color: "#9CA3AF",
            margin: 0,
            fontWeight: 500,
          }}>
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>

        {/* Right side: Add Property button */}
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
        <div style={{
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
        <div style={{
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
