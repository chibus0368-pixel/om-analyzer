"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Workspace, AnalysisType } from "./types";
import { toSlug } from "./types";

/**
 * Workspace storage uses localStorage (not Firestore) to avoid needing
 * new Firestore collection rules. Workspaces are lightweight metadata;
 * the workspaceId field on properties (in Firestore) does the real scoping.
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
    name: "Default Workspace",
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

  // Hydrate from localStorage on mount (client-only, after hydration)
  useEffect(() => {
    const all = getStoredWorkspaces();
    const withUser = all.map(ws => ({ ...ws, userId }));
    setWorkspaces(withUser);
    saveWorkspaces(withUser);

    // Determine active workspace: URL ?ws= slug > localStorage > first workspace
    const urlSlug = new URLSearchParams(window.location.search).get("ws");
    let resolvedId: string = all[0]?.id || DEFAULT_WS_ID;

    if (urlSlug) {
      const match = all.find(ws => ws.slug === urlSlug || ws.id === urlSlug);
      if (match) {
        localStorage.setItem(ACTIVE_WS_KEY, match.id);
        resolvedId = match.id;
      }
    } else {
      const savedId = localStorage.getItem(ACTIVE_WS_KEY);
      const valid = savedId && all.some(ws => ws.id === savedId);
      if (valid) resolvedId = savedId!;
    }

    setActiveId(resolvedId);
    setLoading(false);
    setMounted(true);
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
    const id = generateId();
    const slug = toSlug(name);
    const ws: Workspace = {
      id,
      userId,
      name,
      slug,
      analysisType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setWorkspaces(prev => {
      const updated = [...prev, ws];
      saveWorkspaces(updated);
      return updated;
    });
    switchWorkspace(id);
    return ws;
  }, [userId, switchWorkspace]);

  const renameWorkspace = useCallback((id: string, newName: string) => {
    setWorkspaces(prev => {
      const updated = prev.map(ws =>
        ws.id === id ? { ...ws, name: newName, slug: toSlug(newName), updatedAt: new Date().toISOString() } : ws
      );
      saveWorkspaces(updated);
      return updated;
    });
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
  }, [activeId]);

  const clearWorkspaceData = useCallback(async (id: string) => {
    // Clear all Firestore properties for this workspace
    try {
      const { deleteDoc, doc, collection, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const { getWorkspaceProperties } = await import("@/lib/workspace/firestore");
      const props = await getWorkspaceProperties(userId, id);
      const promises = props.map(p => deleteDoc(doc(db, "properties", p.id)));
      await Promise.all(promises);
      window.dispatchEvent(new Event("workspace-properties-changed"));
    } catch (err) {
      console.error("[Workspace] Failed to clear data:", err);
    }
  }, [userId]);

  const refreshWorkspaces = useCallback(async () => {
    const all = getStoredWorkspaces();
    setWorkspaces(all);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, loading, switchWorkspace, addWorkspace, renameWorkspace, deleteWorkspace, clearWorkspaceData, refreshWorkspaces }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
