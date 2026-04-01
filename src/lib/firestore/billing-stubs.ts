import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BillingStubDoc } from '@/lib/types/billing';

export async function createBillingStub(data: Omit<BillingStubDoc, 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'billing_stubs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
  return ref.id;
}
