# Playwright Live-Render Smoke Plan — Primary Routes v1

> Companion to `docs/quality/primary-route-smoke-dead-ui-guard-v1.md` (PR #136,
> static guard) and `docs/quality/ci-quality-gates-v1.md` (PR #138, CI wiring).
> First skeleton: `apps/web/tests/e2e/primary-route-live-smoke.spec.ts`.

## Why

The static guard (`pnpm check:primary-route-smoke`) proves primary route source
files exist and carry no dead links / placeholder leaks. It does **not** load a
real browser. This plan adds the live-render layer: actually rendering the
primary routes and catching runtime breakage a static scan cannot see.

**No new dependency is required** — `@playwright/test@^1.60.0` and
`apps/web/playwright.config.ts` already exist, with a `tests/e2e/` suite.

## Scope (target coverage)

| Layer | Check | Status |
|-------|-------|--------|
| HTTP 200 | every public primary route returns 2xx | ✅ in skeleton |
| No fatal JS | no uncaught `pageerror` on load | ✅ in skeleton |
| Auth-gated handling | anonymous visit to gated route → `/auth/login` (no fake login) | ✅ in skeleton (`/lt/onboarding`) |
| CTA target resolution | primary CTAs resolve to a real route (no `#`, no 404) | ⬜ to wire |
| Mobile viewport | routes render at a phone viewport without overflow/overlap | ⬜ to wire |
| Console error budget | classify benign vs fatal `console.error` | ⬜ to wire (needs allowlist to avoid flakiness) |

## How to run

Secret-free. Public routes need no `SUPABASE_TEST_URL`.

```bash
# Against local dev (Playwright auto-starts `pnpm dev`):
pnpm -F web exec playwright test primary-route-live-smoke

# Against a deployed URL (no local server):
E2E_BASE_URL=https://app.labourmarket.ai E2E_NO_SERVER=1 \
  pnpm -F web exec playwright test primary-route-live-smoke

# First-time only — install the browser binary (already a sanctioned repo script):
pnpm -F web e2e:install
```

## Dependency decision needed (owner)

- **None to add.** Playwright is already installed. The only one-time step is the
  chromium **browser binary** download via the existing `e2e:install` script —
  not an npm dependency change.
- **CI wiring is intentionally deferred.** The secret-free Quality Gates
  workflow (PR #138) runs static gates + build, not Playwright, because e2e needs
  a running server (and, for auth flows, a separate test Supabase project per
  `docs/TESTING.md`). Wiring this smoke into CI is a **separate owner decision**:
  it would add browser install + a dev-server boot to CI time. The recommended
  first step is a manual/local run; promote to CI only once stable.

## Next steps

1. Owner reviews this PR; run the skeleton locally or against production.
2. Add the CTA-resolution and mobile-viewport layers (still secret-free).
3. Decide whether to add an opt-in CI job (separate from the fast static gate).
