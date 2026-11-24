# PREMIUM REBUILD — LIVE STATE

**Canonical continuation entry point. Read this FIRST, then the full baseline.**
This page is deliberately short: current state only — no history, no findings,
no evidence. Everything else lives behind the links.

_Last updated: 2026-08-03 (post-merge release baseline)._

> Full record: [`post-merge-production-readiness-baseline-2026-08-03.md`](./post-merge-production-readiness-baseline-2026-08-03.md)
> — merged / deployed / migration-applied / owner-gated are kept strictly
> separate there, and must never be reported as one another.

## Current pointers

| | |
|---|---|
| `origin/main` | **`2813c78b`** (#992, W10 Slice 3) |
| Production deployment | **`5722693900`** — sha `2813c78b`, **success**, 2026-08-03T07:49:54Z |
| Production origin | `https://labourmarket.ai` (apex; `app.` is `LEGACY_APP_HOST`, 301) |
| Supabase project ref | `gorgitwvdzxbnaxhrsrw` |
| Migration baseline | **173** files on `main` · **170** ledger rows in production · **12** on `main` unapplied · **4** in production absent from `main` |
| CI on `main` HEAD | `quality` ✅ · CodeQL ✅ · **`Supabase Preview` ❌** (the drift below) |

## Stage ledger

| Stage | State | Record |
|---|---|---|
| W1–W2 | `COMPLETE` | W1/W2 records |
| W3 — chat-first workspace consolidation | `COMPLETE` at `7a4babba`, deploy `5703264161`. **FROZEN** | `evidence/premium-rebuild/w3-final-completion-report.md` |
| W4 — professional identity | `COMPLETE_WITH_OWNER_GATED_ITEMS` at `426e87aa`, deploy `5703997684`. **FROZEN** | `evidence/premium-rebuild/w4-acceptance.md` |
| W5 — journal / evidence / skills | `COMPLETE_WITH_OWNER_GATED_ITEMS` at `7621acab`. **FROZEN** | `evidence/premium-rebuild/w5-baseline.md` |
| W6 — Trust | **code merged (#972 / #973 / #974 / #977), production migration PENDING** — `20260802120000_experience_records_v1` unapplied, so the experience domain is dark in production and fails closed | `evidence/premium-rebuild/w6-baseline.md` |
| W7 — employee journey | **slices 2 (#979) and 3 (#981) merged + deployed.** The audit found zero P0. There is no "slice 1" — the numbering starts at 2 | [`w7-employee-journey-read-only-audit.md`](./w7-employee-journey-read-only-audit.md) |
| W8 — employer journey | **Slice 1 merged (#978) + deployed** | [`evidence/premium-rebuild/w8-employer-journey-audit.md`](./evidence/premium-rebuild/w8-employer-journey-audit.md) |
| W9 — organizations & teams | **Slices 1 (#975) and 2 (#980) merged AND production-applied** (2026-08-02). `organizations using (true)` is closed in production | — |
| W10 — marketplace & matching | **Slices 1 (#986), 2 (#989), 3 (#992) merged + deployed. No migrations** | [`w10-marketplace-matching-audit.md`](./w10-marketplace-matching-audit.md) |
| W11 — project operating system | **Slice 0 merged (#985) + deployed. Assigned-worker authorization code merged (#988), production migration PENDING** — `20260803090000_project_assigned_worker_read_v1` | [`w11-project-operating-system-audit.md`](./w11-project-operating-system-audit.md) |
| W12 — calendar & conflicts | **Slice 1 (#976) and Slice 3 (#982) merged + deployed. Atomic double-booking migration PENDING** — `20260802150000_booking_atomic_double_booking_v1` | — |
| W13 | **UNDEFINED** — no audit, no baseline, no scope in this repository | — |
| W14 — analytics & KPI | **Slices 1 (#984), 2 (#987) and the cross-tenant fix (#990) merged + deployed. `20260714150000_ai_runs_audit_v1` is production-applied** (2026-08-03) | [`w14-analytics-kpi-audit.md`](./w14-analytics-kpi-audit.md) |
| W15–W22 | **UNDEFINED** — no scope exists in this repository | — |

## The three unapplied train migrations

| Migration | Stage | Effect while unapplied |
|---|---|---|
| `20260803090000_project_assigned_worker_read_v1` | W11 (#988) | an assigned worker cannot read their own project; project↔booking conflict detection can never fire |
| `20260802150000_booking_atomic_double_booking_v1` | W12 Slice 1 | production has no DB-level double-booking guard |
| `20260802120000_experience_records_v1` | W6 Slice 3 | the whole experience domain is unavailable and fails closed |

Nine older repo migrations are also unapplied — full list in the baseline §3.

## Production-ahead-of-main drift

Four `usage_cost_events*` migrations are **applied in production** while their
files are absent from `main` (they exist only on Draft PR #898, and they do
**not** match). This is exactly what the red `Supabase Preview` check reports.

**Verdict: `PRODUCTION_SCHEMA_DRIFT_REQUIRES_MANUAL_RECONCILIATION`.**
Inventory + recovery options: [`usage-cost-migration-drift-inventory-2026-08-03.md`](./usage-cost-migration-drift-inventory-2026-08-03.md).

## Customer readiness

`LIMITED PILOT` — workers · recruiters/agencies.
`NOT READY` — employers · organizations · schools · universities.

Schools and universities are **not modelled** as product roles or organization
types. `booking_requests` holds **0 rows**: the marketplace loop has never
completed once in production. Per-segment promotion conditions: baseline §7.

## Standing gates

- **No authenticated production proof exists for any role** — `PROD_QA_*` is
  unprovisioned (`evidence/premium-rebuild/prod-qa-account.md`). Owner decision
  package: [`production-cycle-proof-plan-v1.md`](./production-cycle-proof-plan-v1.md).
- The nine W4 owner-gated items (`evidence/premium-rebuild/w4-acceptance.md` §4).
- Billing / commercial remains a hard stop.

## Standing rules

- Never rebuild the Player Card, the workspace, or any canonical surface — extend only.
- No fabricated reputation, verification badges, or invented scores.
- Row-by-row browser assertions before deletion/port; mobile 375px + keyboard legs on accepted rows.
- Migrations, secrets, billing, outreach, consent wording: owner-gated, hard stop for that item only.
- **Merged is not deployed; deployed is not applied; applied is not proven.**
