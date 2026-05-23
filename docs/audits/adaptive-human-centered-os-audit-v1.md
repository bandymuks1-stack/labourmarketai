# Adaptive Human-Centered OS Audit v1

> **Type:** rigidity / lock-in audit.  
> **Base:** `main` @ `5d9ceeb` (PR #34 merged).  
> **Branch:** `feat/cc/adaptive-human-centered-os-v1`.  
> **Method:** source review + new central-config inventory + guard tests.
> Authenticated production smoke remains **PENDING**.

The 10 audit questions from the sprint brief, scored
`PASS / PARTIAL / FAIL / NOT TESTED`. Failures are not hidden.

| # | Question | Score | Evidence / note |
| --- | --- | --- | --- |
| 1 | Where does the product still imply the user is only one role? | PASS | The role switcher + the account roles list + the onboarding wizard all expose multi-role wording. With this sprint, the strengthened LT/EN `account.rolesIntro` ("Pradinis pasirinkimas nėra apribojimas…" / "Your first choice is not a limit…") sits both on the account page AND inside the RoleSwitcher dropdown. The first-use panel now opens on "Start from yourself" / "Pradėkite nuo savęs". |
| 2 | Where does the product still look too worker-only? | PARTIAL | The dashboard cockpit still has worker-leaning copy in `auth.dashboard.wow.flow.worker.*` and `auth.dashboard.wow.canonical.*`. The first-use panel above it is universal now, but the next-move + canonical surfaces below remain worker-framed. Non-worker dashboards still route to the pilot cockpit. Not a "fake claim" — those surfaces are honestly preparing — but the wording could be made more neutral in a follow-up. |
| 3 | Where does it still look too construction-specific? | PASS | Profile + journal placeholders are universal (customer support / bike repair / led a team / built websites / 12 customer requests). The journal composer now exposes 4 cross-domain examples (customer support, client proposal, furniture assembly, team leadership) via a collapsed `<details>` block. The skill / profession taxonomy under `messages/{locale}/skill-names.json` remains construction-leaning — that is data, not marketing copy, and adding new verticals is a config-only change. |
| 4 | Where are role / status labels hardcoded or duplicated? | PASS | This sprint centralises them: `apps/web/lib/config/roles.ts` is the single source for role ids, labels, availability and routes. `RoleSwitcher` + `account/page.tsx` now read `ROLE_BY_ID` instead of hardcoded `ALL_ROLES`. Status labels for suggestions are centralised in `lib/config/suggestion-statuses.ts` with matching i18n keys under `suggestionStatuses.*` in LT + EN. |
| 5 | Where are CTAs not configurable? | PARTIAL | Dashboard CTAs read from i18n already (`auth.dashboard.firstUse.*`, `auth.dashboard.wow.*`). They are not yet driven by a single feature-availability lookup; this sprint adds `lib/config/feature-availability.ts` as the foundation, but no CTA reads from it yet. Next sprint can wire gated CTAs (e.g. service offer, learning goal) through this config without redesigning the surfaces. |
| 6 | Where are empty states not universal? | PASS | The two intentionally-empty routes (`/dashboard/discover` + `/dashboard/search`) live outside primary nav and render honest "expected in M2 / M3" copy. The new first-use panel acts as the universal empty state for a fresh worker. The journal "no clear suggestions" fallback also points at universal next actions (Back to text / Add manually). |
| 7 | Where could future role expansion break current UI? | PASS | RoleSwitcher + account page now iterate over `LABOUR_MARKET_ROLES` and tag any non-`active` row with the `RUOŠIAMA` chip automatically. Future roles (`freelancer`, `team_lead`, `service_provider`) ride along as `availability: "hidden"` until their flows ship; flipping a row to `"preparing"` is a one-file change. |
| 8 | Which routes must remain stable for first beta? | PASS | `lib/config/navigation.ts` declares the four canonical routes (`/dashboard`, `/dashboard/profile`, `/dashboard/journal`, `/dashboard/account`). `VISIBLE_PRIMARY_NAV_ITEMS` filters by availability. Adding / hiding a tab is a one-line change. |
| 9 | Which routes / features should stay preparing? | PASS | Captured in `lib/config/feature-availability.ts`. `worker.suggestions.external_confirm`, `company.role_management`, `agency.pool`, `customer.bookings` are all openly preparing. `matching.engine`, `score.universal`, `ai.extraction`, `ai.verification` are flagged `hidden` — the catalogue ITSELF documents that they are out of scope, so any future PR that tries to ship them has an obvious place to flip them on (and the guard test catches it). |
| 10 | What is the minimum safe next architecture for flexible roles + activities? | PASS — sketched in `docs/product/adaptive-human-centered-os-v1.md`. Three concrete next steps: (a) flip live role rows to read `cfg.availability` everywhere they decide on a chip; (b) start wiring CTAs to `isFeatureActive()` from feature-availability; (c) when DB review for PR #18 lands, layer the suggestion-confirmations table under `lib/config/suggestion-statuses.ts` so `externally_confirmed` flips to active end-to-end. |

## Companion files

- `docs/evidence/adaptive-os-route-and-nav-check-v1.md` — route-level
  status table for `/dashboard/*` after this sprint.
- `docs/product/adaptive-human-centered-os-v1.md` — the doctrine that
  this audit scores against.
- `apps/web/lib/config/` — the central config files added this sprint.
- `apps/web/lib/guards/product-readiness.test.ts` — guards enforcing the
  catalogue invariants (only `worker` active, only `work_done` +
  `skill_claim` activity types active, `matching` / `score` / `ai` rows
  hidden, no new Supabase migrations added this sprint).
