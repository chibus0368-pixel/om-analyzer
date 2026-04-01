import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserDoc } from '@/lib/types/user';
import type { AuthProviderId, AccountStatus } from '@/lib/types/auth';

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

export async function setUserDoc(uid: string, data: UserDoc): Promise<void> {
  await setDoc(doc(db, 'users', uid), data);
}

export async function updateUserDoc(uid: string, partial: Partial<UserDoc>): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { ...partial, updatedAt: Timestamp.now() });
}

export async function ensureUserDocFromAuth(params: {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string | null;
  photoURL?: string | null;
  providerIds: string[];
}): Promise<UserDoc> {
  const existing = await getUserDoc(params.uid);
  if (existing) {
    // Sync fields that may have changed
    const updates: Partial<UserDoc> = {};
    if (existing.emailVerified !== params.emailVerified) updates.emailVerified = params.emailVerified;
    if (params.photoURL && !existing.photoURL) updates.photoURL = params.photoURL;
    if (Object.keys(updates).length > 0) await updateUserDoc(params.uid, updates);
    return { ...existing, ...updates };
  }

  const names = (params.displayName || '').split(' ');
  const firstName = names[0] || '';
  const lastName = names.slice(1).join(' ') || '';

  const newDoc: UserDoc = {
    uid: params.uid,
    email: params.email,
    emailLower: params.email.toLowerCase(),
    emailVerified: params.emailVerified,
    firstName,
    lastName,
    fullName: params.displayName || `${firstName} ${lastName}`.trim(),
    displayName: params.displayName || undefined,
    photoURL: params.photoURL || undefined,
    onboardingCompleted: false,
    profileCompleted: false,
    authProviders: params.providerIds as AuthProviderId[],
    primaryProvider: (params.providerIds[0] || 'password') as AuthProviderId,
    defaultWorkspaceId: null,
    accountStatus: 'active' as AccountStatus,
    tier: 'free',
    tierStatus: 'none',
    newsletterOptIn: true,
    productUpdatesOptIn: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await setUserDoc(params.uid, newDoc);
  return newDoc;
}
