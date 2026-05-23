# Production smoke evidence — PR #41 deploy

> **Sprint:** `chore/cc/production-smoke-evidence-pr41`  
> **Base commit:** `28b9a88` (PR #41 — fix(vision): hide public vision link until owner smoke passes).  
> **Method:** unauthenticated curl + Playwright iPhone 13 (390 × 844)
> against the live `https://app.labourmarket.ai` deploy.  
> **Authenticated smoke status:** PENDING — owner action only.

## Summary

| Invariant | Status | Source |
| --- | --- | --- |
| `/lt` HTTP 200 | ✅ PASS | live curl |
| `/en` HTTP 200 | ✅ PASS | live curl |
| `/lt/vision` HTTP 200 (reachable by direct URL) | ✅ PASS | live curl |
| `/en/vision` HTTP 200 (reachable by direct URL) | ✅ PASS | live curl |
| `/vision` link **absent** from public site nav | ✅ PASS | live HTML grep + screenshot 01–02 |
| `/lt/vision` carries `<meta name="robots" content="noindex, nofollow">` | ✅ PASS | live curl |
| `/en/vision` carries `<meta name="robots" content="noindex, nofollow">` | ✅ PASS | live curl |
| `data-testid="vision-internal-preview"` present on `/lt/vision` | ✅ PASS | live curl |
| `data-testid="vision-internal-preview"` present on `/en/vision` | ✅ PASS | live curl |
| "Vidinė peržiūra" badge visible on `/lt/vision` mobile | ✅ PASS | screenshot 03 |
| "Internal preview" badge visible on `/en/vision` mobile | ✅ PASS | screenshot 04 |
| Vision control-room section reachable on production | ✅ PASS | screenshot 05–06 |
| Vision full-page renders end-to-end on production mobile | ✅ PASS | screenshot 07 |
| Authenticated dashboard mobile smoke (PR #30 + PR #39 + PR #40 checklists) | ⏳ PENDING — OWNER ACTION |

**Recommendation:** unauthenticated public-surface invariants from PR #41 are verified PASS on production. The PR #30 / PR #39 / PR #40 production-smoke status blocks remain PENDING because this pack does NOT include the authenticated walk-through — that requires a real Supabase session and is owner-only.

## Files in this evidence pack

- `public-routes-smoke.md` — detailed curl + Playwright check log for the
  unauthenticated public surface.
- `owner-authenticated-smoke.md` — what the owner must still run
  manually. Stays PENDING until the owner signs off.
- `screenshots/` — 7 iPhone 13 PNGs of the live production deploy.

## How to reproduce

```bash
git checkout main
git pull --ff-only
git log -1 --oneline  # must include 28b9a88 (PR #41)

# Unauthenticated curl
curl -s -L https://app.labourmarket.ai/lt/vision | grep -i 'name="robots"'
curl -s -L https://app.labourmarket.ai/lt | grep -o 'href="/lt/[^"]*"' | sort -u
curl -s -L https://app.labourmarket.ai/lt/vision | grep -o 'data-testid="vision-internal-preview"'

# Playwright iPhone 13 captures
cd apps/web
npx tsx scripts/capture-production-smoke-pr41.ts
```

PNGs land in `docs/evidence/production-smoke-pr41/screenshots/`.

## What this evidence does NOT prove

- **Authenticated dashboard parity.** PR #30 / PR #39 / PR #40 mobile
  smokes against `/lt/dashboard`, `/lt/dashboard/profile`,
  `/lt/dashboard/journal`, `/lt/dashboard/account` are owner-only and
  remain PENDING. See `owner-authenticated-smoke.md`.
- **A passed status.** Nothing in this PR flips a smoke checklist's
  `Status: PENDING` line to `PASSED`. That stays the owner's
  prerogative.
- **DB-level guarantees.** PR #18 (journal security hardening) is
  still BLOCKED per issue #32. This evidence pack does not change
  that.

## Goal coverage

| PR #41 goal | Evidence |
| --- | --- |
| `/vision` link **removed** from public site nav | screenshot 01 (LT), screenshot 02 (EN), HTML grep showing only `/lt/auth/*` `/lt/for-*` `/lt/legal/*` `/lt/pricing` href entries |
| `/vision` still reachable by direct URL | live `HTTP/2 200` from curl on both `/lt/vision` and `/en/vision` |
| `/vision` carries `noindex, nofollow` | live curl shows `<meta name="robots" content="noindex, nofollow"/>` on both locales |
| `/vision` shows internal-preview badge/banner | live HTML contains `data-testid="vision-internal-preview"` + "Vidinė peržiūra" / "Internal preview"; screenshots 03 + 04 |
| Smoke statuses stay PENDING | `owner-authenticated-smoke.md` explicitly PENDING; PR #30 / PR #39 / PR #40 checklists untouched |
