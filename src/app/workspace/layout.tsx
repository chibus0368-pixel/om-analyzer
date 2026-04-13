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
// NOTE: This component is currently unused — kept for future reuse.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _SidebarUserCard({ user, collapsed, userTier, usage, onUpgradeClick }: {
  user: import("firebase/auth").User | null;
  collapsed: boolean;
  userTier: string;
  usage: { uploadsUsed: number; uploadLimit: number } | null;
  onUpgradeClick: () => void;
}) {
  const router = useRouter();

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
  const pathname = usePathname();
  useEffect(() => setMounted(true), []);

  // The login page is the auth entry point — it should NEVER wait for
  // Firebase auth to initialize before rendering. Blocking here was adding
  // 1-3s to every cold load of /workspace/login. Render immediately and
  // bypass the workspace chrome entirely.
  const isLoginPage = pathname === "/workspace/login";
  if (isLoginPage) {
    return <>{children}</>;
  }

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
        .ws-btn-gold:hover { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(132,204,22,0.35); transform: translateY(-1px); }
        /* Inline green buttons */
        .ws-btn-red { transition: all 0.15s ease; }
        .ws-btn-red:hover { filter: brightness(1.15); box-shadow: 0 2px 8px rgba(132,204,22,0.35); transform: translateY(-1px); }
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

        /* ─── Mobile drawer slide-in animation ─── */
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        /* ─── Mobile-only elements (hidden on desktop) ─── */
        .ws-hamburger { display: none; }
        .ws-bottom-tabs { display: none; }

        /* ─── Mobile responsive ─── */
        @media (max-width: 768px) {
          /* === HEADER — Logo + three-dot menu only === */
          .ws-header { padding: 0 16px !important; height: 52px !important; min-height: 52px !important; justify-content: space-between !important; }
          .ws-header-inner { gap: 0 !important; flex: 0 0 auto !important; }
          .ws-header-logo img { height: 30px !important; }
          .ws-board-selector { display: none !important; }
          .ws-header-right { display: none !important; }
          /* Show three-dot hamburger */
          .ws-hamburger { display: flex !important; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; cursor: pointer; color: rgba(255,255,255,0.7); border-radius: 8px; flex-shrink: 0; }
          .ws-hamburger:active { background: rgba(255,255,255,0.1); }

          /* === NAV BAR — hidden on mobile (replaced by bottom tabs) === */
          .ws-nav-bar { display: none !important; }

          /* === MOBILE DRAWER === */
          .ws-mobile-overlay { display: block !important; }

          /* === BOTTOM TAB BAR === */
          .ws-bottom-tabs {
            display: flex !important;
            position: fixed; bottom: 0; left: 0; right: 0;
            height: 64px;
            background: #FFFFFF;
            border-top: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
            z-index: 900;
            align-items: stretch;
            justify-content: space-around;
            padding: 0 8px;
            padding-bottom: env(safe-area-inset-bottom, 0);
          }
          .ws-bottom-tab {
            display: flex !important; flex-direction: column; align-items: center; justify-content: center;
            flex: 1; gap: 3px; text-decoration: none; color: #9CA3AF;
            font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
            transition: color 0.15s;
            -webkit-tap-highlight-color: transparent;
            position: relative;
          }
          .ws-bottom-tab.active { color: #84CC16; }
          .ws-bottom-tab.active::before {
            content: ''; position: absolute; top: 0; left: 20%; right: 20%;
            height: 3px; background: #84CC16; border-radius: 0 0 3px 3px;
          }
          .ws-bottom-tab-upload {
            position: relative; top: -12px;
          }
          .ws-bottom-tab-upload-circle {
            width: 48px; height: 48px; border-radius: 50%;
            background: #84CC16; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 12px rgba(132,204,22,0.3);
          }
          .ws-bottom-tab-upload span { font-size: 9px; color: #6B7280; font-weight: 700; margin-top: 2px; }

          /* === MAIN CONTENT — pad bottom for tab bar === */
          .ws-main-content { padding: 10px !important; padding-bottom: 80px !important; }
          .ws-footer { flex-direction: column !important; gap: 10px !important; padding: 12px 10px 80px !important; }

          /* === MODALS === */
          .ws-new-modal { width: calc(100vw - 24px) !important; max-width: 400px !important; padding: 16px !important; }
          .ws-new-modal-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .ws-drag-overlay { padding: 20px 16px !important; }
        }
        @media (max-width: 480px) {
          .ws-header { padding: 0 12px !important; height: 48px !important; min-height: 48px !important; }
          .ws-header-logo img { height: 28px !important; }
          .ws-new-modal-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .ws-main-content { padding: 6px !important; padding-bottom: 76px !important; }
        }
      `}</style>
      <WorkspaceLayoutInner user={user}>{children}</WorkspaceLayoutInner>
    </WorkspaceProvider>
  );
}

/** Workspace dropdown — used in sidebar (dark theme) */
function SidebarWorkspaceSwitcher({ collapsed, onAddNew }: { collapsed: boolean; onAddNew: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspace();
  const router = useRouter();
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
              onClick={() => { switchWorkspace(ws.id); setOpen(false); router.push("/workspace"); }}
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
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ws.name}{ws.propertyCount != null ? ` (${ws.propertyCount})` : ""}
              </span>
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
  const router = useRouter();
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
              onClick={() => { switchWorkspace(ws.id); setOpen(false); router.push("/workspace"); }}
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
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ws.name}{ws.propertyCount != null ? ` (${ws.propertyCount})` : ""}
              </span>
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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [globalDrag, setGlobalDrag] = useState(false);
  const globalDragCounter = useRef(0);
  const prevWsIdRef = useRef<string | null>(null);
  const upgradeHandledRef = useRef(false);
  const wsDropdownRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  // ── Close more menu on outside click ──
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  // ── Global drag-and-drop overlay for file uploads ──
  useEffect(() => {
    const isUploadPage = () => window.location.pathname.includes("/workspace/upload");
    const handleDragEnter = (e: DragEvent) => {
      if (isUploadPage()) return; // upload page has its own handler
      if (e.dataTransfer?.types?.includes("Files")) {
        globalDragCounter.current++;
        setGlobalDrag(true);
      }
    };
    const handleDragLeave = () => {
      globalDragCounter.current--;
      if (globalDragCounter.current <= 0) { globalDragCounter.current = 0; setGlobalDrag(false); }
    };
    const handleDragOver = (e: DragEvent) => { if (globalDrag) e.preventDefault(); };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      globalDragCounter.current = 0;
      setGlobalDrag(false);
      if (isUploadPage()) return;
      if (e.dataTransfer?.files?.length) {
        // Store files in sessionStorage so upload page can pick them up
        const names = Array.from(e.dataTransfer.files).map(f => f.name);
        sessionStorage.setItem("globalDropFiles", JSON.stringify(names));
        // We can't pass File objects through sessionStorage, so redirect to upload
        // The upload page already has its own drop zone — user just needs to re-drop or select
        const ws = activeWorkspace?.slug || activeWorkspace?.id || "";
        router.push(`/workspace/upload${ws ? `?ws=${ws}` : ""}`);
      }
    };
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [globalDrag, activeWorkspace, router]);

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

  // ── Handle return from Stripe checkout (?upgraded=true&session_id=...) ──
  // Webhook may not have processed yet, so we (1) call sync-session to pull
  // the subscription straight from Stripe and persist the new tier, then
  // (2) retry fetchTier a few times as a safety net in case sync is slow.
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false);
  useEffect(() => {
    const upgraded = searchParams.get("upgraded");
    const sessionId = searchParams.get("session_id");
    if (upgraded !== "true" || !user) return;

    setShowUpgradeSuccess(true);

    (async () => {
      // 1. Synchronously pull the subscription from Stripe and write the tier
      if (sessionId) {
        try {
          const token = await user.getIdToken();
          await fetch("/api/stripe/sync-session", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sessionId }),
          });
        } catch (e) {
          console.warn("[workspace] sync-session failed", e);
        }
      }

      // 2. Kick the tier refresh loop a few times in case sync was slow
      const trigger = () => window.dispatchEvent(new Event("usage-updated"));
      trigger();
      for (const delay of [500, 1500, 3000, 6000]) {
        setTimeout(trigger, delay);
      }
    })();

    // Clean the URL params
    const url = new URL(window.location.href);
    url.searchParams.delete("upgraded");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", url.pathname + url.search);

    // Auto-dismiss after 6 seconds
    const t = setTimeout(() => setShowUpgradeSuccess(false), 6000);
    return () => clearTimeout(t);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, activeWorkspace?.id]);

  // Only show loading flash on very first load, not workspace switches
  useEffect(() => {
    if (!activeWorkspace) return;
    const isFirstLoad = prevWsIdRef.current === null;
    prevWsIdRef.current = activeWorkspace.id;
    if (isFirstLoad) setLoadingProps(true);
    loadProperties();
  }, [loadProperties, activeWorkspace]);

  // Listen for property/workspace changes (event-driven refresh, no polling)
  useEffect(() => {
    const handler = () => loadProperties();
    window.addEventListener("workspace-properties-changed", handler);
    window.addEventListener("workspace-changed", handler);
    // Removed: 30-second polling was causing ~80 unnecessary API calls per session
    return () => {
      window.removeEventListener("workspace-properties-changed", handler);
      window.removeEventListener("workspace-changed", handler);
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

  // If not authenticated: show login page without workspace chrome, or show loading while redirecting
  if (!user) {
    if (isLoginPage) {
      // Render children (login page) without the workspace sidebar/header
      return <>{children}</>;
    }
    // Show loading spinner while redirecting or during auth token refresh
    // (Firebase onAuthStateChanged can briefly fire null during token refresh)
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F8FA" }}>
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#F7F8FA" }}>
      {/* ===== TOP HEADER BAR — Deal Signals ===== */}
      <header className="ws-header" style={{
        display: "flex", alignItems: "center",
        height: 64, minHeight: 64,
        background: "#0b1326", borderBottom: "1px solid rgba(255,255,255,0.1)",
        zIndex: 60,
        padding: "0 32px",
      }}>
        {/* Left: Logo + DealBoard selector */}
        <div className="ws-header-inner" style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <Link href="/workspace" className="ws-header-logo" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            <img src="/images/dealsignals-full-logo4.png" alt="DealSignals" style={{ height: 36 }} />
          </Link>

          {/* DealBoard selector — separated by border */}
          <div ref={wsDropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowWsDropdown(v => !v)}
              className="ws-board-selector"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                paddingLeft: 24, borderLeft: "1px solid rgba(255,255,255,0.1)", marginLeft: 8,
                background: "none", border: "none", borderLeftStyle: "solid", borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.1)",
                cursor: "pointer", transition: "opacity 0.15s",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.4 }}>
                  <span className="ws-board-name" style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.025em" }}>
                    {activeWorkspace?.name || "Default Dealboard"}
                  </span>
                  <span className="ws-board-type" style={{
                    background: "rgba(132,204,22,0.1)", color: "#84CC16",
                    fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em",
                    padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(132,204,22,0.2)",
                    flexShrink: 0,
                  }}>
                    {ANALYSIS_TYPE_LABELS[activeWorkspace?.analysisType || "retail"] || "Retail"}
                  </span>
                </div>
                <div className="ws-board-sub" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Select Dealboard
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showWsDropdown ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </div>
            </button>

            {/* Workspace dropdown */}
            {showWsDropdown && (
              <div className="ws-ws-dropdown" style={{
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
                          router.push(`/workspace?ws=${encodeURIComponent(ws.slug)}`);
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
                          {ws.name}{ws.propertyCount != null ? ` (${ws.propertyCount})` : ""}
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
        <div className="ws-header-right" style={{ display: "flex", alignItems: "center", gap: 24, marginLeft: "auto" }}>
          {userTier === "free" ? (
            <button
              onClick={() => setShowUpgrade(true)}
              className="ws-plan-pill"
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
            <Link href="/workspace/profile?tab=account" className="ws-plan-pill" style={{
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
            <Link
              href="/workspace/profile"
              onClick={() => router.push("/workspace/profile")}
              title="Account & Profile"
              className="ws-user-link"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.1)",
                textDecoration: "none", transition: "opacity 0.15s",
                cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.75"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >
              <div className="ws-user-text" style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {user.displayName || user.email?.split("@")[0] || "User"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.3 }}>
                  {user.email || ""}
                </div>
              </div>
              <div className="ws-avatar" style={{
                width: 36, height: 36, borderRadius: "50%", background: "#84CC16",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: "#000", flexShrink: 0,
                border: "2px solid rgba(255,255,255,0.1)",
              }}>
                {user.displayName ? user.displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : (user.email?.split("@")[0] || "U").substring(0, 2).toUpperCase()}
              </div>
            </Link>
          )}

          {/* More menu (three dots) */}
          <div ref={moreMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              style={{
                background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 4,
                display: "flex", alignItems: "center", borderRadius: 6, transition: "color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
            </button>
            {showMoreMenu && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, width: 220,
                background: "#fff", borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
                border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden", zIndex: 999,
              }}>
                {[
                  { href: "/workspace/manage", label: "Manage Dealboards", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
                  { href: `/workspace/upload/history?ws=${activeWorkspace?.slug || "default"}`, label: "Upload History", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg> },
                  { href: "/workspace/profile", label: "Account & Profile", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
                  { href: "/workspace/help", label: "Support", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMoreMenu(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 16px", fontSize: 13, fontWeight: 500,
                      color: "#374151", textDecoration: "none", transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ color: "#9CA3AF", display: "flex" }}>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
                {/* Divider */}
                <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "4px 0" }} />
                {/* Log out */}
                <button
                  onClick={async () => {
                    setShowMoreMenu(false);
                    try {
                      const { getAuth, signOut } = await import("firebase/auth");
                      await signOut(getAuth());
                    } catch { /* non-blocking */ }
                    router.push("/workspace/login");
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "11px 16px", fontSize: 13, fontWeight: 500,
                    color: "#DC2626", background: "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit", transition: "background 0.12s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: "#DC2626", display: "flex" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Three-dot menu button (mobile only, hidden on desktop via CSS) ─── */}
        <button
          className="ws-hamburger"
          onClick={() => setShowMobileMenu(v => !v)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </header>

      {/* ─── Mobile Slide-Out Drawer (hidden on desktop via CSS: display:none) ─── */}
      {showMobileMenu && (
        <div className="ws-mobile-overlay" style={{ display: "none" }}>
          {/* Backdrop */}
          <div
            onClick={() => setShowMobileMenu(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 998 }}
          />
          {/* Drawer */}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, width: "min(300px, 80vw)",
            background: "#0f1729", zIndex: 999, display: "flex", flexDirection: "column",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.4)", animation: "slideInRight 0.25s ease",
            overflowY: "auto",
          }}>
            {/* Drawer header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", letterSpacing: "0.05em" }}>Menu</span>
              <button onClick={() => setShowMobileMenu(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Dealboard selector in drawer */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Current Dealboard</div>
              <button
                onClick={() => { setShowMobileMenu(false); setShowWsDropdown(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", border: "1px solid rgba(132,204,22,0.2)", borderRadius: 8,
                  background: "rgba(132,204,22,0.06)", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 4, background: "#84CC16", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#FFFFFF", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeWorkspace?.name || "Default Dealboard"}
                </span>
                <span style={{
                  fontSize: 8, fontWeight: 700, color: "#84CC16", textTransform: "uppercase",
                  letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 4,
                  background: "rgba(132,204,22,0.1)", border: "1px solid rgba(132,204,22,0.2)",
                }}>
                  {ANALYSIS_TYPE_LABELS[activeWorkspace?.analysisType || "retail"] || "Retail"}
                </span>
              </button>
            </div>

            {/* Navigation links */}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "8px 8px 4px" }}>Navigate</div>
              {[
                { href: "/workspace", label: "Dealboard", icon: "M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13" },
                { href: "/workspace/scoreboard", label: "Scorecard", icon: "M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3" },
                { href: "/workspace/upload", label: "Upload Deal", icon: "M12 13v8M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 17l4-4 4 4" },
                { href: "/workspace/map", label: "Map", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" },
              ].map(item => {
                const isActive = item.href === "/workspace" ? pathname === "/workspace" || pathname.startsWith("/workspace/properties") : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={`${item.href}${activeWorkspace?.slug ? "?ws=" + activeWorkspace.slug : ""}`}
                    onClick={() => setShowMobileMenu(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 8px", borderRadius: 8, textDecoration: "none",
                      color: isActive ? "#84CC16" : "rgba(255,255,255,0.65)",
                      background: isActive ? "rgba(132,204,22,0.08)" : "transparent",
                      fontSize: 14, fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* More links */}
            <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em", padding: "8px 8px 4px" }}>More</div>
              {[
                { href: `/workspace/share${activeWorkspace?.slug ? "?ws=" + activeWorkspace.slug : ""}`, label: "Share DealBoard" },
                { href: "/workspace/manage", label: "Manage Dealboards" },
                { href: `/workspace/upload/history?ws=${activeWorkspace?.slug || "default"}`, label: "Upload History" },
                { href: "/workspace/profile", label: "Account & Profile" },
                { href: "/workspace/help", label: "Support" },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 8px", borderRadius: 8, textDecoration: "none",
                    color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 500,
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Plan + User info + Logout */}
            <div style={{ padding: "12px 16px", marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Plan pill — visible in mobile drawer */}
              <div style={{ marginBottom: 12 }}>
                {userTier === "free" ? (
                  <button
                    onClick={() => { setShowMobileMenu(false); setShowUpgrade(true); }}
                    style={{
                      width: "100%", padding: "10px 0", background: "rgba(132,204,22,0.15)", color: "#84CC16",
                      border: "1px solid rgba(132,204,22,0.25)", borderRadius: 8,
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Upgrade to Pro
                  </button>
                ) : (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "8px 0", background: "rgba(132,204,22,0.1)", borderRadius: 8,
                    border: "1px solid rgba(132,204,22,0.2)",
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: "#84CC16" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#84CC16", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      {userTier === "pro" ? "Pro Plan" : userTier === "pro_plus" ? "Pro+ Plan" : "Active Plan"}
                    </span>
                  </div>
                )}
              </div>
              {user && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#84CC16",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#000", flexShrink: 0,
                  }}>
                    {user.displayName ? user.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) : (user.email?.split("@")[0] || "U").substring(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.displayName || user.email?.split("@")[0] || "User"}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user.email || ""}
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={async () => {
                  setShowMobileMenu(false);
                  try {
                    const { getAuth, signOut } = await import("firebase/auth");
                    await signOut(getAuth());
                  } catch { /* non-blocking */ }
                  router.push("/workspace/login");
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", padding: "10px 0", border: "1px solid rgba(220,38,38,0.3)",
                  borderRadius: 8, background: "rgba(220,38,38,0.08)", cursor: "pointer",
                  color: "#EF4444", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NAV BAR — Horizontal Tabs ===== */}
      <nav className="ws-nav-bar" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 56, minHeight: 56,
        background: "#FFFFFF", borderBottom: "1px solid rgba(0,0,0,0.06)",
        padding: "0 32px",
      }}>
        {/* Left: Tabs with icons */}
        <div className="ws-nav-tabs" style={{ display: "flex", alignItems: "center", gap: 32, height: "100%" }}>
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
        <div className="ws-nav-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href={`/workspace/share${activeWorkspace?.slug ? "?ws=" + activeWorkspace.slug : ""}`}
            className="ws-share-btn"
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
          {/* Info tooltip for sharing — click to toggle so user can click Learn more */}
          <div className="ws-info-icon" style={{ position: "relative" }}>
            <div
              onClick={() => {
                const tip = document.getElementById("share-tooltip");
                if (!tip) return;
                const isVisible = tip.style.opacity === "1";
                tip.style.opacity = isVisible ? "0" : "1";
                tip.style.pointerEvents = isVisible ? "none" : "auto";
              }}
              style={{
                width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(156,163,175,0.08)", cursor: "pointer", transition: "background 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div id="share-tooltip" className="ws-share-tooltip" style={{
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
              <Link href="/workspace/help#sharing" onClick={() => {
                const tip = document.getElementById("share-tooltip");
                if (tip) { tip.style.opacity = "0"; tip.style.pointerEvents = "none"; }
              }} style={{
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
        <div className="ws-main-content" style={{ flex: 1, overflow: "auto", padding: 32, display: "flex", flexDirection: "column" }}>
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
          <footer className="ws-footer" style={{
            padding: "32px 0 24px", marginTop: 40,
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            fontSize: 11, color: "#585e70",
            flexWrap: "wrap", gap: 16,
          }}>
            <div>
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 14, color: "#151b2b", display: "block", marginBottom: 6 }}>DealSignals</span>
              <span style={{ color: "#585e70", fontSize: 10 }}>&copy; {new Date().getFullYear()} DealSignals, Inc. All rights reserved.</span>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <a href="/" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Home</a>
              <a href="/#pricing" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Pricing</a>
              <a href="/contact" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Contact</a>
              <a href="/terms" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Terms</a>
              <a href="/privacy" style={{ color: "#585e70", textDecoration: "none", fontSize: 11 }}>Privacy</a>
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
            className="ws-new-modal"
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
            <div className="ws-new-modal-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {(["retail", "industrial", "office", "land", "multifamily"] as AnalysisType[]).map(type => (
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

      {/* ─── Mobile Bottom Tab Bar (hidden on desktop via CSS) ─── */}
      <nav className="ws-bottom-tabs">
        {[
          { href: "/workspace", label: "Dealboard", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, isUpload: false },
          { href: "/workspace/scoreboard", label: "Scorecard", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>, isUpload: false },
          { href: "/workspace/upload", label: "Upload", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 13v8"/><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="m8 17 4-4 4 4"/></svg>, isUpload: true },
          { href: "/workspace/map", label: "Map", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><circle cx="12" cy="11" r="3"/></svg>, isUpload: false },
        ].map(tab => {
          const active = tab.href === "/workspace"
            ? pathname === "/workspace" || pathname.startsWith("/workspace/properties")
            : pathname.startsWith(tab.href);
          const wsSlug = activeWorkspace?.slug ? `?ws=${activeWorkspace.slug}` : "";

          if (tab.isUpload) {
            return (
              <Link key={tab.href} href={`${tab.href}${wsSlug}`} className="ws-bottom-tab ws-bottom-tab-upload" style={{ textDecoration: "none" }}>
                <div className="ws-bottom-tab-upload-circle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                </div>
                <span>Upload</span>
              </Link>
            );
          }

          return (
            <Link key={tab.href} href={`${tab.href}${wsSlug}`} className={`ws-bottom-tab${active ? " active" : ""}`} style={{ textDecoration: "none" }}>
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Global drag-and-drop overlay */}
      {globalDrag && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(132, 204, 22, 0.06)",
          border: "3px dashed #84CC16",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div className="ws-drag-overlay" style={{
            background: "#fff", borderRadius: 12, padding: "32px 48px", textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#151b2b", margin: "0 0 4px", fontFamily: "'Inter', sans-serif" }}>
              Drop files to upload
            </p>
            <p style={{ fontSize: 13, color: "#585e70", margin: 0 }}>
              PDF, Excel, or CSV
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
