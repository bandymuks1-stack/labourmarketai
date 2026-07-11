# Production Migration Activation — Report v1

Programme: `labourmarketai-migrations-voice-work-journal-master-goal-v1.md`
Executed: 2026-07-11 → 2026-07-12 · Production project: `gorgitwvdzxbnaxhrsrw`
Audit: `docs/launch/production-migration-activation-audit-v1.md` (PR #737, merged)

## Outcome: ALL SEVEN owner-authorized migrations are LIVE_IN_PRODUCTION

Every apply went through Supabase MCP `apply_migration` only (never `db push`),
one at a time, in the authorized order, each with production pre-state capture,
post-apply structural verification, a rolled-back production functional
simulation (writes exercised end-to-end and reverted — zero residue rows),
an APPLIED_LEDGER row, and PR merge after verification.

| # | PR | Migration (repo file) | Prod ledger version | Functional proof (rolled-back simulation) |
|---|---|---|---|---|
| 1 | #730 | `20260711330000_worker_demand_structured_v2_exposure` | `20260711203058` | Adversarial jsonb leak test: every free-text/unknown/invalid key dropped (`bonuses_note`, `worksite_type`, `right_to_work_notes`, `meta`, `certificates`, language notes, `decision_owner`); whitelisted enums/numbers/ISO dates/booleans preserved; RPC = live definition (byte-compared pre-apply) + one `structured` column |
| 2 | #720 | `20260711250000_worker_languages_v1` | `20260711203623` | save→row id, owner-visible, remove→true, 0 rows after; RLS qual == `can_view_worker(worker_id)` (same as worker_skills); writes RPC-only |
| 3 | #721 | `20260711270000_worker_preference_columns_v2` | `20260711204006` | 7 nullable columns, 0/20 existing workers changed; v2 RPC saved basis=net, licences {B,CE}, night=true + v1 fields; v1 RPC untouched |
| 4 | #723 | `20260711310000_worker_saved_opportunities_v1` | `20260711204106` | save→id, owner-visible, arbitrary-uuid blocked, unsave→true, 0 after; demand owner sees nothing |
| 5 | #722 | `20260711290000_booking_lifecycle_v2` | `20260711204354` | deadline set, reschedule moved dates, decline recorded `dates_unsuitable`, event history `deadline_set>rescheduled>declined`, non-admin expiry rejected 42501; events table had 0 rows at CHECK swap |
| 6 | #708 | `20260711210000_work_tasks_v1` | `20260711204521` | create/edit/done (+resolved_at stamp), 2-char title rejected, unrelated worker: 0 visible rows, edit→not_found (no existence leak) |
| 7 | #714 | `20260711230000_finance_records_v1` | `20260711204634` | create with exact 1234567 cents, float "12.50" rejected, paid stamped paid_at, unrelated worker: 0 rows / not_found |

## PR / commit ledger

- #737 activation audit — MERGED (docs).
- #730 #720 #721 #723 #722 #708 #714 — ALL MERGED after production verification,
  each carrying its APPLIED_LEDGER row and the migration-count guard baseline
  bump (118 → 125 across the train; three baseline pins per PR:
  `market-map-read-layer-v1`, `product-readiness`, `ops-bridge-migration`).
- #708 needed one comment-only reword in the migration header (`follow_up_tasks`
  literal tripped the follow-up-tasks name guard) — applied production SQL
  unaffected (comments only).

## Security posture after apply

`get_advisors(security)` after all seven: the ONLY findings touching new
objects are the platform-wide intentional `authenticated SECURITY DEFINER
executable` notices (uniform across all ~120 pre-existing RPCs — the
auth.uid()-bound definer pattern IS the platform design). The three
structural findings (`company_need_public_intakes` no-policy write-only
table, `waitlist` anon INSERT, `customer_requests_status_transition_guard`
search_path) all PRE-DATE this programme and are known by design. No new
security debt.

## Dependent UI truth

The consumer slices were already merged and live in honest-degradation mode
(#732 board detail, #734 languages + v2 prefs, #735 saved bookmarks, #733
booking UX, #707 tasks, #713 finance). With the migrations applied they flip
to live behavior on production data paths. SQL-level verification proved
every RPC contract; authenticated browser proof remains gated (see final
execution report — Docker Desktop GUI start + seeded local users, per the
committed `marketplace-auth-proof.mjs` runbook).

## Rollback readiness

Every migration has its paired `supabase/rollbacks/*.down.sql` on main;
#730's down file restores the prior RPC definition verbatim (byte-compared
against production before apply). No rollback was needed — zero failures,
zero partial applies.
