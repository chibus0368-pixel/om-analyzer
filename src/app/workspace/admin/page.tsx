"use client";

import { useEffect, useState, useCallback } from "react";
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
    currentPeriodEnd: string | null;
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
  const [activeTab, setActiveTab] = useState<"users" | "billing">("users");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ uid: string; action: string; email: string } | null>(null);

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

  useEffect(() => {
    if (user && isAdmin) fetchUsers();
  }, [user, isAdmin, fetchUsers]);

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
        <Link href="/workspace" style={{ color: "#84CC16", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Back to Dashboard</Link>
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

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px", color: "#111827", letterSpacing: -0.5 }}>
          Admin Console
        </h1>
        <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
          Manage users, dealboards, and billing for Deal Signals.
        </p>
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
          {(["users", "billing"] as const).map(tab => (
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
              {tab === "billing" ? "Billing & Plans" : "Users & Deals"}
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
                      <tr key={u.uid} style={{
                        borderBottom: "1px solid #F0F2F5",
                        background: u.disabled ? "#FAFAFA" : "#fff",
                        opacity: u.disabled ? 0.6 : 1,
                      }}>
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
                                {isMe && <span style={{ fontSize: 10, color: "#84CC16", marginLeft: 6 }}>YOU</span>}
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
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {isMe ? (
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>—</span>
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
                          {u.subscription.stripeCustomerId || "—"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#6B7280" }}>
                          {u.subscription.currentPeriodEnd ? formatDate(u.subscription.currentPeriodEnd) : "—"}
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
