"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getWorkspaceProperties } from "@/lib/workspace/firestore";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace/workspace-context";
import { useWorkspaceAuth } from "@/lib/workspace/auth";
import type { Property, AnalysisType } from "@/lib/workspace/types";
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_ICONS, ANALYSIS_TYPE_COLORS } from "@/lib/workspace/types";
import Link from "next/link";
import DealSignalLogo from "@/components/DealSignalLogo";
import TrialStatusBar from "@/components/billing/TrialStatusBar";

import UpgradeModal from "@/components/billing/UpgradeModal";

/* Sidebar nav — matches Deal Signal design */
const SIDEBAR_NAV = [
  { href: "/workspace", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { href: "/workspace/scoreboard", label: "Scoreboard", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/workspace/upload", label: "Upload Property", icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" },
  { href: "/workspace/map", label: "Map", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" },
];

/* Top header nav links — removed per design: sidebar handles all nav inside the app */

const BOTTOM_NAV = [
  { href: "/workspace/share", label: "Shareable Links", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
  { href: "/workspace/manage", label: "Workspaces", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/workspace/help", label: "Help", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/workspace/settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/workspace/profile", label: "Account Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
];

function SidebarIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

function NavLink({ href, label, icon, active, collapsed }: { href: string; label: string; icon: string; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={href}
      className="ws-nav"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", borderRadius: 0,
        borderLeft: active ? "3px solid #b9172f" : "3px solid transparent",
        color: active ? "#b9172f" : "#585e70",
        background: "transparent",
        textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
        letterSpacing: 0.3, textTransform: "uppercase" as const,
        transition: "all 0.15s",
      }}
      title={collapsed ? label : undefined}
    >
      <SidebarIcon d={icon} />
      {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
    </Link>
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
        .ws-nav:hover { background: rgba(185, 23, 47, 0.04) !important; color: #b9172f !important; }
        .ws-header-nav:hover { color: #b9172f !important; }
        .ws-new-analysis:hover { background: rgba(185, 23, 47, 0.06) !important; }
        .ws-prop-link:hover { background: rgba(185, 23, 47, 0.04) !important; color: #151b2b !important; }
        .ws-add-prop:hover { border-color: rgba(185, 23, 47, 0.2) !important; color: #585e70 !important; }
        .ws-props-scroll::-webkit-scrollbar { width: 4px; }
        .ws-props-scroll::-webkit-scrollbar-track { background: transparent; }
        .ws-props-scroll::-webkit-scrollbar-thumb { background: rgba(88,94,112,0.2); border-radius: 4px; }
        .ws-props-scroll::-webkit-scrollbar-thumb:hover { background: rgba(88,94,112,0.35); }
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
          title={activeWorkspace?.name || "Workspace"}
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
          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2,
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
          position: "absolute", top: "100%", left: 8, right: 8, marginTop: 4,
          background: "#ffffff", borderRadius: 6, zIndex: 100,
          boxShadow: "0 20px 40px rgba(21, 27, 43, 0.12)",
          overflow: "hidden",
        }}>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
              className="ws-nav"
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "9px 12px", background: ws.id === activeWorkspace?.id ? "rgba(185, 23, 47, 0.06)" : "transparent",
                border: "none", cursor: "pointer", fontSize: 12, color: ws.id === activeWorkspace?.id ? "#b9172f" : "#585e70",
                fontWeight: ws.id === activeWorkspace?.id ? 600 : 400, fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              {ws.id === activeWorkspace?.id && <span style={{ color: "#b9172f", fontSize: 12 }}>✓</span>}
              {ws.id !== activeWorkspace?.id && <span style={{ width: 12 }} />}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws.name}</span>
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "2px 6px", borderRadius: 3,
                background: `${ANALYSIS_TYPE_COLORS[ws.analysisType || "retail"]}25`,
                color: ANALYSIS_TYPE_COLORS[ws.analysisType || "retail"],
                fontSize: 10, fontWeight: 600,
              }}>
                {ANALYSIS_TYPE_LABELS[ws.analysisType || "retail"]}
              </span>
            </button>
          ))}
          <div style={{ margin: "4px 0 0" }}>
            <button
              onClick={() => { setOpen(false); onAddNew(); }}
              className="ws-nav"
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "9px 12px", background: "transparent",
                border: "none", cursor: "pointer", fontSize: 12,
                color: "#585e70", fontWeight: 500, fontFamily: "inherit",
                textAlign: "left", transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#b9172f")}
              onMouseLeave={e => (e.currentTarget.style.color = "#585e70")}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              <span>Add New Workspace</span>
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#faf8ff" }}>
      {/* ===== TOP HEADER BAR — Deal Signal ===== */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56, minHeight: 56,
        background: "#ffffff", boxShadow: "0 1px 3px rgba(21, 27, 43, 0.04)",
        zIndex: 60,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <Link href="/workspace" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            <DealSignalLogo size={28} fontSize={17} gap={8} />
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TrialStatusBar onUpgradeClick={() => setShowUpgrade(true)} />
          {userTier === "free" ? (
            <button
              onClick={() => setShowUpgrade(true)}
              style={{
                padding: "8px 18px", background: "#b9172f", color: "#fff", borderRadius: 6,
                fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Upgrade to Pro
            </button>
          ) : (
            <Link href="/workspace/profile?tab=account" style={{
              padding: "8px 18px", background: "transparent", color: "#b9172f",
              border: "1px solid rgba(185, 23, 47, 0.25)", borderRadius: 6,
              fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "'Inter', sans-serif",
            }}>
              {userTier === "pro" ? "Pro Plan" : userTier === "pro_plus" ? "Pro+" : "My Plan"}
            </Link>
          )}
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "#585e70", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </button>
          <Link href="/workspace/profile" className="ws-header-nav" title="Account Profile" style={{
            background: "none", border: "none", cursor: "pointer", color: "#585e70", padding: 4,
            display: "flex", alignItems: "center", borderRadius: 6, transition: "color 0.15s, background 0.15s",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </Link>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 68 : 280, minWidth: collapsed ? 68 : 280,
        background: "transparent", color: "#151b2b", display: "flex", flexDirection: "column",
        transition: "width 0.2s, min-width 0.2s", zIndex: 50,
        paddingTop: 16, overflow: "hidden",
      }}>
        {/* Workspace info */}
        {!collapsed && (
          <div style={{ padding: "0 16px 12px" }}>
            <SidebarWorkspaceSwitcher collapsed={collapsed} onAddNew={() => setShowNewWs(true)} />
          </div>
        )}
        {collapsed && <SidebarWorkspaceSwitcher collapsed={collapsed} onAddNew={() => setShowNewWs(true)} />}

        {/* Main nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SIDEBAR_NAV.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {/* Properties List */}
        {!collapsed && (
          <div className="ws-props-scroll" style={{ flex: 1, overflow: "auto", padding: "8px 8px", marginTop: 4, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px 8px", marginBottom: 2, position: "sticky", top: 0, background: "#faf8f4", zIndex: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#585e70" }}>Properties{properties.length > 0 ? ` (${properties.length})` : ""}</span>
            </div>

            {loadingProps ? (
              <div style={{ padding: "12px", color: "#585e70", fontSize: 11 }}>Loading...</div>
            ) : properties.length === 0 ? (
              <div style={{ padding: "8px 12px", color: "#585e70", fontSize: 11 }}>No properties yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {properties.map(prop => (
                  <Link
                    key={prop.id}
                    href={`/workspace/properties/${prop.id}`}
                    className="ws-prop-link"
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                      fontSize: 12, color: pathname.includes(prop.id) ? "#b9172f" : "#585e70",
                      textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", borderRadius: 4,
                      background: pathname === `/workspace/properties/${prop.id}` ? "rgba(185, 23, 47, 0.06)" : "transparent",
                      fontWeight: pathname.includes(prop.id) ? 600 : 400,
                    }}
                    title={`${prop.propertyName}${prop.city ? " - " + prop.city : ""}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#585e70" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{prop.propertyName}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Add New Property button — below properties list */}
            <Link href="/workspace/upload" className="ws-add-prop" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", marginTop: 8,
              border: "1px solid rgba(227, 190, 189, 0.15)", borderRadius: 6, color: "#585e70",
              fontSize: 11, fontWeight: 600, textDecoration: "none",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 14, lineHeight: 1, color: "#b9172f" }}>+</span>
              <span>Add New Property</span>
            </Link>
          </div>
        )}

        {/* Divider */}
        {!collapsed && (
          <div style={{ margin: "4px 16px 4px", borderTop: "1px solid rgba(227, 190, 189, 0.15)" }} />
        )}

        {/* Bottom nav */}
        <div style={{ padding: "4px 8px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
          {BOTTOM_NAV.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ws-collapse"
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              background: "none", border: "none", color: "#585e70",
              cursor: "pointer", fontSize: 11, width: "100%", borderRadius: 6, fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              {collapsed ? <path d="M13 5l7 7-7 7M5 5l7 7-7 7" /> : <path d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />}
            </svg>
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
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 14, color: "#151b2b", display: "block", marginBottom: 6 }}>Deal Signal</span>
              <span style={{ color: "#585e70", fontSize: 10 }}>&copy; 2026 NNNTripleNet. All rights reserved.</span>
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
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#151b2b" }}>New Workspace</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#585e70" }}>Create a blank workspace for a new set of properties.</p>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#151b2b", marginBottom: 8 }}>Workspace Name</label>
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

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#151b2b", marginBottom: 10 }}>Property Type</label>
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
