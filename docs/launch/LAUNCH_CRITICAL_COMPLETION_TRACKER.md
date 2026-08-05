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
| PR #1009 (§7.1 engagement end) | Draft, HEAD `eb615ea4` pushed 2026-08-05, rebased on `5be4baf6`, migration ALREADY APPLIED (ledger #1010), browser proof both sides on this HEAD. **CI all green on this exact HEAD** (quality/Analyze/CodeQL/migration-safety/Vercel). Owner merge package posted as PR comment 2026-08-05. AWAITING OWNER MERGE DECISION. |
| `launch/launch-critical-completion-train` | This tracker + owner packages (docs). |
| Display-name slice (`fix/worker-display-name-canonical-write-path`) | PARKED per train §18 — do not touch until #1009 is no longer active. |

## Pilot-chain launch matrix

Classifications: `PROVEN_PRODUCTION` / `SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING` /
`CODE_COMPLETE_PENDING_MERGE` / `LOCAL_PROOF_ONLY` / `MISSING` / `BLOCKED_BY_OWNER_GATE`

| # | Stage | Classification | Notes / proof |
|---|---|---|---|
| 1 | Worker registration & profile | PENDING AUDIT | Track 2 audit in flight |
| 2 | Company registration & org context | PENDING AUDIT | W9 slices 1+2 applied in prod (prior ledger) |
| 3 | Org-scoped demand creation | PARTIAL — preflight complete 2026-08-05 | Surface gate real (`requireEmployerCompany`, fail-closed, guard-pinned 7-file spine); **row scope MISSING**: `customer_requests`/`demand_shortlist`/`booking_requests` have NO org column, zero org-aware RLS in the chain (gaps G1–G9 in [ORGANIZATION_DEMAND_SPINE_PACKAGE.md](ORGANIZATION_DEMAND_SPINE_PACKAGE.md)). No client-supplied authority anywhere (verified safe). Plan: app-layer gate fixes (no migration) first; schema package owner-gated. |
| 4 | Matching & shortlist | PENDING AUDIT | |
| 5 | Booking proposal & acceptance | PENDING AUDIT | |
| 6 | Calendar & double-booking prevention | PENDING AUDIT | W12 accept-RPC race fixed (row+advisory lock, EXCLUDE gist) per prior ledger; verify applied state |
| 7 | Company-worker engagement | CODE_COMPLETE_PENDING_MERGE | #1009: schema APPLIED, both-side browser proof LOCAL; merge = owner gate |
| 8 | Project lifecycle (W11) | PENDING AUDIT | Migration applied 2026-08-04 per prior ledger; PR state to verify |
| 9 | Experience cycle (W6) | SCHEMA_ACTIVE_UI_PRESENT_WRITE_PROOF_PENDING | Prod schema active; full local cycle proof = Track 5 |
| 10 | Analytics & cost truth (W14) | PARTIAL — audit complete 2026-08-05 | `pilot_events` funnel live+tenant-safe (37/38 events) but mid-funnel unmeasured (match/shortlist/contact/booking-proposed/engagement/project/experience/org-created have NO events); `usage_cost_events` + `ai_runs` applied in prod with ZERO writers (AI_PROVIDER_MODE=disabled; 90-day retention is a required block before activation); NO AI-cost admin surface. Smallest slice = zero-migration (extend funnel events + wire usage_cost_events + admin ai-cost view) → implementing on `feat/w14-pilot-analytics-slice-v1` |

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
