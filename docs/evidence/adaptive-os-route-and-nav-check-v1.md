# Adaptive OS route & nav check v1

> **Sprint:** `feat/cc/adaptive-human-centered-os-v1`  
> **Base commit:** `5d9ceeb` (PR #34)  
> **Status:** route-level PASS at source + build. Authenticated production
> mobile smoke remains **PENDING** (owner action — see
> `docs/evidence/post-merge-production-smoke-pr30.md`).

## Method

- `pnpm -F web build` builds all 10 locales; the route manifest is the
  authoritative source for "this route compiles + prerenders".
- Each route below was inspected at the source level on this branch to
  verify: heading is meaningful, every empty state has a next action,
  no surface implies an unavailable feature is active, no CTA loops back
  to the same page without explanation, and account roles do not invite
  broken switching.

Local live curl was not executed from this sandbox (Next dev compile is
flaky here). The build manifest + source review cover Phase 8's contract.

## Primary nav routes (worker context)

| Route | Heading | Empty-state next action | Honest? | Notes |
| --- | --- | --- | --- | --- |
| `/lt/dashboard` | greeting + role chip ("● Darbuotojas") | DashboardFirstUsePanel renders the 5-step path + 3 real CTAs (Continue profile / Add work-or-activity entry / Review roles) | PASS | First-use panel shows in `full` variant while the user has no profession OR no journal entries; switches to `compact` after. Worker-leaning canonical surfaces below remain — flagged in the audit for next sprint. |
| `/lt/dashboard/profile` | "Profesija ir įgūdžiai" | `ProfileTextFirstFlow` opens on "Papasakokite, ką mokate" + CV input panel; manual chip picker is the small secondary "Pridėti rankiniu būdu" link inside the flow | PASS | The applied-state trail explicitly says "Confirmed by you · Added to your profile · Needs external confirmation later" — never "verified". |
| `/lt/dashboard/journal` | "Mano dienoraštis" | `JournalEntryComposer` opens on "Ką šiandien dirbote?" with universal placeholder; new collapsed examples block shows 4 cross-domain examples | PASS | Review stage carries the "Tai pasiūlymai. Patvirtinkite tik tai, kas teisinga…" intro line. Saved-state success card persists on the form until next submit. |
| `/lt/dashboard/account` | "Mano paskyra" | Honest roles list + rolesIntro paragraph + `RUOŠIAMA` chip for every non-active role | PASS | The list now iterates over `LABOUR_MARKET_ROLES` via `ROLE_BY_ID`; any future role added to the catalogue automatically renders here with the right chip. |

## Routes outside primary nav (preparing / honest empty)

| Route | Why kept | Status |
| --- | --- | --- |
| `/lt/dashboard/discover` | Honest "expected in M3" empty state. Not in `VISIBLE_PRIMARY_NAV_ITEMS`. | PASS (preparing) |
| `/lt/dashboard/search` | Honest "expected in M2" empty state. Not in primary nav. | PASS (preparing) |
| `/lt/dashboard/inbox` | Manager / external-manager confirmer inbox; linked from account page only when the user has a manager engagement context. Honest empty state for non-managers. | PASS |

## Dev-only routes

| Route | Gate | Notes |
| --- | --- | --- |
| `/lt/design` | `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS=true` | Component preview |
| `/lt/design/text-first` | same | Mounts text-first composers + MobileSheet with mock data for the capture script. Not linked from any production surface. |

## CTA loop / dead-end audit

- The first-use panel's three CTAs each route to a different page
  (`/dashboard/profile`, `/dashboard/journal`, `/dashboard/account`).
- The legacy "Manage roles" CTA on the addMore card was renamed to
  "Review roles" / "Peržiūrėti vaidmenis" in PR #34; this sprint keeps
  that.
- The role switcher never navigates a user toward a 404 / blank state.
  Non-worker rows that the user has already added route to the existing
  pilot cockpit (with its own honest copy); rows the user has NOT added
  are tagged `RUOŠIAMA` and adding them flips into the same pilot cockpit
  — no false promises.

## Open issues

- **Authenticated production mobile smoke** — still PENDING; owner-only.
  See `docs/evidence/post-merge-production-smoke-pr30.md`. Guard test
  `apps/web/lib/guards/product-readiness.test.ts` enforces it.
- **PR #18 migration review** — does not affect any route; tracked at
  issue #32.
