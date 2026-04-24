import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (singleton)
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Eagerly initialize so both `import { db }` and `import { getDb }` work
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);

// Keep function exports for backward compatibility
export function getDb(): Firestore {
  return db;
}

export function getAuthInstance(): Auth {
  return auth;
}

export function getStorageInstance(): FirebaseStorage {
  return storage;
}

/**
 * Anonymous trial users.
 *
 * Returns the current Firebase user, signing in anonymously if there isn't
 * one yet. The resulting `User` has a real UID, can call `getIdToken()`, and
 * can be promoted to a real account later via `linkWithCredential()` without
 * losing any of their workspace data.
 *
 * Requires Anonymous sign-in to be enabled in Firebase Console > Authentication
 * > Sign-in method. Without it, signInAnonymously() throws auth/operation-not-allowed.
 */
export async function ensureAnonymousUser(): Promise<User> {
  // Wait briefly for any in-flight auth restore from IndexedDB before signing
  // in anonymously - otherwise a real signed-in user could get pre-empted.
  const existing = await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
  if (existing) return existing;

  const cred = await signInAnonymously(auth);
  return cred.user;
}
