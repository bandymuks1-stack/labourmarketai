# LAUNCH-CRITICAL COMPLETION TRACKER

The canonical state ledger of the launch-completion train.
Target: `LABOURMARKET_AI_LAUNCH_CRITICAL_PRODUCT_QUALITY_COMPLETE_READY_FOR_CONTROLLED_PILOT`

Last updated: 2026-08-05 (train session 1)
Current production main: `5be4baf6f157f08ba9ff21a227d112197a0d0986` (post-#1012)

## Verdict (current)

`IN_PROGRESS — #1009 CI FULLY GREEN on eb615ea4, owner merge package posted; Tracks 2–7 auditing`

## PR / branch dependencies

| Item | State |
|---|---|
| PR #1009 (§7.1 engagement end) | **MERGED 2026-08-05 06:46 UTC by explicit owner approval** on exact HEAD `eb615ea4` (expected-head protected squash). Merge SHA / new main: `de38b3dbd842102161a9a186f090d0231344c88c`. No migration reapplied (file byte-identical to ledger hash `4e19703c…`). **DEPLOYED TO PRODUCTION**: Vercel deployment `5757082717`, env Production, deployment SHA = merge SHA (verified), state success; landing page smoke OK 2026-08-05. Stage 7 is now MERGED+DEPLOYED; production write proof still pending QA accounts. |
| `launch/launch-critical-completion-train` | This tracker + owner packages (docs). |
| **Draft PR #1014** (`feat/stripe-test-mode-launch-fixes-v1`) | Track 8 code-complete 2026-08-05: both HIGH defects closed (retry-safe webhooks; re-subscribe collision), `invoice.paid`, compile-time API-version pin w/ dual-shape parsers, ledger reconciliation row for `billing_test_mode_records`. Zero migrations; live blocking intact. Full validation green (1 known tree-scan flake, passes alone). |
| **Draft PR #1013** (`fix/worker-display-name-canonical-write-path-v2`) | §18 package — owner-gated migrations NOT applied; Decisions 1/2/2b in the human-gate doc. CI fixes pushed `55fa4ff0`: explicit anon revoke (real secdef guard finding), baseline bumps 179→181 w/ rationale. migration-safety RED = designed state. |
| **Draft PR #1015** (`feat/w14-pilot-analytics-slice-v1`) | W14 slice shipped: 11 mid-funnel events (server-side), usage_cost_events writer (inert until AI enabled), admin AI-cost view on existing telemetry page. `engagement_ended` honestly skipped (base predates #1009) — follow-up on current main. |
| **Draft PR #1017** (`feat/org-demand-scope-app-gates-v1`, Stage A) | Shipped 2026-08-05: all 9 employer G5 paths gated fail-closed through the canonical resolver; G6 divergent org resolver DELETED (disclosure org id now from active workspace); 3 deliberate non-gates documented+pinned (buyer save, privacy actions, worker salary); new guard `org-demand-scope-gates.test.ts`. Full vitest 13,609/13,609, build green. Zero migrations. Residuals noted in PR (reports-hub leg, acknowledgeInterest, executor error code). |
| **Draft PR #1016** (`feat/org-demand-spine-schema-v1`, Stage B) | `ORGANIZATION_DEMAND_SPINE_CODE_COMPLETE_PENDING_HUMAN_GATE` (schema side). One migration `20260805100000_org_demand_row_scope_v1`: org columns+backfill (verified 100% coverage: 17/17+1/1+0), additive read RLS (co-managers gain reads = G7 closed for reads), server-side stamping (zero-arg SECDEF resolver, no client org id anywhere, shortlist BEFORE-trigger), paired rollback, 17-test guard. Full vitest 13,591/13,591. RED by design; owner package `docs/human-gates/org-demand-row-scope-gate.md`. NOT applied. |
| Track 4+5 journey (in progress) | Disposable-stack W7–W12 integrated + W6 full-cycle proof running on exact main `de38b3db` (local supabase + synthetic cast; evidence to scratchpad). |
| Display-name slice (`fix/worker-display-name-canonical-write-path`) | §18 re-evaluated 2026-08-05 (read-only): defect UNFIXED on main `de38b3db` — `complete_onboarding` (0008) still `on conflict do nothing`, `workers.display_name` NULL for every account, NO app writer exists; 6 UUID-leak sites incl. 2 NEW since the parked base (`project-workspace.ts:339`, `engagements-result.ts`). Parked SQL is sound but timestamps (`202608041500xx`) now sort behind applied `20260804160000` → **RECREATE from fresh main** with new timestamps + 3 missing artifacts (human-gate doc, guard test, backfill rollback). Both migrations stay RED/owner-gated; backfill separately approvable. **DONE 2026-08-05: Draft PR #1013** (`fix/worker-display-name-canonical-write-path-v2` from `de38b3db`) — repair + backfill migrations (RED, owner-gated, NOT applied), paired rollbacks, 5-assertion guard pin (pass), human-gate doc with Decisions 1/2/2b, audit addendum. Typecheck+lint green. Verdict: `WORKER_DISPLAY_NAME_CANONICAL_PATH_CODE_COMPLETE_PENDING_HUMAN_GATE`. |

## Pilot-chain launch matrix

Classifications: `PROVEN_PRODUCTION` / `SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING` /
`CODE_COMPLETE_PENDING_MERGE` / `LOCAL_PROOF_ONLY` / `MISSING` / `BLOCKED_BY_OWNER_GATE`

| # | Stage | Classification | Notes / proof |
|---|---|---|---|
| 1 | Worker registration & profile | PROVEN_PRODUCTION | 27 profiles / 20 onboarded / 33 worker_skills through the real path; Player Card renders from real rows. Deferred panels (external profiles, profession templates, opportunity-seen) render `needs_migration` honestly. |
| 2 | Company registration & org context | PROVEN_PRODUCTION (multi-org durable pointer BLOCKED_BY_OWNER_GATE) | 6 companies → 9 mirrored orgs; W9 RLS hardening applied 2026-08-02. `profiles.active_organization_id` needs unapplied `20260714210000` → workspace choice is cookie-only, no cross-device persistence. |
| 3 | Org-scoped demand creation | MISSING (creation itself PROVEN_PRODUCTION, 17 rows) | Surface gate real (`requireEmployerCompany`, fail-closed, guard-pinned); **row scope MISSING**: `customer_requests`/`demand_shortlist`/`booking_requests` have NO org column, zero org-aware RLS (G1–G9 in [ORGANIZATION_DEMAND_SPINE_PACKAGE.md](ORGANIZATION_DEMAND_SPINE_PACKAGE.md)). Non-exploitable today only because `companies.profile_id` is (conditionally) unique. No client-supplied authority anywhere (verified safe). |
| 4 | Matching & shortlist | PROVEN_PRODUCTION (thin) | Fit engine pure/read-time, never persisted; `demand_shortlist` 1 row, `demand_interest_signals` 4 rows. Legacy `matches`/`match_actions` deliberately neutralized (guard-pinned) — not a gap. |
| 5 | Booking proposal & acceptance | SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING | v3 RPC chain + full UI shipped and applied; **0 rows in prod — never exercised**. |
| 6 | Calendar & double-booking (W12) | SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING (race proof LOCAL_PROOF_ONLY) | 3-layer protection (row lock → advisory lock → EXCLUDE gist) APPLIED 2026-08-03; concurrency proof local-only; 9 calendar sources still absent (owner-gated additive slices). |
| 7 | Company-worker engagement | SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING (was CODE_COMPLETE_PENDING_MERGE) | #1009 MERGED+DEPLOYED 2026-08-05 (main `de38b3db`): v2 RPC applied AND callers now live on main/prod. Browser proof both sides exists LOCAL; production write proof awaits QA accounts. |
| 8 | Project lifecycle (W11) | SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING | `set_project_status_v1` applied 2026-08-04, wired to real UI; prod = 5 projects all draft + 1 SELF-assignment (cannot separate assignee from owner); operations page reachable only by deep link (F7). |
| 9 | Experience cycle (W6) | SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING | `experience_records` applied 2026-08-04; full RPC+component set; canonical `?result=experiences` (no route — correct); 0 submissions; only groundable interaction class in prod today is `engagement_contexts` (39 rows). |
| 10 | Analytics & cost truth (W14) | BLOCKED_BY_OWNER_GATE (usage-cost consumer MISSING) | `pilot_events` PROVEN (224 rows) but mid-funnel unmeasured; `usage_cost_events` applied with NO reader/writer; `ai_runs` applied, 0 rows (AI_PROVIDER_MODE=disabled + 90-day-retention precondition); all commercial flags hard-false (guard-pinned). Zero-migration slice implementing on `feat/w14-pilot-analytics-slice-v1`. |

**Root blocker shared by steps 5–9:** no production QA identity → no authenticated
prod write proof anywhere. One owner decision (QA accounts package) unblocks five stages.

**Production ahead of main in two places:** `20260804160000_booking_engagement_end_v2`
(applied; file only in #1009) and 24 applied-but-unrecorded migrations (ledger DRIFT
NOTICE 2026-08-01). The failing `Supabase Preview` CI job is this drift, not a transient.

**Genuinely deferred / owner-gated migrations (the real list, 10):**
`company_locations_v1`, `agency_clients_v1`, `multi_source_talent_v1`,
`worker_opportunity_seen_v1`, `journal_profession_templates_v1`,
`company_memberships_v1` (**blocks durable multi-org**), `dashboard_preferences_v1`,
`demand_interest_seen_v1`, `agency_real_client_bridge_v1`,
`open_markets_countries_draft_v1` (**absent from Deferred section — GE/BE/FR/ES/AT/CH
company registration cannot work; matrix finding F2**).
Formerly-ambiguous applies RESOLVED by read-only prod `schema_migrations` check
2026-08-05 — all three ARE applied, ledger rows missing (add to reconciliation):
`company_worker_engagements_v1` (prod version `20260723182516`),
`secdef_public_grant_hygiene_v1` (`20260727125759`),
`journal_entry_skill_provenance_v1` (`20260727183554`).

## Migration gates

- `20260804160000_booking_engagement_end_v2` — APPLIED to prod 2026-08-04
  19:09:40 UTC (ledger entry via #1010). Executable sha256 `302341790e…`,
  marked-file `4e19703c…`, rollback `11454154…`. DO NOT REAPPLY.
- Other deferred/owner-gated migrations: inventory pending (Track 2 audit).

## Owner gates outstanding

1. **Merge decision for PR #1009** — after CI green on `eb615ea4`.
2. **Production QA accounts** — package at
   [PRODUCTION_QA_ACCOUNT_PACKAGE.md](PRODUCTION_QA_ACCOUNT_PACKAGE.md).
3. **Stripe Live** — NOT AUTHORIZED; Test-Mode work first (Tracks 7/8).
4. Any new owner-gated migration surfaced by Track 3 (org demand scope).

## Next actions

1. CI green on #1009 → present smallest owner merge package.
2. Fill the matrix from Track 2/3/6/7 audit results.
3. Track 3: implement org-demand scope only if the audit shows gaps.
4. Track 4/5: disposable-stack integrated journey + W6 full cycle proof.
5. Stripe preflight doc → `docs/billing/STRIPE_LAUNCH_PREFLIGHT.md`.

## Confirmations (standing)

- No unauthorized migration applied. No merge performed. No Stripe Live.
- No real charge. No real user or company contacted. No production QA
  account created. No paid infrastructure activated.
