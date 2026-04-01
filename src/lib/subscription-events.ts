import { collection, addDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import type { SubscriptionEvent } from './subscriber-types';

/**
 * Log subscription event to Firestore
 */
export async function logSubscriptionEvent(
  subscriberId: string,
  email: string,
  eventType: SubscriptionEvent['eventType'],
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const db = getDb();
    await addDoc(collection(db, 'subscriptionEvents'), {
      subscriberId,
      email,
      eventType,
      timestamp: new Date().toISOString(),
      details: details || {},
    });
  } catch (error) {
    console.error('Failed to log subscription event:', error);
  }
}
