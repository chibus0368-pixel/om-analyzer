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
        color: active ? "#b9172f" : "#64748b",
        background: active ? "rgba(185, 23, 47, 0.06)" : "transparent",
        textDecoration: "none", fontSize, fontWeight: active ? 600 : 500,
        transition: "all 0.15s",
        position: "relative",
      }}
      title={collapsed ? label : undefined}
    >
      <div style={{
        width: iconSize, height: iconSize, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "rgba(185, 23, 47, 0.08)" : "transparent",
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
          width: 34, height: 34, borderRadius: "50%", background: "#b9172f",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
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
          width: 36, height: 36, borderRadius: "50%", background: "#b9172f",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
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
            background: usagePct >= 90 ? "#EF4444" : usagePct >= 70 ? "#F59E0B" : "#b9172f",
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
              fontSize: 11, fontWeight: 600, color: "#b9172f", cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(185,23,47,0.04)"; e.currentTarget.style.borderColor = "#b9172f"; }}
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
            border: "3px solid rgba(227, 190, 189, 0.15)",
            borderTopColor: "#b9172f",
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
        .ws-nav:hover { background: #f8fafc !important; color: #b9172f !important; }
        .ws-header-nav:hover { color: #b9172f !important; }
        .ws-new-analysis:hover { background: rgba(185, 23, 47, 0.06) !important; }
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
        .ws-collapse:hover { color: #585e70 !important; background: rgba(185, 23, 47, 0.04) !important; }
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
        <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(185, 23, 47, 0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", cursor: "pointer" }}
          title={activeWorkspace?.name || "DealBoard"}
          onClick={() => setOpen(!open)}
        >
          <span style={{ color: "#b9172f", fontSize: 11, fontWeight: 800 }}>
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
          color: "#b9172f", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
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
                padding: "12px 14px", background: ws.id === activeWorkspace?.id ? "rgba(185, 23, 47, 0.06)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 14, color: ws.id === activeWorkspace?.id ? "#b9172f" : "#475569",
                fontWeight: ws.id === activeWorkspace?.id ? 700 : 500, fontFamily: "inherit",
                textAlign: "left", borderRadius: 8,
              }}
            >
              {ws.id === activeWorkspace?.id && <span style={{ color: "#b9172f", fontSize: 14 }}>✓</span>}
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
              onMouseEnter={e => (e.currentTarget.style.color = "#b9172f")}
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
                padding: "10px 14px", background: ws.id === activeWorkspace?.id ? "rgba(185, 23, 47, 0.06)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 13, color: ws.id === activeWorkspace?.id ? "#b9172f" : "#475569",
                fontWeight: ws.id === activeWorkspace?.id ? 700 : 500, fontFamily: "inherit",
                textAlign: "left", borderRadius: 8,
              }}
            >
              {ws.id === activeWorkspace?.id && <span style={{ color: "#b9172f", fontSize: 13 }}>✓</span>}
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
              onMouseEnter={e => (e.currentTarget.style.color = "#b9172f")}
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
  const { activeWorkspace, addWorkspace, loading: wsLoading } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsType, setNewWsType] = useState<AnalysisType>("retail");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [userTier, setUserTier] = useState<string>("free");
  const prevWsIdRef = useRef<string | null>(null);
  const upgradeHandledRef = useRef(false);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#f8fafc" }}>
      {/* ===== TOP HEADER BAR — Deal Signals ===== */}
      <header style={{
        display: "flex", alignItems: "center",
        height: 56, minHeight: 56,
        background: "#ffffff", borderBottom: "1px solid #e2e8f0",
        zIndex: 60,
      }}>
        {/* Logo zone — matches sidebar width */}
        <div style={{
          width: collapsed ? 68 : 260, minWidth: collapsed ? 68 : 260,
          display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "0" : "0 20px",
          transition: "width 0.2s, min-width 0.2s",
          height: "100%",
        }}>
          <Link href="/workspace" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            <DealSignalLogo size={26} fontSize={16} gap={7} showText={!collapsed} />
          </Link>
        </div>

        {/* Content zone — nav links + right controls */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: "100%",
        }}>
          {/* Left: Top nav links (All DealBoards, Upload History) */}
          <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {[
              { href: "/workspace/manage", label: "All DealBoards" },
              { href: "/workspace/upload/history", label: "Upload History" },
            ].map(item => {
              const active = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} style={{
                  padding: "6px 14px", borderRadius: 8,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? "#b9172f" : "#64748b",
                  background: active ? "rgba(185,23,47,0.06)" : "transparent",
                  textDecoration: "none", transition: "all 0.15s",
                  fontFamily: "'Inter', sans-serif",
                }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#1e293b"; e.currentTarget.style.background = "#f8fafc"; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "transparent"; } }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Plan button + User info + Settings icon */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {userTier === "free" ? (
              <button
                onClick={() => setShowUpgrade(true)}
                style={{
                  padding: "7px 18px", background: "transparent", color: "#b9172f",
                  border: "1.5px solid #b9172f", borderRadius: 50,
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Inter', sans-serif", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(185,23,47,0.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                Upgrade to Pro
              </button>
            ) : (
              <Link href="/workspace/profile?tab=account" style={{
                padding: "7px 18px", background: "#b9172f", color: "#fff",
                borderRadius: 50,
                fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "'Inter', sans-serif",
                transition: "all 0.15s",
              }}>
                {userTier === "pro" ? "Pro Plan" : userTier === "pro_plus" ? "Pro+" : "My Plan"}
              </Link>
            )}

            {/* User name + organization display with avatar */}
            {user && (
              <Link href="/workspace/profile" style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 12px", borderRadius: 8,
                textDecoration: "none", transition: "background 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", lineHeight: 1.2 }}>
                    {user.displayName || user.email?.split("@")[0] || "User"}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.2 }}>
                    {user.email || ""}
                  </div>
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: "#b9172f",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {user.displayName ? user.displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : (user.email?.split("@")[0] || "U").substring(0, 2).toUpperCase()}
                </div>
              </Link>
            )}

            {/* Settings/grid icon */}
            <Link href="/workspace/settings" className="ws-header-nav" title="Settings" style={{
              background: "none", border: "none", cursor: "pointer", color: "#585e70", padding: 6,
              display: "flex", alignItems: "center", borderRadius: 6, transition: "color 0.15s",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
            </Link>
          </div>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 68 : 260, minWidth: collapsed ? 68 : 260,
        background: "#ffffff", color: "#1e293b", display: "flex", flexDirection: "column",
        transition: "width 0.2s, min-width 0.2s", zIndex: 50,
        paddingTop: 8, overflow: "hidden",
        borderRight: "1px solid #e2e8f0",
      }}>
        {/* Workspace Switcher at top */}
        <SidebarWorkspaceSwitcher collapsed={collapsed} onAddNew={() => setShowNewWs(true)} />

        {/* Main nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "0 8px" }}>
          {SIDEBAR_NAV.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {/* Properties List */}
        {!collapsed && (
          <div className="ws-props-scroll" style={{ flex: 1, overflow: "auto", padding: "8px 8px", marginTop: 4, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px 8px", marginBottom: 2, position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#94a3b8" }}>PROPERTIES{properties.length > 0 ? ` (${properties.length})` : ""}</span>
            </div>

            {loadingProps ? (
              <div style={{ padding: "12px 8px", color: "#94a3b8", fontSize: 11 }}>Loading...</div>
            ) : properties.length === 0 ? (
              <div style={{ padding: "8px", color: "#94a3b8", fontSize: 11 }}>No properties yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {properties.map(prop => {
                  const isPropertyActive = pathname === `/workspace/properties/${prop.id}`;
                  return (
                    <Link
                      key={prop.id}
                      href={`/workspace/properties/${prop.id}`}
                      className="ws-prop-link"
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                        fontSize: 12, color: isPropertyActive ? "#b9172f" : "#64748b",
                        textDecoration: "none", overflow: "hidden",
                        whiteSpace: "nowrap", borderRadius: 8,
                        background: isPropertyActive ? "rgba(185, 23, 47, 0.06)" : "transparent",
                        fontWeight: isPropertyActive ? 600 : 500,
                        transition: "all 0.15s",
                      }}
                      title={`${cleanDisplayName(prop.propertyName, prop.address1, prop.city, prop.state)}${prop.city ? " - " + prop.city : ""}`}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: isPropertyActive ? "rgba(185, 23, 47, 0.08)" : "#f1f5f9",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={isPropertyActive ? "#b9172f" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /></svg>
                      </div>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{cleanDisplayName(prop.propertyName, prop.address1, prop.city, prop.state)}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Add New Property button — below properties list */}
            <Link href="/workspace/upload" className="ws-add-prop" style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginTop: 8,
              border: "1.5px dashed #e2e8f0", borderRadius: 10, color: "#94a3b8",
              fontSize: 12, fontWeight: 600, textDecoration: "none",
              transition: "all 0.15s",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: "#f8fafc",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontSize: 16, lineHeight: 1, color: "#b9172f", fontWeight: 700 }}>+</span>
              </div>
              <span>Add Property</span>
            </Link>
          </div>
        )}

        {/* Collapse toggle */}
        <div style={{ padding: "0 8px 6px" }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ws-collapse"
            style={{
              display: "flex", alignItems: "center", gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "4px 0" : "4px 10px",
              background: "none", border: "none", color: "#94a3b8",
              cursor: "pointer", fontSize: 11, fontWeight: 500, width: "100%", borderRadius: 8, fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                {collapsed ? <path d="M13 5l7 7-7 7M5 5l7 7-7 7" /> : <path d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />}
              </svg>
            </div>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column" }}>
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
      </div>

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
                  padding: "8px 20px", background: newWsName.trim() ? "#DC2626" : "#D8DFE9",
                  color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
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
