"use client";

import { useState, useEffect } from "react";
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

  useEffect(() => {
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const auth = getAuthInstance();
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
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
