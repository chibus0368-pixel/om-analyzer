import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  confirmPasswordReset,
  updateProfile,
  signOut,
  GoogleAuthProvider,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function registerWithEmail(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/* ─────────────────────────────────────────────────────────────
   Google Identity Services (GIS) — direct sign-in

   This bypasses Firebase's auth handler entirely.  Instead of
   opening a popup to firebaseapp.com/__/auth/handler, we open
   Google's own OAuth consent screen directly.  The consent
   screen shows the app name ("Deal Signals") and origin domain
   ("dealsignals.app") — no Firebase domain visible anywhere.

   Flow:
   1. Load the GIS client script
   2. Open Google's OAuth token popup
   3. Get access_token back from Google
   4. Create a Firebase credential from it
   5. Sign into Firebase with signInWithCredential
   ───────────────────────────────────────────────────────────── */

// Cache the GIS script load
let gisLoaded = false;
let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisLoaded) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      gisLoaded = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (error: { type: string }) => void;
          }) => {
            requestAccessToken: (opts?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

/**
 * Sign in with Google using GIS (Google Identity Services).
 * Shows "Deal Signals" and "dealsignals.app" on the consent screen.
 * Falls back to the legacy Firebase popup flow if GIS client ID is not set.
 */
export async function loginWithGoogle(): Promise<UserCredential> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // If no GIS client ID configured, fall back to legacy Firebase popup flow
  if (!clientId) {
    console.warn('[auth] NEXT_PUBLIC_GOOGLE_CLIENT_ID not set — falling back to Firebase popup');
    return loginWithGoogleLegacy();
  }

  try {
    await loadGisScript();
  } catch {
    console.warn('[auth] GIS script load failed — falling back to Firebase popup');
    return loginWithGoogleLegacy();
  }

  if (!window.google?.accounts?.oauth2) {
    console.warn('[auth] GIS not available — falling back to Firebase popup');
    return loginWithGoogleLegacy();
  }

  return new Promise<UserCredential>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'No access token received'));
          return;
        }
        try {
          // Create Firebase credential from Google access token
          const credential = GoogleAuthProvider.credential(null, response.access_token);
          const result = await signInWithCredential(auth, credential);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
      error_callback: (error) => {
        // User closed the popup or other non-fatal error
        if (error.type === 'popup_closed') {
          reject({ code: 'auth/popup-closed-by-user', message: 'Popup closed' });
        } else {
          reject(new Error(`Google sign-in error: ${error.type}`));
        }
      },
    });

    client.requestAccessToken({ prompt: 'select_account' });
  });
}

/**
 * Legacy Firebase popup/redirect flow.
 * Shows hacktheprompt-8051e.firebaseapp.com on the consent screen.
 */
async function loginWithGoogleLegacy(): Promise<UserCredential> {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null as any;
    }
    throw err;
  }
}

/**
 * Call on page mount to pick up result from redirect-based Google sign-in.
 * Returns UserCredential if redirect just completed, null otherwise.
 */
export async function checkGoogleRedirect(): Promise<UserCredential | null> {
  try {
    const result = await getRedirectResult(auth);
    return result; // null if no redirect happened
  } catch (err: any) {
    console.error('Google redirect result error:', err);
    throw err;
  }
}

export async function sendVerificationEmail() {
  if (!auth.currentUser) throw new Error('No authenticated user');
  return sendEmailVerification(auth.currentUser, {
    url: `${typeof window !== 'undefined' ? window.location.origin : ''}/verify-email`,
    handleCodeInApp: false,
  });
}

export async function requestPasswordReset(email: string) {
  return sendPasswordResetEmail(auth, email, {
    url: `${typeof window !== 'undefined' ? window.location.origin : ''}/login`,
    handleCodeInApp: false,
  });
}

export async function resetPassword(oobCode: string, newPassword: string) {
  return confirmPasswordReset(auth, oobCode, newPassword);
}

export async function updateFirebaseDisplayName(displayName: string) {
  if (!auth.currentUser) throw new Error('No authenticated user');
  return updateProfile(auth.currentUser, { displayName });
}

export async function logoutUser() {
  return signOut(auth);
}
