// Temporary mock auth for workspace — bypasses Firebase Auth
// TODO: Re-enable real auth when Firebase Auth is configured for custom domain

const MOCK_USER = {
  uid: "admin-user",
  email: "admin@nnntriplenet.com",
  displayName: "Admin",
  emailVerified: true,
};

export function useWorkspaceAuth() {
  return {
    user: MOCK_USER as any,
    isAdmin: true,
    loading: false,
    signIn: async () => {},
    signOut: async () => {},
  };
}
