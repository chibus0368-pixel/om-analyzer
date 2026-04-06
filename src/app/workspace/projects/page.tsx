"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import { getUserProjects, createProject, updateProject, deleteProject } from "@/lib/workspace/firestore";
import type { Project, AssetType, ProjectStatus } from "@/lib/workspace/types";
import { STATUS_LABELS, STATUS_COLORS, ASSET_TYPE_LABELS, SCORE_BAND_COLORS, formatCurrency } from "@/lib/workspace/types";
import Link from "next/link";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #D8DFE9",
  borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#253352", marginBottom: 5,
};

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (id: string) => void }) {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState("");
  const [assetType, setAssetType] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!user || !projectName.trim() || !assetType) return;
    setSaving(true);
    setError("");
    try {
      const projectId = await createProject(user.uid, {
        projectName: projectName.trim(),
        propertyName: "",
        assetType: assetType as AssetType,
        notesSummary: notes || undefined,
        tags: [],
      });
      onCreate(projectId);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to create project");
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,17,32,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, padding: 32 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>New Project</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#8899B0", lineHeight: 1 }}>&times;</button>
        </div>

        <p style={{ fontSize: 13, color: "#5A7091", margin: "0 0 20px", lineHeight: 1.5 }}>
          A project is a group for organizing deals — like &quot;Strip Malls&quot;, &quot;Dollar General Portfolio&quot;, or &quot;Austin Retail Q1&quot;.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Project Name *</label>
            <input
              style={inputStyle}
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="e.g. Strip Malls, Dollar General Portfolio, Austin Retail"
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Asset Type *</label>
            <select style={inputStyle} value={assetType} onChange={e => setAssetType(e.target.value)}>
              <option value="">Select asset type...</option>
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Notes <span style={{ fontWeight: 400, color: "#8899B0" }}>(optional)</span></label>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What's this project about?"
            />
          </div>
        </div>

        {error && (
          <div style={{ background: "#FDE8EA", color: "#C52D3A", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginTop: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", background: "none", border: "1.5px solid #D8DFE9", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !projectName.trim() || !assetType}
            style={{
              padding: "10px 24px", background: "#C49A3C", color: "#fff", border: "none",
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              opacity: saving || !projectName.trim() || !assetType ? 0.5 : 1, fontFamily: "inherit",
            }}
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsListPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "true");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"updatedAt" | "projectName" | "scoreTotal">("updatedAt");

  const loadProjects = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let p = await getUserProjects(user.uid);
      if (statusFilter && statusFilter !== "all") {
        p = p.filter(proj => proj.status === statusFilter);
      }
      setProjects(p);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [user, statusFilter]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const filtered = projects
    .filter(p => !search || p.projectName.toLowerCase().includes(search.toLowerCase()) || p.propertyName?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => assetFilter === "all" || p.assetType === assetFilter)
    .sort((a, b) => {
      if (sortBy === "projectName") return a.projectName.localeCompare(b.projectName);
      if (sortBy === "scoreTotal") return (b.scoreTotal || 0) - (a.scoreTotal || 0);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={(id) => { setShowCreate(false); loadProjects(); router.push(`/workspace/projects/${id}`); }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: "8px 20px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          + New Project
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects..."
          style={{ ...inputStyle, width: 260, padding: "8px 12px" }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 150, padding: "8px 12px" }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={assetFilter} onChange={e => setAssetFilter(e.target.value)} style={{ ...inputStyle, width: 160, padding: "8px 12px" }}>
          <option value="all">All Asset Types</option>
          {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ ...inputStyle, width: 160, padding: "8px 12px" }}>
          <option value="updatedAt">Last Updated</option>
          <option value="projectName">Name</option>
          <option value="scoreTotal">Deal Score</option>
        </select>
        <span style={{ fontSize: 12, color: "#8899B0", marginLeft: "auto" }}>{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EDF0F5", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#5A7091" }}>Loading projects...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#5A7091", marginBottom: 16 }}>
              {projects.length === 0 ? "No projects yet. Start by creating your first deal project." : "No projects match your filters."}
            </p>
            {projects.length === 0 && (
              <button onClick={() => setShowCreate(true)} style={{ padding: "10px 24px", background: "#C49A3C", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                + Create First Project
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F6F8FB" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Project</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Asset Type</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Status</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Deal Score</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Tags</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#5A7091" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid #EDF0F5", cursor: "pointer" }} onClick={() => router.push(`/workspace/projects/${p.id}`)}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 600, color: "#0B1120" }}>{p.projectName}</div>
                    {p.propertyName && <div style={{ fontSize: 12, color: "#8899B0", marginTop: 2 }}>{p.propertyName}</div>}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#5A7091" }}>
                    {p.assetType ? ASSET_TYPE_LABELS[p.assetType] : "--"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 20,
                      fontSize: 11, fontWeight: 600, color: STATUS_COLORS[p.status],
                      background: STATUS_COLORS[p.status] + "15",
                    }}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontWeight: 700 }}>
                    {p.scoreTotal !== undefined ? (
                      <span style={{ color: p.scoreBand ? SCORE_BAND_COLORS[p.scoreBand] : "#0B1120" }}>{p.scoreTotal}</span>
                    ) : "--"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(p.tags || []).slice(0, 3).map(t => (
                        <span key={t} style={{ padding: "2px 8px", background: "#EDF0F5", borderRadius: 12, fontSize: 11, color: "#5A7091" }}>{t}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#8899B0", fontSize: 12 }}>
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "14px 8px" }}>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${p.projectName}" and all its properties?`)) {
                          await deleteProject(p.id);
                          loadProjects();
                        }
                      }}
                      style={{ background: "none", border: "none", color: "#B4C1D1", cursor: "pointer", fontSize: 14, padding: "4px 8px" }}
                      title="Delete project"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
