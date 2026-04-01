import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

/**
 * Try popup first — fall back to redirect if popup is blocked or fails.
 * Common failures: auth/popup-blocked, auth/unauthorized-domain, browser restrictions.
 */
export async function loginWithGoogle(): Promise<UserCredential> {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err: any) {
    const code = err?.code || '';
    // If popup was blocked or cancelled, try redirect flow
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      // Redirect flow — page will reload, result picked up by checkGoogleRedirect()
      await signInWithRedirect(auth, googleProvider);
      // This line won't execute (page redirects), but TS needs a return
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
