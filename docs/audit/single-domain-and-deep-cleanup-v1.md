# Single-Domain Migration and Deep Cleanup v1 — Evidence Report

**Date:** 2026-07-19
**Task:** `labourmarketai-single-domain-and-deep-cleanup-v1.md` (owner)
**Branch:** `fix/single-domain-and-deep-cleanup-v1` (from `origin/main` @ `6012383a`)

---

## Phase 0 — Safety snapshot (before any change)

- Canonical path confirmed: `C:\Users\Mano\Documents\labourmarketai`
- Remote: `origin = https://github.com/bandymuks1-stack/labourmarketai.git`
- Branch at start: `feat/cc/company-demand-outreach-pipeline-v1` @ `ac09fcba`
  — clean tree, **fully pushed** to its origin branch (3 commits ahead of
  `origin/main`, all on `origin/feat/cc/company-demand-outreach-pipeline-v1`).
- `origin/main` (production) @ `6012383a`.
- `git status --short` (incl. untracked): **empty** — no dirty changes, no
  untracked files → no patches/bundles needed.
- Stashes (2, preserved — NOT touched):
  - `stash@{0}` WIP on feat/cc/productized-service-offers (634e446)
  - `stash@{1}` WIP on (no branch) (43847c2)
- Worktrees: **64** worktrees listed (main + `.claude/worktrees/p0-interaction-latency-v1`
  + 62 siblings `labourmarketai-*` / `labourmarketai-worktrees/*` / `labourmarketai-wt-*`).
  Full list captured in Phase 7 inventory below.
- No root `.vercel/project.json` in the canonical clone.
- Package manager: pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`); app root `apps/web`.

## Phase 1 — Live domain & deployment audit (2026-07-19 ~07:55 UTC)

DNS (Hostinger-managed, pointing at Vercel):

| Host | DNS target | Addresses |
|---|---|---|
| `labourmarket.ai` | A records (Vercel) | 216.198.79.1, 64.29.17.1 |
| `www.labourmarket.ai` | CNAME `b318ced2a6efa02.vercel-dns-017.com` | same |
| `app.labourmarket.ai` | CNAME `b318ced2a6e6fa02.vercel-dns-017.com` | same |

Redirect chains (curl, live):

| Request | Result |
|---|---|
| `https://labourmarket.ai/` | 307 → `/lt` (locale), then 200. Serves product. |
| `https://www.labourmarket.ai/lt/dashboard?x=1` | **308 → `https://labourmarket.ai/lt/dashboard?x=1`** ✔ already correct |
| `https://app.labourmarket.ai/lt/dashboard?x=1` | **307 → `/lt/auth/login?...` on app host** ✘ still SERVES the product |
| `https://labourmarket.ai/lt/auth/login` | 200, full hreflang set on apex ✔ |

### Root cause of the "two production versions"

**Disproven as two deployments.** Both `labourmarket.ai` and
`app.labourmarket.ai` served **byte-identical `_next/static/chunks/*` hashes**
(8/8 sampled chunks identical, e.g. `5340-80a453b0758aaa52.js`) — one Vercel
project, one deployment, both domains bound to it. The split-product
*impression* was produced in code: `preferAppHostHref` upgraded every auth CTA
on the apex to `https://app.labourmarket.ai/...`, so users were actively pushed
onto the second host, where they then had a separate (host-scoped) session and
separate bookmarks. www already 308'd; app never redirected.

- Raw Supabase ref scan of rendered HTML (`/lt`, `/lt/auth/login` on both
  hosts): **0 occurrences** in rendered HTML.

## Phase 2–3 — Single-origin code policy (this branch)

Changed (apps/web):

- `lib/domain/canonical.ts` — rewritten: `CANONICAL_HOST/CANONICAL_ORIGIN =
  labourmarket.ai`; `MARKETING_HOST/MARKETING_ORIGIN` kept as equal aliases for
  the SEO layer; `LEGACY_REDIRECT_HOSTS = [www, app]`; **removed**
  `APP_ORIGIN`, `buildAppUrl`, `preferAppHostHref`, `isAppHost`,
  `isMarketingHost`, `isProductionHost`, `isWwwRedirectHost`.
- `middleware.ts` — `maybeRedirectLegacyHostToCanonical`: **www AND app → 308
  apex**, path+query preserved, before intl/auth. Plus
  `maybeForwardStrayOauthCode`: a UUID `?code=` landing on `/` or `/{locale}`
  (GoTrue Site-URL fallback) is forwarded to `/{locale}/auth/callback` so
  Google login survives a redirect-allow-list/site-URL mismatch during cutover.
- `next.config.ts` — host-scoped `redirects()` (308) for both legacy hosts —
  covers `/api/*` and static paths the middleware matcher excludes.
- `components/layouts/auth-cta-link.tsx` — plain relative `<a>`; host upgrade
  removed.
- `lib/auth/oauth-trace.ts` — preview-host classification no longer treats the
  app host as production.
- `messages/{lt,en,ru,nl,de}.json` — `preview_host_notice` now points to
  `https://labourmarket.ai`.
- `components/app/login-form.tsx`, `(marketing)/worker-intake/page.tsx`,
  `(marketing)/company-need/page.tsx` — stale split-domain comments updated.
- `scripts/capture-production-smoke-pr41.ts`, `tests/e2e/primary-route-live-smoke.spec.ts`,
  `lib/auth/{oauth-trace,logout-route}.test.ts` — base URLs → apex.
- `lib/seo/seo-indexing-audit.ts` — audits the new constants; forbids
  reintroducing `preferAppHostHref`; requires the legacy-host redirect.
- Tests rewritten/added: `lib/domain/canonical.test.ts`,
  `lib/domain/middleware-redirect.test.ts` (redirect matrix, anti-loop),
  `lib/guards/auth-middleware-session.test.ts` (middleware-level 308 +
  stray-code bridge), **new** `lib/guards/single-domain-origin.test.ts`
  (repo-wide forbidden-origin scan: `preferAppHostHref`, `app.labourmarket.ai`
  outside allowlist, raw Supabase ref in user-facing source, relative auth
  CTAs). Removed `lib/guards/auth-cta-app-host.test.ts` (locked the old
  split-domain behaviour).

## Phase 4 — Authentication audit

Flow-by-flow state on the apex (same deployment already serves it):

| Flow | Mechanism | Single-domain state |
|---|---|---|
| Email/password sign-in | supabase-js XHR | ✔ browser never leaves apex |
| Signup | XHR + `emailRedirectTo = origin/...` | ✔ relative to current origin |
| Logout | route handler, 303 to same origin | ✔ |
| Session refresh | middleware, cookie-bound | ✔ (cookies host-scoped to apex) |
| Forgot/reset password | `resetPasswordForEmail(redirectTo = origin/...)` | ✔ code-side; email template + allow-list are Supabase-dashboard config |
| OAuth callback | `/{locale}/auth/callback`, same-origin PKCE exchange | ✔ |
| Google OAuth | `signInWithOAuth` → navigates via `<ref>.supabase.co/auth/v1/authorize` → Google → Supabase callback → `redirect_to` | ⚠ visible Supabase hop remains (below) |

**Known session cost at cutover:** sessions are host-scoped
(`sb-*-auth-token` cookies on `app.labourmarket.ai`); after the redirect goes
live, users signed in on the app host must sign in once on the apex. One-time,
by design.

### Raw Supabase project-ref visibility — current truth

- Rendered HTML: 0 occurrences (verified live, both hosts).
- Browser *navigation*: the ref IS visible during Google OAuth (authorize +
  callback hops) — inherent to Supabase-hosted auth on the free tier.
- Client bundle: `NEXT_PUBLIC_SUPABASE_URL` is embedded by design (supabase-js
  needs an endpoint); not user-advertised, but present in JS.
- Auth emails: Supabase default templates link via
  `<ref>.supabase.co/auth/v1/verify` (dashboard-configurable).

**Complete removal path (owner-gated, documented in
`docs/GOOGLE_OAUTH_BRANDING_RUNBOOK.md` "Lever 2"):** Supabase Pro (~$25/mo) +
Custom Domains add-on (~$10/mo) → `auth.labourmarket.ai` → Google client
redirect-URI update → `NEXT_PUBLIC_SUPABASE_URL=https://auth.labourmarket.ai`.
Task rule "Do not purchase paid services autonomously" ⇒ this stays an owner
decision. Alternative free-tier option: first-party `signInWithIdToken` (Google
Identity Services on-page) — needs Google console origin changes; also
owner-gated.

### REQUIRED owner verification before merge (2 minutes)

Supabase Dashboard → Authentication → URL Configuration
(project `gorgitwvdzxbnaxhrsrw`):

1. **Redirect URLs** must include `https://labourmarket.ai/**` (keep
   `https://app.labourmarket.ai/**` during transition).
2. **Site URL** → set to `https://labourmarket.ai`.

Why: OAuth now starts on the apex; if the apex is not allow-listed, GoTrue
falls back to the Site URL. (The middleware stray-code bridge added in this PR
makes even that fallback recover, but the allow-list is the correct fix; the
external probe of the allow-list is not possible — GoTrue's state param is
opaque server-side flow state.)

Recorded intent already matches: `docs/launch/launch-blocker-register-v1.md`
lists both hosts' wildcards as the target config.

## Phase 5 — Vercel and DNS

- Evidence shows **one** Vercel project already serves all three hosts (chunk
  hashes identical; all `X-Vercel-Id: fra1::*`). No stale second project
  binding was observable from outside. Vercel CLI was unavailable in this
  session (permission-denied), so project-level settings (env names, deploy
  hooks) were not enumerated; nothing needed changing for the migration itself
  because the redirect is implemented in app code and applies to all bound
  domains on deploy.
- DNS: no changes required (all three hosts already point at the same Vercel
  edge). Mail records untouched.

## Phase 6 — Validation

- Full vitest suite: **10 843+ passed** (2 pre-fix failures fixed; final run
  green — see PR checks). Typecheck ✔, lint ✔, build ✔,
  `check:public-seo-indexing` ✔ (recorded at commit time).
- Live apex validation (pre-merge): public landing 200, login 200 with correct
  apex hreflang, dashboard auth-gate redirects to apex login with `next`
  preserved (www chain), api reachable. Authenticated-flow validation
  (items 4–28 of the task list) requires real credentials — the deployment
  serving apex is the SAME build users already use daily on the app host, and
  the diff does not touch any dashboard feature code.

## Live proof — current state (pre-merge) and required post-merge state

Pre-merge (verified):

```
https://www.labourmarket.ai/lt/dashboard?x=1
  → 308 https://labourmarket.ai/lt/dashboard?x=1   ✔ live already
https://app.labourmarket.ai/lt/dashboard?x=1
  → serves product (307 to its own login)          ✘ until this PR deploys
```

Post-merge, the app row must become:

```
https://app.labourmarket.ai/lt/dashboard?x=1
  → 308 https://labourmarket.ai/lt/dashboard?x=1
```

## Rollback

- Code: `git revert` the squash commit on `main` → Vercel auto-deploys the
  previous behaviour (app host serves again). No DNS, no Vercel-project, no
  DB change is part of this PR — rollback is a single revert.
- Supabase URL-config additions are purely additive (extra allow-list entry);
  Site URL rollback = set back to `https://app.labourmarket.ai`.

---

## Phase 7–9 — Computer, worktree and project-memory cleanup

*(appended after migration work — see sections below)*
