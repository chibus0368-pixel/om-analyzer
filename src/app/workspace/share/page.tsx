"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/lib/workspace/workspace-context";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";

interface ShareLink {
  id: string;
  shareId: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  whiteLabel: boolean;
  hideDocuments: boolean;
  contactName: string;
  contactAgency: string;
  contactPhone: string;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

const C = {
  primary: "#b9172f",
  onSurface: "#151b2b",
  secondary: "#585e70",
  bg: "#faf8ff",
  surfLow: "#f2f3ff",
  surfLowest: "#ffffff",
  ghost: "rgba(227, 190, 189, 0.15)",
  shadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
  radius: 6,
};

const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://www.nnntriplenet.com";

export default function ShareLinksPage() {
  const { user } = useAuth();
  const { workspaces, activeWorkspace } = useWorkspace();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWsId, setSelectedWsId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whiteLabel, setWhiteLabel] = useState(true);
  const [hideDocuments, setHideDocuments] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactAgency, setContactAgency] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editWhiteLabel, setEditWhiteLabel] = useState(true);
  const [editHideDocuments, setEditHideDocuments] = useState(true);
  const [editContactName, setEditContactName] = useState("");
  const [editContactAgency, setEditContactAgency] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLinks();
  }, []);

  async function loadLinks() {
    try {
      const res = await fetch("/api/workspace/share", {
        headers: { Authorization: "Bearer mock" },
      });
      if (res.ok) {
        const data = await res.json();
        setLinks(data.links || []);
      }
    } catch (err) {
      console.error("[share] Failed to load links:", err);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!selectedWsId) return;
    setCreating(true);

    const ws = workspaces.find(w => w.id === selectedWsId);

    try {
      const res = await fetch("/api/workspace/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mock" },
        body: JSON.stringify({
          workspaceId: selectedWsId,
          workspaceName: ws?.name || "Workspace",
          displayName: displayName.trim() || "",
          whiteLabel,
          hideDocuments,
          contactName: contactName.trim() || "",
          contactAgency: contactAgency.trim() || "",
          contactPhone: contactPhone.trim() || "",
        }),
      });

      if (res.ok) {
        const newLink = await res.json();
        setLinks(prev => [newLink, ...prev]);
        setShowCreate(false);
        setDisplayName("");
        setSelectedWsId("");
        setWhiteLabel(true);
        setHideDocuments(true);
        setContactName("");
        setContactAgency("");
        setContactPhone("");
      }
    } catch (err) {
      console.error("[share] Failed to create link:", err);
    }
    setCreating(false);
  }

  function startEdit(link: ShareLink) {
    setEditingId(link.id);
    setEditDisplayName(link.displayName || "");
    setEditWhiteLabel(link.whiteLabel);
    setEditHideDocuments(link.hideDocuments);
    setEditContactName(link.contactName || "");
    setEditContactAgency(link.contactAgency || "");
    setEditContactPhone(link.contactPhone || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(link: ShareLink) {
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mock" },
        body: JSON.stringify({
          id: link.id,
          displayName: editDisplayName.trim(),
          whiteLabel: editWhiteLabel,
          hideDocuments: editHideDocuments,
          contactName: editContactName.trim(),
          contactAgency: editContactAgency.trim(),
          contactPhone: editContactPhone.trim(),
        }),
      });

      if (res.ok) {
        setLinks(prev => prev.map(l => l.id === link.id ? {
          ...l,
          displayName: editDisplayName.trim(),
          whiteLabel: editWhiteLabel,
          hideDocuments: editHideDocuments,
          contactName: editContactName.trim(),
          contactAgency: editContactAgency.trim(),
          contactPhone: editContactPhone.trim(),
        } : l));
        setEditingId(null);
      }
    } catch (err) {
      console.error("[share] Failed to save edit:", err);
    }
    setSaving(false);
  }

  async function handleToggle(link: ShareLink) {
    try {
      await fetch("/api/workspace/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer mock" },
        body: JSON.stringify({ id: link.id, isActive: !link.isActive }),
      });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, isActive: !l.isActive } : l));
    } catch (err) {
      console.error("[share] Failed to toggle link:", err);
    }
  }

  async function handleDelete(link: ShareLink) {
    if (!confirm("Delete this shareable link? Recipients will no longer be able to access it.")) return;
    try {
      await fetch(`/api/workspace/share?id=${link.id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer mock" },
      });
      setLinks(prev => prev.filter(l => l.id !== link.id));
    } catch (err) {
      console.error("[share] Failed to delete link:", err);
    }
  }

  function copyLink(shareId: string) {
    const url = `${baseUrl}/share/${shareId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(shareId);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", border: `1px solid ${C.ghost}`,
    borderRadius: C.radius, fontSize: 13, outline: "none", boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif", background: C.surfLow,
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.onSurface, margin: 0, fontFamily: "'Inter', sans-serif" }}>
            Shareable Links
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: "4px 0 0" }}>
            Create links to share workspace properties with clients and partners
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setSelectedWsId(activeWorkspace?.id || ""); }}
          className="ws-btn-gold"
          style={{
            padding: "10px 20px", background: C.primary, color: "#fff", border: "none",
            borderRadius: C.radius, fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create Link
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{
          background: C.surfLowest, borderRadius: 10, padding: "24px 28px", marginBottom: 24,
          border: `1px solid ${C.ghost}`, boxShadow: C.shadow,
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.onSurface }}>
            New Shareable Link
          </h3>

          {/* Workspace selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
              Workspace
            </label>
            <select
              value={selectedWsId}
              onChange={e => setSelectedWsId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Select a workspace...</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {/* Custom display name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
              Display Name <span style={{ color: C.secondary, fontWeight: 400 }}>(optional — overrides workspace name)</span>
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Q2 NNN Properties for ABC Capital"
              style={inputStyle}
            />
          </div>

          {/* Contact Info (optional) */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 10 }}>
              Displayed Contact Information <span style={{ color: C.secondary, fontWeight: 400 }}>(optional)</span>
              <span title="Your name, agency, and phone number will be shown in the header of the shared page so your client knows who to contact." style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: C.surfLow, border: `1px solid ${C.ghost}`, color: C.secondary, fontSize: 10, fontWeight: 700, cursor: "help", flexShrink: 0 }}>?</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <input
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Your name"
                style={inputStyle}
              />
              <input
                value={contactAgency}
                onChange={e => setContactAgency(e.target.value)}
                placeholder="Agency / brokerage"
                style={inputStyle}
              />
            </div>
            <input
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="Phone number"
              style={{ ...inputStyle, maxWidth: "calc(50% - 5px)" }}
            />
          </div>

          {/* Checkboxes */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.onSurface }}>
              <input
                type="checkbox"
                checked={whiteLabel}
                onChange={e => setWhiteLabel(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: C.primary }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>White Label</div>
                <div style={{ fontSize: 11, color: C.secondary }}>Hide Deal Signal branding from the shared page</div>
              </div>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.onSurface }}>
              <input
                type="checkbox"
                checked={hideDocuments}
                onChange={e => setHideDocuments(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: C.primary }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Hide Source Documents</div>
                <div style={{ fontSize: 11, color: C.secondary }}>Don&apos;t show original uploaded files (OMs, flyers, etc.)</div>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowCreate(false)}
              style={{
                padding: "8px 16px", background: "transparent", border: `1px solid ${C.ghost}`,
                borderRadius: C.radius, fontSize: 13, cursor: "pointer", color: C.secondary,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!selectedWsId || creating}
              className="ws-btn-gold"
              style={{
                padding: "8px 20px", background: selectedWsId && !creating ? C.primary : "#D8DFE9",
                color: "#fff", border: "none", borderRadius: C.radius, fontSize: 13, fontWeight: 600,
                cursor: selectedWsId && !creating ? "pointer" : "default",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {creating ? "Creating..." : "Create Link"}
            </button>
          </div>
        </div>
      )}

      {/* Links List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.secondary, fontSize: 13 }}>Loading...</div>
      ) : links.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          background: C.surfLowest, borderRadius: 10, border: `1px solid ${C.ghost}`,
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D8DFE9" strokeWidth="1.5" style={{ margin: "0 auto 16px", display: "block" }}>
            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.onSurface, margin: "0 0 6px" }}>No shareable links yet</h3>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
            Create a link to share a client-facing view of your properties with maps and summaries.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {links.map(link => {
            const isEditing = editingId === link.id;

            return (
              <div
                key={link.id}
                style={{
                  background: C.surfLowest, borderRadius: 10, padding: "16px 20px",
                  border: isEditing ? `2px solid ${C.primary}` : `1px solid ${C.ghost}`,
                  boxShadow: C.shadow,
                  opacity: link.isActive ? 1 : 0.6,
                }}
              >
                {isEditing ? (
                  /* ─── Edit Mode ─── */
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: 0 }}>
                        Edit Link Settings
                      </h3>
                      <span style={{ fontSize: 11, color: C.secondary }}>
                        URL stays the same for your client
                      </span>
                    </div>

                    {/* Display Name */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
                        Display Name
                      </label>
                      <input
                        value={editDisplayName}
                        onChange={e => setEditDisplayName(e.target.value)}
                        placeholder={link.workspaceName}
                        style={inputStyle}
                      />
                    </div>

                    {/* Contact Info */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
                        Displayed Contact Information <span style={{ color: C.secondary, fontWeight: 400 }}>(optional)</span>
                        <span title="Your name, agency, and phone number will be shown in the header of the shared page so your client knows who to contact." style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: C.surfLow, border: `1px solid ${C.ghost}`, color: C.secondary, fontSize: 10, fontWeight: 700, cursor: "help", flexShrink: 0 }}>?</span>
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <input
                          value={editContactName}
                          onChange={e => setEditContactName(e.target.value)}
                          placeholder="Your name"
                          style={inputStyle}
                        />
                        <input
                          value={editContactAgency}
                          onChange={e => setEditContactAgency(e.target.value)}
                          placeholder="Agency / brokerage"
                          style={inputStyle}
                        />
                      </div>
                      <input
                        value={editContactPhone}
                        onChange={e => setEditContactPhone(e.target.value)}
                        placeholder="Phone number"
                        style={{ ...inputStyle, maxWidth: "calc(50% - 5px)" }}
                      />
                    </div>

                    {/* Checkboxes */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.onSurface }}>
                        <input
                          type="checkbox"
                          checked={editWhiteLabel}
                          onChange={e => setEditWhiteLabel(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: C.primary }}
                        />
                        <div>
                          <div style={{ fontWeight: 600 }}>White Label</div>
                          <div style={{ fontSize: 11, color: C.secondary }}>Hide Deal Signal branding from the shared page</div>
                        </div>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.onSurface }}>
                        <input
                          type="checkbox"
                          checked={editHideDocuments}
                          onChange={e => setEditHideDocuments(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: C.primary }}
                        />
                        <div>
                          <div style={{ fontWeight: 600 }}>Hide Source Documents</div>
                          <div style={{ fontSize: 11, color: C.secondary }}>Don&apos;t show original uploaded files (OMs, flyers, etc.)</div>
                        </div>
                      </label>
                    </div>

                    {/* URL reminder */}
                    <div style={{
                      padding: "8px 12px", background: C.surfLow, borderRadius: C.radius,
                      fontSize: 12, color: C.secondary, fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      marginBottom: 14,
                    }}>
                      {baseUrl}/share/{link.shareId}
                    </div>

                    {/* Save / Cancel */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: "8px 16px", background: "transparent", border: `1px solid ${C.ghost}`,
                          borderRadius: C.radius, fontSize: 13, cursor: "pointer", color: C.secondary,
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(link)}
                        disabled={saving}
                        className="ws-btn-gold"
                        style={{
                          padding: "8px 20px", background: saving ? "#D8DFE9" : C.primary,
                          color: "#fff", border: "none", borderRadius: C.radius, fontSize: 13, fontWeight: 600,
                          cursor: saving ? "default" : "pointer",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {saving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ─── View Mode ─── */
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: 0 }}>
                          {link.displayName || link.workspaceName}
                        </h3>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
                            padding: "2px 8px", borderRadius: 4,
                            background: link.isActive ? "rgba(16, 185, 129, 0.1)" : "rgba(148, 163, 184, 0.1)",
                            color: link.isActive ? "#059669" : "#94a3b8",
                          }}>
                            {link.isActive ? "Active" : "Disabled"}
                          </span>
                          <span style={{ fontSize: 11, color: C.secondary }}>
                            {link.viewCount} view{link.viewCount !== 1 ? "s" : ""}
                          </span>
                          {link.whiteLabel && (
                            <span style={{ fontSize: 10, color: C.secondary, background: C.surfLow, padding: "2px 6px", borderRadius: 3 }}>
                              White labeled
                            </span>
                          )}
                          {link.hideDocuments && (
                            <span style={{ fontSize: 10, color: C.secondary, background: C.surfLow, padding: "2px 6px", borderRadius: 3 }}>
                              Docs hidden
                            </span>
                          )}
                          {(link.contactName || link.contactAgency) && (
                            <span style={{ fontSize: 10, color: C.secondary, background: C.surfLow, padding: "2px 6px", borderRadius: 3 }}>
                              {[link.contactName, link.contactAgency].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => startEdit(link)}
                          className="ws-btn-secondary"
                          title="Edit link settings"
                          style={{
                            padding: "6px 12px", background: C.surfLow, border: `1px solid ${C.ghost}`,
                            borderRadius: C.radius, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            color: C.onSurface, fontFamily: "'Inter', sans-serif",
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          onClick={() => copyLink(link.shareId)}
                          className="ws-btn-secondary"
                          style={{
                            padding: "6px 12px", background: C.surfLow, border: `1px solid ${C.ghost}`,
                            borderRadius: C.radius, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            color: copied === link.shareId ? "#059669" : C.onSurface,
                            fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          {copied === link.shareId ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                              Copy Link
                            </>
                          )}
                        </button>
                        <a
                          href={`/share/${link.shareId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ws-btn-secondary"
                          style={{
                            padding: "6px 12px", background: C.surfLow, border: `1px solid ${C.ghost}`,
                            borderRadius: C.radius, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            color: C.onSurface, textDecoration: "none", fontFamily: "'Inter', sans-serif",
                            display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          Preview
                        </a>
                        <button
                          onClick={() => handleToggle(link)}
                          title={link.isActive ? "Disable link" : "Enable link"}
                          style={{
                            padding: "6px 10px", background: "transparent", border: `1px solid ${C.ghost}`,
                            borderRadius: C.radius, fontSize: 11, cursor: "pointer", color: C.secondary,
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          {link.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(link)}
                          title="Delete link"
                          className="ws-btn-danger"
                          style={{
                            padding: "6px 10px", background: "transparent", border: `1px solid ${C.ghost}`,
                            borderRadius: C.radius, fontSize: 11, cursor: "pointer", color: "#EF4444",
                            fontFamily: "'Inter', sans-serif",
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* URL */}
                    <div style={{
                      padding: "8px 12px", background: C.surfLow, borderRadius: C.radius,
                      fontSize: 12, color: C.secondary, fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {baseUrl}/share/{link.shareId}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.secondary }}>
                      Created {new Date(link.createdAt).toLocaleDateString()} · Workspace: {link.workspaceName}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
