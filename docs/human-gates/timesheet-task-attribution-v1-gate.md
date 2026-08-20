# HUMAN GATE — chain step A: task attribution of canonical work-time

Migration: `supabase/migrations/20260819220000_timesheet_task_attribution_v1.sql`
Rollback:  `supabase/rollbacks/20260819220000_timesheet_task_attribution_v1.down.sql`
PR:        #1215

## OWNER DECISION — GIVEN 2026-08-20 ("SLICE A — APPROVED")

The owner approved, in one decision:

1. the migration `20260819220000_timesheet_task_attribution_v1`;
2. **applying it to production** (the 2026-08-19 decision had approved building
   it and explicitly withheld the apply — this decision grants the apply);
3. merging PR #1215 once the required gates are green;
4. production verification after apply;
5. recording the apply in `docs/APPLIED_LEDGER.md`.

State: `SLICE_A_APPROVED_APPLY_GRANTED`

### The invariant the approval binds to

The owner restated the rule the approval is bound to. It is reproduced here in
full because the approval covers **this rule and no other**:

- attribute timesheet hours to a task ONLY when the journal entry has exactly
  ONE live task link;
- 0 live links → attribution stays `null`;
- more than 1 live link → attribution stays `null`;
- NEVER multiply hours across tasks;
- NEVER guess how hours should be split;
- preserve the canonical `journal_entry_metrics` hours truth;
- preserve provenance, conflicts and `evidencePhrase`;
- do not create a second hours truth.

Every one of those is asserted by
`apps/web/lib/guards/timesheet-task-attribution.test.ts` and by the real-Postgres
proof `scripts/db-proof/timesheet-task-attribution.sh` (36/36).

## Identity gate executed before apply (all PASS)

- `merge-tree` vs `origin/main` (`e20f3d91`): CLEAN, no rebase required;
- migration count: main 233 + exactly this ONE file = 234 (both ratchets);
- no `20260819220000` timestamp collision on main;
- rollback sha256
  `afa28a63922065cd8265e23cdb3fc544fdc706738f75d0440cf90df84fc2ea10`;
- **comment-stripped EXECUTABLE sha256
  `7ea584e3273c9962401bad1badfc8faf98fed80cce1483ac8e1d9fc670a9434f`** — this
  is the invariant the approval binds to. The `@human-gate-approved` header
  rewrite that records this decision is comments only and left this hash
  byte-identical (verified before and after the edit);
- full-file sha256 `6b7764a10bdec33e4c86d2696595487efed4e63a7b66fc21ea5311103f6d586b`
  (after the header rewrite; `fc759692a1344a83dd5ed2eea2ac2d01b0f3b1ea90b2fd5f8e5ecc55d0d8b2ab`
  before it — the delta is the recorded decision, nothing executable);
- production target verified: `gorgitwvdzxbnaxhrsrw` / labourmarket.ai /
  eu-west-1 / `ACTIVE_HEALTHY`;
- branch worktree clean at commit time.

## Why the RED classification, and why it is narrow

`migration-safety` classifies this RED for exactly one reason: it replaces the
body of an existing `SECURITY DEFINER` function. It creates, drops or alters
**zero** tables, columns, policies, indexes, triggers and grants, and executes
**zero** DML at apply time. The function signature is unchanged, so every
existing grant and the SECDEF allowlist stand untouched.

## Pre-apply production baseline (the evidence the apply is a no-op on truth)

| Table | Rows |
|---|---|
| `journal_entries` | 36 |
| `journal_entry_metrics` | 114 |
| `journal_entry_tasks` (all / live) | 0 / 0 |
| `work_tasks` | 0 |
| `timesheets` (all / with frozen snapshot) | 0 / 0 |

With `journal_entry_tasks` empty, the new `task_link` CTE matches nothing, so
every emitted line must carry `taskId: null`, `taskTitle: null`,
`taskLinkCount: 0` and otherwise be byte-identical to today's output.

Canonical hours truth, measured across **all 8** distinct
`(worker_id, organization_id)` pairs that have journal entries, over an
unbounded period, with `computedAt` stripped:

```
chain_fingerprint (md5) = aa403222716f0864ed41c2baeff13e9d
sum totalHours    = 0.00
sum lineCount     = 0
sum totalDayUnits = 0.00
sum conflicts     = 0
```

The post-apply verification re-measures the same fingerprint. Attribution is
additive, so the three new keys change the fingerprint by construction; the
**totals** must be identical.

### A separate finding surfaced by this baseline (NOT part of this gate)

The zero total is not caused by an absence of logged time. Production holds 12
`fragment_time` and 8 `quantity` metric rows in the `time` unit category across
7 journal entries. They produce no timesheet lines because **6 of those 7
entries hang off an engagement context whose `organization_id` is NULL**
(36 contexts are `relationship_slug = 'employee'` with a NULL organization),
and the 7th is superseded. `timesheet_compute_lines_v1` scopes by
`ec.organization_id = p_organization_id`, so a NULL-org context can never match.

This is recorded here only so the baseline is not misread as "no work logged".
It is upstream of chain step A, it is not changed by this migration, and it is
carried forward as the candidate FIRST_BROKEN_LINK for its own evidence-based
assessment.

## Gates

| Check | Result |
|---|---|
| `typecheck` | pending re-run at commit |
| `lint` | pending re-run at commit |
| `build` | pending re-run at commit |
| `test` | pending re-run at commit |
| `migration-safety` | GREEN (human-gated) |
| Real-PostgreSQL proof (`scripts/db-proof/timesheet-task-attribution.sh`) | 36 / 36 |

## Apply procedure (binding)

Supabase MCP `apply_migration` against `gorgitwvdzxbnaxhrsrw`, name
`timesheet_task_attribution_v1`, body = the migration file with the `begin;` /
`commit;` wrapper stripped (the MCP tool wraps its own transaction). **Never**
`supabase db push` — repo filenames do not match ledger versions and a push
would re-run already-applied migrations.
