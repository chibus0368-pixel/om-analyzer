# DealSignals E2E Tests

End-to-end tests that drive a real browser against the production deploy
(or any other URL via `E2E_BASE_URL`). These exist so that flow regressions
are caught **before** a user finds them.

## Quick start

```bash
# First time only - install Playwright's browser binaries
npx playwright install chromium

# Run the full suite against production
npm run test:e2e

# Run against a specific URL (Vercel preview, localhost, etc.)
E2E_BASE_URL=https://your-preview.vercel.app npm run test:e2e

# Run a single spec
npx playwright test e2e/server-guards.spec.ts

# Run with the UI inspector (great for debugging)
npx playwright test --ui

# View the HTML report from the last run
npx playwright show-report e2e-report
```

## What gets tested

| Spec | What it covers | Needs creds? |
| --- | --- | --- |
| `server-guards.spec.ts` | API routes reject unauth/invalid requests | No |
| `anon-flow.spec.ts` | Anon visitor → workspace shell, profile redirect, register form renders | No |
| `anon-flow.spec.ts` (one test) | Full trial upload through to property page | Needs `e2e/fixtures/sample-om.pdf` |
| `signup-and-checkout.spec.ts` | Free user → Stripe checkout, profile save → header sync | Needs `E2E_FREE_*` env vars |

## Setup for the auth-required tests

1. **Create a test account in Firebase**: e.g. `e2e-tester@dealsignals.app`. Sign up
   normally on the production site so it gets a free-tier `users/{uid}` doc.

2. **Set env vars** before running:

   ```bash
   export E2E_FREE_EMAIL=e2e-tester@dealsignals.app
   export E2E_FREE_PASSWORD=...
   npm run test:e2e
   ```

3. **For the upload test**: drop any reasonable OM PDF at
   `e2e/fixtures/sample-om.pdf`. The test reads it and uploads it through
   the real /om-analyzer flow.

## Adding a new test

Each new flow we discover gets a test here. Drop a fresh `.spec.ts` in
`e2e/`, follow the pattern in `anon-flow.spec.ts`. Keep tests independent
(each `test.beforeEach` should leave the browser in a clean state).
