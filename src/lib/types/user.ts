import { Timestamp } from 'firebase/firestore';
import { AuthProviderId, AccountStatus, Tier, TierStatus } from './auth';

export type UserRole = 'broker' | 'investor' | 'analyst' | 'lender' | 'operator' | 'other';

export interface UserDoc {
  uid: string;
  email: string;
  emailLower: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName?: string;
  photoURL?: string;
  company?: string;
  role?: UserRole;
  jobTitle?: string;
  phone?: string;
  bio?: string;
  marketFocus?: string;
  assetFocus?: string;
  onboardingCompleted: boolean;
  profileCompleted: boolean;
  authProviders: AuthProviderId[];
  primaryProvider: AuthProviderId;
  defaultWorkspaceId: string | null;
  accountStatus: AccountStatus;
  tier: Tier;
  tierStatus: TierStatus;
  newsletterOptIn: boolean;
  productUpdatesOptIn: boolean;
  lastLoginAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPreferencesDoc {
  uid: string;
  theme: 'light' | 'dark' | 'system';
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY';
  timezone?: string;
  emailNotifications: {
    productUpdates: boolean;
    dealStatus: boolean;
    analysisComplete: boolean;
    onboardingEmails: boolean;
    newsletter: boolean;
    weeklyDigest: boolean;
  };
  workspacePreferences: {
    defaultView?: 'table' | 'cards';
    defaultSort?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
