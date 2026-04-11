"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Workspace, AnalysisType } from "./types";
import { toSlug } from "./types";

/**
 * Workspace storage is now DURABLE: the source of truth is Firestore
 * (via /api/workspace/boards), and localStorage is a write-behind cache
 * so the UI renders instantly on load before the server round-trip
 * completes. Previously workspaces lived ONLY in localStorage, which
 * meant clearing cache blew away every DealBoard and orphaned all
 * property rows attributed to them.
 *
 * On mount we:
 *   1. Hydrate from localStorage immediately (fast paint)
 *   2. Fetch /api/workspace/boards in the background
 *   3. Reconcile: server wins; cache is refreshed
 *
 * Mutations (add / rename / delete) optimistically update local state,
 * then write through to the server; on failure we revert.
 */

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  loading: boolean;
  switchWorkspace: (id: string) => void;
  addWorkspace: (name: string, analysisType?: AnalysisType) => Promise<Workspace>;
  renameWorkspace: (id: string, newName: string) => void;
  deleteWorkspace: (id: string) => void;
  clearWorkspaceData: (id: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeWorkspace: null,
  loading: true,
  switchWorkspace: () => {},
  addWorkspace: async () => ({} as Workspace),
  renameWorkspace: () => {},
  deleteWorkspace: () => {},
  clearWorkspaceData: async () => {},
  refreshWorkspaces: async () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

const WS_LIST_KEY = "nnn-workspaces";
const ACTIVE_WS_KEY = "nnn-active-workspace";
const DEFAULT_WS_ID = "default";

function generateId(): string {
  return "ws_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Grab a fresh Firebase ID token for authenticated API calls. */
async function getAuthToken(): Promise<string | null> {
  try {
    const { getAuth } = await import("firebase/auth");
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/** Ensure every workspace has a slug and analysisType (migration for pre-slug/pre-analysisType workspaces) */
function ensureSlugs(workspaces: Workspace[]): Workspace[] {
  let changed = false;
  const slugged = workspaces.map(ws => {
    const updated = { ...ws };
    if (!ws.slug) {
      changed = true;
      updated.slug = ws.id === DEFAULT_WS_ID ? "default" : toSlug(ws.name);
    }
    if (!ws.analysisType) {
      changed = true;
      updated.analysisType = "retail";
    }
    return updated;
  });
  // Deduplicate slugs by appending index
  const seen = new Map<string, number>();
  const deduped = slugged.map(ws => {
    const count = seen.get(ws.slug) || 0;
    seen.set(ws.slug, count + 1);
    if (count > 0) return { ...ws, slug: `${ws.slug}-${count}` };
    return ws;
  });
  if (changed) saveWorkspaces(deduped);
  return deduped;
}

function getStoredWorkspaces(): Workspace[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return ensureSlugs(parsed);
    }
  } catch { /* ignore */ }
  // Return default workspace if nothing stored
  const defaultWs: Workspace = {
    id: DEFAULT_WS_ID,
    userId: "",
    name: "Default DealBoard",
    slug: "default",
    analysisType: "retail",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(WS_LIST_KEY, JSON.stringify([defaultWs]));
  return [defaultWs];
}

function saveWorkspaces(workspaces: Workspace[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WS_LIST_KEY, JSON.stringify(workspaces));
}

/**
 * Fetch server-authoritative workspaces list. Returns null on any error
 * so callers can fall back to the local cache without exploding.
 */
async function fetchRemoteWorkspaces(): Promise<Workspace[] | null> {
  try {
    const token = await getAuthToken();
    if (!token) return null;
    const res = await fetch("/api/workspace/boards", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.workspaces)) return null;
    return data.workspaces as Workspace[];
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // SSR-safe initialization — start with empty defaults to avoid hydration mismatch,
  // then hydrate from localStorage in useEffect below.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // true until first client-side hydration
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage on mount (fast paint), then reconcile with server.
  useEffect(() => {
    const cached = getStoredWorkspaces();
    const withUser = cached.map(ws => ({ ...ws, userId }));
    setWorkspaces(withUser);
    saveWorkspaces(withUser);

    // Determine active workspace: URL ?ws= slug > localStorage > first workspace
    const urlSlug = new URLSearchParams(window.location.search).get("ws");
    let resolvedId: string = cached[0]?.id || DEFAULT_WS_ID;

    if (urlSlug) {
      const match = cached.find(ws => ws.slug === urlSlug || ws.id === urlSlug);
      if (match) {
        localStorage.setItem(ACTIVE_WS_KEY, match.id);
        resolvedId = match.id;
      }
    } else {
      const savedId = localStorage.getItem(ACTIVE_WS_KEY);
      const valid = savedId && cached.some(ws => ws.id === savedId);
      if (valid) resolvedId = savedId!;
    }

    setActiveId(resolvedId);
    setLoading(false);
    setMounted(true);

    // Background reconcile with server — server is authoritative. This is
    // the critical step that makes boards survive a cache wipe.
    (async () => {
      const token = await getAuthToken();
      if (!token) return;
      const remote = await fetchRemoteWorkspaces();
      if (!remote) return;

      // ── One-time migration ─────────────────────────────────────────
      // Users who were on the old localStorage-only build have boards
      // that the server knows nothing about. Before trusting the server
      // list, push any locally-known boards that are missing upstream.
      // Without this, the first post-deploy load would silently delete
      // every custom DealBoard (and orphan every property on them).
      const remoteIds = new Set(remote.map(w => w.id));
      const missing = cached.filter(w => !remoteIds.has(w.id));
      if (missing.length > 0) {
        await Promise.all(
          missing.map(async w => {
            try {
              const res = await fetch("/api/workspace/boards", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: w.id,
                  name: w.name,
                  analysisType: w.analysisType || "retail",
                }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data?.workspace) remote.push(data.workspace as Workspace);
              } else {
                console.warn("[workspace] migration POST failed:", res.status, w.id);
              }
            } catch (err) {
              console.warn("[workspace] migration error for", w.id, err);
            }
          }),
        );
      }

      if (remote.length === 0) return;
      const withUserRemote = remote.map(ws => ({ ...ws, userId }));
      setWorkspaces(withUserRemote);
      saveWorkspaces(withUserRemote);

      // Re-resolve active workspace against the authoritative list. If the
      // previously active id no longer exists server-side, fall back to
      // the default board so the UI doesn't end up in limbo.
      setActiveId(prevId => {
        if (prevId && withUserRemote.some(w => w.id === prevId)) return prevId;
        const fallback = withUserRemote[0]?.id || DEFAULT_WS_ID;
        localStorage.setItem(ACTIVE_WS_KEY, fallback);
        return fallback;
      });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep workspaces in sync if userId changes (rare)
  useEffect(() => {
    if (!mounted) return;
    const all = getStoredWorkspaces();
    const withUser = all.map(ws => ({ ...ws, userId }));
    setWorkspaces(withUser);
    saveWorkspaces(withUser);
  }, [userId, mounted]);

  // Sync URL ?ws= param when workspace changes
  const activeWorkspace = workspaces.find(ws => ws.id === activeId) || null;
  const isUrlSyncRef = useRef(false);

  useEffect(() => {
    if (!activeWorkspace?.slug) return;
    // Skip ws param sync on login page — login doesn't need workspace context in URL
    if (pathname === "/workspace/login") return;
    const currentSlug = searchParams.get("ws");
    if (currentSlug !== activeWorkspace.slug) {
      isUrlSyncRef.current = true; // flag so URL watcher skips this update
      const params = new URLSearchParams(searchParams.toString());
      params.set("ws", activeWorkspace.slug);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeWorkspace?.slug, pathname, searchParams, router]);

  // Watch for URL changes (e.g. browser back/forward) to switch workspace
  useEffect(() => {
    // Skip if this URL change was caused by our own sync above
    if (isUrlSyncRef.current) {
      isUrlSyncRef.current = false;
      return;
    }
    const urlSlug = searchParams.get("ws");
    if (!urlSlug || !workspaces.length) return;
    const match = workspaces.find(ws => ws.slug === urlSlug);
    if (match && match.id !== activeId) {
      setActiveId(match.id);
      localStorage.setItem(ACTIVE_WS_KEY, match.id);
      window.dispatchEvent(new Event("workspace-changed"));
    }
  }, [searchParams, workspaces, activeId]);

  const switchWorkspace = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_WS_KEY, id);
    window.dispatchEvent(new Event("workspace-changed"));
  }, []);

  const addWorkspace = useCallback(async (name: string, analysisType: AnalysisType = "retail"): Promise<Workspace> => {
    // Optimistic local insert so the UI updates immediately.
    const tempId = generateId();
    const tempSlug = toSlug(name);
    const optimistic: Workspace = {
      id: tempId,
      userId,
      name,
      slug: tempSlug,
      analysisType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setWorkspaces(prev => {
      const updated = [...prev, optimistic];
      saveWorkspaces(updated);
      return updated;
    });
    switchWorkspace(tempId);

    // Write through to server. If the server returns a different id/slug
    // (e.g. slug deduped), swap the optimistic row for the authoritative one.
    try {
      const token = await getAuthToken();
      if (token) {
        const res = await fetch("/api/workspace/boards", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id: tempId, name, analysisType }),
        });
        if (res.ok) {
          const data = await res.json();
          const server = data?.workspace as Workspace | undefined;
          if (server) {
            setWorkspaces(prev => {
              const updated = prev.map(w => (w.id === tempId ? { ...server, userId } : w));
              saveWorkspaces(updated);
              return updated;
            });
            // If server slug differs, re-sync active id
            if (server.id !== tempId) {
              switchWorkspace(server.id);
            }
            return { ...server, userId };
          }
        } else {
          console.warn("[workspace] addWorkspace POST failed:", res.status);
        }
      }
    } catch (err) {
      console.warn("[workspace] addWorkspace write-through error:", err);
    }
    return optimistic;
  }, [userId, switchWorkspace]);

  const renameWorkspace = useCallback((id: string, newName: string) => {
    const newSlug = toSlug(newName);
    setWorkspaces(prev => {
      const updated = prev.map(ws =>
        ws.id === id ? { ...ws, name: newName, slug: newSlug, updatedAt: new Date().toISOString() } : ws
      );
      saveWorkspaces(updated);
      return updated;
    });
    // Write through to server (fire-and-forget with warn on failure)
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch("/api/workspace/boards", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: newName }),
        });
        if (!res.ok) console.warn("[workspace] renameWorkspace PATCH failed:", res.status);
      } catch (err) {
        console.warn("[workspace] renameWorkspace write-through error:", err);
      }
    })();
  }, []);

  const deleteWorkspace = useCallback((id: string) => {
    if (id === DEFAULT_WS_ID) return; // never delete the default
    setWorkspaces(prev => {
      const updated = prev.filter(ws => ws.id !== id);
      saveWorkspaces(updated);
      // If we deleted the active workspace, switch to first available
      if (id === activeId) {
        const next = updated[0]?.id || DEFAULT_WS_ID;
        setActiveId(next);
        localStorage.setItem(ACTIVE_WS_KEY, next);
        window.dispatchEvent(new Event("workspace-changed"));
      }
      return updated;
    });
    // Write through to server
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch(`/api/workspace/boards?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) console.warn("[workspace] deleteWorkspace DELETE failed:", res.status);
      } catch (err) {
        console.warn("[workspace] deleteWorkspace write-through error:", err);
      }
    })();
  }, [activeId]);

  const clearWorkspaceData = useCallback(async (id: string) => {
    // Clear all Firestore properties and related data via server-side API
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/workspace/clear", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Clear failed (${res.status})`);
      }
      const result = await res.json();
      console.log(`[Workspace] Cleared ${result.properties} properties, ${result.deleted} total documents`);
      window.dispatchEvent(new Event("workspace-properties-changed"));
    } catch (err) {
      console.error("[Workspace] Failed to clear data:", err);
    }
  }, [userId]);

  const refreshWorkspaces = useCallback(async () => {
    // Try server first, fall back to cache.
    const remote = await fetchRemoteWorkspaces();
    if (remote && remote.length > 0) {
      const withUser = remote.map(ws => ({ ...ws, userId }));
      setWorkspaces(withUser);
      saveWorkspaces(withUser);
      return;
    }
    const all = getStoredWorkspaces();
    setWorkspaces(all.map(ws => ({ ...ws, userId })));
  }, [userId]);

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, loading, switchWorkspace, addWorkspace, renameWorkspace, deleteWorkspace, clearWorkspaceData, refreshWorkspaces }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
