# First Working Beta Flow Audit v1

> **Type:** flow audit, not a feature spec.  
> **Base:** `main` @ `efe3df3` (PR #33 merged).  
> **Branch:** `feat/cc/first-working-beta-variant-v1`.  
> **Method:** source review + build / test / lint validation + targeted
> Playwright mobile preview captures. Authenticated production smoke is
> **still PENDING** — see `docs/evidence/post-merge-production-smoke-pr30.md`.

The 15 audit questions from the sprint brief, scored as
`PASS / PARTIAL / FAIL / NOT TESTED`. Failures are not hidden.

| # | Question | Score | Evidence |
| --- | --- | --- | --- |
| 1 | Can a new user reach the dashboard? | PASS | `apps/web/middleware.ts` + `apps/web/app/[locale]/auth/*` cover signup / login. The `/dashboard` layout redirects to `/auth/login?next=…` when there's no session. Onboarding gate at `dashboard/layout.tsx:41` redirects to `/onboarding` until `profiles.onboarded_at` is set. Validated source-level; live auth flow against the prod Supabase remains owner-only. |
| 2 | Can the user understand the first role/intention choice? | PASS | `OnboardingWizard` is multi-select with the explicit `multiNote` ("you can pick one or several — this is only your starting point"). LT and EN copy match (`auth.onboarding.rolePicker.*`). |
| 3 | Is the user clearly told they are not locked into one role? | PASS | Three explicit places: `auth.onboarding.rolePicker.multiNote`, `auth.dashboard.wow.startingPoint` on every dashboard, and the new `auth.dashboard.account.rolesIntro` ("Šiandien galite pradėti kaip darbuotojas, bet tai neužrakina jūsų viename vaidmenyje…"). The `RoleSwitcher` now mirrors the same intro at the top of its dropdown. |
| 4 | Can a worker-like user start with profile text/CV? | PASS | `/dashboard/profile` opens on `ProfileTextFirstFlow`, whose first visible block is "Papasakokite, ką mokate" + CV upload / paste panel. Universal placeholder (customer support, bike repair, websites, furniture, documents — bench-tested by the guard test). |
| 5 | Can suggestions be produced from text? | PASS | `lib/structuring/extract-profile-suggestions.ts` + `extract-journal-suggestions.ts`. Honestly labelled rule-based (parser eyebrow + ruleBasedNotice line). 4 unit tests in `lib/structuring/*.test.ts` cover the LT dictionary. |
| 6 | Can confirmed suggestions be added to profile state? | PASS | `applyConfirmed()` in `ProfileTextFirstFlow` posts confirmed slugs to `/api/workers/:id/skills` using the same endpoint the manual picker uses. After save, the panel renders a *Confirmed by you · Added to your profile · Needs external confirmation later* trail. |
| 7 | Can a Work Journal entry be written naturally? | PASS | `JournalEntryComposer` first labelled field is "Ką šiandien dirbote?" with universal placeholder (customer support / 12 requests / daily report). Time units (`minutes`, `hours`, `days`) are exposed; `hours` is the primary universal unit. |
| 8 | Can journal suggestions be reviewed? | PASS | Review stage renders `Sistema rado` cards for time / quantity / direction / site / strengthens-skills, each with `Patvirtinti` / `Pataisyti` / `Neįtraukti`. The new `suggestionReviewIntro` line ("These are suggestions. Confirm only what is correct. Unconfirmed suggestions are not saved as facts.") sits above the cards. |
| 9 | Can journal entry be saved without confusing required fields? | PASS | Only the free-text + engagement-context are required by `createJournalEntry`. Worker can confirm zero suggestions and still save the entry — the structured fields only get persisted if explicitly confirmed. After save, a visible success card stays on the form until next submit. |
| 10 | Does mobile bottom nav block anything? | PASS | Layout uses `pb-[calc(5rem+env(safe-area-inset-bottom))]` (kept by a guard test). Evidence captures in `docs/evidence/text-first-mobile/11-design-preview-bottom-nav.png` show CTA + bottom nav coexisting. Live authenticated smoke remains PENDING. |
| 11 | Are inactive roles clearly marked preparing? | PASS | Account page tags non-worker rows with `RUOŠIAMA` and shows the rolesIntro paragraph; `RoleSwitcher` repeats `RUOŠIAMA` chips on every non-worker row and prints the rolesIntro inside its menu. |
| 12 | Is there any dead-end CTA? | PASS | Sweep done: `Discover` / `Search` were removed from primary nav by PR #25; the routes still exist but render honest empty states and are never targeted by a CTA. The `addMore` card now says "Review roles" / "Peržiūrėti vaidmenis" instead of the misleading "Manage roles" (the destination is the honest account page, not a management surface). |
| 13 | Is there any old project naming? | PASS | Guard test `legacy project naming` in `apps/web/lib/guards/product-readiness.test.ts` blocks `LABMA`, `LABMA OS`, `tiler.ai`, `workforceos`, `tradeapp`, `tradeos`, `tradeai` across `apps/web/{messages,components,app}`. Internal `docs/` may still use historical names — those are not user-facing and are excluded by design. |
| 14 | Is there any fake AI / verification / matching claim? | PASS | Guard test `honest copy claims` blocks `AI verified`, `AI patvirtinta`, `auto verified`, `automatic approval`, `automatinis patvirtinimas`, `guaranteed match`, `garantuotas atitikimas`, `AI matching`, `AI score`, `AI-powered extraction` across every locale JSON. The parser is consistently labelled rule-based in copy and code comments. |
| 15 | What is the shortest honest path to a first usable beta? | PASS — defined in the new docs/product/first-working-beta-variant-v1.md, summarized below. |

## Shortest honest path (Question 15 expansion)

1. Owner verifies `SUPABASE_SERVICE_ROLE_KEY` in production (the only P0 item
   the audit family has flagged since 2026-05-22; still owner-action).
2. Owner runs the PR #30 mobile smoke against the production deploy of
   `db73ef1` / now `efe3df3` and flips the status block in
   `docs/evidence/post-merge-production-smoke-pr30.md` if it passes.
3. Founder personally onboards 3 – 5 hand-picked workers + 1 – 2 small
   companies through:
   - signup → onboarding (worker role today; other roles optional but tagged
     RUOŠIAMA);
   - text-first profile composer → confirm suggestions → review CV trail;
   - Work Journal text-first composer → confirm suggestions → see entry
     land in the work history list.
4. Collect anonymised feedback (in-product, via founder Slack / email).
5. Decide whether to schedule the PR #18 migration review sprint (issue #32)
   based on whether the closed-beta cohort actually needs the journal
   visibility / audit / RPCs PR #18 ships.

## Failures hidden? No

- The production mobile smoke is reported as **PENDING**, not as passing.
  The guard test enforces it.
- PR #18 migration is reported as **BLOCKED_MIGRATION**, not as work that's
  about to land. Issue #32 tracks the path forward.
- The dev-gated `/design/text-first` preview is openly labelled as
  dev-only; the captures from it are clearly marked as preview / mock
  data, not authenticated screens.
- Construction-leaning examples were removed from the primary placeholders
  but the construction vertical still has its own skill / profession
  taxonomy under `messages/{locale}/skill-names.json` — that's data, not
  marketing copy.

## Companion documents

- `docs/audits/PUBLIC-BETA-READINESS-AUDIT-V1.md` (PR #24, closed) — earlier
  closed beta audit; superseded by PR #25 → #31 + this audit.
- `docs/evidence/post-merge-production-smoke-pr30.md` — owner checklist
  for the still-PENDING mobile smoke.
- `docs/evidence/first-working-beta-route-smoke-v1.md` (this sprint) —
  route-level smoke based on the build manifest.
- `docs/product/confirmed-suggestions-foundation.md` (PR #31) — the
  pipeline model the text-first work follows.
- `docs/product/first-working-beta-variant-v1.md` (this sprint) — what the
  first working beta is and is not.
