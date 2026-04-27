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
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  EmailAuthProvider,
  GoogleAuthProvider,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function registerWithEmail(email: string, password: string): Promise<UserCredential> {
  // If the visitor is currently signed in anonymously (e.g. they came in
  // through the Try Me trial flow and we want to preserve their property
  // analyses), link the email/password credential to their existing
  // anonymous account. Otherwise create a brand-new account.
  const current = auth.currentUser;
  if (current && current.isAnonymous) {
    try {
      const credential = EmailAuthProvider.credential(email, password);
      return await linkWithCredential(current, credential);
    } catch (err: any) {
      // auth/email-already-in-use means an account with that email already
      // exists. Fall through to the normal create flow so the user gets a
      // sensible error - linkWithCredential here would silently drop their
      // anon data anyway.
      if (err?.code !== "auth/credential-already-in-use" && err?.code !== "auth/email-already-in-use") {
        throw err;
      }
      console.warn("[auth] Anonymous link failed, falling back to create:", err.code);
    }
  }
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function loginWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/* ─────────────────────────────────────────────────────────────
   Google Identity Services (GIS) - direct sign-in

   This bypasses Firebase's auth handler entirely.  Instead of
   opening a popup to firebaseapp.com/__/auth/handler, we open
   Google's own OAuth consent screen directly.  The consent
   screen shows the app name ("Deal Signals") and origin domain
   ("dealsignals.app") - no Firebase domain visible anywhere.

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
    console.warn('[auth] NEXT_PUBLIC_GOOGLE_CLIENT_ID not set - falling back to Firebase popup');
    return loginWithGoogleLegacy();
  }

  try {
    await loadGisScript();
  } catch {
    console.warn('[auth] GIS script load failed - falling back to Firebase popup');
    return loginWithGoogleLegacy();
  }

  if (!window.google?.accounts?.oauth2) {
    console.warn('[auth] GIS not available - falling back to Firebase popup');
    return loginWithGoogleLegacy();
  }

  return new Promise<UserCredential>((resolve, reject) => {
    // Safety net: if neither callback fires within 90s, release the
    // button. GIS has been observed to silently drop the callback when
    // popup blockers or third-party-cookie policies interfere, which
    // left our "Connecting to Google..." button spinning forever.
    const timeoutId = setTimeout(() => {
      reject({
        code: 'auth/timeout',
        message: 'Google sign-in timed out. Try again, allow popups for this site, or use email sign-up.',
      });
    }, 90_000);

    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (response) => {
        clearTimeout(timeoutId);
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'No access token received'));
          return;
        }
        try {
          // Create Firebase credential from Google access token
          const credential = GoogleAuthProvider.credential(null, response.access_token);
          // If currently signed in anonymously (Try Me trial), link the
          // Google credential so the anon UID and all attached trial
          // properties carry over to the new Google account.
          const current = auth.currentUser;
          if (current && current.isAnonymous) {
            try {
              const linked = await linkWithCredential(current, credential);
              resolve(linked);
              return;
            } catch (linkErr: any) {
              // auth/credential-already-in-use means a Google account with this
              // email already exists - fall back to a fresh sign-in. Trial
              // data won't carry over, but the user can still proceed.
              if (linkErr?.code !== "auth/credential-already-in-use") throw linkErr;
              console.warn("[auth] Google linkWithCredential failed:", linkErr.code, "- falling back to signInWithCredential");
            }
          }
          const result = await signInWithCredential(auth, credential);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
      error_callback: (error) => {
        clearTimeout(timeoutId);
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
 * Shows deal-signals.firebaseapp.com on the consent screen.
 *
 * Anon-aware: if the visitor is signed in anonymously (Try Me trial),
 * link the Google credential to the anon account instead of replacing it.
 */
async function loginWithGoogleLegacy(): Promise<UserCredential> {
  const current = auth.currentUser;
  const isAnon = !!current && current.isAnonymous;

  try {
    if (isAnon) {
      try {
        return await linkWithPopup(current!, googleProvider);
      } catch (linkErr: any) {
        if (linkErr?.code === "auth/credential-already-in-use") {
          // Account exists - fall through to normal sign-in below. The
          // trial data won\'t carry over but the user can still proceed.
          console.warn("[auth] Google linkWithPopup: credential-already-in-use, falling back");
        } else if (
          linkErr?.code === "auth/popup-blocked" ||
          linkErr?.code === "auth/cancelled-popup-request" ||
          linkErr?.code === "auth/operation-not-supported-in-this-environment"
        ) {
          await linkWithRedirect(current!, googleProvider);
          return null as any;
        } else {
          throw linkErr;
        }
      }
    }
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
    // Wait for auth to fully initialize before checking redirect result
    if (auth.authStateReady) {
      await auth.authStateReady();
    }
    const result = await getRedirectResult(auth);
    return result; // null if no redirect happened
  } catch (err: any) {
    // Gracefully handle initialization race condition
    if (err?.message?.includes('_initializationPromise') || err?.message?.includes('not initialized')) {
      console.warn('[auth] Auth not ready for redirect check, skipping');
      return null;
    }
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
