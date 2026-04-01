'use client';

import { createContext } from 'react';
import type { User } from 'firebase/auth';
import type { UserDoc } from '@/lib/types/user';

export interface AuthContextValue {
  authUser: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
  initialized: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
