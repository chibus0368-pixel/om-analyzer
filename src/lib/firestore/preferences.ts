import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserPreferencesDoc } from '@/lib/types/user';

export async function getPreferences(uid: string): Promise<UserPreferencesDoc | null> {
  const snap = await getDoc(doc(db, 'user_preferences', uid));
  return snap.exists() ? (snap.data() as UserPreferencesDoc) : null;
}

export async function ensurePreferences(uid: string): Promise<UserPreferencesDoc> {
  const existing = await getPreferences(uid);
  if (existing) return existing;
  const defaults: UserPreferencesDoc = {
    uid,
    theme: 'light',
    dateFormat: 'MM/DD/YYYY',
    emailNotifications: {
      productUpdates: true,
      dealStatus: true,
      analysisComplete: true,
      onboardingEmails: true,
      newsletter: true,
      weeklyDigest: false,
    },
    workspacePreferences: {
      defaultView: 'cards',
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await setDoc(doc(db, 'user_preferences', uid), defaults);
  return defaults;
}

export async function updatePreferences(uid: string, partial: Partial<UserPreferencesDoc>): Promise<void> {
  await updateDoc(doc(db, 'user_preferences', uid), { ...partial, updatedAt: Timestamp.now() });
}
