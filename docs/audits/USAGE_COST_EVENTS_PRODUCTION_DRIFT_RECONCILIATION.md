# USAGE_COST_EVENTS production drift — reconciliation record

Date: 2026-08-06 · Scope: read-only audit on main `ac6186dc` + this doc-only fix
Verdict: **`USAGE_COST_EVENTS_DRIFT_RECONCILED_CI_SIGNAL_RESTORED`**

## What was audited

The W1–W22 recount listed cross-cutting blocker 3: *"`usage_cost_events`
production-ahead-of-main drift — Supabase Preview CI red."* This record
re-verifies every layer of that claim against current production and current
main, classifies the residual drift, and applies the minimum truthful fix.

## Findings by layer

| Layer | State | Evidence |
|---|---|---|
| Production table | `public.usage_cost_events` EXISTS, **0 rows** | read-only SQL 2026-08-06 |
| Production ledger | ALL FOUR migrations recorded (`20260728114008/114254/114301/114353`) | `supabase_migrations.schema_migrations` + inventory §1 md5 table |
| Repo migrations | All four files on main, byte-exact to the ledger bodies | restored by PR #995 (main `081098c6`), md5-verified in inventory §7 |
| APPLIED_LEDGER | All four rows present (L814–L818) | `docs/APPLIED_LEDGER.md` |
| Generated types | `usage_cost_events` Row = exactly the 20 `clean_start` columns, nullability aligned | `apps/web/lib/supabase/types.ts` L6520–6603 |
| Writer | `persistUsageCostEvent` (`lib/usage/usage-cost-store.ts`), service-role only, fires only on `cfg.state === "live"` AI runs | PR #1015 |
| Readers | `lib/admin/ai-cost.ts` behind `requireSuperadmin` + admin-only RLS | telemetry admin page |
| 0 production rows | CONSISTENT, not a defect — no live AI run has executed with a service key since merge | writer gating |
| Fresh replay | full local `supabase db reset` of all migrations: 0 errors | inventory §7.2, re-confirmed 2026-08-06 (188 migrations) |

## Drift classification (required single choice)

**Multiple causes — both residual, neither schema-level:**

1. **Preview branch history mismatch** (dominant): Supabase Preview compares
   remote ledger VERSIONS to local migration FILENAMES; MCP `apply_migration`
   mints apply-time versions, so ~151/170 remote versions have no matching
   filename. This is the **owner-ACCEPTED permanent red** recorded in
   `docs/audits/supabase-migration-version-drift-decision-v1.md` (D5,
   status ACCEPTED: "the check will stay red for now, by decision"). Live
   check-runs confirm the pattern: Preview FAILS only on PRs that touch
   `supabase/migrations/` (e.g. #1033), SKIPS on doc/code PRs and Drafts
   (#1034, #1035, #1036). Not a regression; not fixable doc-only without
   violating the standing "never rewrite the prod ledger" constraint.
2. **APPLIED_LEDGER accounting gap** (small, fixed here): the Deferred entry
   for `20260714210000_company_memberships_v1` lacked a supersession note
   against the APPLIED `20260806090000_company_memberships_v1` — the first
   case where the ledger's "match on name" doctrine is ambiguous (one prod
   `name`, two repo files, opposite designs). Annotated in this change.

Explicitly ruled out: production-ahead-of-repo (closed by PR #995),
repo-migration-missing (all four on main), generated-type drift (exact
match). **No production migration is required.** The four usage_cost files
cause no fresh-replay problem (clean reset proof).

## The minimum truthful fix applied (this change, doc-only + one comment)

1. This record (the reconciliation target the recount asked for).
2. `docs/APPLIED_LEDGER.md`: supersession/name-collision note on the
   `20260714210000` Deferred entry.
3. `apps/web/lib/ai/run-agent-server.ts`: stale comment corrected — it still
   said the `ai_runs` migration was unapplied; it has been APPLIED since
   2026-08-03 (ledger `20260803061937`).

## What was deliberately NOT done

- No production table touched, dropped, or recreated; no business rows.
- No migration fabricated or reapplied; no prod ledger rewrite.
- No ~151-file rename to appease Preview (owner declined this in D5).
- Branch `fix/reconcile-usage-cost-production-migration-history` (worktree
  `labourmarketai-migration-reconciliation`) is content-merged into main via
  the #995 squash (`git diff origin/main 8f9a3623` over its files is empty);
  deleting branch + worktree is safe owner housekeeping, not done here.

## What "CI signal restored" means going forward

- `Quality Gates` + `CodeQL` green on main = trustworthy signal (verified).
- `Supabase Preview` red on a migration-touching PR = the KNOWN D5 label
  drift, unless the failure text names something other than "Remote
  migration versions not found in local migrations directory" — only then
  does it mean a real problem.
- The D5 going-forward rule stands: every new apply must have its repo file
  present before/with the apply, so the gap never widens in content.
