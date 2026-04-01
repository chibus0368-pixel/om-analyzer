"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getWorkspaceProperties } from "@/lib/workspace/firestore";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace/workspace-context";
import type { Property } from "@/lib/workspace/types";
import Link from "next/link";

const TOP_NAV = [
  { href: "/workspace", label: "Dashboard", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { href: "/workspace/scoreboard", label: "Scoreboard", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/workspace/upload", label: "Upload Property", icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" },
  { href: "/workspace/map", label: "Map", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
];

const BOTTOM_NAV = [
  { href: "/workspace/manage", label: "Manage Workspaces", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/workspace/settings", label: "Settings", icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" },
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
        padding: "8px 12px", borderRadius: 6,
        color: active ? "#fff" : "rgba(255,255,255,0.5)",
        background: active ? "rgba(196,154,60,0.15)" : "transparent",
        textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
        transition: "all 0.15s",
      }}
      title={collapsed ? label : undefined}
    >
      <SidebarIcon d={icon} />
      {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{label}</span>}
    </Link>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "#F6F8FB", color: "#5A7091" }}>Loading workspace...</div>}>
      <WorkspaceProvider userId="admin-user">
        <style>{`
          /* Sidebar nav hover */
          .ws-nav:hover { background: rgba(255,255,255,0.06) !important; color: #fff !important; }
          .ws-prop-link:hover { background: rgba(255,255,255,0.06) !important; color: #fff !important; }
          .ws-add-prop:hover { border-color: rgba(255,255,255,0.35) !important; color: rgba(255,255,255,0.7) !important; }
          /* Global gold buttons (New Workspace, Create Workspace) */
          .ws-btn-gold { transition: all 0.15s ease; }
          .ws-btn-gold:hover { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(196,154,60,0.4); transform: translateY(-1px); }
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
          .ws-collapse:hover { color: rgba(255,255,255,0.6) !important; }
        `}</style>
        <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      </WorkspaceProvider>
    </Suspense>
  );
}

/** Workspace dropdown in the header breadcrumb */
function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace, addWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const showDropdown = workspaces.length > 1 || open;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => { if (workspaces.length > 1) setOpen(!open); }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: workspaces.length > 1 ? "pointer" : "default",
          fontSize: 12, fontWeight: 600, color: "#0B1120", fontFamily: "inherit", padding: 0,
        }}
      >
        {activeWorkspace?.name || "Loading..."}
        {workspaces.length > 1 && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 2 }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 220,
          background: "#fff", border: "1px solid #E5E9F0", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100,
          overflow: "hidden",
        }}>
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => { switchWorkspace(ws.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "10px 14px", background: ws.id === activeWorkspace?.id ? "#F6F8FB" : "transparent",
                border: "none", cursor: "pointer", fontSize: 13, color: "#0B1120",
                fontWeight: ws.id === activeWorkspace?.id ? 600 : 400, fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              {ws.id === activeWorkspace?.id && <span style={{ color: "#C49A3C", fontSize: 14 }}>✓</span>}
              {ws.id !== activeWorkspace?.id && <span style={{ width: 14 }} />}
              {ws.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, addWorkspace, loading: wsLoading } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [showNewWs, setShowNewWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const prevWsIdRef = useRef<string | null>(null);

  const user = { email: "admin@nnntriplenet.com", uid: "admin-user" } as any;

  // Load properties for active workspace
  const loadProperties = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const props = await getWorkspaceProperties(user.uid, activeWorkspace.id);
      setProperties(props.sort((a, b) => a.propertyName.localeCompare(b.propertyName)));
    } catch { /* ignore */ }
    setLoadingProps(false);
  }, [user.uid, activeWorkspace?.id]);

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
      console.log("[Layout] Creating workspace:", name);
      await addWorkspace(name);
      console.log("[Layout] Workspace created successfully");
      setNewWsName("");
      setShowNewWs(false);
      router.push("/workspace");
    } catch (err) {
      console.error("[Layout] Failed to create workspace:", err);
      alert("Failed to create workspace. Check console for details.");
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#F6F8FB" }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 68 : 260, minWidth: collapsed ? 68 : 260,
        background: "#0B1120", color: "#fff", display: "flex", flexDirection: "column",
        transition: "width 0.2s, min-width 0.2s", zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? "14px 8px" : "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: collapsed ? 0 : 10, minHeight: 56 }}>
          <div style={{
            width: collapsed ? 32 : 28, height: collapsed ? 32 : 28, borderRadius: 6,
            background: "#DC2626",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            boxShadow: "0 1px 4px rgba(220,38,38,0.35)",
          }}>
            <span style={{ color: "#fff", fontSize: collapsed ? 11 : 10, fontWeight: 900, lineHeight: 1, letterSpacing: -0.3 }}>NNN</span>
          </div>
          {!collapsed && (
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>OM Analyzer</span>
          )}
        </div>

        {/* Workspace name label */}
        {!collapsed && activeWorkspace?.name && (
          <div style={{
            padding: "12px 14px 4px",
            fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2,
            color: "#C49A3C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {activeWorkspace.name}
          </div>
        )}

        {/* Top nav — indented under workspace name */}
        <div style={{ padding: collapsed ? "10px 8px 4px" : "2px 8px 4px 14px", display: "flex", flexDirection: "column", gap: 1 }}>
          {TOP_NAV.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        {/* Properties List */}
        {!collapsed && (
          <div style={{ flex: 1, overflow: "auto", padding: "8px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px 8px", marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.3)" }}>Properties</span>
            </div>

            {loadingProps ? (
              <div style={{ padding: "12px", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Loading...</div>
            ) : properties.length === 0 ? (
              <div style={{ padding: "8px 12px", color: "rgba(255,255,255,0.25)", fontSize: 11 }}>No properties yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {properties.map(prop => (
                  <Link
                    key={prop.id}
                    href={`/workspace/properties/${prop.id}`}
                    className="ws-prop-link"
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                      fontSize: 12, color: pathname.includes(prop.id) ? "#fff" : "rgba(255,255,255,0.5)",
                      textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", borderRadius: 4,
                      background: pathname === `/workspace/properties/${prop.id}` ? "rgba(196,154,60,0.12)" : "transparent",
                      fontWeight: pathname.includes(prop.id) ? 600 : 400,
                    }}
                    title={`${prop.propertyName}${prop.city ? " - " + prop.city : ""}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{prop.propertyName}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Add Property button */}
            <Link
              href="/workspace/upload"
              className="ws-add-prop"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                marginTop: 8, padding: "7px 12px",
                fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.45)",
                textDecoration: "none", borderRadius: 5,
                border: "1px dashed rgba(255,255,255,0.15)",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 13 }}>+</span> Add Property
            </Link>

          </div>
        )}

        {/* Bottom nav */}
        <div style={{ padding: "4px 8px 8px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 1 }}>
          {BOTTOM_NAV.map(item => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ws-collapse"
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              background: "none", border: "none", color: "rgba(255,255,255,0.3)",
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
        <header style={{
          height: 48, minHeight: 48, background: "#fff", borderBottom: "1px solid #EDF0F5",
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link href="/" style={{ fontSize: 11, color: "#8899B0", textDecoration: "none" }}>NNNTripleNet.com</Link>
            <span style={{ color: "#D8DFE9", fontSize: 11 }}>/</span>
            <WorkspaceSwitcher />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowNewWs(true)}
              className="ws-btn-gold"
              style={{ padding: "5px 14px", background: "#C49A3C", color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              + New Workspace
            </button>
          </div>
        </header>
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>{children}</div>
          <footer style={{
            padding: "14px 20px", marginTop: 32,
            borderTop: "1px solid #EDF0F5",
            fontSize: 11, lineHeight: 1.5, color: "#8899B0", textAlign: "center",
          }}>
            <span style={{ fontWeight: 600, color: "#5A7091" }}>Disclaimer:</span>{" "}
            This tool is for initial first-pass analysis only. Information may be incorrect or parsed incorrectly. Always verify all data independently before making investment decisions.
          </footer>
        </div>
      </main>

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
              background: "#fff", borderRadius: 12, padding: "28px 32px", width: 380,
              boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#0B1120" }}>New Workspace</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#5A7091" }}>Create a blank workspace for a new set of properties.</p>
            <input
              autoFocus
              value={newWsName}
              onChange={e => setNewWsName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateWorkspace(); }}
              placeholder="e.g. Q2 Pipeline, Client Portfolio"
              style={{
                width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 6,
                border: "1px solid #D8DFE9", outline: "none", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowNewWs(false)}
                style={{ padding: "8px 16px", background: "transparent", border: "1px solid #D8DFE9", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#5A7091", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={!newWsName.trim()}
                className="ws-btn-gold"
                style={{
                  padding: "8px 20px", background: newWsName.trim() ? "#C49A3C" : "#D8DFE9",
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
