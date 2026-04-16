# DealSignals -- Project Rules

## Performance Rules

### All new `<Link>` elements in `/workspace` MUST use `prefetch={false}`

Next.js prefetches page chunks for every visible `<Link>` on mount. The workspace layout has 13+ links (sidebar, header, tabs, mobile menu). Without `prefetch={false}`, these chunk downloads saturate the browser's connection pool and block Firebase Auth's `accounts.lookup` request for 20-25 seconds.

This was the root cause of the persistent "Loading workspace..." hang on 2026-04-15. The fix is in commit `768f680`.

If you add a new `<Link>` anywhere under `src/app/workspace/`, always include `prefetch={false}`.

### Use `router.push()` for in-app navigation, never `window.location.href`

`window.location.href` triggers a full page reload, which forces Firebase Auth to re-initialize from IndexedDB (another 20+ second delay). `router.push()` does client-side navigation and keeps the auth state in memory.

Fixed in commit `1c6bca1`. If you need to navigate programmatically inside the workspace, use `router.push()`.

### Preconnect hints for Firebase Auth

Root `layout.tsx` includes `<link rel="preconnect">` for `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, and `www.googleapis.com`. Do not remove these. They allow the browser to start DNS/TCP/TLS handshakes for Firebase Auth before JS finishes downloading.

### Do not cache Firebase Auth users in localStorage

We tried caching a minimal user stub in localStorage to skip the loading skeleton. It failed because the cached plain object lacks `getIdToken()` and other Firebase User methods. Components throughout the codebase call `user.getIdToken()`, so they silently break when given a stub. Separating a "display hint" from the real user caused black screens on pages that assume `user` is non-null when the workspace shell is visible. This approach was attempted and reverted twice. Do not try it again without first auditing every `user.getIdToken()` call site.

## Architecture Rules

See SPECS.md section 4 ("Architecture Lock") for the full list. Key points:

1. **Never HTTP self-fetch on Vercel.** Import `runParseEngine()` / `runScoreEngine()` directly instead of calling `fetch()` to routes on the same deployment.
2. **Extension uploads use 3-step signed URL flow** to bypass Vercel's 4.5 MB body limit: `init` -> direct GCS PUT -> `finalize`.
3. **Idempotency is nonce-as-Firestore-doc-ID + `sourceUrl` dedup.** Do not switch to compound queries.
4. **Firestore field names are load-bearing.** Property detail reads `originalFilename`, `fileSizeBytes`, `storagePath`. Writing `filename`/`fileSize` silently breaks the Source Documents panel.

## Workspace Context Stability

`WorkspaceContext` provider value and `activeWorkspace` must be memoized. If they rebuild on every render, every `useWorkspace()` consumer re-renders, useEffects watching `activeWorkspace` re-fire, and you get 8+ duplicate `/api/workspace/properties` calls per page load. See `src/lib/workspace/workspace-context.tsx`.

## Style

- Don't use em dashes
