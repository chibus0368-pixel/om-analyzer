"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getWorkspaceProperties } from "@/lib/workspace/firestore";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace/workspace-context";
import { useWorkspaceAuth } from "@/lib/workspace/auth";
import type { Property, AnalysisType } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_ICONS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import { cleanDisplayName } from "@/lib/workspace/propertyNameUtils";
import Link from "next/link";
import DealSignalLogo from "@/components/DealSignalLogo";
import TrialStatusBar from "@/components/billing/TrialStatusBar";

import UpgradeModal from "@/components/billing/UpgradeModal";

/* Sidebar nav — matches Deal Signals design — NO "DealBoard" link */
const SIDEBAR_NAV = [
  { href: "/workspace/scoreboard", label: "Scoreboard", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/workspace/upload", label: "Upload Deal", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" },
  { href: "/workspace/map", label: "Map", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/workspace/share", label: "Shareable Links", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
];

/* BOTTOM_NAV removed — no longer used in new layout */

function SidebarIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

function NavLink({ href, label, icon, active, collapsed, compact = false }: { href: string; label: string; icon: string; active: boolean; collapsed: boolean; compact?: boolean }) {
  const iconSize = compact ? 26 : 28;
  const fontSize = compact ? 11 : 13;
  const padding = collapsed ? (compact ? "4px 0" : "5px 0") : (compact ? "4px 10px" : "5px 12px");

  return (
    <Link
      href={href}
      className="ws-nav"
      style={{
        display: "flex", alignItems: "center", gap: collapsed ? 0 : 8,
        padding,
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 8,
        color: active ? "#84CC16" : "#64748b",
        background: active ? "rgba(132, 204, 22, 0.1)" : "transparent",
        textDecoration: "none", fontSize, fontWeight: active ? 600 : 500,
        transition: "all 0.15s",
        position: "relative",
      }}
      title={collapsed ? label : undefined}
    >
      <div style={{
        width: iconSize, height: iconSize, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "rgba(132, 204, 22, 0.12)" : "transparent",
        transition: "background 0.15s",
        flexShrink: 0,
      }}>
        <SidebarIcon d={icon} size={compact ? 15 : 18} />
      </div>
      {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
    </Link>
  );
}

/** Sidebar user account card — shows avatar, name, email, plan & usage */
function SidebarUserCard({ user, collapsed, userTier, onUpgradeClick }: {
  user: import("firebase/auth").User | null;
  collapsed: boolean;
  userTier: string;
  onUpgradeClick: () => void;
}) {
  const [usage, setUsage] = useState<{ uploadsUsed: number; uploadLimit: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function fetchUsage() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch("/api/workspace/usage", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setUsage({ uploadsUsed: data.uploadsUsed || 0, uploadLimit: data.uploadLimit || 5 });
        }
      } catch { /* non-blocking */ }
    }
    fetchUsage();
    const handler = () => fetchUsage();
    window.addEventListener("usage-updated", handler);
    window.addEventListener("workspace-properties-changed", handler);
    return () => { cancelled = true; window.removeEventListener("usage-updated", handler); window.removeEventListener("workspace-properties-changed", handler); };
  }, [user]);

  if (!user) return null;

  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const email = user.email || "";
  const initials = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const usagePct = usage ? Math.min(Math.round((usage.uploadsUsed / usage.uploadLimit) * 100), 100) : 0;
  const tierLabel = userTier === "pro_plus" ? "Pro+" : userTier === "pro" ? "Pro" : "Free";
  const tierSuffix = userTier === "free" ? "" : " Monthly";

  if (collapsed) {
    return (
      <div
        style={{ padding: "6px 0", display: "flex", justifyContent: "center", cursor: "pointer" }}
        onClick={() => router.push("/workspace/profile")}
        title={`${displayName}\n${email}`}
      >
        <div style={{
          width: 34, height: 34, borderRadius: "50%", background: "#84CC16",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#0F172A", flexShrink: 0,
        }}>
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "6px 10px 8px" }}>
      {/* User info row */}
      <Link
        href="/workspace/profile"
        className="ws-nav"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 8px", borderRadius: 10, textDecoration: "none",
          transition: "background 0.15s",
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: "50%", background: "#84CC16",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#0F172A", flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
            {email}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </Link>

      {/* Plan & usage bar */}
      <div style={{ padding: "6px 8px 0" }}>
        <div style={{
          height: 4, borderRadius: 4, background: "#e2e8f0", overflow: "hidden", marginBottom: 6,
        }}>
          <div style={{
            height: "100%", borderRadius: 4,
            width: `${usagePct}%`,
            background: usagePct >= 90 ? "#EF4444" : usagePct >= 70 ? "#F59E0B" : "#84CC16",
            transition: "width 0.4s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
            {tierLabel}{tierSuffix}
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
            {usage ? `${usagePct}% usage` : "..."}
          </span>
        </div>
        {userTier === "free" && usage && usagePct >= 80 && (
          <button
            onClick={(e) => { e.preventDefault(); onUpgradeClick(); }}
            style={{
              width: "100%", marginTop: 6, padding: "5px 0",
              background: "none", border: "1px solid #e2e8f0", borderRadius: 6,
              fontSize: 11, fontWeight: 600, color: "#84CC16", cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(132,204,22,0.08)"; e.currentTarget.style.borderColor = "#84CC16"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
          >
            Upgrade Plan
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Client-only gate: prevents SSR of the entire workspace tree.
 * Next.js App Router SSR-streams even "use client" components; the resulting
 * $RC boundary-swap scripts fail silently on some routes, leaving the page
 * stuck on the root loading.tsx spinner.  By rendering nothing on the server
 * (mounted === false) and only rendering after useEffect fires on the client,
 * we bypass SSR streaming entirely for /workspace/*.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { user, loading: authLoading } = useWorkspaceAuth();
  useEffect(() => setMounted(true), []);

  if (!mounted || authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#faf8ff" }}>
        <div style={{ textAlign: "center", color: "#585e70" }}>
          <div style={{
            width: 32, height: 32,
            border: "3px solid rgba(0,0,0,0.06)",
            borderTopColor: "#84CC16",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 12px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 13 }}>Loading workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider userId={user?.uid || ""}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600;1,700&display=swap');
        /* Sidebar nav hover */
        .ws-nav:hover { background: #f8fafc !important; color: #0F172A !important; }
        .ws-header-nav:hover { color: #84CC16 !important; }
        .ws-new-analysis:hover { background: rgba(132, 204, 22, 0.1) !important; }
        .ws-prop-link:hover { background: #f8fafc !important; color: #1e293b !important; }
        .ws-add-prop:hover { border-color: #e2e8f0 !important; background: #f8fafc !important; }
        .ws-props-scroll::-webkit-scrollbar { width: 4px; }
        .ws-props-scroll::-webkit-scrollbar-track { background: transparent; }
        .ws-props-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 4px; }
        .ws-props-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
        /* Primary buttons */
        .ws-btn-gold { transition: all 0.15s ease; }
        .ws-btn-gold:hover { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(220,38,38,0.35); transform: translateY(-1px); }
        /* Inline red buttons */
        .ws-btn-red { transition: all 0.15s ease; }
        .ws-btn-red:hover { filter: brightness(1.15); box-shadow: 0 2px 8px rgba(220,38,38,0.35); transform: translateY(-1px); }
        /* Secondary/outline buttons */
        .ws-btn-secondary { transition: all 0.15s ease; }
        .ws-btn-secondary:hover { background: #EDF0F5 !important; border-color: #B4C1D1 !important; }
        /* Dark buttons (Export XLS) */
        .ws-btn-dark { transition: all 0.15s ease; }
        .ws-btn-dark:hover { background: #1a2332 !important; box-shadow: 0 2px 8px rgba(11,17,32,0.3); transform: translateY(-1px); }
        /* Green buttons (XLS export) */
        .ws-btn-green { transition: all 0.15s ease; }
        .ws-btn-green:hover { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(22,163,74,0.35); transform: translateY(-1px); }
        /* Danger buttons */
        .ws-btn-danger { transition: all 0.15s ease; }
        .ws-btn-danger:hover { background: #FDD1D5 !important; }
        /* Text links */
        .ws-link:hover { opacity: 0.8; }
        /* Collapse button */
        .ws-collapse:hover { color: #585e70 !important; background: rgba(132, 204, 22, 0.08) !important; }
        .ws-dealboard-tab:hover { color: #0F172A !important; background: rgba(0,0,0,0.04) !important; }
      `}</style>
      <WorkspaceLayoutInner user={user}>{children}</WorkspaceLayoutInner>
    </WorkspaceProvider>
  );
}

/** Workspace dropdown — used in sidebar (dark theme) */
function SidebarWorkspaceSwitcher({ collapsed, onAddNew }: { collapsed: boolean; onAddNew: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (collapsed) {
    return (
      <div style={{ padding: "10px 8px 4px", textAlign: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(132, 204, 22, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", cursor: "pointer" }}
          title={activeWorkspace?.name || "DealBoard"}
          onClick={() => setOpen(!open)}
        >
          <span style={{ color: "#84CC16", fontSize: 11, fontWeight: 800 }}>
            {(activeWorkspace?.name || "W").charAt(0).toUpperCase()}
          </span>
        </div>
      </div>
    );
  }

  const hasMultiple = workspaces.length > 1;

  return (
    <div ref={dropdownRef} style={{ position: "relative", padding: "10px 14px 4px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          background: "none", border: "none", cursor: "pointer",
          padding: "4px 0", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span style={{
          fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8,
          color: "#84CC16", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          flex: 1,
        }}>
          {activeWorkspace?.name || "Loading..."}
        </span>
        {activeWorkspace && (
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 6px", borderRadius: 3,
            background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType || "retail"]}25`,
            color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType || "retail"],
            fontSize: 10, fontWeight: 600, flexShrink: 0,
          }}>
            {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType || "retail"]}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#585e70" strokeWidth="2.5" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 4, right: 4, marginTop: 6,
          background: "#ffffff", borderRadius: 12, zIndex: 100,
          boxShadow: "0 20px 48px rgba(21, 27, 43, 0.15)",
          overflow: "hidden", border: "1px solid #e2e8f0",
          padding: "6px",
        }}>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
              className="ws-nav"
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "12px 14px", background: ws.id === activeWorkspace?.id ? "rgba(132, 204, 22, 0.1)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 14, color: ws.id === activeWorkspace?.id ? "#84CC16" : "#475569",
                fontWeight: ws.id === activeWorkspace?.id ? 700 : 500, fontFamily: "inherit",
                textAlign: "left", borderRadius: 8,
              }}
            >
              {ws.id === activeWorkspace?.id && <span style={{ color: "#84CC16", fontSize: 14 }}>✓</span>}
              {ws.id !== activeWorkspace?.id && <span style={{ width: 14 }} />}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name}</span>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 8px", borderRadius: 6,
                background: `${ANALYSIS_TYPE_COLORS[ws.analysisType || "retail"]}20`,
                color: ANALYSIS_TYPE_COLORS[ws.analysisType || "retail"],
                fontSize: 11, fontWeight: 600,
              }}>
                {ANALYSIS_TYPE_LABELS[ws.analysisType || "retail"]}
              </span>
            </button>
          ))}
          <div style={{ margin: "4px 0 0", borderTop: "1px solid #f1f5f9", paddingTop: 4 }}>
            <button
              onClick={() => { setOpen(false); onAddNew(); }}
              className="ws-nav"
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "12px 14px", background: "transparent",
                border: "none", cursor: "pointer", fontSize: 14,
                color: "#64748b", fontWeight: 600, fontFamily: "inherit",
                textAlign: "left", transition: "color 0.15s", borderRadius: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#84CC16")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              <span>Add New DealBoard</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Workspace dropdown — used in top header bar */
function HeaderWorkspaceSwitcher({ onAddNew }: { onAddNew: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "1.5px solid #e2e8f0", borderRadius: 10,
          cursor: "pointer", padding: "6px 14px",
          fontFamily: "inherit", transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.background = "#f8fafc"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "none"; }}
      >
        <span style={{
          fontSize: 13, fontWeight: 700, color: "#1e293b",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          maxWidth: 180,
        }}>
          {activeWorkspace?.name || "Loading..."}
        </span>
        {activeWorkspace && (
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 7px", borderRadius: 4,
            background: `${ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType || "retail"]}20`,
            color: ANALYSIS_TYPE_COLORS[activeWorkspace.analysisType || "retail"],
            fontSize: 10, fontWeight: 700, flexShrink: 0, letterSpacing: 0.2,
          }}>
            {ANALYSIS_TYPE_LABELS[activeWorkspace.analysisType || "retail"]}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 260,
          background: "#ffffff", borderRadius: 12, zIndex: 200,
          boxShadow: "0 20px 48px rgba(21, 27, 43, 0.18)",
          overflow: "hidden", border: "1px solid #e2e8f0",
          padding: 6,
        }}>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
              className="ws-nav"
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", background: ws.id === activeWorkspace?.id ? "rgba(132, 204, 22, 0.1)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 13, color: ws.id === activeWorkspace?.id ? "#84CC16" : "#475569",
                fontWeight: ws.id === activeWorkspace?.id ? 700 : 500, fontFamily: "inherit",
                textAlign: "left", borderRadius: 8,
              }}
            >
              {ws.id === activeWorkspace?.id && <span style={{ color: "#84CC16", fontSize: 13 }}>✓</span>}
              {ws.id !== activeWorkspace?.id && <span style={{ width: 13 }} />}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name}</span>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "2px 7px", borderRadius: 5,
                background: `${ANALYSIS_TYPE_COLORS[ws.analysisType || "retail"]}20`,
                color: ANALYSIS_TYPE_COLORS[ws.analysisType || "retail"],
                fontSize: 10, fontWeight: 600,
              }}>
                {ANALYSIS_TYPE_LABELS[ws.analysisType || "retail"]}
              </span>
            </button>
          ))}
          <div style={{ margin: "4px 0 0", borderTop: "1px solid #f1f5f9", paddingTop: 4 }}>
            <button
              onClick={() => { setOpen(false); onAddNew(); }}
              className="ws-nav"
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", background: "transparent",
                border: "none", cursor: "pointer", fontSize: 13,
                color: "#64748b", fontWeight: 600, fontFamily: "inherit",
                textAlign: "left", borderRadius: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#84CC16")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              <span>Add New DealBoard</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceLayoutInner({ children, user }: { children: React.ReactNode; user: import("firebase/auth").User | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaces, activeWorkspace, switchWorkspace, addWorkspace, loading: wsLoading } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [showNewWs, setShowNewWs] = useState(false);
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsType, setNewWsType] = useState<AnalysisType>("retail");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [userTier, setUserTier] = useState<string>("free");
  const prevWsIdRef = useRef<string | null>(null);
  const upgradeHandledRef = useRef(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // ── Close workspace dropdown on outside click ──
  useEffect(() => {
    if (!showWsDropdown) return;
    const handler = (e: MouseEvent) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setShowWsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showWsDropdown]);

  // ── Auth gate: redirect to login if not authenticated ──
  // Skip redirect if already on the login page to prevent redirect loops.
  // The parent WorkspaceLayout already waits for auth to load before rendering,
  // so `user` being null here means the user is genuinely not logged in.
  const isLoginPage = pathname === "/workspace/login";
  useEffect(() => {
    if (!user && !isLoginPage) {
      router.replace("/workspace/login");
    }
  }, [user, router, isLoginPage]);

  // ── Auto-open upgrade modal if ?upgrade= param is present (after login redirect) ──
  useEffect(() => {
    if (upgradeHandledRef.current) return;
    const upgradePlan = searchParams.get("upgrade");
    if (upgradePlan && user) {
      upgradeHandledRef.current = true;
      setShowUpgrade(true);
      // Clean the URL param
      const url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      url.searchParams.delete("redirect");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [searchParams, user]);

  // ── Handle return from Stripe checkout (?upgraded=true) ──
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);
  useEffect(() => {
    const upgraded = searchParams.get("upgraded");
    if (upgraded === "true" && user) {
      setShowUpgradeSuccess(true);
      // Refresh tier immediately
      window.dispatchEvent(new Event("usage-updated"));
      // Clean the URL param
      const url = new URL(window.location.href);
      url.searchParams.delete("upgraded");
      window.history.replaceState({}, "", url.pathname + url.search);
      // Auto-dismiss after 6 seconds
      setTimeout(() => setShowUpgradeSuccess(false), 6000);
    }
  }, [searchParams, user]);

  // Fetch user tier for header display
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchTier() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch("/api/workspace/usage", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setUserTier(data.tier || "free");
        }
      } catch { /* non-blocking */ }
    }

    fetchTier();

    // Also listen for usage changes (uploads, upgrades, property changes)
    const handler = () => fetchTier();
    window.addEventListener("usage-updated", handler);
    window.addEventListener("workspace-properties-changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("usage-updated", handler);
      window.removeEventListener("workspace-properties-changed", handler);
    };
  }, [user]);

  // Load properties for active workspace
  const loadProperties = useCallback(async () => {
    if (!activeWorkspace || !user) return;
    try {
      const props = await getWorkspaceProperties(user.uid, activeWorkspace.id);
      setProperties(props.sort((a, b) => a.propertyName.localeCompare(b.propertyName)));
    } catch { /* ignore */ }
    setLoadingProps(false);
  }, [user, activeWorkspace?.id]);

  // Only show loading flash on very first load, not workspace switches
  useEffect(() => {
    if (!activeWorkspace) return;
    const isFirstLoad = prevWsIdRef.current === null;
    prevWsIdRef.current = activeWorkspace.id;
    if (isFirstLoad) setLoadingProps(true);
    loadProperties();
  }, [loadProperties, activeWorkspace]);

  // Listen for property/workspace changes (background refresh, no loading flash)
  useEffect(() => {
    const handler = () => loadProperties();
    window.addEventListener("workspace-properties-changed", handler);
    window.addEventListener("workspace-changed", handler);
    const interval = setInterval(loadProperties, 30000);
    return () => {
      window.removeEventListener("workspace-properties-changed", handler);
      window.removeEventListener("workspace-changed", handler);
      clearInterval(interval);
    };
  }, [loadProperties]);

  const isActive = (href: string) => {
    if (href === "/workspace") return pathname === "/workspace";
    return pathname.startsWith(href);
  };

  const handleCreateWorkspace = async () => {
    const name = newWsName.trim();
    if (!name) return;
    try {
      console.log("[Layout] Creating workspace:", name, "type:", newWsType);
      await addWorkspace(name, newWsType);
      console.log("[Layout] Workspace created successfully");
      setNewWsName("");
      setNewWsType("retail");
      setShowNewWs(false);
      router.push("/workspace");
    } catch (err) {
      console.error("[Layout] Failed to create workspace:", err);
      alert("Failed to create workspace. Check console for details.");
    }
  };

  // If not authenticated: show login page without workspace chrome, or show nothing while redirecting
  if (!user) {
    if (isLoginPage) {
      // Render children (login page) without the workspace sidebar/header
      return <>{children}</>;
    }
    // Show nothing while redirecting to login
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#F7F8FA" }}>
      {/* ===== TOP HEADER BAR — Deal Signals ===== */}
      <header style={{
        display: "flex", alignItems: "center",
        height: 64, minHeight: 64,
        background: "#0b1326", borderBottom: "1px solid rgba(255,255,255,0.1)",
        zIndex: 60,
        padding: "0 32px",
      }}>
        {/* Left: Logo + DealBoard selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <Link href="/workspace" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {/* Logo mark: green rounded square with pulse */}
            <div style={{ background: "#84CC16", padding: 6, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, color: "#000" }}>
                <path d="M3 12h3l3-9 6 18 3-9h3" />
              </svg>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.02em", fontFamily: "'Inter', sans-serif" }}>
              Deal <span style={{ color: "#84CC16" }}>Signals</span>
            </span>
          </Link>

          {/* DealBoard selector — separated by border */}
          <div ref={wsDropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowWsDropdown(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                paddingLeft: 24, borderLeft: "1px solid rgba(255,255,255,0.1)", marginLeft: 8,
                background: "none", border: "none", borderLeftStyle: "solid", borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.1)",
                cursor: "pointer", transition: "opacity 0.15s",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.025em" }}>
                    {activeWorkspace?.name || "Default Dealboard"}
                  </span>
                  <span style={{
                    background: "rgba(132,204,22,0.1)", color: "#84CC16",
                    fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                    padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(132,204,22,0.2)",
                  }}>
                    {ANALYSIS_TYPE_LABELS[activeWorkspace?.analysisType || "retail"] || "Retail"}
                  </span>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Select Dealboard
                </span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showWsDropdown ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {/* Workspace dropdown */}
            {showWsDropdown && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", left: 0, minWidth: 320,
                background: "#151d2e", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
                zIndex: 300, overflow: "hidden",
              }}>
                <div style={{ padding: "14px 16px 8px 16px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Your Dealboards
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto", padding: "0 6px 4px" }}>
                  {workspaces.map(ws => {
                    const isActive = ws.id === activeWorkspace?.id;
                    return (
                      <button
                        key={ws.id}
                        onClick={() => {
                          switchWorkspace(ws.id);
                          setShowWsDropdown(false);
                          router.push("/workspace");
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, width: "100%",
                          padding: "12px 10px", border: "none", cursor: "pointer", borderRadius: 8,
                          background: isActive ? "rgba(132,204,22,0.08)" : "transparent",
                          transition: "background 0.12s", textAlign: "left",
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? "rgba(132,204,22,0.08)" : "transparent"; }}
                      >
                        <div style={{
                          width: 8, height: 8, borderRadius: 4,
                          background: isActive ? "#84CC16" : "rgba(255,255,255,0.15)",
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 14, fontWeight: isActive ? 700 : 500, flex: 1, minWidth: 0,
                          color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.6)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {ws.name}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
                          padding: "3px 8px", borderRadius: 4, flexShrink: 0,
                          background: isActive ? "rgba(132,204,22,0.15)" : "rgba(255,255,255,0.06)",
                          color: isActive ? "#84CC16" : "rgba(255,255,255,0.35)",
                          border: isActive ? "1px solid rgba(132,204,22,0.2)" : "1px solid rgba(255,255,255,0.06)",
                        }}>
                          {ANALYSIS_TYPE_LABELS[ws.analysisType || "retail"] || "Retail"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "6px 6px" }}>
                  <button
                    onClick={() => { setShowWsDropdown(false); setShowNewWs(true); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
                      padding: "12px 14px", border: "none", borderRadius: 8,
                      background: "transparent", cursor: "pointer", transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(132,204,22,0.06)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", letterSpacing: "0.08em" }}>Add New Dealboard</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Pro Plan pill + user info + settings */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginLeft: "auto" }}>
          {userTier === "free" ? (
            <button
              onClick={() => setShowUpgrade(true)}
              style={{
                padding: "6px 16px", background: "rgba(132,204,22,0.2)", color: "#84CC16",
                border: "1px solid rgba(132,204,22,0.3)", borderRadius: 9999,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(132,204,22,0.3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(132,204,22,0.2)"; }}
            >
              Upgrade to Pro
            </button>
          ) : (
            <Link href="/workspace/profile?tab=account" style={{
              padding: "6px 16px", background: "rgba(132,204,22,0.2)", color: "#84CC16",
              border: "1px solid rgba(132,204,22,0.3)", borderRadius: 9999,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              textDecoration: "none", fontFamily: "'Inter', sans-serif", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(132,204,22,0.3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(132,204,22,0.2)"; }}
            >
              {userTier === "pro" ? "Pro Plan" : userTier === "pro_plus" ? "Pro+" : "My Plan"}
            </Link>
          )}

          {/* User section — border-left divider */}
          {user && (
            <Link href="/workspace/profile" style={{
              display: "flex", alignItems: "center", gap: 12,
              paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.1)",
              textDecoration: "none", transition: "opacity 0.15s",
            }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {user.displayName || user.email?.split("@")[0] || "User"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.3 }}>
                  {user.email || ""}
                </div>
              </div>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: "#84CC16",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#000", flexShrink: 0,
                border: "2px solid rgba(255,255,255,0.1)",
              }}>
                {user.displayName ? user.displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : (user.email?.split("@")[0] || "U").substring(0, 2).toUpperCase()}
              </div>
            </Link>
          )}

          {/* Settings icon */}
          <Link href="/workspace/settings" title="Settings" style={{
            background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 4,
            display: "flex", alignItems: "center", borderRadius: 6, transition: "color 0.15s",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
          </Link>
        </div>
      </header>

      {/* ===== NAV BAR — Horizontal Tabs ===== */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 56, minHeight: 56,
        background: "#FFFFFF", borderBottom: "1px solid rgba(0,0,0,0.06)",
        padding: "0 32px",
      }}>
        {/* Left: Tabs with icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 32, height: "100%" }}>
          {[
            { href: "/workspace", label: "Dealboard", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" /></svg> },
            { href: "/workspace/scoreboard", label: "Scorecard", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg> },
            { href: "/workspace/upload", label: "Upload", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13v8" /><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="m8 17 4-4 4 4" /></svg> },
            { href: "/workspace/map", label: "Map", icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" /><path d="M15 5.764v15" /><path d="M9 3.236v15" /></svg> },
          ].map(tab => {
            const active = tab.href === "/workspace" ? pathname === "/workspace" || pathname.startsWith("/workspace/properties") : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={`${tab.href}${activeWorkspace?.slug ? "?ws=" + activeWorkspace.slug : ""}`} style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                height: "100%",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "2.2px",
                color: active ? "#84CC16" : "#9CA3AF",
                textDecoration: "none",
                borderBottom: active ? "2px solid #84CC16" : "2px solid transparent",
                paddingTop: 4,
                fontFamily: "'Inter', sans-serif",
                transition: "all 0.15s",
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#111827"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "#9CA3AF"; } }}
              >
                <span style={{ display: "flex", opacity: active ? 1 : 0.7 }}>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Right: Share DealBoard button + info icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={`/workspace/share${activeWorkspace?.slug ? "?ws=" + activeWorkspace.slug : ""}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 16px", background: "rgba(132,204,22,0.1)", color: "#84CC16",
              border: "1px solid rgba(132,204,22,0.2)", borderRadius: 6,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
              cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.15s",
              textDecoration: "none",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(132,204,22,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(132,204,22,0.1)"; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
            Share DealBoard
          </Link>
          {/* Info tooltip for sharing */}
          <div style={{ position: "relative" }}
            onMouseEnter={e => {
              const tip = e.currentTarget.querySelector("[data-tooltip]") as HTMLElement;
              if (tip) tip.style.opacity = "1";
              if (tip) tip.style.pointerEvents = "auto";
            }}
            onMouseLeave={e => {
              const tip = e.currentTarget.querySelector("[data-tooltip]") as HTMLElement;
              if (tip) tip.style.opacity = "0";
              if (tip) tip.style.pointerEvents = "none";
            }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(156,163,175,0.08)", cursor: "help", transition: "background 0.15s",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div data-tooltip style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, width: 280,
              background: "#1a2236", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
              padding: "14px 16px", boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
              opacity: 0, pointerEvents: "none", transition: "opacity 0.2s", zIndex: 200,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 }}>
                Sharing a DealBoard
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, marginBottom: 10 }}>
                Generate a read-only link to share your DealBoard with investors, partners, or your team. Recipients can view property scores, financials, and AI analysis without needing an account.
              </div>
              <Link href="/workspace/help#sharing" style={{
                fontSize: 11, fontWeight: 700, color: "#84CC16", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                Learn more
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content — full width */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 32, display: "flex", flexDirection: "column" }}>
          {showUpgradeSuccess && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 18px", marginBottom: 16, borderRadius: 8,
              background: "linear-gradient(135deg, #059669, #10B981)",
              color: "#fff", fontSize: 13, fontWeight: 600,
              animation: "fadeIn 0.3s ease",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Upgrade complete! Your Pro plan is now active.</span>
              <button onClick={() => setShowUpgradeSuccess(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>&times;</button>
            </div>
          )}
          <div style={{ flex: 1 }}>{children}</div>
          <footer style={{
            padding: "32px 0 24px", marginTop: 40,
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            fontSize: 11, color: "#585e70",
          }}>
            <div>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 14, color: "#151b2b", display: "block", marginBottom: 6 }}>Deal Signals</span>
              <span style={{ color: "#585e70", fontSize: 10 }}>&copy; 2026 Deal Signals. All rights reserved.</span>
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              <a href="/terms" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Terms</a>
              <a href="/privacy" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Privacy</a>
              <a href="/contact" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Support</a>
            </div>
          </footer>
        </div>
      </main>

      {/* Upgrade Modal */}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} reason="limit_reached" />

      {/* New Workspace Modal */}
      {showNewWs && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 200,
          }}
          onClick={() => setShowNewWs(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, padding: "28px 32px", width: 420,
              boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#151b2b" }}>New DealBoard</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#585e70" }}>Create a blank DealBoard for a new set of properties.</p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#151b2b", marginBottom: 8 }}>DealBoard Name</label>
            <input
              autoFocus
              value={newWsName}
              onChange={e => setNewWsName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateWorkspace(); }}
              placeholder="e.g. Q2 Pipeline, Client Portfolio"
              style={{
                width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 6,
                border: "1px solid rgba(227, 190, 189, 0.15)", outline: "none", fontFamily: "inherit",
                boxSizing: "border-box", marginBottom: 20,
              }}
            />

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#151b2b", marginBottom: 10 }}>Deal Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {(["retail", "industrial", "office", "land"] as AnalysisType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setNewWsType(type)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    padding: "12px", borderRadius: 8,
                    border: newWsType === type ? `2px solid ${ANALYSIS_TYPE_COLORS[type]}` : "1px solid rgba(227, 190, 189, 0.15)",
                    background: newWsType === type ? `${ANALYSIS_TYPE_COLORS[type]}10` : "#fff",
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 24 }}>{ANALYSIS_TYPE_ICONS[type]}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: newWsType === type ? ANALYSIS_TYPE_COLORS[type] : "#585e70",
                  }}>
                    {ANALYSIS_TYPE_LABELS[type]}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowNewWs(false); setNewWsType("retail"); }}
                style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(227, 190, 189, 0.15)", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#585e70", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWsName.trim()}
                className="ws-btn-gold"
                style={{
                  padding: "8px 20px", background: newWsName.trim() ? "#84CC16" : "#D8DFE9",
                  color: newWsName.trim() ? "#0F172A" : "#ffffff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
                  cursor: newWsName.trim() ? "pointer" : "default", fontFamily: "inherit",
                }}
              >
                Create Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
