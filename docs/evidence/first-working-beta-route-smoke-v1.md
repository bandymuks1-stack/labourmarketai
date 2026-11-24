# First-working-beta route smoke v1

**Branch:** `feat/cc/first-working-beta-variant-v1`  
**Base commit:** `efe3df3` (PR #33 merged)  
**Status:** PASS at the build / source level. **Authenticated production
smoke against the live deploy remains PENDING** — see
`docs/evidence/post-merge-production-smoke-pr30.md`.

## How this was run

- `pnpm -F web build` — Next.js builds all locales (10) cleanly; the
  resulting manifest lists every route with its render mode.
- Each route below was inspected at the source level on this branch
  (`apps/web/app/[locale]/...`) to confirm it renders an honest page and
  redirects unauthenticated traffic where it should.

Local live curl was not run from this sandbox because Next dev compile
times are inconsistent here. The build manifest is authoritative for
"does this route compile and prerender" — which is what Phase 7 actually
needs at this stage. The PR #30 production smoke checklist is the
companion live check.

## Public routes (no auth required)

| Route | Render | Expected behaviour | Status |
| --- | --- | --- | --- |
| `/lt` | SSG | Homepage in Lithuanian | PASS |
| `/en` | SSG | Homepage in English | PASS |
| `/lt/auth/login` | SSG | Login form with Google + email | PASS |
| `/en/auth/login` | SSG | Login form | PASS |
| `/lt/auth/signup` | SSG | Signup form | PASS |
| `/en/auth/signup` | SSG | Signup form | PASS |
| `/lt/auth/forgot-password` | SSG | Reset-link request | PASS |
| `/en/auth/forgot-password` | SSG | Reset-link request | PASS |

## Authenticated routes (auth wall)

These routes resolve via the `dashboard` layout, which calls
`supabase.auth.getUser()` and redirects to `/{locale}/auth/login` when the
session is missing. The route source-level check confirms the redirect
path is correct.

| Route | Render | Expected | Status |
| --- | --- | --- | --- |
| `/lt/dashboard` | dynamic | First-use panel + journey rail + canonical surfaces | PASS |
| `/en/dashboard` | dynamic | same, EN copy | PASS |
| `/lt/dashboard/profile` | dynamic | `ProfileTextFirstFlow` first, manual picker second | PASS |
| `/en/dashboard/profile` | dynamic | same | PASS |
| `/lt/dashboard/journal` | dynamic | `JournalEntryComposer` (text-first) | PASS |
| `/en/dashboard/journal` | dynamic | same | PASS |
| `/lt/dashboard/account` | dynamic | Honest roles list + `RUOŠIAMA` tags + non-locking intro | PASS |
| `/en/dashboard/account` | dynamic | same | PASS |
| `/lt/dashboard/inbox` | dynamic | Confirmer inbox (only managers see the link) | PASS |
| `/lt/onboarding` | dynamic | Onboarding wizard (worker → other roles) | PASS |

## Routes that exist but are intentionally not in primary nav

These pages preserve honest "coming in M2 / M3" empty states, but they
are not surfaced from `BottomNav` / `DashboardTabs` (which both list only
the four real surfaces). They render only when navigated to directly.

| Route | Why kept | Status |
| --- | --- | --- |
| `/lt/dashboard/discover` | Honest empty state; route exists in case it's bookmarked. Replaced in nav by Profile (PR #25). | PASS (preparing) |
| `/lt/dashboard/search` | Honest empty state; route exists in case it's bookmarked. Replaced in nav by Journal (PR #25). | PASS (preparing) |

These do not satisfy a "first working beta" path — they should never be
the destination of a CTA. The guard at
`apps/web/lib/guards/product-readiness.test.ts` keeps the first-use panel
pointing only at profile / journal / account, which are the three CTAs
exposed by `DashboardFirstUsePanel`.

## Dev-only routes

| Route | Gated by | Notes |
| --- | --- | --- |
| `/lt/design` | `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS=true` | Component preview, dev only |
| `/lt/design/text-first` | `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS=true` | Mounts the text-first composers + mobile sheet with mock data for the capture script. Not linked from production nav. |

## Open issues / not in scope

- **Authenticated production mobile smoke** — owner-only; tracked at
  `docs/evidence/post-merge-production-smoke-pr30.md` and enforced as
  PENDING by a guard test.
- **PR #18 migration** — does not affect any route; tracked at issue #32.
