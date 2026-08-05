# LAUNCH-CRITICAL COMPLETION TRACKER

The canonical state ledger of the launch-completion train.
Target: `LABOURMARKET_AI_LAUNCH_CRITICAL_PRODUCT_QUALITY_COMPLETE_READY_FOR_CONTROLLED_PILOT`

Binding product doctrine: people and companies are free — one person may work
for several companies, one company has many workers, active organization is
SELECTED never inferred. Full rules, cardinalities, prohibited assumptions and
required tests:
[MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md](../architecture/MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md).
Every future slice must pass its §12 test requirements.

Last updated: 2026-08-05 (train session 2 — multi-organization continuation)
Current production main: `52c34584bb284aa85ae50e0fe32a90fdbaba2ace` (post-#1014)

## Verdict (current, 2026-08-05 train session 2)

`LABOURMARKET_AI_SAFE_TECHNICAL_WORK_COMPLETE_OWNER_GATES_PENDING`

Session 2 delivered the conditional no-migration merge train under the
multi-organization doctrine audit:
- **#1017 MERGED** `91b48a96` (Stage A app gates) — merged as a strict
  improvement; the surviving upstream first-created-org inference is G10, NOT
  fixed by this PR.
- **#1015 MERGED** `18132663` (W14 analytics) — updated on-branch first:
  `engagement_ended` now emitted from the shared end path (#1009 landed).
- **#1014 MERGED** `52c34584` (Stripe Test fixes) — a P0 found by the audit
  was FIXED before merge: the 23505 fallback would have silently overwritten
  a LIVE subscription row when one person buys the same plan for two
  organizations; it now refuses (`conflict-live-subscription`) unless the
  held row is dead (cancelled/expired) or a `manual_` override.
- **#1013 updated** `f0968cb4` (owner-gated, NOT applied) — backfill re-apply
  made edit-preserving; ratchet collision with #1016 documented (combined
  value 182).
- **#1016 REWORKED** `3906c76d` (owner-gated, NOT applied) — resolver is now
  membership-derived and fail-closed (the legacy `companies.profile_id`
  bridge answered WRONGLY for team-org owners); `customer_requests` PATCH
  forgery closed with a stamping trigger; gate doc corrected (the "existing
  queries unaffected" claim was false — `canonical-demand.ts` widens at
  apply time) and now answers the fourteen §9 owner questions. Honest
  classification:
  `ORGANIZATION_DEMAND_ROW_SCOPE_V1_SAFE_BACKFILL_BRIDGE_ACTIVE_CONTEXT_V2_REQUIRED`.

Local integrated proof achieved on exact main `de38b3db`:
- `W7_W12_LOCAL_INTEGRATED_CUSTOMER_JOURNEY_PROVEN` (synthetic cast, real UI,
  127 logged row dumps, 83 screenshots 1440+375, W12 concurrency 21/21;
  evidence in session scratchpad `journey-proof/`)
- `W6_EXPERIENCE_FULL_LOCAL_CYCLE_PROVEN_PRODUCTION_WRITE_PROOF_PENDING`
Journey observations: display-name defect CONFIRMED live (P2 — fix is PR
#1013, owner-gated); P3: `companies_select` lets any authenticated user read
any company legal name (looks deliberate, flag for §15); P3: experience about
an employer stored as `subject_type='worker'` with the profile id (W6
follow-up); P4 cosmetic work-card re-render.

## PR / branch dependencies

| Item | State |
|---|---|
| PR #1009 (§7.1 engagement end) | **MERGED 2026-08-05 06:46 UTC by explicit owner approval** on exact HEAD `eb615ea4` (expected-head protected squash). Merge SHA / new main: `de38b3dbd842102161a9a186f090d0231344c88c`. No migration reapplied (file byte-identical to ledger hash `4e19703c…`). **DEPLOYED TO PRODUCTION**: Vercel deployment `5757082717`, env Production, deployment SHA = merge SHA (verified), state success; landing page smoke OK 2026-08-05. Stage 7 is now MERGED+DEPLOYED; production write proof still pending QA accounts. |
| `launch/launch-critical-completion-train` | This tracker + owner packages (docs). |
| **PR #1014 — MERGED** `52c34584` 2026-08-05 (expected-head `b50a9eb1`) | Track 8: retry-safe webhooks, re-subscribe collision, `invoice.paid`, compile-time API-version pin w/ dual-shape parsers, ledger reconciliation row. PLUS the doctrine-audit P0 fix: the 23505 fallback refuses to overwrite a LIVE subscription of the same owner+plan (`conflict-live-subscription`, operator-decidable, event stays unprocessed) — replaceable only when the held row is cancelled/expired or a `manual_` pilot override. Zero migrations; live blocking intact. Known residual (P1, pre-existing): billing schema is person-mapped only — `unique (owner_id, plan_key, provider)` still prevents one person paying for two organizations; org billing subject model is an owner decision (see doctrine §7). |
| **PR #1013 — Draft, owner-gated** head `f0968cb4` | §18 package — migrations NOT applied; Decisions 1/2/2b in the human-gate doc. Session-2 hardening: backfill re-apply is now EDIT-PRESERVING (per-column current-value guard, same discipline as the rollback), ratchet-collision with #1016 documented in both baseline comments (combined value 182, fails closed). migration-safety RED = designed state. Doctrine audit verdict: name lives on the PERSON (`workers.profile_id` unique, no org column) — changing employer cannot change the name; recommend approving Decision 1 now, Decision 2 with the hardened backfill. |
| **PR #1015 — MERGED** `18132663` 2026-08-05 (expected-head `ff5eeec0`) | W14 slice: 11 mid-funnel events (server-side), usage_cost_events writer (inert until AI enabled), admin AI-cost view. `engagement_ended` ADDED on-branch before merge (shared end path from #1009; fires only on a real `ended` outcome; `role_context` = server-derived actor side). Known residuals (P1, tracked for the org-attribution follow-up): mid-funnel events and the usage-cost writer carry NO organization_id (`pilot_events` has no org column; writer hardcodes null) — a person acting for two orgs merges into one funnel until the org-attribution slice; server-emitted rows hardcode `locale: "lt"` (P2). |
| **PR #1017 — MERGED** `91b48a96` 2026-08-05 (expected-head `480904dc`) | Stage A: all 9 employer G5 paths gated fail-closed through the canonical resolver; the LOCAL divergent org resolver in contact-disclosure deleted; 3 deliberate non-gates documented+pinned; guard `org-demand-scope-gates.test.ts`. Zero migrations. HONEST FRAMING (doctrine audit): this is a strict improvement, NOT "first-org inference deleted" — the upstream fallback survives (G10 below); rows remain unscoped until Stage B; non-owner org members still hit `company-not-owned` (G7). Residuals: reports-hub leg, `acknowledgeInterest` write ungated (P2), guard is regex-over-source (P3). |
| **PR #1016 — Draft, owner-gated** head `3906c76d` | Stage B REWORKED after doctrine audit: membership-derived fail-closed resolver (owned + actively-managed orgs, exactly-one-or-NULL; the legacy `companies.profile_id` bridge was fail-WRONG for team-org owners and is banned from the resolver by guard pin); `customer_requests` BEFORE-trigger closes the PATCH forgery (0028's UPDATE grant + profile-only WITH CHECK); both triggers refuse to stamp another person's row; backfill unchanged (historically correct bridge, 100% coverage 17/17+1/1+0); rollback drops the new trigger pair and carries the V2 expiry warning; gate doc corrected + fourteen §9 answers. RED by design; NOT applied. Classification: `ORGANIZATION_DEMAND_ROW_SCOPE_V1_SAFE_BACKFILL_BRIDGE_ACTIVE_CONTEXT_V2_REQUIRED`. |
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

## Multi-organization doctrine audit — findings register (2026-08-05, session 2)

Full doctrine: [MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md](../architecture/MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md).
Audit scope: main `de38b3db` + PRs #1013–#1018. Merge-train items were fixed
before merge (see PR rows above); the items below are PRE-EXISTING on main and
are the structural work list for true multi-organization support:

| # | Sev | Finding (pre-existing on main) |
|---|---|---|
| M-P0-1 | P0 | `companies_profile_id_key` UNIQUE (20260604120000:245, CONDITIONALLY applied) — one person can never own two companies at the DB level. The comment in the migration ("1:1, per project model") states the anti-doctrine verbatim. |
| M-P0-2 | P0 | `save_company_setup` is a singleton upsert keyed on `profile_id` (20260604140000:131-148) — the ONLY company-creation RPC; a second call silently RENAMES company #1. No create-second-company path exists (only `create_team_v1` teams). |
| M-P0-3 | P0 | `getOwnCompany()` (`company-workers.ts:86`) drives employer WRITE actions (invite/assign/project-create) via `.eq(profile_id).maybeSingle()`, bypassing the workspace; wrong-row writes possible in any environment lacking the conditional constraint. |
| G10 | P1 | First-created-org inference SURVIVES upstream of Stage A: `resolveActiveWorkspaceId` falls back to `organizationIds[0]` (owned orgs ordered `created_at asc`) when no cookie/DB pointer exists — every fresh session before the first switch. #1017 did NOT fix this; v2 should fail to Personal / explicit chooser. |
| M-P1-1 | P1 | `/dashboard/company`, market-map, start/company + dashboard-header fallback still read `getOwnCompany()` — workspace switch changes nothing there. |
| M-P1-2 | P1 | Contact-disclosure "first owned non-team org by created_at" resolver (privacy-sensitive attribution). |
| M-P1-3 | P1 | Planning + Workforce union ALL owned orgs after resolving the workspace — switcher decorative there. |
| M-P1-5 | P1 | Billing is person-mapped only; `unique(owner_id, plan_key, provider)` forbids one person holding the same plan for two orgs; no org billing subject (doctrine §7 model required before Stripe Live). |
| M-P1-6 | P1 | Canonical resolver requires OWNERSHIP (`company-not-owned`) — managers-not-owners cannot act at all (G7). Needs `company_memberships_v1` + role-aware resolution. |
| M-P1-7 | P1 | Engagement minting returns `ambiguous_company` for multi-company owners — booking→engagement chain breaks silently under true multi-org. |
| M-P1-9 | P1 | `pilot_events` has no organization column; employer funnel events unattributable per org (usage_cost_events HAS the column — writer stamps null, see #1015 row). |
| M-P2-* | P2 | `getOwnAgency()` unbacked by any unique constraint; booking budget quota per-profile not per-company; `customers` unique(profile_id); `resolveOrganizationIdForCompany` `.limit(1).maybeSingle()` silently reduces duplicate mirrors; legacy `kind is null` demand rows shown in personal context. |
| OK | — | Booking/calendar conflicts are WORKER-scoped across all employers (EXCLUDE gist + advisory lock) — doctrine-correct, do not "fix". `engagement_contexts` is a real many-to-many spine. `workers.profile_id` unique is CORRECT (one identity, many employers). W9 org RLS hardening applied. |

## Owner gates outstanding

1. **PR #1013 migrations** (Decision 1 write-path repair / Decision 2 or 2b
   backfill) — package hardened `f0968cb4`; audit recommends Decision 1 now.
2. **PR #1016 migration** (`20260805100000`, reworked `3906c76d`) — apply
   yes/not-yet; note the market-map read widening happens AT APPLY TIME.
3. **Production QA accounts** — package at
   [PRODUCTION_QA_ACCOUNT_PACKAGE.md](PRODUCTION_QA_ACCOUNT_PACKAGE.md);
   §13 multi-org cast update pending below.
4. **Stripe Live** — NOT AUTHORIZED. Additionally blocked by doctrine: the
   person-only billing mapping (M-P1-5) must gain the billing-subject model
   before any org plan goes live.
5. **Multi-org structural train** (M-P0-1/2/3 + `company_memberships_v1` +
   `20260714210000` durable pointer) — sequencing in doctrine §11 and the
   audit's ordered list; all schema steps owner-gated.

## Next actions

1. Multi-org §13/§14 QA cast + integrated proof — blocked on QA-account gate;
   prepare the disposable local variant meanwhile.
2. Org-attribution telemetry slice (M-P1-9 + usage-cost org stamping) after
   an org spine exists on the rows it would attribute to.
3. §15 consolidated audit — fold the three journey observations + this
   register into final P0–P4 classifications.
4. ACTIVE_CONTEXT_V2 design (workspace-selected stamping) once
   `20260714210000` + `company_memberships_v1` are applied.

## Confirmations (standing)

- No unauthorized migration applied. No merge performed. No Stripe Live.
- No real charge. No real user or company contacted. No production QA
  account created. No paid infrastructure activated.
