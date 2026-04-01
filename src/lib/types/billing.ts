import { Timestamp } from 'firebase/firestore';
import { Tier } from './auth';

export interface BillingStubDoc {
  workspaceId: string;
  uid: string;
  intendedTier: Tier;
  intendedBillingCycle?: 'monthly' | 'annual';
  source: 'pricing_page' | 'upgrade_cta' | 'account_billing';
  notes?: string;
  createdAt: Timestamp;
}
