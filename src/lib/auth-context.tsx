"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getAuthInstance } from "./firebase";
import { getDb } from "./firebase";

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
    const auth = getAuthInstance();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Check admin role in Firestore
        try {
          const db = getDb();
          const adminDoc = await getDoc(doc(db, "admins", firebaseUser.uid));
          setIsAdmin(adminDoc.exists() && adminDoc.data()?.role === "admin");
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
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
