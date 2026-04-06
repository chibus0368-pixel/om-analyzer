"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import type { AnalysisType } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_COLORS, ANALYSIS_TYPE_ICONS } from "@/lib/workspace/types";

export default function ManageWorkspacesPage() {
  const router = useRouter();
  const { workspaces, activeWorkspace, switchWorkspace, addWorkspace, renameWorkspace, deleteWorkspace, clearWorkspaceData } = useWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<AnalysisType>("retail");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const startEdit = (ws: { id: string; name: string }) => {
    setEditingId(ws.id);
    setEditName(ws.name);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    renameWorkspace(editingId, editName.trim());
    setEditingId(null);
    setEditName("");
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    await addWorkspace(name, newType);
    setNewName("");
    setNewType("retail");
    setShowAdd(false);
    router.push("/workspace");
  };

  const handleDelete = (id: string) => {
    deleteWorkspace(id);
    setConfirmDeleteId(null);
  };

  const handleClear = async (id: string) => {
    setClearing(true);
    await clearWorkspaceData(id);
    setClearing(false);
    setConfirmClearId(null);
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0B1120" }}>Manage DealBoards</h1>
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
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#5A7091" }}>Add, rename, clear data, or delete DealBoards.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="ws-btn-gold"
          style={{
            padding: "8px 18px", background: "#C49A3C", color: "#fff", border: "none",
            borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + New DealBoard
        </button>
      </div>

      {/* Add workspace form */}
      {showAdd && (
        <div style={{
          background: "#fff", borderRadius: 12, padding: "24px 28px", marginBottom: 16,
          border: "1px solid #E5E9F0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#151b2b", marginBottom: 8 }}>DealBoard Name</label>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setShowAdd(false); setNewType("retail"); } }}
            placeholder="e.g. Q2 Pipeline, Client Portfolio"
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
              border: "1px solid #e2e8f0", outline: "none", fontFamily: "inherit",
              boxSizing: "border-box", marginBottom: 18,
            }}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#151b2b", marginBottom: 10 }}>Deal Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {(["retail", "industrial", "office", "land"] as AnalysisType[]).map(type => (
              <button
                key={type}
                onClick={() => setNewType(type)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  padding: "12px 8px", borderRadius: 10,
                  border: newType === type ? `2px solid ${ANALYSIS_TYPE_COLORS[type]}` : "1px solid #e2e8f0",
                  background: newType === type ? `${ANALYSIS_TYPE_COLORS[type]}10` : "#fff",
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 22 }}>{ANALYSIS_TYPE_ICONS[type]}</span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: newType === type ? ANALYSIS_TYPE_COLORS[type] : "#585e70",
                }}>
                  {ANALYSIS_TYPE_LABELS[type]}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowAdd(false); setNewName(""); setNewType("retail"); }}
              style={{ padding: "9px 16px", background: "transparent", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#585e70", fontFamily: "inherit" }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              style={{
                padding: "9px 22px", background: newName.trim() ? "#b9172f" : "#D8DFE9", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: newName.trim() ? "pointer" : "default", fontFamily: "inherit",
              }}
            >
              Create DealBoard
            </button>
          </div>
        </div>
      )}

      {/* Workspace list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {workspaces.map(ws => {
          const isActive = ws.id === activeWorkspace?.id;
          const isDefault = ws.id === "default";
          const isEditing = editingId === ws.id;

          return (
            <div
              key={ws.id}
              style={{
                background: "#fff", borderRadius: 10, padding: "16px 20px",
                border: isActive ? "1.5px solid #C49A3C" : "1px solid #E5E9F0",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  {/* Active indicator */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: isActive ? "#10B981" : "transparent",
                    border: isActive ? "none" : "1.5px solid #D8DFE9",
                  }} />

                  {isEditing ? (
                    <div style={{ display: "flex", gap: 8, flex: 1 }}>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                        style={{
                          flex: 1, padding: "6px 10px", fontSize: 14, borderRadius: 5,
                          border: "1px solid #C49A3C", outline: "none", fontFamily: "inherit",
                        }}
                      />
                      <button onClick={saveEdit} className="ws-btn-red" style={{ padding: "6px 14px", background: "#DC2626", color: "#fff", border: "none", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: "6px 12px", background: "transparent", border: "1px solid #D8DFE9", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "#5A7091", fontFamily: "inherit" }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#0B1120", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ws.name}
                        {isActive && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "#10B981", textTransform: "uppercase", letterSpacing: 0.5 }}>Active</span>}
                        {isDefault && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: "#8899B0" }}>Default</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#8899B0", marginTop: 2 }}>
                        /{ws.slug} &middot; Created {new Date(ws.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isEditing && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                    {!isActive && (
                      <ActionButton label="Switch" onClick={() => { switchWorkspace(ws.id); router.push("/workspace"); }} color="#2563EB" />
                    )}
                    <ActionButton label="Rename" onClick={() => startEdit(ws)} color="#5A7091" />
                    <ActionButton label="Clear Data" onClick={() => setConfirmClearId(ws.id)} color="#F59E0B" />
                    {!isDefault && (
                      <ActionButton label="Delete" onClick={() => setConfirmDeleteId(ws.id)} color="#DC3545" />
                    )}
                  </div>
                )}
              </div>

              {/* Confirm Delete */}
              {confirmDeleteId === ws.id && (
                <ConfirmBanner
                  message={`Permanently delete "${ws.name}"? This removes the DealBoard entry (properties remain in Firestore).`}
                  confirmLabel="Delete"
                  confirmColor="#DC3545"
                  onConfirm={() => handleDelete(ws.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                />
              )}

              {/* Confirm Clear */}
              {confirmClearId === ws.id && (
                <ConfirmBanner
                  message={`Delete all properties in "${ws.name}"? This cannot be undone.`}
                  confirmLabel={clearing ? "Clearing..." : "Clear All Data"}
                  confirmColor="#F59E0B"
                  disabled={clearing}
                  onConfirm={() => handleClear(ws.id)}
                  onCancel={() => setConfirmClearId(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {workspaces.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#8899B0", fontSize: 14 }}>
          No DealBoards found. Create one to get started.
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", background: "transparent", border: `1px solid ${color}33`,
        borderRadius: 5, fontSize: 11, fontWeight: 600, color, cursor: "pointer",
        fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { (e.target as HTMLElement).style.background = `${color}10`; }}
      onMouseLeave={e => { (e.target as HTMLElement).style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}

function ConfirmBanner({ message, confirmLabel, confirmColor, disabled, onConfirm, onCancel }: {
  message: string; confirmLabel: string; confirmColor: string; disabled?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      marginTop: 12, padding: "12px 16px", background: "#FFF8F0", borderRadius: 8,
      border: "1px solid #F5D9B0", display: "flex", alignItems: "center", gap: 12,
    }}>
      <span style={{ fontSize: 13, color: "#6B4F1D", flex: 1 }}>{message}</span>
      <button
        onClick={onConfirm}
        disabled={disabled}
        style={{
          padding: "6px 14px", background: confirmColor, color: "#fff", border: "none",
          borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1, fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        {confirmLabel}
      </button>
      <button
        onClick={onCancel}
        style={{ padding: "6px 12px", background: "transparent", border: "1px solid #D8DFE9", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "#5A7091", fontFamily: "inherit" }}
      >
        Cancel
      </button>
    </div>
  );
}
