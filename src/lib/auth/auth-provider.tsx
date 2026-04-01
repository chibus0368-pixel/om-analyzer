'use client';

import { useEffect, useState, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, browserLocalPersistence, setPersistence } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { UserDoc } from '@/lib/types/user';
import { AuthContext, type AuthContextValue } from './auth-context';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Initialize persistence
  useEffect(() => {
    const initializePersistence = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        console.error('Failed to set persistence:', error);
      }
    };

    initializePersistence();
  }, []);

  // Fetch user document from Firestore
  const fetchUserDoc = useCallback(async (uid: string, idToken: string): Promise<UserDoc | null> => {
    try {
      const anonId = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
      const response = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid, anonId: anonId || undefined }),
      });
      // Clear anonymous ID after merge attempt
      if (anonId && response.ok) localStorage.removeItem("nnn_anon_id");

      if (!response.ok) {
        console.error('Failed to bootstrap user:', response.statusText);
        return null;
      }

      const data = await response.json();
      return data.userDoc || null;
    } catch (error) {
      console.error('Error fetching user document:', error);
      return null;
    }
  }, []);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setLoading(true);

        if (user) {
          setAuthUser(user);

          // Get ID token and fetch user document
          const idToken = await user.getIdToken();
          const userDocData = await fetchUserDoc(user.uid, idToken);
          setUserDoc(userDocData);
        } else {
          setAuthUser(null);
          setUserDoc(null);
        }
      } catch (error) {
        console.error('Error in auth state change handler:', error);
        setAuthUser(null);
        setUserDoc(null);
      } finally {
        setLoading(false);
        setInitialized(true);
      }
    });

    return () => unsubscribe();
  }, [fetchUserDoc]);

  // Refresh profile
  const refreshProfile = useCallback(async () => {
    if (!authUser) return;

    try {
      setLoading(true);
      const idToken = await authUser.getIdToken();
      const userDocData = await fetchUserDoc(authUser.uid, idToken);
      setUserDoc(userDocData);
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setLoading(false);
    }
  }, [authUser, fetchUserDoc]);

  // Sign out
  const handleSignOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      setAuthUser(null);
      setUserDoc(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, []);

  const value: AuthContextValue = {
    authUser,
    userDoc,
    loading,
    initialized,
    refreshProfile,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
