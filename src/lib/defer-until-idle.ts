/**
 * On marketing pages, heavy work that isn't needed for first paint
 * (Firebase Auth + Firestore, ~200KB of JS plus Google's auth iframe)
 * waits until the visitor interacts or the page has been idle for a few
 * seconds. On the app itself (/workspace, share pages, auth pages) it
 * runs right away, since those pages need the signed-in user immediately.
 */
const APP_PATHS = /^\/(workspace|share|p\/|login|register|forgot-password|reset-password|verify-email|unsubscribe)/;

export function isMarketingPath(pathname: string): boolean {
  return !APP_PATHS.test(pathname);
}

export function deferUntilIdle(cb: () => void, { idleMs = 4000 }: { idleMs?: number } = {}): () => void {
  if (typeof window === "undefined") return () => {};
  if (!isMarketingPath(window.location.pathname)) { cb(); return () => {}; }
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const events = ["pointerdown", "keydown", "focusin"] as const;
  const fire = () => {
    if (done) return;
    done = true;
    cleanup();
    cb();
  };
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    events.forEach(e => window.removeEventListener(e, fire, true));
    window.removeEventListener("load", arm);
  };
  const arm = () => {
    const ric = (window as any).requestIdleCallback as undefined | ((f: () => void, o?: { timeout: number }) => number);
    timer = setTimeout(() => (ric ? ric(fire, { timeout: 2000 }) : fire()), idleMs);
  };
  events.forEach(e => window.addEventListener(e, fire, { capture: true, passive: true }));
  if (document.readyState === "complete") arm(); else window.addEventListener("load", arm, { once: true });
  return () => { done = true; cleanup(); };
}
