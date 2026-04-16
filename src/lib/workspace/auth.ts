"use client";

import { useState, useEffect, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";

interface CachedAuthHint {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface WorkspaceAuthState {
  user: User | null;
  /** Minimal cached user info from localStorage for rendering the shell
   *  before Firebase Auth initializes. NOT a real Firebase User -- has no
   *  getIdToken() etc. Only use for UI display (name, email, avatar). */
  cachedHint: CachedAuthHint | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Real Firebase Auth hook for workspace pages.
 * Returns the current Firebase user (or null if not logged in).
 * `loading` is true while Firebase Auth is initializing.
 */
// localStorage key for cached auth state (lets us skip the loading skeleton
// on cold loads while Firebase reads IndexedDB + refreshes the token).
const _AUTH_CACHE_KEY = "nnn-auth-user";

function getCachedAuthHint(): CachedAuthHint | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(_AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.uid) return null;
    return { uid: parsed.uid, email: parsed.email ?? null, displayName: parsed.displayName ?? null };
  } catch { return null; }
}

function setCachedAuthUser(user: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      localStorage.setItem(_AUTH_CACHE_KEY, JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        photoURL: user.photoURL,
      }));
    } else {
      localStorage.removeItem(_AUTH_CACHE_KEY);
    }
  } catch { /* ignore */ }
}

export function useWorkspaceAuth(): WorkspaceAuthState {
  // Seed from auth.currentUser (warm client-side nav). On cold loads
  // currentUser is null until Firebase reads IndexedDB + refreshes the
  // token (2-5s). In that case, check localStorage for a cached hint that
  // a user was previously signed in. We use the hint ONLY to suppress the
  // loading skeleton so the workspace shell renders instantly; the actual
  // `user` state stays null until onAuthStateChanged fires with a real
  // Firebase User (which has getIdToken() etc.). This prevents data-fetching
  // code from trying to use a plain-object stub that lacks Firebase methods.
  const auth = getAuthInstance();
  const realInitialUser = auth.currentUser;
  const [cachedHint] = useState<CachedAuthHint | null>(() =>
    realInitialUser ? null : getCachedAuthHint(),
  );
  const [user, setUser] = useState<User | null>(realInitialUser);
  // Skip the loading skeleton if we have either a real user OR a cached hint
  const [loading, setLoading] = useState(!realInitialUser && !cachedHint);
  const lastKnownUser = useRef<User | null>(realInitialUser);
  const hasInitialized = useRef(!!realInitialUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is authenticated - update both state and cache
        lastKnownUser.current = firebaseUser;
        hasInitialized.current = true;
        setUser(firebaseUser);
        setCachedAuthUser(firebaseUser);
        setLoading(false);
      } else if (lastKnownUser.current && hasInitialized.current) {
        // Brief null during token refresh - keep last known user for 3s grace period
        // to avoid flashing blank/spinner. If auth truly expired, we'll clear after timeout.
        const timeout = setTimeout(() => {
          const currentUser = auth.currentUser;
          if (!currentUser) {
            lastKnownUser.current = null;
            setUser(null);
            setCachedAuthUser(null);
          }
        }, 3000);
        return () => clearTimeout(timeout);
      } else {
        // Initial load with no user - genuinely not authenticated
        hasInitialized.current = true;
        lastKnownUser.current = null;
        setUser(null);
        setCachedAuthUser(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const auth = getAuthInstance();
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    // Clear cached user immediately so the auth listener doesn't hold stale state
    lastKnownUser.current = null;
    setCachedAuthUser(null);
    // CRITICAL: purge all per-user cached state from localStorage so the next
    // user to sign in on this browser does NOT inherit the previous user's
    // dealboards, active board, or any other workspace-scoped cache.
    if (typeof window !== "undefined") {
      try {
        const keysToRemove = [
          "nnn-workspaces",
          "nnn-active-workspace",
          "nnn_anon_id",
        ];
        for (const k of keysToRemove) localStorage.removeItem(k);
        // Also remove any key that starts with "nnn-" or "workspace-" as a
        // safety net for caches added later.
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.startsWith("nnn-") || key.startsWith("nnn_") || key.startsWith("workspace-")) {
            localStorage.removeItem(key);
          }
        }
      } catch { /* ignore quota / access errors */ }
    }
    const auth = getAuthInstance();
    await firebaseSignOut(auth);
  }

  const ADMIN_EMAIL = "chibus0368@gmail.com";

  return {
    user,
    cachedHint: user ? null : cachedHint,
    isAdmin: !!user && user.email === ADMIN_EMAIL,
    loading,
    signIn,
    signOut,
  };
}
