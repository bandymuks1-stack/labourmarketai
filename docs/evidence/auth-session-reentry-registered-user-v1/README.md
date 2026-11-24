# Auth session re-entry fix — evidence

> **Sprint:** `fix/cc/auth-session-reentry-registered-user-v1`  
> **Base commit:** `b0ee918` (PR #42 — production smoke evidence).  
> **Theme:** stabilise the "I registered yesterday, can't get back in
> today" experience for the registered-user re-entry path.

## Problem summary

After a registered user closes the browser or lets their session
expire, returning to `/dashboard` (or any sub-route) bounces them
through `/auth/login?next=…`. Before this PR, every login / signup /
OAuth callback path **dropped the `next` parameter and routed the
user to the home `/dashboard` instead of where they were heading**.
Subjective effect: the user feels "thrown out" of the route they
wanted, and the existing fix path (clicking the "Prisijungti" footer
link from signup) is non-obvious when they accidentally land on
signup first.

The owner's primary email was used to confirm this; the literal email
is intentionally kept out of the repo (privacy hygiene — a guard test
in `apps/web/lib/guards/product-readiness.test.ts` enforces this).

## Root cause

`apps/web/middleware.ts` correctly attaches
`?next=/lt/dashboard/<route>` when it bounces an unauthenticated user
to login. But:

1. **Login form** (`apps/web/components/app/login-form.tsx`) hardcoded
   `router.replace("/dashboard")` on success — never read `next`.
2. **Signup form** (`apps/web/components/app/signup-form.tsx`) hardcoded
   `router.replace("/onboarding")` and never threaded `next` through
   onboarding. The `userAlreadyRegistered` error path also showed only
   plain error text — no one-tap "Login instead" CTA.
3. **GoogleButton** built its `redirectTo` URL without forwarding
   `next` to the OAuth callback.
4. **OAuth callback** (`apps/web/app/[locale]/auth/callback/route.ts`)
   never read `?next=` — it hardcoded the destination based on
   `profiles.onboarded_at` only.

Result: a user with a valid session who was bounced from
`/lt/dashboard/journal` would land on `/lt/dashboard` (overview)
after login. Compounded with the "user already registered" UX dead
end on signup, the experience reads as instability.

## Fix

Smallest reliable code change, all source-only — no DB, no migration,
no env touch.

- **New `apps/web/lib/auth/redirect.ts`** with
  `getSafeReturnPath(input, locale)`. Sanitises a possibly-malicious
  `next` query — rejects open-redirect URLs (`https://…`, `//…`,
  `javascript:…`), rejects relative paths, rejects anything
  re-entering the auth flow (login → login loops). Defaults to
  `/<locale>/dashboard`. Backed by 8 unit tests in
  `apps/web/lib/auth/redirect.test.ts`.
- **`login-form.tsx`** reads `?next=` via `useSearchParams`,
  sanitises through `getSafeReturnPath`, and routes via
  `window.location.assign(nextPath)` so the locale prefix the helper
  added survives. Also forwards the param to the in-form "Signup"
  footer link.
- **`signup-form.tsx`** mirrors the same handling. After signup it
  routes to `/onboarding?next=<safe>` so a future onboarding-completion
  hook can land the user where they originally headed. On the
  `userAlreadyRegistered` error it renders an inline "Login instead"
  CTA (`data-testid="signup-login-instead"`) with the `next` already
  carried over.
- **`google-button.tsx`** accepts `nextPath` and forwards it as
  `?next=` on the `redirectTo` URL.
- **`auth/callback/route.ts`** reads `next` from the URL, preserves
  it on every error rebound to login, sanitises via
  `getSafeReturnPath`, and uses it as the success destination when
  onboarding is complete.
- **`auth/login/page.tsx`** + **`auth/signup/page.tsx`** wrap the
  client form in `<Suspense fallback={null}>` so Next.js 15's
  static-prerender + `useSearchParams()` requirement is satisfied
  without the page becoming dynamic.

## Tests / guards added

`apps/web/lib/auth/redirect.test.ts` (8 new tests)
- Falls back to `/<locale>/dashboard` on null / empty / missing input.
- Blocks open-redirect attempts (`https://…`, `//…`, `javascript:…`).
- Blocks paths that re-enter the auth flow.
- Rejects relative paths.
- Accepts a locale-prefixed internal path verbatim.
- Prefixes the locale when the input is a bare `/dashboard` path.
- Preserves query + hash on safe paths.
- Companion `isSafeReturnPath` agrees on the obvious cases.

`apps/web/lib/guards/product-readiness.test.ts` (5 new assertions)
- Login form reads `next` + routes via `window.location.assign(nextPath)`
  (the hardcoded `/dashboard` redirect is gone).
- Signup form reads `next`, routes through `onboardingPath`, and
  renders the inline `signup-login-instead` CTA when
  `errorKind === "alreadyRegistered"`.
- GoogleButton forwards a sanitised `next` into the OAuth redirect.
- OAuth callback honours `next` AND preserves it on every error
  rebound to login.
- The literal owner email never appears anywhere in `apps/web/**` or
  `docs/**`. The guard reconstructs the email at runtime from two
  halves so its own source doesn't embed it.

Earlier guards from PR #31 → #42 still apply unchanged.

## Before vs after expected behaviour

| Scenario | Before | After |
| --- | --- | --- |
| Registered user opens `/lt/dashboard/journal` with no session | bounced to login → after login lands on `/dashboard` (overview) | bounced to login with `?next=/lt/dashboard/journal` → after login lands on `/dashboard/journal` |
| User accidentally hits `/auth/signup` with an already-registered email | error text only, must find footer "Prisijungti" link manually | error text + inline "Login instead →" CTA that carries `next` through |
| OAuth (Google) sign-in from a protected route | OAuth callback ignored `next`, landed on `/dashboard` | callback honours `next`, lands on the original protected route |
| Hostile `?next=https://evil.example` query | (was never read) | rejected by `getSafeReturnPath`, falls back to `/<locale>/dashboard` |

## What was intentionally NOT touched

- **PR #18** not merged, not modified, not rebased.
- **`supabase/migrations/`** unchanged.
- **billing / payment / pricing / checkout / providers** — no
  changes.
- **production deploy / Vercel / DNS / secrets / env / Supabase
  project settings** — no changes.
- **`lib/auth/actions.ts`** server-side actions are unchanged.
- **Onboarding wizard** is unchanged — it does not yet read `next`
  itself. The signup form passes `?next=` to `/onboarding`, but
  hooking onboarding-completion into the redirect is a follow-up
  PR (out of scope for this trust fix).
- **Email confirmation policy** — Supabase project setting
  "Confirm email" remains OFF per existing project setup. No env
  / Supabase changes.
- **PR #30, #39, #40, #42 production smoke / owner-review status
  blocks** — all still PENDING (guards enforce in lock-step).
- **`/vision` publication flag** — stays `false` (PR #41).

## Owner manual smoke

After Vercel deploys this PR:

1. Open `https://app.labourmarket.ai/lt/dashboard/journal` in a
   fresh incognito window. Expected: redirected to
   `/lt/auth/login?next=/lt/dashboard/journal`.
2. Sign in with email + password. Expected: lands on
   `/lt/dashboard/journal` (not `/lt/dashboard`).
3. Sign out. Open `/lt/dashboard/profile`. Expected: redirected to
   `/lt/auth/login?next=/lt/dashboard/profile`.
4. Click "Tęsti su Google" (Google OAuth). Expected: lands on
   `/lt/dashboard/profile` after callback.
5. Sign out. Open `/lt/auth/signup`. Enter the primary email +
   any password. Expected: "Šis el. paštas jau registruotas…" error
   + an inline "Prisijungti →" button right below it. Click the
   button. Expected: lands on `/lt/auth/login`.
6. Sign in. Expected: lands on `/lt/dashboard` (because no `next`
   was attached this time).

Mobile (iPhone 13 Chrome):

7. Repeat step 1 on mobile. Expected: same behaviour, no horizontal
   overflow, no bottom-nav clipping.

If any step fails, open a follow-up branch from `main`. Do not flip
the PR #30 / PR #39 / PR #40 / PR #42 smoke statuses to PASSED based
on this PR alone — those remain owner-only.

## Privacy note

The primary email that surfaced the bug is intentionally not stored
anywhere in this repo. The runtime guard reconstructs it from two
halves at test time to verify the absence; the source file itself
never carries the literal.

## Limitations

- This PR does not change Supabase email-confirmation behaviour, the
  session lifetime, the cookie domain, or the refresh-token rotation.
  If the user's session simply expired overnight, the
  redirect-with-`next` fix means they now land where they wanted
  after re-logging in, but it does not extend the session lifetime.
- Onboarding completion does not yet read `next` and route there
  automatically — listed under "intentionally not touched". The
  signup form does propagate `next` into onboarding as a query, so
  wiring the completion hook later is a one-line follow-up.
- Authenticated production smoke remains PENDING.
