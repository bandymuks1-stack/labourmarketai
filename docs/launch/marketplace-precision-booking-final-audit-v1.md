# Marketplace Precision & Booking — Final Audit v1

Programme: `marketplace-precision-booking-execution-goal-v1` · Executed 2026-07-11
Base at start: `29e45fa3` (verified = expected closeout SHA) · Main at audit: `8027936b`

## 1. PR / commit ledger (all squash-merged to main, CI green each)

| # | PR | Slice | Main commit |
|---|---|---|---|
| 1 | #718 | Gap map + canonical contracts (docs) | `7f37cef9` |
| 2 | #719 | Structured demand capture v2 (`payload.structured_v2`, advanced wizard, honesty flags, preview-as-worker, duplicate-and-edit) | `f5b9a266` |
| 6a | #724 | Experience-record eligibility contract v1 (owner-gated, no UI) | `260b7ad8` |
| 3 | #725 | Worker structured preferences form (wires the applied-but-orphaned 8 columns + `save_worker_availability_prefs`) | `82c231be` |
| 5 | #726 | Booking clarity: derived `awaiting_response`/`no_response_stale` display states, mode-explicit propose, conversation-grant guard | `fe4a14c5` |
| 4 | #727 | Matching contract v2 (`calcVersion "2"`, hard/weighted/negotiable, sources, missingFacts, hard-block non-override) + discovery filters/sort/explanations/progressive disclosure | `032894a0` |
| 6b | #728 | Repeat actions: propose-again (rebook) + request-again | `8027936b` |

Draft human-gated migration PRs opened (OPEN, NOT applied, NOT merged): **#720** MP-1 `worker_languages` · **#721** MP-2 worker preference columns v2 · **#722** MP-4 booking lifecycle v2 · **#723** MP-5 `worker_saved_opportunities`. Pre-existing gates **#708** (`work_tasks`) / **#714** (`finance_records`) unchanged (inspected; contracts still match main consumers; both behind main — rebase left to owner, force-push was declined in-session).

## 2. Production deployment truth

- Vercel production deploy of main `8027936b` = **success** (commit status verified). All seven programme commits are LIVE on https://labourmarket.ai.
- Production DB (Supabase `gorgitwvdzxbnaxhrsrw`) migration ledger verified via MCP before and during the programme: last applied `20260711081250` (privacy-consent text v2). **No migration was applied by this programme.** `work_tasks`, `finance_records`, `worker_languages`, the v2 preference columns, booking lifecycle v2 and `worker_saved_opportunities` remain UNAPPLIED (their consumer surfaces degrade honestly).
- Backfill outcome: none required, none performed (all shipped capture is additive `payload.structured_v2`; old records verified readable by guard tests — absence renders as "not stated").

## 3. Capability status (goal-spec vocabulary)

| Capability | Status | Truth |
|---|---|---|
| A — structured opportunity/demand **capture** | **LIVE_IN_PRODUCTION** | Full `structured_v2` cluster capture (engagement/time/compensation with integer-cents + gross/net + itemized deductions/accommodation detail/transport split/requirements incl. CEFR languages/process incl. talent-pool disclosure) through the existing owner-scoped RPCs; publish-honesty flags; quick entry unchanged as minimum path |
| A — worker-side **exposure** of v2 fields | **CODE_READY_MIGRATION_UNAPPLIED** (partially) / **OWNER_DECISION_GATED** | The worker board still shows the applied RPC whitelist only; widening = MP-3 (to be drafted per owner's chosen field set after MP-1/MP-2 land — see §6 next PR) |
| B — mirrored worker preferences | **LIVE_IN_PRODUCTION** (v1 fields) + **CODE_READY_MIGRATION_UNAPPLIED** (v2 fields: gross/net pref, shifts, licences, own vehicle/tools via #721) + **NOT_IMPLEMENTED** (hard-exclusions store — deferred, no honest deterministic match use yet) | Structured preferences form live on the profile; tri-state honesty (null ≠ no) |
| B — worker languages | **CODE_READY_MIGRATION_UNAPPLIED** (#720) | No store existed at all; UI lands after apply |
| B — team/company capability | **LIVE_PARTIAL** (pre-existing org-spine + offerings; team-level stored claims not added — deliberate, derived-from-members display only) | |
| C — explainable deterministic matching | **LIVE_IN_PRODUCTION** | One engine (`match-v1.ts` + `match-criteria-v2.ts`), calcVersion 2, hard/weighted/negotiable classes, per-criterion sources, missingFacts, structural hard-block non-override (guard-tested); no %, no AI claims |
| D — marketplace discovery | **LIVE_IN_PRODUCTION** | Filter chips + active count + reset + filter-naming empty state + relevance/newest sort + tier explanations + per-card progressive disclosure (worker board); scouting shows same tiers |
| D — saved search + notification choices | **NOT_IMPLEMENTED** / **OWNER_DECISION_GATED** | No user notification channels exist platform-wide (spine is in-app counts by design) |
| E — quick/advanced entry, autosave, preview, duplicate-and-edit | **LIVE_IN_PRODUCTION** | Wizard quick path unchanged; advanced optional; draft autosave pre-existing (`save_demand_draft`); preview-as-worker honest about unexposed v2 |
| E — assisted import (paste/PDF/image) | **PROVIDER_GATED** | AI provider/audit store gated (pre-existing PR #379 unmerged); nothing shipped — no fake extraction |
| F — booking clarity, modes, derived response states | **LIVE_IN_PRODUCTION** | Display-only stale states (DB truth never faked), per-direction next-step copy, planning links, mode-explicit propose |
| F — response deadline, reasons, reschedule, real expiry | **CODE_READY_MIGRATION_UNAPPLIED** (#722) | UI upgrade lands after owner applies MP-4 |
| F — instant confirmation / payments / deposits | **OWNER_DECISION_GATED** / out of scope by spec | `no-live-payments` guard intact |
| G — reviews | **OWNER_DECISION_GATED** (contract **merged**: `lib/trust/experience-eligibility.ts`) | §19 "fit, ne reitingas" reconciliation encoded: no numeric person score ever, moderation-only publication, completed-interaction eligibility, guard pins zero UI consumers until owner decision (then MP-6 store draft) |
| G — repeat actions | **LIVE_IN_PRODUCTION** | Duplicate-and-edit (demand), propose-again (bookings), request-again (services); saved-opportunities store = **CODE_READY_MIGRATION_UNAPPLIED** (#723, UI after apply); recently-viewed deferred (see §7) |
| H — polish | **LIVE_IN_PRODUCTION** (for the new surfaces) | Real controls (aria-expanded/pressed), skeleton/empty/error states per repo guards, preserved-filter URLs, 0 px horizontal overflow verified at 390 px on public surfaces |
| H — authenticated mobile proof | **BLOCKED_EXTERNAL_INPUT_REQUIRED** | See §5 — exact operator actions prepared |

## 4. Routes / schema / RLS truth

- **No new routes** were added; no nav/module-registry changes were needed (all work extended existing classified surfaces: dashboard, profile, opportunities, company/scouting, bookings, service-requests, planning). Route-truth map unchanged and green.
- **No schema/RPC/RLS change is live** from this programme. New RLS/RPC contracts exist only inside the four draft packs (#720–#723), each: `needs-human-gate` + `@human-gate-approved`, SECURITY DEFINER with pinned `search_path`, RPC-only writes, closed vocabularies, paired `supabase/rollbacks/*.down.sql`, apply + APPLIED_LEDGER + post-apply verification instructions in the header, migration-safety classifier GREEN.
- Privacy: every new worker fact stays inside the existing `can_view_worker` fail-closed regime; saved-opportunities SELECT is worker-private by design; nothing exposes contacts/CV/location without the existing consent paths.

## 5. Browser-smoke evidence

**Public production (done, 2026-07-11, after final deploy):** Playwright headless, 390×844 + 1440×900, LT locale: landing `200`, `/lt/company-need` `200` (form renders fully), `/lt/work-opportunities` `200`, `/lt/dashboard` → fail-closed redirect to `/lt/auth/login` `200`. **Horizontal overflow: 0 px on every capture.** Screenshots (10) saved locally at `scratchpad/prod-proof/` (session artifacts). Note: `/lt/sign-in` is 404 — canonical auth route is `/lt/auth/login`.

**Authenticated 390 px journeys: BLOCKED_EXTERNAL_INPUT_REQUIRED.**
- I do not create accounts or authenticate with real credentials (hard policy), so the only sanctioned path is the repo's local seeded stack (`docs/TESTING.md`): synthetic users `dev.worker@local.test` / `dev.company@local.test`.
- That path requires Docker Desktop; the daemon would not start headlessly on this machine (process exits — first-run GUI interaction appears required). Retried twice.
- **Everything else is prepared:** `apps/web/scripts/marketplace-auth-proof.mjs` (committed in this PR) drives both full journeys — worker: login → dashboard → profile → structured preferences → journal → opportunities (filters + explanation + details) → bookings → communication → planning; company: login → dashboard → structured demand wizard incl. advanced compensation + honesty flags + preview-as-worker → scouting → bookings → planning → projects; plus desktop parity shots. It hard-refuses any non-local target.

**Exact operator actions to close this gate (~15 min once Docker is up):**
1. Open Docker Desktop once (accept any first-run dialogs).
2. `npx supabase start` && `npx supabase db reset` && `pnpm db:fixtures:local` (repo root).
3. `pnpm -C apps/web e2e:install` (first time only), then start the app per `e2e-local` env and run `node apps/web/scripts/marketplace-auth-proof.mjs` — screenshots land in `runtime/marketplace-proof/`.
   (Alternative: provide a production smoke account and I run the same script pointed at a production-safe target — requires an explicit owner decision.)

## 6. Owner actions (complete list)

1. **Apply decision** per gated pack, via Supabase MCP `apply_migration` only (+ APPLIED_LEDGER row + post-apply verification): #708 `work_tasks`, #714 `finance_records`, #720 `worker_languages`, #721 preference columns v2, #722 booking lifecycle v2, #723 saved opportunities. Recommended order: #720 → #721 → #723 → #722 (then #708/#714 from the previous programme at will).
2. **MP-3 decision** — which `structured_v2` clusters the worker board may expose (compensation summary + time + requirement chips recommended); I then draft the `list_open_demand_for_workers` v3 RED pack.
3. **MP-6 / §19 decision** — approve or amend the merged experience-record contract (`docs/launch/marketplace-precision-booking-canonical-contract-v1.md` §5 + `lib/trust/experience-eligibility.ts`); only then is the store SQL drafted.
4. **Authenticated-proof gate** — §5 above.
5. Optional: rebase #708/#714 onto current main (I was not permitted to force-push their branches).

## 7. Explicitly NOT implemented (honest list)

- Worker-facing exposure of structured_v2 demand fields (needs MP-3 after owner field-set decision).
- Consumer UI for the four unapplied packs (languages form, v2 preference fields, deadline/reason/reschedule booking UI, save/compare board affordance) — deliberately not shipped ahead of their migrations beyond honest degradation.
- Hard-exclusions store; stored team-level capability claims; company insurance/licence/portfolio/structured-pricing stores; saved searches + notification preferences; recently-viewed persistence; assisted AI import; instant confirmation; any review/rating UI; any payment work. Each is gated or consciously deferred — none is mocked or faked.
- No scheduler was installed anywhere (expiry sweep in #722 is an enabling admin function only).

## 8. Next recommended PR

**MP-3 draft pack** (`list_open_demand_for_workers` v3) immediately after the owner picks the exposure field set — it unlocks the largest visible product gain (workers see compensation/time/requirement truth), and the capture side is already live and populated from PR 2 onward.
