import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage as getAdminStorageSDK } from "firebase-admin/storage";

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

function getAdminApp(): App {
  if (!adminApp) {
    if (getApps().length === 0) {
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccount) {
        try {
          const parsed = JSON.parse(serviceAccount);
          // Vercel often stores \n as literal \\n in env vars - fix private_key
          if (parsed.private_key && typeof parsed.private_key === "string") {
            parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
          }
          adminApp = initializeApp({
            credential: cert(parsed),
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "hacktheprompt-8051e.firebasestorage.app",
          });
        } catch (err) {
          console.error("Firebase Admin SDK init error:", err);
          // Fall back to default credentials
          adminApp = initializeApp();
        }
      } else {
        // In Cloud Functions, uses default credentials
        adminApp = initializeApp();
      }
    } else {
      adminApp = getApps()[0];
    }
  }
  return adminApp;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getAdminApp());
  }
  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

export function getAdminStorage() {
  return getAdminStorageSDK(getAdminApp());
}
