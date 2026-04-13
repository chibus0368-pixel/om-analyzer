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
export function useWorkspaceAuth(): WorkspaceAuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastKnownUser = useRef<User | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is authenticated - update both state and cache
        lastKnownUser.current = firebaseUser;
        hasInitialized.current = true;
        setUser(firebaseUser);
        setLoading(false);
      } else if (lastKnownUser.current && hasInitialized.current) {
        // Brief null during token refresh - keep last known user for 3s grace period
        // to avoid flashing blank/spinner. If auth truly expired, we'll clear after timeout.
        const timeout = setTimeout(() => {
          const currentUser = auth.currentUser;
          if (!currentUser) {
            lastKnownUser.current = null;
            setUser(null);
          }
        }, 3000);
        return () => clearTimeout(timeout);
      } else {
        // Initial load with no user - genuinely not authenticated
        hasInitialized.current = true;
        lastKnownUser.current = null;
        setUser(null);
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
