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
  expiresAt?: string; // ISO string, empty/missing = no expiration
  isActive: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

/**
 * Expiration preset options for the create/edit form. "never" is the default
 * (empty expiresAt in Firestore). Day-based presets are computed at submit
 * time so the cutoff is relative to when the link is saved, not when the
 * form was opened. "custom" lets the user pick any future date.
 */
type ExpiryPreset = "never" | "7d" | "30d" | "90d" | "custom";

function computeExpiryIso(preset: ExpiryPreset, customDate: string): string {
  if (preset === "never") return "";
  if (preset === "custom") {
    if (!customDate) return "";
    // HTML date input returns YYYY-MM-DD. Anchor to end-of-day local so the
    // link stays usable for the full calendar day the user picked.
    const d = new Date(`${customDate}T23:59:59`);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function presetFromIso(iso: string | undefined): { preset: ExpiryPreset; customDate: string } {
  if (!iso) return { preset: "never", customDate: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { preset: "never", customDate: "" };
  // Always expose an existing expiration as "custom" in the edit form so the
  // user sees the exact date rather than a fuzzy preset bucket.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return { preset: "custom", customDate: `${yyyy}-${mm}-${dd}` };
}

const C = {
  primary: "#84CC16",
  onSurface: "#151b2b",
  secondary: "#585e70",
  bg: "#faf8ff",
  surfLow: "#f2f3ff",
  surfLowest: "#ffffff",
  ghost: "rgba(227, 190, 189, 0.15)",
  shadow: "0 20px 40px rgba(21, 27, 43, 0.06)",
  radius: 6,
};

const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://www.dealsignals.app";

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
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("never");
  const [expiryCustomDate, setExpiryCustomDate] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWorkspaceId, setEditWorkspaceId] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editWhiteLabel, setEditWhiteLabel] = useState(true);
  const [editHideDocuments, setEditHideDocuments] = useState(true);
  const [editContactName, setEditContactName] = useState("");
  const [editContactAgency, setEditContactAgency] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editExpiryPreset, setEditExpiryPreset] = useState<ExpiryPreset>("never");
  const [editExpiryCustomDate, setEditExpiryCustomDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!user) return {};
    try {
      const token = await user.getIdToken();
      return { Authorization: `Bearer ${token}` };
    } catch {
      return {};
    }
  }

  async function loadLinks() {
    try {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) { setLoading(false); return; }
      const res = await fetch("/api/workspace/share", { headers });
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
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/workspace/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          workspaceId: selectedWsId,
          workspaceName: ws?.name || "DealBoard",
          displayName: displayName.trim() || "",
          whiteLabel,
          hideDocuments,
          contactName: contactName.trim() || "",
          contactAgency: contactAgency.trim() || "",
          contactPhone: contactPhone.trim() || "",
          expiresAt: computeExpiryIso(expiryPreset, expiryCustomDate),
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
        setExpiryPreset("never");
        setExpiryCustomDate("");
      }
    } catch (err) {
      console.error("[share] Failed to create link:", err);
    }
    setCreating(false);
  }

  function startEdit(link: ShareLink) {
    setEditingId(link.id);
    setEditWorkspaceId(link.workspaceId);
    setEditDisplayName(link.displayName || "");
    setEditWhiteLabel(link.whiteLabel);
    setEditHideDocuments(link.hideDocuments);
    setEditContactName(link.contactName || "");
    setEditContactAgency(link.contactAgency || "");
    setEditContactPhone(link.contactPhone || "");
    const { preset, customDate } = presetFromIso(link.expiresAt);
    setEditExpiryPreset(preset);
    setEditExpiryCustomDate(customDate);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(link: ShareLink) {
    setSaving(true);
    const newWs = workspaces.find(w => w.id === editWorkspaceId);
    const nextExpiry = computeExpiryIso(editExpiryPreset, editExpiryCustomDate);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/workspace/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          id: link.id,
          workspaceId: editWorkspaceId,
          workspaceName: newWs?.name || link.workspaceName,
          displayName: editDisplayName.trim(),
          whiteLabel: editWhiteLabel,
          hideDocuments: editHideDocuments,
          contactName: editContactName.trim(),
          contactAgency: editContactAgency.trim(),
          contactPhone: editContactPhone.trim(),
          expiresAt: nextExpiry,
        }),
      });

      if (res.ok) {
        setLinks(prev => prev.map(l => l.id === link.id ? {
          ...l,
          workspaceId: editWorkspaceId,
          workspaceName: newWs?.name || l.workspaceName,
          displayName: editDisplayName.trim(),
          whiteLabel: editWhiteLabel,
          hideDocuments: editHideDocuments,
          contactName: editContactName.trim(),
          contactAgency: editContactAgency.trim(),
          contactPhone: editContactPhone.trim(),
          expiresAt: nextExpiry,
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
      const authHeaders = await getAuthHeaders();
      await fetch("/api/workspace/share", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
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
      const authHeaders = await getAuthHeaders();
      await fetch(`/api/workspace/share?id=${link.id}`, {
        method: "DELETE",
        headers: authHeaders,
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
    <>
      <style>{`
        @media (max-width: 768px) {
          .sh-container { padding: 0 12px !important; }
          .sh-header { flex-direction: column !important; gap: 12px !important; align-items: flex-start !important; }
          .sh-header > button { width: 100% !important; }
          .sh-contact-grid { grid-template-columns: 1fr !important; }
          .sh-phone-input { max-width: 100% !important; }
          .sh-form-section { padding: 16px 20px !important; }
          .sh-link-card { padding: 12px 14px !important; }
          .sh-link-header { flex-direction: column !important; gap: 8px !important; align-items: flex-start !important; }
          .sh-actions { flex-wrap: wrap !important; gap: 4px !important; }
          .sh-badges { flex-wrap: wrap !important; gap: 4px !important; }
        }
        @media (max-width: 480px) {
          .sh-container { padding: 0 12px !important; }
          .sh-header > div { width: 100% !important; }
          .sh-form-section { padding: 12px 14px !important; margin-bottom: 12px !important; }
          .sh-contact-grid { gap: 8px !important; }
          .sh-link-card { border-radius: 8px !important; }
          .sh-actions button { font-size: 10px !important; padding: 4px 8px !important; }
          .sh-url { font-size: 11px !important; }
        }
      `}</style>
      <div className="sh-container" style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      {/* Header */}
      <div className="sh-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.onSurface, margin: 0, fontFamily: "'Inter', sans-serif" }}>
            Shareable Links
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: "4px 0 0" }}>
            Create links to share DealBoard deals with clients and partners
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
        <div className="sh-form-section" style={{
          background: C.surfLowest, borderRadius: 10, padding: "24px 28px", marginBottom: 24,
          border: `1px solid ${C.ghost}`, boxShadow: C.shadow,
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: C.onSurface }}>
            New Shareable Link
          </h3>

          {/* Workspace selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
              DealBoard
            </label>
            <select
              value={selectedWsId}
              onChange={e => setSelectedWsId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Select a DealBoard...</option>
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          {/* Custom display name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
              Display Name <span style={{ color: C.secondary, fontWeight: 400 }}>(optional - overrides DealBoard name)</span>
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Q2 NNN Deals for ABC Capital"
              style={inputStyle}
            />
          </div>

          {/* Contact Info (optional) */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 10 }}>
              Displayed Contact Information <span style={{ color: C.secondary, fontWeight: 400 }}>(optional)</span>
              <span title="Your name, agency, and phone number will be shown in the header of the shared page so your client knows who to contact." style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: C.surfLow, border: `1px solid ${C.ghost}`, color: C.secondary, fontSize: 10, fontWeight: 700, cursor: "help", flexShrink: 0 }}>?</span>
            </label>
            <div className="sh-contact-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
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
              className="sh-phone-input"
              value={contactPhone}
              onChange={e => setContactPhone(e.target.value)}
              placeholder="Phone number"
              style={{ ...inputStyle, maxWidth: "calc(50% - 5px)" }}
            />
          </div>

          {/* Expiration */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
              Link Expiration
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={expiryPreset}
                onChange={e => setExpiryPreset(e.target.value as ExpiryPreset)}
                style={{ ...inputStyle, cursor: "pointer", maxWidth: 220 }}
              >
                <option value="never">Never (default)</option>
                <option value="7d">In 7 days</option>
                <option value="30d">In 30 days</option>
                <option value="90d">In 90 days</option>
                <option value="custom">Custom date...</option>
              </select>
              {expiryPreset === "custom" && (
                <input
                  type="date"
                  value={expiryCustomDate}
                  onChange={e => setExpiryCustomDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  style={{ ...inputStyle, maxWidth: 180 }}
                />
              )}
              <span style={{ fontSize: 11, color: C.secondary }}>
                After this date the link returns "expired" to anyone who opens it.
              </span>
            </div>
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
                <div style={{ fontSize: 11, color: C.secondary }}>Hide Deal Signals branding from the shared page</div>
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
                className="sh-link-card"
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

                    {/* Workspace */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
                        DealBoard
                      </label>
                      <select
                        value={editWorkspaceId}
                        onChange={e => setEditWorkspaceId(e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        {workspaces.map(ws => (
                          <option key={ws.id} value={ws.id}>{ws.name}</option>
                        ))}
                      </select>
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
                      <div className="sh-contact-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
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
                        className="sh-phone-input"
                        value={editContactPhone}
                        onChange={e => setEditContactPhone(e.target.value)}
                        placeholder="Phone number"
                        style={{ ...inputStyle, maxWidth: "calc(50% - 5px)" }}
                      />
                    </div>

                    {/* Expiration */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.onSurface, marginBottom: 6 }}>
                        Link Expiration
                      </label>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={editExpiryPreset}
                          onChange={e => setEditExpiryPreset(e.target.value as ExpiryPreset)}
                          style={{ ...inputStyle, cursor: "pointer", maxWidth: 220 }}
                        >
                          <option value="never">Never</option>
                          <option value="7d">In 7 days (from now)</option>
                          <option value="30d">In 30 days (from now)</option>
                          <option value="90d">In 90 days (from now)</option>
                          <option value="custom">Custom date...</option>
                        </select>
                        {editExpiryPreset === "custom" && (
                          <input
                            type="date"
                            value={editExpiryCustomDate}
                            onChange={e => setEditExpiryCustomDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 10)}
                            style={{ ...inputStyle, maxWidth: 180 }}
                          />
                        )}
                      </div>
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
                          <div style={{ fontSize: 11, color: C.secondary }}>Hide Deal Signals branding from the shared page</div>
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
                    <div className="sh-url" style={{
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
                    <div className="sh-link-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.onSurface, margin: 0 }}>
                          {link.displayName || link.workspaceName}
                        </h3>
                        <div className="sh-badges" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
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
                          {link.expiresAt ? (() => {
                            const exp = new Date(link.expiresAt);
                            if (isNaN(exp.getTime())) return null;
                            const expired = exp.getTime() < Date.now();
                            return (
                              <span style={{
                                fontSize: 10, color: expired ? "#EF4444" : C.secondary,
                                background: expired ? "rgba(239,68,68,0.08)" : C.surfLow,
                                padding: "2px 6px", borderRadius: 3, fontWeight: expired ? 600 : 400,
                              }}>
                                {expired ? "Expired " : "Expires "}{exp.toLocaleDateString()}
                              </span>
                            );
                          })() : null}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="sh-actions" style={{ display: "flex", gap: 6 }}>
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
                    <div className="sh-url" style={{
                      padding: "8px 12px", background: C.surfLow, borderRadius: C.radius,
                      fontSize: 12, color: C.secondary, fontFamily: "monospace",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {baseUrl}/share/{link.shareId}
                    </div>

                    <div style={{ marginTop: 8, fontSize: 10, color: C.secondary }}>
                      Created {new Date(link.createdAt).toLocaleDateString()} · DealBoard: {link.workspaceName}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
