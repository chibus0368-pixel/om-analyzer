/**
 * Tiny in-memory handoff for files picked on one page (e.g. the empty
 * dealboard drop zone) and consumed on another (/workspace/upload).
 *
 * Files can't be serialized into query params or sessionStorage, so we
 * stash them on a module-scoped variable. This works because the app is
 * a Next.js SPA — `router.push` preserves the JS module state between
 * navigations. A safety TTL makes sure we don't accept a stale handoff
 * if the user bounced around before landing on the upload page.
 */

let pending: { files: File[]; at: number } | null = null;

// Generous TTL — covers slow auth / workspace bootstraps on first login.
const TTL_MS = 60_000;

export function setPendingUploadFiles(files: File[] | FileList | null | undefined) {
  if (!files) {
    pending = null;
    return;
  }
  const arr = Array.from(files);
  if (!arr.length) {
    pending = null;
    return;
  }
  pending = { files: arr, at: Date.now() };
}

export function consumePendingUploadFiles(): File[] | null {
  if (!pending) return null;
  const fresh = Date.now() - pending.at < TTL_MS;
  const out = pending.files;
  pending = null;
  return fresh ? out : null;
}

export function hasPendingUploadFiles(): boolean {
  if (!pending) return false;
  if (Date.now() - pending.at >= TTL_MS) {
    pending = null;
    return false;
  }
  return true;
}
