import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type AuthEventType = 'register' | 'login_success' | 'login_failure' | 'logout' | 'password_reset_requested' | 'password_reset_completed' | 'email_verified' | 'profile_updated' | 'account_deleted';

export async function logAuthEvent(params: {
  uid?: string;
  email?: string;
  eventType: AuthEventType;
  provider?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'auth_events'), {
      ...params,
      createdAt: Timestamp.now(),
    });
  } catch { /* non-critical */ }
}
