"use client";

// Force dynamic rendering - this page uses useSearchParams() and Firebase
// auth state, neither of which work with static prerender. Without this,
// Next.js tries to prerender at build time and fails with "useSearchParams
// should be wrapped in a suspense boundary".
export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateProfile } from "firebase/auth";
import { registerWithEmail } from "@/lib/auth/providers";
import { auth } from "@/lib/firebase";
import { loginWithGoogle, checkGoogleRedirect } from "@/lib/auth/providers";

/* ─── friendly error messages ─── */
function friendlyError(code: string, fallback: string): string {
  const map: Record<string, string> = {
    "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password is too weak - use at least 8 characters.",
    "auth/user-not-found": "No account found with this email. If you signed up with Google, use Continue with Google above. Otherwise click Create Account below.",
    "auth/wrong-password": "Incorrect password. If you signed up with Google, use Continue with Google above. Otherwise try again or reset your password.",
    "auth/invalid-credential": "We could not sign you in with that email and password. If you signed up with Google, use Continue with Google above. If you are new, click Create Account below.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/popup-blocked": "Your browser blocked the sign-in popup. Trying redirect instead…",
    "auth/unauthorized-domain": "This domain isn't authorized for sign-in yet. Contact support.",
    "auth/network-request-failed": "Network error - check your connection and try again.",
    "auth/operation-not-allowed": "Google sign-in is not enabled. Contact the administrator.",
    "auth/internal-error": "Something went wrong on our end. Please try again.",
  };
  return map[code] || fallback;
}

/* ─── Google "G" icon (official colors) ─── */
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

/* ─── bootstrap helper (shared by email + google flows) ─── */
async function bootstrapUser(user: any, extra?: { firstName?: string; lastName?: string; company?: string }) {
  try {
    const token = await user.getIdToken();
    const firstName = extra?.firstName || user.displayName?.split(" ")[0] || "";
    const lastName = extra?.lastName || user.displayName?.split(" ").slice(1).join(" ") || "";
    const anonId = typeof window !== "undefined" ? localStorage.getItem("nnn_anon_id") : null;
    const res = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ firstName, lastName, company: extra?.company, anonId: anonId || undefined }),
    });
    if (!res.ok) console.error("Bootstrap failed:", await res.text());
    if (anonId) localStorage.removeItem("nnn_anon_id");
  } catch (err) {
    console.error("Bootstrap error:", err);
  }
}

/* ═══════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function WorkspaceLoginPage() {
  // Suspense is required because WorkspaceLoginPageInner uses
  // useSearchParams() which triggers a CSR bailout at build time
  // if not wrapped in a boundary.
  return (
    <Suspense fallback={null}>
      <WorkspaceLoginPageInner />
    </Suspense>
  );
}

function WorkspaceLoginPageInner() {
  const { signIn, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const upgradePlan = searchParams.get("upgrade") || "";
  const redirectPath = searchParams.get("redirect") || "";
  // Honor ?mode=register (or ?mode=signup for back-compat) so footer/nav
  // "Sign Up" links land directly on the registration form instead of login.
  const initialModeParam = (searchParams.get("mode") || "").toLowerCase();
  const initialMode: "login" | "register" =
    initialModeParam === "register" || initialModeParam === "signup"
      ? "register"
      : "login";
  // If a Firebase anon user lands here, they're in trial state and almost
  // certainly came to convert. Force the register form regardless of param.
  const looksAnon = !!user && (user as any).isAnonymous === true;
  const [mode, setMode] = useState<"login" | "register">(looksAnon ? "register" : initialMode);

  // If the user state flips to anonymous AFTER mount (e.g. we redirected them
  // here from /workspace/upgrade and Firebase was still settling), still
  // honor the conversion intent by switching to register mode.
  useEffect(() => {
    if (looksAnon) setMode("register");
  }, [looksAnon]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Render form immediately. Redirect-result check runs in the background
  // and only flips this true if we actually detect an inbound redirect.
  const [redirectChecking, setRedirectChecking] = useState(false);
  // When true, handleSubmit owns the post-auth flow and the "user changed"
  // useEffect below must NOT fire its own handlePostAuth. Without this, a
  // signup race sends the user to /workspace before the bootstrap call (and
  // its Try Me claim step) has finished, and the new DealBoard shows empty.
  const handlingSubmitRef = useRef(false);

  /* ── Build post-auth redirect URL (preserves upgrade param) ── */
  function getPostAuthUrl(): string {
    if (upgradePlan) {
      const base = redirectPath || "/workspace";
      return `${base}?upgrade=${encodeURIComponent(upgradePlan)}`;
    }
    return redirectPath || "/workspace";
  }

  /* ── Post-auth handler: if upgrade param set, go straight to Stripe; else workspace ── */
  async function handlePostAuth(firebaseUser: any) {
    if (upgradePlan && (upgradePlan === "pro" || upgradePlan === "pro_plus")) {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plan: upgradePlan }),
        });
        const data = await res.json();
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        console.error("[login] checkout returned no URL", data);
      } catch (err) {
        console.error("[login] checkout call failed", err);
      }
    }
    router.push(redirectPath || "/workspace");
  }

  /* ── handle redirect result on mount (from Google redirect flow) ──
     NOTE: runs in background only. We do NOT block the form render on this.
     Firebase's getRedirectResult can take several seconds to resolve on cold
     loads; blocking here made the whole login page feel broken. If a real
     redirect result arrives we flip redirectChecking true just long enough
     to show a spinner while we finish the handoff. */
  useEffect(() => {
    let cancelled = false;
    // Only bother doing the redirect check if there's a hint a redirect
    // actually just happened. Google sign-in via redirect sets a session
    // storage key; the auth handler also appends #state= to the URL.
    const looksLikeRedirect =
      typeof window !== "undefined" &&
      (window.location.hash.includes("state=") ||
        window.location.hash.includes("id_token=") ||
        (() => { try { return !!sessionStorage.getItem("firebase:pendingRedirect"); } catch { return false; } })());

    if (!looksLikeRedirect) {
      // Nothing to do - render the form immediately.
      return;
    }

    setRedirectChecking(true);
    async function handleRedirect() {
      try {
        const result = await checkGoogleRedirect();
        if (result && result.user && !cancelled) {
          await bootstrapUser(result.user);
          await handlePostAuth(result.user);
          return;
        }
      } catch (err: any) {
        if (!cancelled && err?.code !== "auth/popup-closed-by-user") {
          setError(friendlyError(err?.code, err?.message || "Google sign-in failed"));
        }
      } finally {
        if (!cancelled) setRedirectChecking(false);
      }
    }
    handleRedirect();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  /* ── if already logged in (NOT anon): route to checkout / workspace ──
     Anonymous Firebase users are in trial state; we deliberately keep them
     on this page so they can register/link their account. Otherwise the
     upgrade pill on the workspace header would silently route them through
     to Stripe without ever capturing an email. */
  useEffect(() => {
    if (!user) return;
    if ((user as any).isAnonymous === true) return;
    if (redirectChecking) return;
    if (handlingSubmitRef.current) return;
    handlePostAuth(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, redirectChecking]);

  /* ── email/password submit ── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Block the "user changed" useEffect from stealing the post-auth flow
    // before bootstrap (and its Try Me claim step) finishes.
    handlingSubmitRef.current = true;
    try {
      if (mode === "register") {
        if (password.length < 8) { setError("Password must be at least 8 characters"); setLoading(false); handlingSubmitRef.current = false; return; }
        if (password !== confirmPassword) { setError("Passwords do not match"); setLoading(false); handlingSubmitRef.current = false; return; }
        // registerWithEmail uses linkWithCredential under the hood when the
        // visitor is signed in anonymously, so their Try Me trial property
        // (and any analyses they did as anon) carry over to the real account.
        const credential = await registerWithEmail(email, password);
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName) await updateProfile(credential.user, { displayName: fullName });
        await bootstrapUser(credential.user, { firstName, lastName, company: company || undefined });
        await handlePostAuth(credential.user);
      } else {
        const signedIn = await signIn(email, password);
        const u = (signedIn as any)?.user || auth.currentUser;
        if (u) await handlePostAuth(u);
        else router.push(getPostAuthUrl());
      }
    } catch (err: any) {
      handlingSubmitRef.current = false;
      setError(friendlyError(err?.code, err?.message || "Authentication failed"));
    } finally {
      setLoading(false);
    }
  }

  /* ── Google sign-in ── */
  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      const credential = await loginWithGoogle();
      // If loginWithGoogle triggered a redirect, the page will reload.
      // credential is only valid for popup flow.
      if (credential && credential.user) {
        await bootstrapUser(credential.user);
        await handlePostAuth(credential.user);
      }
    } catch (err: any) {
      if (err?.code !== "auth/popup-closed-by-user") {
        // auth/invalid-credential coming from the Google flow almost
        // always means the configured Google OAuth client ID does not
        // belong to this Firebase project (e.g. after a project
        // migration, the NEXT_PUBLIC_GOOGLE_CLIENT_ID on Vercel still
        // points at the old project). Tell the user rather than
        // recycling the generic "wrong password" copy.
        if (err?.code === "auth/invalid-credential") {
          setError(
            "Google sign-in is misconfigured on this environment. The OAuth client ID does not match this Firebase project. An admin needs to update NEXT_PUBLIC_GOOGLE_CLIENT_ID on Vercel (or remove it so Firebase uses its default).",
          );
        } else {
          setError(friendlyError(err?.code, err?.message || "Google sign-in failed"));
        }
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  /* ── show loading while checking redirect ── */
  if (redirectChecking) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0B1120 0%, #162036 50%, #253352 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 48, height: 48, border: "3px solid rgba(255,255,255,0.15)",
            borderTopColor: "#fff", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
          }} />
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
            Checking sign-in status…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (user) return null;

  /* ─── shared input style ─── */
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", border: "1.5px solid #D8DFE9",
    borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif", transition: "border-color 0.2s, box-shadow 0.2s",
    background: "#fff",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 600, color: "#253352",
    marginBottom: 6, fontFamily: "'Inter', sans-serif",
  };
  const focusIn = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#4D7C0F";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(132,204,22,0.1)";
  };
  const focusOut = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#D8DFE9";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0B1120 0%, #162036 50%, #253352 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: mode === "register" ? 560 : 440,
        background: "#fff", borderRadius: 16,
        padding: mode === "register" ? "44px 48px" : "40px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        transition: "max-width 0.3s ease",
      }}>
        {/* ── Header ── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <span style={{
              fontSize: 34, fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
              letterSpacing: -0.5, lineHeight: 1,
            }} aria-label="DealSignals">
              <span style={{ color: "#0B1120" }}>Deal</span>
              <span style={{ color: "#4D7C0F" }}>Signals</span>
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0B1120", margin: 0, fontFamily: "'Inter', sans-serif" }}>
            {upgradePlan
              ? (mode === "login" ? "Sign in to continue" : "Create your account")
              : (mode === "login" ? "Sign In" : "Create Your Account")}
          </h1>
          <p style={{ fontSize: 14, color: "#5A7091", marginTop: 6, fontFamily: "'Inter', sans-serif" }}>
            {upgradePlan
              ? `Sign ${mode === "login" ? "in" : "up"} to complete your upgrade to ${upgradePlan === "pro_plus" ? "Pro+" : "Pro"}`
              : (mode === "login" ? "Sign in to your workspace" : "Get started with Deal Signals Pro")}
          </p>
        </div>

        {/* ══════════ SOCIAL LOGIN ══════════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            style={{
              width: "100%", padding: "12px 16px",
              background: "#fff", color: "#1f2937",
              border: "1.5px solid #D8DFE9", borderRadius: 10,
              fontSize: 14, fontWeight: 600,
              cursor: (googleLoading || loading) ? "not-allowed" : "pointer",
              opacity: (googleLoading || loading) ? 0.6 : 1,
              fontFamily: "'Inter', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { if (!googleLoading && !loading) { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#9CA3AF"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#D8DFE9"; }}
          >
            {googleLoading ? (
              <>
                <div style={{
                  width: 18, height: 18, border: "2px solid #D8DFE9",
                  borderTopColor: "#4285F4", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                }} />
                Connecting to Google…
              </>
            ) : (
              <>
                <GoogleIcon size={20} />
                Continue with Google
              </>
            )}
          </button>

          {/* Microsoft (visual - extensible) */}
          <button
            type="button"
            disabled
            title="Coming soon"
            style={{
              width: "100%", padding: "12px 16px",
              background: "#F9FAFB", color: "#9CA3AF",
              border: "1.5px solid #E5E7EB", borderRadius: 10,
              fontSize: 14, fontWeight: 600,
              cursor: "default", opacity: 0.55,
              fontFamily: "'Inter', sans-serif",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            Microsoft - Coming Soon
          </button>
        </div>

        {/* ── Divider ── */}
        <div style={{ display: "flex", alignItems: "center", margin: "0 0 20px" }}>
          <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          <span style={{ padding: "0 14px", fontSize: 12, color: "#9CA3AF", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>or continue with email</span>
          <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
        </div>

        {/* ══════════ EMAIL FORM ══════════ */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="John" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Doe" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
            </div>
          )}
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div style={mode === "register" ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } : {}}>
            <div>
              <label style={labelStyle}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Min 8 characters" : "Your password"} required
                style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
            </div>
            {mode === "register" && (
              <div>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password" required style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
              </div>
            )}
          </div>
          {mode === "register" && (
            <div>
              <label style={labelStyle}>Company <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span></label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Acme Capital" style={inputStyle} onFocus={focusIn} onBlur={focusOut} />
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{
              background: "#FEF2F2", color: "#991B1B", padding: "10px 14px",
              borderRadius: 8, fontSize: 13, fontFamily: "'Inter', sans-serif",
              border: "1px solid #FECACA", display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", padding: "13px 0",
              background: loading ? "#999" : "#0F172A",
              color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
              marginTop: 2, fontFamily: "'Inter', sans-serif",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = "0 8px 20px rgba(132, 204, 22, 0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
          >
            {loading
              ? (mode === "register" ? "Creating Account…" : "Signing In…")
              : (mode === "login" ? "Sign In" : "Create Account")}
          </button>
        </form>

        {/* ── Toggle login/register ── */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#5A7091", fontFamily: "'Inter', sans-serif" }}>
          {mode === "login" ? (
            <>
              No account?{" "}
              <button onClick={() => { setMode("register"); setError(""); }}
                style={{ background: "none", border: "none", color: "#4D7C0F", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
                Create Account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(""); }}
                style={{ background: "none", border: "none", color: "#4D7C0F", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
                Sign In
              </button>
            </>
          )}
        </div>

        {/* ── Footer note ── */}
        <p style={{
          textAlign: "center", marginTop: 16, fontSize: 11, color: "#9CA3AF",
          fontFamily: "'Inter', sans-serif", lineHeight: 1.5,
        }}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
        <p style={{
          textAlign: "center", marginTop: 8, fontSize: 10, color: "#B4C1D1",
          fontFamily: "'Inter', sans-serif", lineHeight: 1.5,
        }}>
          Deal Signals - CRE intelligence &amp; analytics
        </p>
      </div>

      {/* Global animation keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
