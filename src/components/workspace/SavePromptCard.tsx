"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { updateProfile, type User } from "firebase/auth";
import { linkAnonymousWithGoogle, registerWithEmail } from "@/lib/auth/providers";
import { getAttribution } from "@/lib/attribution";
import { trackSavePrompt } from "@/lib/analytics";

/**
 * "Save this deal" card for anonymous trial users.
 *
 * Shown at the top of a trial user's FIRST deal result once it has finished
 * rendering. It never blocks or blurs the result. Both sign-up paths convert
 * the anonymous Firebase user IN PLACE (same UID), so the trial deal and the
 * first-touch attribution stay attached, exactly like the register form:
 *   - Google: linkAnonymousWithGoogle()
 *   - Email:  registerWithEmail() with a generated password, then an emailed
 *             link to set a real one (/api/auth/save-link)
 * /api/auth/bootstrap then promotes the trial user doc to a free account.
 *
 * "Not now" hides it for the browser session. Shown / dismissed / signup are
 * recorded for /api/bot/usage (save_prompt block).
 */

const DISMISS_KEY = "som_save_prompt_dismissed";
const SHOWN_KEY = "som_save_prompt_shown";

const ss = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
};

function randomPassword(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") + "aA1!";
}

async function post(user: User, url: string, body?: unknown, forceRefresh = false) {
  const token = await user.getIdToken(forceRefresh);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function SavePromptCard({ user, ready }: { user: User | null; ready: boolean }) {
  const [phase, setPhase] = useState<"hidden" | "show" | "done">("hidden");
  const [busy, setBusy] = useState<"" | "google" | "email">("");
  const [email, setEmail] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [error, setError] = useState<React.ReactNode>("");
  const [doneMsg, setDoneMsg] = useState("");
  const checked = useRef(false);

  const isAnon = !!user && user.isAnonymous === true;

  // Decide once whether to show: anonymous, result rendered, not dismissed
  // this session, and this is their first deal.
  useEffect(() => {
    if (checked.current || !user || !isAnon || !ready) return;
    checked.current = true;
    if (ss.get(DISMISS_KEY)) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/workspace/usage", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const u = await res.json();
        if (cancelled || (Number(u.uploadsUsed) || 0) > 1) return;
        setPhase("show");
        if (!ss.get(SHOWN_KEY)) {
          ss.set(SHOWN_KEY, "1");
          trackSavePrompt("shown");
          post(user, "/api/workspace/save-prompt", { event: "shown" }).catch(() => {});
        }
      } catch { /* stay hidden */ }
    })();
    return () => { cancelled = true; };
  }, [user, isAnon, ready]);

  if (phase === "hidden") return null;
  // Signed-in users never see the prompt (only the confirmation after signing up here).
  if (phase === "show" && !isAnon && !busy) return null;

  const dismiss = () => {
    ss.set(DISMISS_KEY, "1");
    setPhase("hidden");
    trackSavePrompt("dismissed");
    if (user) post(user, "/api/workspace/save-prompt", { event: "dismissed" }).catch(() => {});
  };

  /** Promote the (now linked) trial user doc to a free account. */
  const finish = async (u: User, method: "google" | "email", name?: string | null) => {
    const firstName = name?.split(" ")[0] || "";
    const lastName = name?.split(" ").slice(1).join(" ") || "";
    const res = await post(u, "/api/auth/bootstrap", {
      firstName, lastName, attribution: getAttribution(), signupVia: "save_prompt", signupMethod: method,
    }, true);
    if (!res.ok) console.error("[save-prompt] bootstrap failed:", await res.text());
    trackSavePrompt("signup", method);
    window.dispatchEvent(new Event("usage-updated"));
    window.dispatchEvent(new Event("workspace-properties-changed"));
  };

  const existingAccountMsg = (what: string) => (
    <>
      {what} already has a ScoreOM account. This deal stays here for now.{" "}
      <Link href="/workspace/login" prefetch={false} style={{ color: "#B91C1C", fontWeight: 700 }}>Sign in</Link>{" "}
      to that account, or use a different email.
    </>
  );

  const onGoogle = async () => {
    if (busy) return;
    setError(""); setBusy("google");
    try {
      const cred = await linkAnonymousWithGoogle();
      const u = cred.user;
      const g = u.providerData.find((p) => p.providerId === "google.com");
      if (!u.displayName && g?.displayName) {
        await updateProfile(u, { displayName: g.displayName, photoURL: g.photoURL || undefined }).catch(() => {});
      }
      await finish(u, "google", u.displayName || g?.displayName);
      setDoneMsg("Saved. This deal is in your account, and your DealBoard is ready for the next one.");
      setPhase("done");
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") { /* they backed out */ }
      else if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") setError(existingAccountMsg("That Google account"));
      else if (code === "auth/popup-blocked") setError("Your browser blocked the Google window. Allow popups for this site, or use email.");
      else setError(err?.message || "Google sign-in didn't work. Try again, or use email.");
    } finally {
      setBusy("");
    }
  };

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setError("Enter a valid email address."); return; }
    setError(""); setBusy("email");
    try {
      // Same path as the register form: links the email to the trial user so
      // the deal carries over. The password is a throwaway; the emailed link
      // lets them set their own.
      const cred = await registerWithEmail(addr, randomPassword());
      await finish(cred.user, "email");
      const sent = await post(cred.user, "/api/auth/save-link").then((r) => r.ok).catch(() => false);
      setDoneMsg(sent
        ? `Saved. We emailed a link to ${addr} so you can set a password and come back to this deal.`
        : `Saved to ${addr}. We couldn't send the email just now. Use "Forgot password" on the sign-in page to set your password.`);
      setPhase("done");
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") setError(existingAccountMsg("That email"));
      else if (code === "auth/invalid-email") setError("Enter a valid email address.");
      else setError(err?.message || "Couldn't create the account. Try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="sp-card" role="region" aria-label="Save this deal">
      <style>{`
        .sp-card { position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
          margin: 0 0 16px; padding: 14px 16px; background: #F7FEE7; border: 1px solid #D9F99D; border-radius: 12px; }
        .sp-copy { flex: 1 1 300px; min-width: 0; }
        .sp-title { font-size: 15px; font-weight: 800; color: #0F172A; line-height: 1.3; margin: 0 0 3px; }
        .sp-body { font-size: 13px; color: #4B5563; line-height: 1.5; margin: 0; }
        .sp-actions { flex: 0 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 14px;
          border-radius: 9px; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; font-family: inherit; box-sizing: border-box; min-width: 0; }
        .sp-btn svg { flex: 0 0 auto; }
        .sp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .sp-google { background: #fff; color: #1F2937; border: 1.5px solid #D1D5DB; }
        .sp-google:hover:not(:disabled) { border-color: #9CA3AF; }
        .sp-send { background: #4D7C0F; color: #fff; border: 1.5px solid #4D7C0F; }
        .sp-email-toggle { display: none; background: transparent; color: #3F6212; border: 1.5px solid #A3E635; }
        .sp-email-form { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 0; }
        .sp-input { box-sizing: border-box; height: 40px; width: 200px; padding: 0 11px; border: 1.5px solid #D1D5DB; border-radius: 9px;
          font-size: 16px; color: #0F172A; background: #fff; font-family: inherit; outline: none; }
        .sp-input:focus { border-color: #65A30D; }
        .sp-notnow { flex: 0 0 auto; background: none; border: none; padding: 4px;
          font-size: 12.5px; color: #6B7280; text-decoration: underline; cursor: pointer; font-family: inherit; }
        .sp-error { flex: 1 1 100%; font-size: 12.5px; color: #B91C1C; line-height: 1.5; margin: 0; }
        .sp-done { flex: 1 1 0; min-width: 0; font-size: 13.5px; font-weight: 600; color: #3F6212; line-height: 1.5; margin: 0; }
        @media (max-width: 768px) {
          /* Full width above the score; kept short so the score stays on screen. */
          .sp-card { margin: 10px 16px 4px; padding: 12px 14px; gap: 10px; }
          .sp-copy { flex-basis: 100%; }
          .sp-title { font-size: 14px; padding-right: 56px; }
          .sp-notnow { position: absolute; top: 8px; right: 10px; font-size: 12px; }
          .sp-done { padding-right: 44px; }
          .sp-body { font-size: 12.5px; line-height: 1.45; }
          .sp-actions { flex: 1 1 100%; gap: 8px; flex-wrap: nowrap; }
          .sp-actions.email-open { flex-wrap: wrap; }
          .sp-btn { flex: 1 1 0; padding: 0 8px; font-size: 13px; }
          .sp-google { flex: 1.5 1 0; }
          .sp-actions.email-open .sp-google { flex: 1 1 100%; }
          .sp-email-toggle { display: inline-flex; }
          .sp-actions.email-open .sp-email-toggle { display: none; }
          .sp-email-form { display: none; }
          .sp-actions.email-open .sp-email-form { display: flex; flex: 1 1 100%; max-width: 100%; }
          .sp-input { flex: 1 1 0; width: 0; min-width: 0; }
          .sp-send { flex: 0 0 auto; }
        }
      `}</style>

      {phase === "done" ? (
        <>
          <p className="sp-done">{doneMsg}</p>
          <button type="button" className="sp-notnow" onClick={() => setPhase("hidden")}>Close</button>
        </>
      ) : (
        <>
          <div className="sp-copy">
            <p className="sp-title">Save this deal and screen your next one</p>
            <p className="sp-body">Create a free account to keep this result, compare deals on your DealBoard, and come back to it later.</p>
          </div>
          <div className={`sp-actions${emailOpen ? " email-open" : ""}`}>
            <button type="button" className="sp-btn sp-google" onClick={onGoogle} disabled={!!busy}>
              <GoogleIcon />{busy === "google" ? "Connecting…" : "Continue with Google"}
            </button>
            <button type="button" className="sp-btn sp-email-toggle" onClick={() => setEmailOpen(true)} disabled={!!busy}>
              Email me a link
            </button>
            <form className="sp-email-form" onSubmit={onEmail} noValidate>
              <input
                className="sp-input" type="email" inputMode="email" autoComplete="email"
                placeholder="you@company.com" aria-label="Email address"
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!busy}
              />
              <button type="submit" className="sp-btn sp-send" disabled={!!busy}>
                {busy === "email" ? "Saving…" : "Email me a link"}
              </button>
            </form>
          </div>
          <button type="button" className="sp-notnow" onClick={dismiss}>Not now</button>
          {error ? <p className="sp-error" role="alert">{error}</p> : null}
        </>
      )}
    </div>
  );
}
