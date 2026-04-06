"use client";

import { useEffect, useState, useRef } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getWorkspaceProperties, getProjectDocuments, deleteProperty } from "@/lib/workspace/firestore";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { collection, query, where, getDocs, writeBatch, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Property, ProjectDocument } from "@/lib/workspace/types";
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
    const collections = [
      "workspace_properties", "workspace_projects", "workspace_documents",
      "workspace_extracted_fields", "workspace_underwriting_models",
      "workspace_underwriting_outputs", "workspace_scores",
      "workspace_property_snapshots", "workspace_outputs", "workspace_notes",
      "workspace_tasks", "workspace_activity_logs", "workspace_parser_runs",
    ];
    try {
      const propSnap = await getDocs(query(collection(db, "workspace_properties"), where("workspaceId", "==", workspaceId)));
      const allUserSnap = await getDocs(query(collection(db, "workspace_properties"), where("userId", "==", "admin-user")));
      const unmigratedDocs = allUserSnap.docs.filter(d => !d.data().workspaceId);
      const allDocs = [...propSnap.docs, ...unmigratedDocs];
      const seenIds = new Set<string>();
      const dedupedDocs = allDocs.filter(d => { if (seenIds.has(d.id)) return false; seenIds.add(d.id); return true; });
      const propIds = dedupedDocs.map(d => d.id);
      const projectIds = dedupedDocs.map(d => d.data().projectId).filter(Boolean);

      for (let i = 0; i < dedupedDocs.length; i += 450) {
        const batch = writeBatch(db);
        dedupedDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      for (const coll of collections.filter(c => c !== "workspace_properties")) {
        try {
          for (const pid of propIds) {
            const snap = await getDocs(query(collection(db, coll), where("propertyId", "==", pid)));
            for (let i = 0; i < snap.docs.length; i += 450) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
          for (const pid of projectIds) {
            const snap = await getDocs(query(collection(db, coll), where("projectId", "==", pid)));
            for (let i = 0; i < snap.docs.length; i += 450) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
        } catch { /* continue */ }
      }
    } catch { /* continue */ }
    setClearing(false);
    onClear();
  }
  return (
    <button onClick={handleClear} disabled={clearing} style={{
      padding: "6px 14px", background: "rgba(185, 23, 47, 0.08)", color: "#b9172f", border: "1px solid #b9172f",
      borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: clearing ? "not-allowed" : "pointer", fontFamily: "inherit",
    }}>
      {clearing ? "Clearing..." : "Clear All Data"}
    </button>
  );
}

/* ========== Property Card ========== */
function PropertyCard({ property, docCount }: { property: Property; docCount: number }) {
  const router = useRouter();
  const status = (property as any).parseStatus || "pending";
  const score = (property as any).scoreTotal;
  const scoreBand = (property as any).scoreBand;
  const heroUrl = (property as any).heroImageUrl;
  const location = [property.city, property.state].filter(Boolean).join(", ");
  const displayName = cleanDisplayName(property.propertyName, property.address1, property.city, property.state);

  const bandColors: Record<string, { bg: string; text: string; label: string }> = {
    strong_buy: { bg: "#D1FAE5", text: "#059669", label: "Strong Buy" },
    buy: { bg: "#D1FAE5", text: "#0A7E5A", label: "Buy" },
    hold: { bg: "#FEF3C7", text: "#D97706", label: "Neutral" },
    pass: { bg: "#FDE8EA", text: "#DC2626", label: "Pass" },
    strong_reject: { bg: "#FDE8EA", text: "#991B1B", label: "Strong Reject" },
  };
  const band = bandColors[scoreBand] || null;

  return (
    <div
      onClick={() => router.push(`/workspace/properties/${property.id}`)}
      style={{
        background: "#fff", borderRadius: 12, border: "1px solid rgba(227, 190, 189, 0.15)",
        overflow: "hidden", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.transform = "none"; }}
    >
      {/* Hero / Thumbnail */}
      <div style={{
        height: 140, background: "linear-gradient(135deg, #1a2744, #151b2b)",
        overflow: "hidden", position: "relative",
      }}>
        {heroUrl ? (
          <img src={heroUrl} alt={displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 32 }}>📍</span>
          </div>
        )}
        {/* Status badge */}
        <span style={{
          position: "absolute", top: 8, left: 8,
          padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
          color: status === "parsed" ? "#0A7E5A" : "#92400E",
          background: status === "parsed" ? "rgba(209,250,229,0.9)" : "rgba(254,243,199,0.9)",
          backdropFilter: "blur(4px)",
        }}>
          {status === "parsed" ? "Analyzed" : "Pending"}
        </span>
        {/* Score badge */}
        {score != null && (
          <span style={{
            position: "absolute", top: 8, right: 8,
            padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 800,
            color: "#fff", background: "rgba(11,17,32,0.75)", backdropFilter: "blur(4px)",
          }}>
            {Math.round(score)}/100
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#151b2b", lineHeight: 1.3, fontFamily: "'Playfair Display', Georgia, serif" }}>
          {displayName}
        </div>
        {location && (
          <div style={{ fontSize: 12, color: "#585e70" }}>{location}</div>
        )}
        <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#585e70" }}>
            {docCount} file{docCount !== 1 ? "s" : ""}
          </span>
          {band && (
            <span style={{
              padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700,
              color: band.text, background: band.bg,
            }}>
              {band.label}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <div style={{ padding: "0 16px 10px", display: "flex", justifyContent: "flex-end" }}>
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
              // Remove card visually before reload
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
          style={{ background: "none", border: "none", color: "#C5CBD6", cursor: "pointer", fontSize: 11, padding: "2px 6px", transition: "opacity 0.2s" }}
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
          fontSize: 22, fontWeight: 700, color: "#151b2b", background: "#f2f3ff",
          border: "1px solid rgba(227, 190, 189, 0.15)", borderRadius: 8, padding: "2px 10px",
          margin: 0, lineHeight: 1.2, outline: "none",
          fontFamily: "'Playfair Display', Georgia, serif", minWidth: 200,
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setEditing(true)}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#151b2b", margin: 0, fontFamily: "'Playfair Display', Georgia, serif" }}>
        {name}
      </h1>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#585e70" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </div>
  );
}

/* ========== Main Dashboard ========== */
export default function WorkspaceDashboard() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !activeWorkspace) return;
    setLoading(true);
    getWorkspaceProperties(user.uid, activeWorkspace.id).then(async (props) => {
      setProperties(props);
      const counts: Record<string, number> = {};
      for (const prop of props) {
        try {
          const docs = await getProjectDocuments(prop.projectId, prop.id);
          counts[prop.id] = docs.length;
        } catch {
          counts[prop.id] = 0;
        }
      }
      setDocCounts(counts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, activeWorkspace]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#585e70" }}>Loading dashboard...</div>;
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <EditableWorkspaceTitle
              name={activeWorkspace?.name || "DealBoard"}
              workspaceId={activeWorkspace?.id || ""}
            />
            {activeWorkspace?.analysisType && (
              <span style={{
                display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4,
                background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType]}15`,
                color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType],
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
              }}>
                {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType]}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#585e70", marginTop: 2 }}>
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href={`/workspace/share?ws=${activeWorkspace?.slug || "default-dealboard"}`} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8,
            background: "rgba(185,23,47,0.06)", color: "#b9172f",
            fontSize: 12, fontWeight: 600, textDecoration: "none",
            border: "1px solid rgba(185,23,47,0.12)",
            transition: "all 0.15s",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            Share DealBoard
          </Link>
          <Link href="/workspace/upload" style={{
            padding: "8px 18px", background: "linear-gradient(135deg, #b9172f, #dc3545)", border: "none", borderRadius: 6,
            fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none",
          }}>
            + Add Property
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
            background: "#fff", borderRadius: 6, border: "2px dashed #D8DFE9",
            padding: "48px 20px", textAlign: "center", cursor: "pointer",
            boxShadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
            transition: "all 0.2s",
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "rgba(185, 23, 47, 0.08)",
            display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b9172f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#151b2b", margin: "0 0 6px", fontFamily: "'Inter', sans-serif" }}>
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
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16, marginBottom: 24,
        }}>
          {properties.map(p => (
            <PropertyCard key={p.id} property={p} docCount={docCounts[p.id] || 0} />
          ))}
        </div>
      )}

      {/* Danger Zone — collapsed */}
      {properties.length > 0 && (
        <div style={{
          background: "#fff", borderRadius: 10, border: "1px solid rgba(227, 190, 189, 0.15)",
          padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#b9172f" }}>Clear DealBoard</span>
            <span style={{ fontSize: 11, color: "#585e70", marginLeft: 8 }}>Delete all properties in &ldquo;{activeWorkspace?.name}&rdquo;</span>
          </div>
          <ClearAllButton onClear={() => window.location.reload()} workspaceId={activeWorkspace?.id || ""} workspaceName={activeWorkspace?.name || "this DealBoard"} />
        </div>
      )}
    </div>
  );
}
