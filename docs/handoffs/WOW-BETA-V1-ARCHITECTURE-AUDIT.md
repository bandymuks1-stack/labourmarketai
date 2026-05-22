# WOW Public Beta v1 — Architecture Audit

> **Mode:** Read-only audit (no app rebuild). Baseline: `main` @ `98efc98`.
> **Companion:** `docs/PRODUCT_CONSTITUTION.md`. **Source task:** `TASK-WOW-PUBLIC-BETA-START-V1` (handoff).
> This sprint delivered docs + tiny copy fixes only; full WOW screens are a later, explicitly-started sprint.

## Headline

The product is **already architecturally non-locking and honest**. The first
role choice is a *current workspace*, not a permanent category; users can pick
multiple roles and add more later; non-worker roles get honest "coming soon"
(no fake). The real gaps are **first-impression polish and copy framing**, not
architecture or fake-data violations.

## Answers to the 8 audit questions

| # | Question | Finding |
|---|---|---|
| 1 | one user = one permanent role? | **No.** `OnboardingWizard` is multi-select (`Set<Role>`); `profile_roles` stores all roles; `active_role` is the *switchable* current workspace. |
| 2 | worker/company choice is final? | **No.** RoleSwitcher header dropdown offers "Add role" (`add_role` RPC); `account/page.tsx` shows the role catalogue. Users grow post-onboarding. |
| 3 | company context forced before personal identity? | **No.** Onboarding asks for roles + name + country only; no org is required first. A worker starts with a personal engagement (`engagement_contexts`, §5.5) — company-optional. |
| 4 | dashboard depends on locked role assumptions? | **No.** `dashboard/page.tsx` branches on `active_role` and adapts; non-worker → honest "coming soon" panel; worker → overview. Switching role re-renders. |
| 5 | UI implies fake matching/AI/verified/readiness? | **No fake found.** M1 dashboard sections are honest empty stubs; placeholder system (`<Placeholder>` + registry, `docs/PLACEHOLDERS.md`) governs any sample data; `placeholders:check` enforces it. |
| 6 | mobile first impression broken? | **Mostly OK.** Bell/notification dropdown is viewport-guarded (fixed PR #6). Header is responsive (`DashboardTabs` hidden on mobile, `BottomNav` for mobile). See risks below. |
| 7 | navigation dead-ends / weak areas? | **Partial risk.** Worker **Overview** is 3 empty stub sections (Offer/Seek/Proofs) — honest but thin/unfinished-feeling. Substance lives in Journal + Profile. |
| 8 | user understands what to do next in 30s? | **Partial risk.** After onboarding the worker lands on an empty overview; the strong surfaces (Journal, Profile/CV) aren't the first thing surfaced. A clearer "next step" is a WOW target. |

## Known mobile/UI issues — status

1. **Bell / notification overflow** — ✅ fixed (PR #6); `notification-panel.tsx` has `max-w-[calc(100vw-1rem)]` + `right-2` + `overflow-y-auto`. No change needed; verify it stays fixed.
2. **Employee / Owner / Owner duplicate label** — ✅ fixed (PR #16, on `main`): `journal/page.tsx` + `profile/page.tsx` add `organization_type` → "Company/Agency Owner" disambiguation. Verify it stays fixed.
3. **Skill aggregation / universal journal UI mobile criteria** — ❌ not fixed; **deferred to PR #11** (single-context vs cross-context aggregation; needs DB/query + UI work). Not implemented here (would require DB/query). Acceptance criteria already in `docs/handoffs/TASK-PR11-UNIVERSAL-JOURNAL-UI.md`. Not a WOW blocker unless visibly damaging.

## Architecture risks for the WOW sprint (no code changed here)

- **R1 — Thin worker Overview.** 3 empty stub sections read as "unfinished." *WOW fix:* one strong, coherent overview that points to the real next step (log work / build CV).
- **R2 — Onboarding → empty dashboard handoff.** Strong surfaces (Journal, Profile/CV) aren't surfaced first. *WOW fix:* post-onboarding "what to do next" guidance.
- **R3 — Copy framing (partially addressed this sprint).** Onboarding heading/note reframed to non-locking in EN+LT (below); the other 8 locales still carry the older (non-locking but weaker) wording — **follow-up: translate the strengthened note to lv/et/nl/de/da/no/sv/pl.**
- **R4 — Non-worker roles are honest but empty.** Company/agency/customer = "coming soon." *WOW fix (later):* the company/team/agency activity-start screen from the task.
- **R5 — Landing↔app visual continuity** to verify in the WOW sprint (not audited deeply here).

## Changes made in THIS sprint (docs + tiny copy only)

- `docs/PRODUCT_CONSTITUTION.md` — new (locks §1–§8 incl. non-locking role/intention).
- `docs/handoffs/WOW-BETA-V1-ARCHITECTURE-AUDIT.md` — this file.
- `apps/web/messages/en.json` + `lt.json` — onboarding role-picker `heading` → "What do you want to start with today?" and `multiNote` → explicit "this is only your starting point… add more later." (i18n copy only; keys unchanged in all 10 locales; no logic/layout/DB change.)

## Explicitly NOT done (gated to the full WOW implementation sprint)

Landing rebuild, start-direction screen, personal work-identity screen, company/
team/agency activity screen, opportunities/pilot surface, dashboard overview
redesign. No DB/migrations/RLS/RPC, no PR #18 changes, no billing/deploy/env.
