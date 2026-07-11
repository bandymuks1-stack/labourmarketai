# Production Migration Activation Audit v1

Programme: `labourmarketai-migrations-voice-work-journal-master-goal-v1.md` (owner goal command, 2026-07-11)
Audited: 2026-07-11 · Base: `origin/main` `732014b7` (post Phase-2 closeout #736)
Production: `gorgitwvdzxbnaxhrsrw` · Last applied ledger version at audit time: `20260711081250` (`privacy_consent_text_v2_controller_identity`)

Owner authorization covers applying the seven already-prepared draft migrations
(#730 #720 #721 #723 #722 #708 #714) **one at a time via Supabase MCP
`apply_migration` only** (never `db push`), each with production pre-state
capture, post-apply verification, APPLIED_LEDGER row, rollback readiness and
dependent-UI smoke. It does NOT cover any new (e.g. voice) migration.

## Production precondition sweep (verified live 2026-07-11 via MCP SQL)

| Check | Result |
|---|---|
| `can_view_worker()` / `is_admin()` / `can_manage_project()` / `owns_company()` exist | ✅ all present |
| `demand_structured_v2_public` absent (no prior partial apply) | ✅ absent |
| `worker_languages` / `worker_saved_opportunities` / `work_tasks` / `finance_records` tables absent | ✅ 0 present |
| `workers` v1 preference columns (8: relocate/accommodation/transport/trip-days/contract/team/solo/note) | ✅ all 8 present |
| `workers` v2 preference columns (7 new) absent | ✅ 0 present |
| `booking_requests.response_deadline_date` absent | ✅ absent |
| `booking_request_events_event_type_check` constraint exists; events table empty | ✅ (0 rows → constraint swap is conflict-free) |
| `booking_request_events.reason_kind/reason_note` absent | ✅ absent |
| Production `list_open_demand_for_workers()` definition == #730 body minus `structured` column | ✅ compared `pg_get_functiondef` byte-for-byte |

No production conflicts. No backfill required by any of the seven (all
additive; projections computed at read time; new tables ship empty; new
columns NULL = honest "not stated").

## Per-migration audit

Order of apply (goal + Phase-2 closeout concur): #730 → #720 → #721 → #723 → #722 → #708 → #714.
All seven PRs are open against `main`, contain exactly one migration + paired
rollback (+ guard tests where applicable), and are additive-only. None
requires rebase (no file overlap with `main` since branch; GitHub reports
MERGEABLE for all five MP PRs; #708/#714 re-verified by branch diff — only
new files + their own guard-test extension).

### #730 — `20260711330000_worker_demand_structured_v2_exposure` (MP-3)

- **Head/base**: `feat/worker-demand-structured-exposure-migration` @ `4a662132` vs main — no rebase needed (new files only).
- **Change**: 1 IMMUTABLE pure-SQL helper `demand_structured_v2_public(jsonb)` (per-key type/enum whitelist re-projection of `payload.structured_v2`; every free-text key dropped element-by-element) + recreate `list_open_demand_for_workers()` = live definition + one `structured jsonb` column.
- **RLS/grants**: RPC stays SECURITY DEFINER worker-gated; helper + RPC `revoke public` / `grant authenticated`. `customer_requests` RLS untouched.
- **Dependencies**: verified-company Model-A join (live), `company_demand_locations` (live).
- **Consumers**: #732 board detail (merged, mirrors whitelist, degrades to null when column absent).
- **Rollback**: down file restores the live RPC definition verbatim (compared against production `pg_get_functiondef`) + drops helper. Trigger: any leak of excluded keys or worker-board 500s.
- **Pre/post truth**: pre — workers see narrow whitelist; post — plus enums/numbers/ISO-dates/booleans only. Old records: `structured` NULL (honest).
- **Smoke**: helper leak-test with adversarial jsonb; worker RPC returns only whitelisted keys.
- **Recommendation: APPLY_AS_IS.**

### #720 — `20260711250000_worker_languages_v1` (MP-1)

- **Change**: new `worker_languages` table (closed 11-lang set, CEFR+native, unique (worker,lang) ⇒ ≤11 rows/worker) + `save_worker_language_v1` / `remove_worker_language_v1` RPC-only writes.
- **RLS**: SELECT = `can_view_worker(worker_id)` — mirrors `worker_skills` consent model exactly (fail-closed). No write policies; direct DML revoked.
- **Self-declared only** — no verified flag exists; UI (#734) renders the self-declared disclaimer.
- **Rollback**: drops 2 functions + table. Trigger: RLS leak (employer without consent sees rows) or write-path failure.
- **Smoke**: worker add/update/remove; unconsented-employer read = 0 rows.
- **Recommendation: APPLY_AS_IS.**

### #721 — `20260711270000_worker_preference_columns_v2` (MP-2)

- **Change**: 7 additive NULLABLE columns on `workers` (pay basis, night/weekend/overtime tri-states, licence categories ⊆ {B,BE,C,CE,D}, own vehicle/tools) + NEW-name RPC `save_worker_availability_prefs_v2` (v1 RPC untouched; either apply order safe).
- **NULL = not stated** — matching treats NULL as missing data, never "no". Existing rows read back unchanged.
- **Rollback**: drops v2 function + 7 columns. Trigger: constraint violation storm or v1 writer breakage (none expected — v1 untouched).
- **Smoke**: v2 save + reload; v1 fields intact.
- **Recommendation: APPLY_AS_IS.**

### #723 — `20260711310000_worker_saved_opportunities_v1` (MP-5)

- **Change**: new private bookmark table (ids + optional ≤500-char note only, NO copied demand facts) + save/unsave RPCs; cap 200/worker; unique (worker,request).
- **RLS**: SELECT = saving worker or admin ONLY — demand owner never sees savers (bookmark ≠ interest signal).
- **Stale saves**: board re-reads live truth; closed demand renders "no longer open" honestly.
- **Rollback**: drops 2 functions + table. Trigger: cross-user visibility.
- **Smoke**: save/unsave as worker; demand-owner read = 0 rows.
- **Recommendation: APPLY_AS_IS.**

### #722 — `20260711290000_booking_lifecycle_v2` (MP-4)

- **Change**: `booking_requests.response_deadline_date`; `booking_request_events.reason_kind/reason_note` (closed kinds, ≤500 note); event-type CHECK widened (+`rescheduled`,`deadline_set` — events table has 0 rows, swap conflict-free); 4 new RPCs (`respond_booking_request_v2`, `withdraw_booking_request_v2`, `reschedule_booking_proposal_v1` proposed-only, `set_booking_response_deadline_v1`) + `expire_stale_booking_requests_v1` (is_admin-only, ≤500 rows/call, **no scheduler installed** — wiring expiry to any scheduler stays a separate owner decision).
- **v1 compatibility**: v1 RPCs untouched; #733 UI calls v2 with automatic v1 fallback — safe in either state.
- **Accepted bookings immutable**: reschedule refuses non-proposed; accepted change = withdraw + new proposal (event-visible).
- **Rollback**: drops 4+1 functions + 2 columns, restores original CHECK. Trigger: v1 booking flow breakage.
- **Smoke**: deadline set, reschedule, decline-with-reason, admin expiry dry call.
- **Recommendation: APPLY_AS_IS.**

### #708 — `20260711210000_work_tasks_v1` (control-room PR D2)

- **Change**: new `work_tasks` table (bounded fields, honest 5-state lifecycle, derived nothing) + 3 RPC-only write paths; SELECT = creator/assignee/admin/project-manager via existing `can_manage_project`; open-task cap 200/creator; no external sending by construction.
- **Consumers**: `/dashboard/tasks` + spine signal (merged #707), currently honest "preparing" via 42P01.
- **Rollback**: drops 3 functions + table. Trigger: RLS leak or task CRUD failure.
- **Smoke**: create/edit/status; unauthorized caller gets `not_found` (no existence leak).
- **Recommendation: APPLY_AS_IS.**

### #714 — `20260711230000_finance_records_v1` (control-room PR I2)

- **Change**: new `finance_records` table (integer cents 0..1e11, EUR-only, honest stored lifecycle; **overdue derived app-side, never stored**) + 3 RPC-only write paths; SELECT = creator/admin/company-owner via existing `owns_company`; no money movement, no payment/bank/payroll/tax claims by construction.
- **Consumers**: `/dashboard/finance` + CSV export (merged #713), currently honest "preparing" / CSV 503.
- **Rollback**: drops 3 functions + table. Trigger: RLS leak or amount-integrity failure.
- **Smoke**: create/update/status; CSV export goes live; cents exactness.
- **Recommendation: APPLY_AS_IS.**

## Verdict

All seven: **APPLY_AS_IS**, in the stated order, one at a time, each followed
by header verification, dependent-UI smoke, APPLIED_LEDGER row and merge of
its PR. No migration depends on a later one; a failure at step N blocks only
N (later independent migrations may still proceed per goal §fail rules), with
the sole ordering note that #721 touches the same `workers` table as #720's
FK target — both are additive and remain independent.
