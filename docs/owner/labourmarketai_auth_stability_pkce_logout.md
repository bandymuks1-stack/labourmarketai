# Labourmarket.ai — Auth Stability Hotfix: PKCE Race + Logout 303

## Context

Production auth has two confirmed problems.

### Problem 1 — Google OAuth `exchange_failed`

Owner sees:

`/lt/auth/login?next=%2Flt%2Fdashboard&error=exchange_failed`

Investigation result from Supabase auth logs:

- `/authorize` OK
- `/callback` OK
- failing round had no `/token POST`
- likely Case B: PKCE `code_verifier` cookie missing/stale/race
- not `invalid_grant`
- not clear redirect URI mismatch

### Problem 2 — Logout redirect method bug

Production Vercel logs show:

- `POST /lt/auth/logout -> 307`
- then `POST /lt/auth/login -> 405 INVALID_REQUEST_METHOD`

Meaning: logout redirect preserves POST. Logout must redirect with `303 See Other` so browser loads login with GET.

## Objective

Create one small auth-only hotfix PR that fixes:

1. Google OAuth PKCE cookie race handling.
2. Logout POST redirect status.

## Branch

Create from updated `origin/main`:

`fix/auth-stability-pkce-logout`

## Hard Rules

- Do not merge PR #54.
- Do not touch PR #18.
- No DB migration.
- No manual production DB mutation.
- No env/secrets edits.
- No billing/payment/provider changes.
- No service_role changes.
- No destructive git operations.
- No auth codes, tokens, cookies, refresh tokens, access tokens, secrets, full callback URLs, or private user data in logs or reports.
- Keep scope auth-only.

## Part A — Fix Logout Redirect

Inspect:

- `apps/web/app/[locale]/auth/logout/route.ts`
- account menu logout form
- logout tests/guards

Required behavior:

- `POST /lt/auth/logout` calls `signOut`.
- Response redirects to `/lt/auth/login` with HTTP `303 See Other`.
- `POST /en/auth/logout` redirects to `/en/auth/login` with HTTP `303 See Other`.
- Must not use 307 or 308.
- Must preserve locale.
- Must not delete profile, skills, roles, company, draft, or other user data.

Implementation guidance:

Use the current Next.js-supported equivalent of:

```ts
return NextResponse.redirect(loginUrl, { status: 303 });
```

## Part B — Fix Google OAuth PKCE Race

Inspect:

- `apps/web/app/[locale]/auth/callback/route.ts`
- Google OAuth login/start action/component
- Supabase browser/server helpers
- Supabase SSR cookie handling

Required callback behavior:

1. Try `exchangeCodeForSession` normally.
2. If `exchangeCodeForSession` succeeds:
   - redirect to sanitized internal `next`
   - fallback to localized dashboard.
3. If `exchangeCodeForSession` fails:
   - call `supabase.auth.getSession()`
   - if a valid session exists, treat as success and redirect to sanitized `next` / dashboard
   - if no valid session exists, redirect to localized login with `error=exchange_failed`
4. Preserve locale.
5. Validate `next` as an internal path only.
6. No open redirect.
7. Never expose auth code/token/cookie/secret/full callback URL.

Required OAuth-start behavior:

- Before Google `signInWithOAuth`, clear stale local browser auth state with `supabase.auth.signOut({ scope: "local" })` if supported by the installed SDK.
- Do not globally revoke server session before OAuth.
- Then start Google OAuth normally.

Cookie diagnostics:

- If Supabase server cookie `setAll` has an empty `catch {}`, replace it with safe `console.error` that logs only non-secret error name/message/context.
- Do not log cookie values.
- Do not change cookie behavior unless necessary.

## Part C — Supabase Auth URL Config

Try to inspect Supabase Auth URL configuration only if an already-available read-only tool exists and does not require owner token or secret exposure.

If readable, report:

- Site URL
- relevant Redirect URLs for `app.labourmarket.ai`

If not readable:

- do not block the PR
- do not ask owner to manually check during the coding task
- include recommended config in final report only:

Recommended Site URL:

`https://app.labourmarket.ai`

Recommended Redirect URLs:

`https://app.labourmarket.ai/lt/auth/callback`

`https://app.labourmarket.ai/en/auth/callback`

or wildcard:

`https://app.labourmarket.ai/*/auth/callback`

## Tests

Add or update focused tests.

### Logout tests

- `POST /lt/auth/logout` returns 303.
- `Location` is `/lt/auth/login`.
- `POST /en/auth/logout` returns 303.
- `Location` is `/en/auth/login`.
- `signOut` is called.
- logout does not call profile/role/skill/company/draft mutation.
- logout does not use 307 or 308.

### Callback tests

- `exchangeCodeForSession` success redirects to sanitized internal `next`.
- `exchangeCodeForSession` failure + valid `getSession` redirects to sanitized `next` / dashboard.
- `exchangeCodeForSession` failure + no session redirects to localized login with `error=exchange_failed`.
- external `next` URL is rejected/sanitized.
- locale is preserved.
- no auth code/token/cookie/secret leaks into redirect or logs.
- successful callback behavior remains unchanged.

### OAuth-start tests

- Google OAuth start clears stale local auth state before `signInWithOAuth` when SDK supports local `signOut`.
- Google OAuth still starts normally after local cleanup.
- no global revoke before OAuth.

## Commands

Run:

```bash
pnpm -F web lint
pnpm -F web typecheck
pnpm -F web test
pnpm -F web build
```

If command names differ, use existing repo scripts and report exact commands.

## PR

Open PR:

Title:

`fix(auth): stabilize Google PKCE callback and logout redirect`

PR body must include:

- root cause
- files changed
- tests/checks run
- whether Supabase Auth URL config was readable
- whether any dashboard config remains recommended but not verified
- PR #54 still unmerged
- PR #18 still blocked/untouched
- safety proof

## Final Report

Include:

- branch
- commit SHA
- PR URL
- root cause
- files changed
- tests/checks run
- whether Supabase config was readable by agent
- whether any owner dashboard config remains only recommended
- PR #54 still unmerged
- PR #18 blocked/untouched
- safety proof:
  - no DB migration
  - no production DB mutation
  - no env/secrets
  - no service_role
  - no billing/payment/provider
  - no destructive git
  - no auth codes/tokens/cookies/secrets logged

## Post-Deploy Owner Browser Checks

After this PR is merged and deployed, owner should only need to check:

1. Google login works.
2. Logout lands on `/lt/auth/login` without 405.
3. Account menu remains visible.
4. Admin access remains visible across role switch.
5. Then PR #54 smoke can resume.
