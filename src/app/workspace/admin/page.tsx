"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useWorkspaceAuth as useAuth } from "@/lib/workspace/auth";
import Link from "next/link";
import { getAuthInstance } from "@/lib/firebase";

// ── Types ──
interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: string;
  lastSignIn: string;
  provider: string;
  disabled: boolean;
  dealboards: number;
  deals: number;
  subscription: {
    tier: string;
    status: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId?: string | null;
    stripePriceId?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd: string | null;
    uploadsUsed?: number;
    uploadLimit?: number;
    cancelAtPeriodEnd?: boolean;
    updatedAt?: string | null;
  };
}

// ── Helpers ──
function timeAgo(dateStr: string): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TIER_COLORS: Record<string, { color: string; bg: string }> = {
  free: { color: "#6B7280", bg: "#F3F4F6" },
  pro: { color: "#2563EB", bg: "#EFF6FF" },
  pro_plus: { color: "#7C3AED", bg: "#F5F3FF" },
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  pro_plus: "Pro+",
};

// ══════════════════════════════════════════════════════════════
// ADMIN PAGE
// ══════════════════════════════════════════════════════════════
export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "billing" | "leads">("users");
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ uid: string; action: string; email: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Beta access panel state
  const [betaEmail, setBetaEmail] = useState("");
  const [betaTier, setBetaTier] = useState<"pro" | "pro_plus">("pro_plus");
  const [betaLoading, setBetaLoading] = useState<"grant" | "revoke" | null>(null);
  const [betaResult, setBetaResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleBetaAccess = async (action: "grant" | "revoke") => {
    if (!betaEmail.trim()) {
      setBetaResult({ ok: false, message: "Enter an email first" });
      return;
    }
    setBetaLoading(action);
    setBetaResult(null);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const res = await fetch("/api/admin/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: betaEmail.trim(), action, tier: betaTier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBetaResult({ ok: false, message: data.error || `HTTP ${res.status}` });
      } else {
        setBetaResult({ ok: true, message: data.message || "Done" });
        setBetaEmail("");
        await fetchUsers();
      }
    } catch (err: any) {
      setBetaResult({ ok: false, message: err?.message || "Request failed" });
    } finally {
      setBetaLoading(null);
    }
  };

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
  };

  const formatDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const fetchUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLeadsLoading(true);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const res = await fetch("/api/admin/leads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch leads");
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (err: any) {
      console.error("Leads fetch error:", err?.message);
    } finally {
      setLeadsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && isAdmin) fetchUsers();
  }, [user, isAdmin, fetchUsers]);

  useEffect(() => {
    if (user && isAdmin && activeTab === "leads") fetchLeads();
  }, [user, isAdmin, activeTab, fetchLeads]);

  const handleAction = async (uid: string, action: string) => {
    setActionLoading(uid);
    setConfirmAction(null);
    try {
      const token = await getAuthInstance().currentUser?.getIdToken();
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uid, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed");
      }
      // Refresh user list
      await fetchUsers();
    } catch (err: any) {
      setError(err?.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Filter
  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q);
  });

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => !u.disabled).length;
  const totalDeals = users.reduce((sum, u) => sum + u.deals, 0);
  const proUsers = users.filter(u => u.subscription.tier !== "free").length;

  // ── Auth gate ──
  if (authLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>Admin Access Required</h2>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 8 }}>You don't have permission to view this page.</p>
        <Link href="/workspace" style={{ color: "#4D7C0F", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 20px" }}>
      {/* Confirm modal */}
      {confirmAction && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmAction(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 12, padding: 24, width: 400,
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {confirmAction.action === "delete" ? "Delete User" : confirmAction.action === "disable" ? "Disable User" : "Enable User"}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6B7280" }}>
              {confirmAction.action === "delete"
                ? `Permanently delete ${confirmAction.email}? This cannot be undone.`
                : confirmAction.action === "disable"
                ? `Disable ${confirmAction.email}? They won't be able to log in.`
                : `Re-enable ${confirmAction.email}?`}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmAction(null)} style={{
                padding: "8px 16px", borderRadius: 6, border: "1px solid #E5E7EB",
                background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
                Cancel
              </button>
              <button onClick={() => handleAction(confirmAction.uid, confirmAction.action)} style={{
                padding: "8px 16px", borderRadius: 6, border: "none",
                background: confirmAction.action === "delete" ? "#DC2626" : confirmAction.action === "disable" ? "#D97706" : "#059669",
                color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
                {confirmAction.action === "delete" ? "Delete" : confirmAction.action === "disable" ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUser && (
        <div
          onClick={() => setSelectedUser(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(17,24,39,0.35)", display: "flex", justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxWidth: "100%", height: "100%", background: "#fff",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", overflowY: "auto",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Drawer header */}
            <div style={{
              padding: "20px 24px", borderBottom: "1px solid #F0F2F5",
              display: "flex", alignItems: "center", gap: 14, background: "#FAFAFA",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", background: "#F3F4F6",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, color: "#6B7280", overflow: "hidden", flexShrink: 0,
              }}>
                {selectedUser.photoURL ? (
                  <img src={selectedUser.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  selectedUser.email.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
                  {selectedUser.displayName || selectedUser.email.split("@")[0]}
                </div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{selectedUser.email}</div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: 20, color: "#9CA3AF", padding: 4, lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ padding: "20px 24px", flex: 1 }}>
              {(() => {
                const s = selectedUser.subscription;
                const tierStyle = TIER_COLORS[s.tier] || TIER_COLORS.free;
                const tierLabel = TIER_LABELS[s.tier] || s.tier;

                const Row = ({ label, value, mono, copyValue }: {
                  label: string; value: ReactNode; mono?: boolean; copyValue?: string;
                }) => (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderBottom: "1px solid #F3F4F6", gap: 16,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: 12, color: "#111827", fontWeight: 600,
                      fontFamily: mono ? "monospace" : "inherit",
                      textAlign: "right", wordBreak: "break-all", display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span>{value}</span>
                      {copyValue && (
                        <button
                          onClick={() => copyToClipboard(copyValue, label)}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280",
                            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                          }}
                        >
                          {copiedField === label ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </div>
                );

                const SectionHeader = ({ title }: { title: string }) => (
                  <div style={{
                    fontSize: 10, fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1,
                    marginTop: 20, marginBottom: 4, paddingBottom: 6, borderBottom: "2px solid #111827",
                  }}>
                    {title}
                  </div>
                );

                return (
                  <>
                    <SectionHeader title="Identity" />
                    <Row label="UID" value={selectedUser.uid} mono copyValue={selectedUser.uid} />
                    <Row label="Email" value={selectedUser.email} copyValue={selectedUser.email} />
                    <Row label="Name" value={selectedUser.displayName || "--"} />
                    <Row label="Provider" value={selectedUser.provider} />
                    <Row label="Status" value={
                      <span style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                        background: selectedUser.disabled ? "#FEF2F2" : "#ECFDF5",
                        color: selectedUser.disabled ? "#DC2626" : "#059669",
                      }}>
                        {selectedUser.disabled ? "Disabled" : "Active"}
                      </span>
                    } />

                    <SectionHeader title="Activity" />
                    <Row label="Signed Up" value={formatDateTime(selectedUser.createdAt)} />
                    <Row label="Last Active" value={`${timeAgo(selectedUser.lastSignIn)} (${formatDateTime(selectedUser.lastSignIn)})`} />
                    <Row label="DealBoards" value={String(selectedUser.dealboards)} />
                    <Row label="Deals" value={String(selectedUser.deals)} />
                    <Row label="Uploads Used" value={
                      `${s.uploadsUsed ?? 0} / ${s.uploadLimit ?? 0}`
                    } />

                    <SectionHeader title="Billing" />
                    <Row label="Plan" value={
                      <span style={{
                        padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: tierStyle.bg, color: tierStyle.color,
                      }}>
                        {tierLabel}
                      </span>
                    } />
                    <Row label="Sub Status" value={s.status || "active"} />
                    <Row label="Cancel at End" value={s.cancelAtPeriodEnd ? "Yes" : "No"} />
                    <Row label="Customer ID" value={s.stripeCustomerId || "--"} mono copyValue={s.stripeCustomerId || undefined} />
                    <Row label="Subscription ID" value={s.stripeSubscriptionId || "--"} mono copyValue={s.stripeSubscriptionId || undefined} />
                    <Row label="Price ID" value={s.stripePriceId || "--"} mono copyValue={s.stripePriceId || undefined} />
                    <Row label="Period Start" value={formatDateTime(s.currentPeriodStart)} />
                    <Row label="Period End" value={formatDateTime(s.currentPeriodEnd)} />
                    <Row label="Billing Updated" value={formatDateTime(s.updatedAt)} />

                    {s.stripeCustomerId && (
                      <div style={{ marginTop: 20 }}>
                        <a
                          href={`https://dashboard.stripe.com/customers/${s.stripeCustomerId}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{
                            display: "inline-block", padding: "8px 14px", borderRadius: 6,
                            background: "#635BFF", color: "#fff", fontSize: 12, fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          Open in Stripe →
                        </a>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px", color: "#111827", letterSpacing: -0.5 }}>
          Admin Console
        </h1>
        <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
          Manage users, dealboards, and billing for Deal Signals.
        </p>
      </div>

      {/* Beta Access Panel */}
      <div style={{
        background: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.05)",
        padding: "16px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#111827", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Beta Access
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF" }}>
            Grant or revoke paid-tier access for beta testers (bypasses Stripe)
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="email"
            placeholder="user@example.com"
            value={betaEmail}
            onChange={(e) => setBetaEmail(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 6, border: "1px solid #E5E7EB",
              fontSize: 13, fontFamily: "inherit", minWidth: 260, outline: "none",
            }}
          />
          <select
            value={betaTier}
            onChange={(e) => setBetaTier(e.target.value as "pro" | "pro_plus")}
            style={{
              padding: "8px 12px", borderRadius: 6, border: "1px solid #E5E7EB",
              fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer",
            }}
          >
            <option value="pro_plus">Pro+</option>
            <option value="pro">Pro</option>
          </select>
          <button
            onClick={() => handleBetaAccess("grant")}
            disabled={betaLoading !== null}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "none",
              background: "#7C3AED", color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: betaLoading ? "default" : "pointer",
              fontFamily: "inherit", opacity: betaLoading ? 0.6 : 1,
            }}
          >
            {betaLoading === "grant" ? "Granting..." : "Grant Beta Access"}
          </button>
          <button
            onClick={() => handleBetaAccess("revoke")}
            disabled={betaLoading !== null}
            style={{
              padding: "8px 16px", borderRadius: 6, border: "1px solid #E5E7EB",
              background: "#fff", color: "#6B7280",
              fontSize: 12, fontWeight: 700, cursor: betaLoading ? "default" : "pointer",
              fontFamily: "inherit", opacity: betaLoading ? 0.6 : 1,
            }}
          >
            {betaLoading === "revoke" ? "Revoking..." : "Revoke"}
          </button>
          {betaResult && (
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: betaResult.ok ? "#059669" : "#DC2626",
              padding: "6px 10px", borderRadius: 6,
              background: betaResult.ok ? "#ECFDF5" : "#FEF2F2",
            }}>
              {betaResult.message}
            </div>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total Users", value: String(totalUsers), color: "#2563EB" },
          { label: "Active Users", value: String(activeUsers), color: "#059669" },
          { label: "Total Deals", value: String(totalDeals), color: "#D97706" },
          { label: "Paid Users", value: String(proUsers), color: "#7C3AED" },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.05)",
            padding: "16px 20px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5 }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color, marginTop: 2 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Search */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "inline-flex", background: "#F3F4F6", borderRadius: 8, padding: 2 }}>
          {(["users", "billing", "leads"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 18px", borderRadius: 6, border: "none",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                textTransform: "capitalize",
                background: activeTab === tab ? "#fff" : "transparent",
                color: activeTab === tab ? "#111827" : "#9CA3AF",
                boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}
            >
              {tab === "billing" ? "Billing & Plans" : tab === "leads" ? "Leads" : "Users & Deals"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB",
              fontSize: 13, fontFamily: "inherit", width: 240, outline: "none",
            }}
          />
          <button onClick={fetchUsers} style={{
            padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.05)",
            background: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
            textTransform: "uppercase", letterSpacing: 0.5, color: "#6B7280", fontFamily: "inherit",
          }}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "10px 16px", background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.15)",
          borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#DC2626", fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading users...</div>
      ) : (
        <>
          {/* USERS & DEALS TAB */}
          {activeTab === "users" && (
            <div style={{
              background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)", overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F2F5" }}>
                    {["User", "Status", "Signed Up", "Last Active", "Plan", "DealBoards", "Deals", "Actions"].map(h => (
                      <th key={h} style={{
                        padding: "12px 16px", textAlign: h === "Actions" ? "center" : "left",
                        fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                        textTransform: "uppercase", letterSpacing: 1.5,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                        {search ? "No users match your search." : "No users found."}
                      </td>
                    </tr>
                  ) : filtered.map(u => {
                    const tierStyle = TIER_COLORS[u.subscription.tier] || TIER_COLORS.free;
                    const tierLabel = TIER_LABELS[u.subscription.tier] || u.subscription.tier;
                    const isMe = u.email === "chibus0368@gmail.com";
                    return (
                      <tr key={u.uid} onClick={() => setSelectedUser(u)} style={{
                        borderBottom: "1px solid #F0F2F5",
                        background: u.disabled ? "#FAFAFA" : "#fff",
                        opacity: u.disabled ? 0.6 : 1,
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { if (!u.disabled) e.currentTarget.style.background = "#F9FAFB"; }}
                      onMouseLeave={(e) => { if (!u.disabled) e.currentTarget.style.background = "#fff"; }}
                      >
                        {/* User */}
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%", background: "#F3F4F6",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 700, color: "#6B7280", flexShrink: 0,
                              overflow: "hidden",
                            }}>
                              {u.photoURL ? (
                                <img src={u.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                u.email.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                                {u.displayName || u.email.split("@")[0]}
                                {isMe && <span style={{ fontSize: 10, color: "#4D7C0F", marginLeft: 6 }}>YOU</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                            background: u.disabled ? "#FEF2F2" : "#ECFDF5",
                            color: u.disabled ? "#DC2626" : "#059669",
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: u.disabled ? "#DC2626" : "#10B981",
                            }} />
                            {u.disabled ? "Disabled" : "Active"}
                          </span>
                        </td>

                        {/* Signed Up */}
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#6B7280" }}>
                          {formatDate(u.createdAt)}
                        </td>

                        {/* Last Active */}
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#6B7280" }}>
                          {timeAgo(u.lastSignIn)}
                        </td>

                        {/* Plan */}
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 4,
                            fontSize: 11, fontWeight: 700,
                            background: tierStyle.bg, color: tierStyle.color,
                          }}>
                            {tierLabel}
                          </span>
                        </td>

                        {/* DealBoards */}
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#111827", textAlign: "center" }}>
                          {u.dealboards}
                        </td>

                        {/* Deals */}
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#111827", textAlign: "center" }}>
                          {u.deals}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "12px 16px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          {isMe ? (
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>-</span>
                          ) : (
                            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                              {u.disabled ? (
                                <button
                                  onClick={() => setConfirmAction({ uid: u.uid, action: "enable", email: u.email })}
                                  disabled={actionLoading === u.uid}
                                  style={{
                                    padding: "4px 10px", borderRadius: 4, border: "1px solid rgba(5,150,105,0.2)",
                                    background: "rgba(5,150,105,0.06)", color: "#059669",
                                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                                  }}
                                >
                                  Enable
                                </button>
                              ) : (
                                <button
                                  onClick={() => setConfirmAction({ uid: u.uid, action: "disable", email: u.email })}
                                  disabled={actionLoading === u.uid}
                                  style={{
                                    padding: "4px 10px", borderRadius: 4, border: "1px solid rgba(217,119,6,0.2)",
                                    background: "rgba(217,119,6,0.06)", color: "#D97706",
                                    fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                                  }}
                                >
                                  Disable
                                </button>
                              )}
                              <button
                                onClick={() => setConfirmAction({ uid: u.uid, action: "delete", email: u.email })}
                                disabled={actionLoading === u.uid}
                                style={{
                                  padding: "4px 10px", borderRadius: 4, border: "1px solid rgba(220,38,38,0.2)",
                                  background: "rgba(220,38,38,0.06)", color: "#DC2626",
                                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* LEADS TAB */}
          {activeTab === "leads" && (
            <div style={{
              background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)", overflow: "hidden",
            }}>
              {leadsLoading ? (
                <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading leads...</div>
              ) : leads.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                  No leads captured yet. Leads appear here when visitors enter their email on the lite analyzer.
                </div>
              ) : (
                <>
                  <div style={{ padding: "12px 16px", background: "#FAFAFA", borderBottom: "1px solid #F0F2F5", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>{leads.length} leads captured</span>
                    <button onClick={fetchLeads} style={{
                      padding: "5px 12px", borderRadius: 4, border: "1px solid #E5E7EB",
                      background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      color: "#6B7280", fontFamily: "inherit",
                    }}>
                      Refresh
                    </button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F2F5" }}>
                        {["Email", "Source", "Properties Analyzed", "Touches", "Last Score", "First Seen", "Last Active", "Converted"].map(h => (
                          <th key={h} style={{
                            padding: "10px 14px", textAlign: "left",
                            fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                            textTransform: "uppercase", letterSpacing: 1,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead: any) => (
                        <tr key={lead.id} style={{ borderBottom: "1px solid #F0F2F5" }}>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                            {lead.email}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                              background: "#F3F4F6", color: "#6B7280", textTransform: "uppercase",
                            }}>
                              {lead.source || lead.lastSource || "-"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "#374151" }}>
                            {(lead.propertiesAnalyzed || []).join(", ") || "-"}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#111827", textAlign: "center" }}>
                            {lead.touches || 1}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: lead.lastDealScore >= 70 ? "#059669" : lead.lastDealScore >= 50 ? "#D97706" : "#6B7280" }}>
                            {lead.lastDealScore ?? "-"}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>
                            {lead.createdAt ? formatDate(lead.createdAt) : "-"}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280" }}>
                            {lead.lastActiveAt ? timeAgo(lead.lastActiveAt) : "-"}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                              background: lead.convertedToUser ? "rgba(5,150,105,0.1)" : "rgba(217,119,6,0.1)",
                              color: lead.convertedToUser ? "#059669" : "#D97706",
                            }}>
                              {lead.convertedToUser ? "Yes" : "No"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* BILLING TAB */}
          {activeTab === "billing" && (
            <div style={{
              background: "#fff", borderRadius: 12, border: "1px solid rgba(0,0,0,0.05)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)", overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F2F5" }}>
                    {["User", "Plan", "Status", "Stripe ID", "Period End", "Deals Used"].map(h => (
                      <th key={h} style={{
                        padding: "12px 16px", textAlign: "left",
                        fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                        textTransform: "uppercase", letterSpacing: 1.5,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
                        No users found.
                      </td>
                    </tr>
                  ) : filtered.map(u => {
                    const tierStyle = TIER_COLORS[u.subscription.tier] || TIER_COLORS.free;
                    const tierLabel = TIER_LABELS[u.subscription.tier] || u.subscription.tier;
                    return (
                      <tr key={u.uid} style={{ borderBottom: "1px solid #F0F2F5" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                            {u.displayName || u.email.split("@")[0]}
                          </div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{u.email}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 4,
                            fontSize: 11, fontWeight: 700,
                            background: tierStyle.bg, color: tierStyle.color,
                          }}>
                            {tierLabel}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600,
                            color: u.subscription.status === "active" ? "#059669" : "#D97706",
                          }}>
                            {u.subscription.status || "active"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>
                          {u.subscription.stripeCustomerId || "-"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#6B7280" }}>
                          {u.subscription.currentPeriodEnd ? formatDate(u.subscription.currentPeriodEnd) : "-"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                          {u.deals}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
