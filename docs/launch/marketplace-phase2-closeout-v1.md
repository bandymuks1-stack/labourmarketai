# Marketplace Completion — Phase 2 Closeout v1

Goal: `labourmarketai-marketplace-phase2-goal.md` · Executed 2026-07-11
Base: `675deb14` (Phase 1 closeout) · Final main: `16f53a9f` · Production deploy: verified per merge (final deploy check in verification log)

## PR ledger (all CI-green; feature PRs squash-merged, draft packs held at the human gate)

| PR | Slice | State |
|---|---|---|
| #730 | **MP-3** — worker RPC recreation + SQL-side privacy projection helper (`demand_structured_v2_public`: closed enums / typed numbers / ISO dates / booleans only; every free-text key dropped; leak-test in header) | **DRAFT, human-gated, NOT applied** |
| #731 | Matching dimensions v2.1 — languages (CEFR + native, one-per-team demotion for team demands), licence categories, own vehicle, own tools, gross/net (negotiable), night/weekend shifts (hard when both stated), overtime (negotiable); feature-detected worker reads | MERGED |
| #732 | Worker board structured detail — card chips (pay+basis+currency, hours, engagement, deadlines), organized detail sections, worker-visible honesty gaps, mandatory talent-pool disclosure; exact #730 whitelist mirror; honest degradation until applied | MERGED |
| #733 | Booking UX compat — optional decline/withdraw reasons (v2 RPC with automatic v1 fallback + honest partial-result notice), proposed-only reschedule affordance, respond-by deadline display/set with 42703 retry, 44px mobile targets | MERGED |
| #734 | #720/#721 compatibility UI — worker languages section (add/remove, self-declared disclaimer, calm not-enabled state) + v2 preference fieldset (pay basis, night/weekend/overtime tri-states, licence chips, own vehicle/tools) with v2→v1 save fallback | MERGED |
| #735 | Saved bookmarks (#723-compat, honest invisibility when store absent), device-local recently-viewed (max 10, ids only, disclosure copy), client-side compare (2–3 cards, whitelisted facts, own-container scroll), mobile polish | MERGED |

Validation each slice: typecheck, eslint, full vitest (8,779 → **8,936** tests), build, placeholders, i18n-debt (baselines unchanged), parity guards. No gated migration applied; no duplicate profile/booking/demand/matching system; no guard weakened.

## Completion

- **Repo-safe Phase 2 scope: 100%** — every capability the goal lists that can exist without an owner-applied migration is implemented, tested, merged, deployed.
- **Total Phase 2 outcome: ~85%** — the remaining ~15% is exactly the owner-gated tail: five migration applies (which flip the already-shipped UI/matching from honest degradation to live) and one verification gate (authenticated 390px proof — Docker Desktop requires a one-time GUI start; scripted proof is committed and ready; real-credential authentication is out of policy for me).

## Remaining owner actions

1. **Apply the gated packs** (Supabase MCP `apply_migration` only, + APPLIED_LEDGER row + header verification each). **Recommended order:**
   1. **#730** MP-3 exposure — highest visible value: workers immediately see pay/time/conditions on demands captured since #719; UI (#732) is already live and waiting.
   2. **#720** `worker_languages` — languages form (#734) lights up; language matching gains worker-side facts.
   3. **#721** preference columns v2 — v2 preference fields (#734) light up; licences/vehicle/tools/basis/shifts matching gains worker-side facts.
   4. **#723** saved opportunities — save toggle + saved section (#735) appear.
   5. **#722** booking lifecycle v2 — reasons/reschedule/deadline (#733) switch from fallback to full behavior.
   6. #708 `work_tasks` / #714 `finance_records` (prior programme) at will.
2. **Authenticated mobile proof**: start Docker Desktop once → `npx supabase start && npx supabase db reset && pnpm db:fixtures:local` → run `node apps/web/scripts/marketplace-auth-proof.mjs` (local seeded users only).
3. **MP-6 / §19 decision** on the merged experience-record contract (unchanged from Phase 1).
4. Optional: rebase #708/#714; delete leftover `Documents/lmai-*` folders.

## Verification log

- 2026-07-11: main `675deb14` + all six gated PRs verified open/unapplied; production ledger re-read via Supabase MCP (last applied `20260711081250`).
- 2026-07-11: #731 → #735 merged sequentially, CI green each, production deploys completed per merge; final deploy of `16f53a9f` verified in closeout.
- Public production smoke (Phase 1, unchanged surfaces): 200s at 390/1440px, 0px horizontal overflow, auth fail-closed. Authenticated proof: BLOCKED_EXTERNAL_INPUT_REQUIRED (Docker GUI start), steps above.
