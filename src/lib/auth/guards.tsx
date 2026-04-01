'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './use-auth';

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Client-side guard component that checks auth state and redirects to /login if not authenticated.
 * Shows a loading spinner or fallback while initializing.
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const router = useRouter();
  const { authUser, initialized } = useAuth();

  // Show fallback/loading spinner while initializing
  if (!initialized) {
    return fallback || <LoadingSpinner />;
  }

  // Redirect to login if not authenticated
  if (!authUser) {
    router.replace('/login');
    return fallback || <LoadingSpinner />;
  }

  return <>{children}</>;
}

/**
 * Wrapper component for pages that require authentication.
 * Handles all auth state checking and redirects.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <AuthGuard fallback={<LoadingSpinner />}>
      {children}
    </AuthGuard>
  );
}

/**
 * Hook to check if user is authenticated and redirect if not.
 * Useful for server components that need client-side auth checks.
 */
export function useRequireAuth() {
  const { authUser, initialized } = useAuth();
  const router = useRouter();

  if (initialized && !authUser) {
    router.replace('/login');
  }

  return { isAuthenticated: !!authUser, initialized };
}

/**
 * Default loading spinner component.
 */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
