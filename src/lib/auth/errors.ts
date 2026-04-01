export function mapAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code) : '';
  switch (code) {
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Incorrect email or password.';
    case 'auth/email-already-in-use': return 'An account already exists for this email.';
    case 'auth/weak-password': return 'Use a stronger password with at least 10 characters.';
    case 'auth/popup-closed-by-user': return 'Sign-in was canceled before completion.';
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in popup. Try again.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed': return 'Network error. Check your connection.';
    default: return 'Something went wrong. Please try again.';
  }
}
