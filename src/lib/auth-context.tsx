"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* ── Lazy Firebase imports ──────────────────────────────────────────────
   Firebase SDK modules (auth ~90KB, firestore ~250KB) were imported
   statically, which meant they shipped in the initial JS bundle for
   EVERY page - including the marketing homepage. On mobile connections
   this added 10-15 seconds of download + parse time before first paint.

   Switching to dynamic import() keeps Firebase out of the initial chunk.
   Next.js automatically code-splits these into a separate async chunk
   that loads in the background after the shell renders.
   ──────────────────────────────────────────────────────────────────── */

// Re-export the User type so consumers don't need to import firebase/auth
type User = import("firebase/auth").User;

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isAdmin: false,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    Promise.all([
      import("./firebase"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]).then(([fb, fbAuth, fbFirestore]) => {
      if (cancelled) return;
      const auth = fb.getAuthInstance();
      unsubscribe = fbAuth.onAuthStateChanged(auth, async (firebaseUser) => {
        if (cancelled) return;
        setUser(firebaseUser);
        if (firebaseUser) {
          try {
            const db = fb.getDb();
            const adminDoc = await fbFirestore.getDoc(
              fbFirestore.doc(db, "admins", firebaseUser.uid),
            );
            if (!cancelled) {
              setIsAdmin(adminDoc.exists() && adminDoc.data()?.role === "admin");
            }
          } catch {
            if (!cancelled) setIsAdmin(false);
          }
        } else {
          if (!cancelled) setIsAdmin(false);
        }
        if (!cancelled) setLoading(false);
      });
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const [fb, fbAuth] = await Promise.all([
      import("./firebase"),
      import("firebase/auth"),
    ]);
    const auth = fb.getAuthInstance();
    await fbAuth.signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    const [fb, fbAuth] = await Promise.all([
      import("./firebase"),
      import("firebase/auth"),
    ]);
    const auth = fb.getAuthInstance();
    await fbAuth.signOut(auth);
    setIsAdmin(false);
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
