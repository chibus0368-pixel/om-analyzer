"use client";

import { useState, useEffect, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getAuthInstance } from "@/lib/firebase";

interface WorkspaceAuthState {
  user: User | null;
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

function getCachedAuthUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(_AUTH_CACHE_KEY);
    if (!raw) return null;
    // We store a minimal user-like object. It's not a real Firebase User
    // but has enough fields for the layout to render the shell (uid, email,
    // displayName). The real User replaces it once onAuthStateChanged fires.
    return JSON.parse(raw) as User;
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
  // Seed from auth.currentUser (warm client-side nav) OR from localStorage
  // (cold load). Without this, loading stays true for several seconds while
  // Firebase reads IndexedDB and refreshes the token, showing the
  // "Loading workspace..." skeleton on every page load.
  const auth = getAuthInstance();
  const initialUser = auth.currentUser || getCachedAuthUser();
  const [user, setUser] = useState<User | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const lastKnownUser = useRef<User | null>(initialUser);
  const hasInitialized = useRef(!!initialUser);

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
    isAdmin: !!user && user.email === ADMIN_EMAIL,
    loading,
    signIn,
    signOut,
  };
}
