# HUMAN GATE — ai_runs subject de-linking after 90 days

State: `CODE_COMPLETE_PENDING_HUMAN_GATE`

Migration: `supabase/migrations/20260824170000_ai_runs_retention_delink_subject_v1.sql`
Rollback:  `supabase/rollbacks/20260824170000_ai_runs_retention_delink_subject_v1.down.sql`
Guard:     `apps/web/lib/guards/ai-runs-subject-delinking.test.ts` (14 pins)

## The owner direction this implements

> AI technical telemetry must not become a second permanent copy of a person's
> professional/work history.

The Work Journal, evidence and verified history stay canonical and persistent
where product doctrine requires — **nothing here touches them.** AI telemetry is
a different thing wearing similar data.

## What is true today

`redact_expired_ai_run_content()` clears `output_excerpt` after 90 days and
stops. The 20260808130000 header is explicit about why:

> `profile_id` is deliberately NOT touched here: it is structured, not
> free-form, and removing it is a separate decision nobody has taken.

So past the horizon a run keeps a **live foreign key into `profiles`** plus
`request_context` (the agent key). Combined with `task_type` and `created_at`,
what remains is a permanent, per-person, timestamped index of every AI
interaction someone was the subject of. The product never promised to keep
that, and it is not what the table exists for.

## What the change does

The **same** canonical function — one home, one horizon, one scheduled job —
now nulls three columns instead of one:

| Column | After 90 days | Why it is safe to clear |
|---|---|---|
| `output_excerpt` | cleared (unchanged) | free-form model output; original D1 scope |
| `profile_id` | **now cleared** | `uuid`, nullable, FK `ON DELETE SET NULL` — the column's own contract already anticipates the null |
| `request_context` | **now cleared** | `text`, nullable, `CHECK` permits NULL explicitly; ≤120 chars, written by our code |

Everything else survives **forever**, so owner decision D2 (long-term
aggregated AI cost history) is intact: `created_at`, `task_type`, `provider`,
`model_id`, `model_alias`, `tier`, `input_tokens`, `output_tokens`,
`estimated_cost_usd`, `actual_cost_usd`, `latency_ms`, `route_reason`,
`blocked_reason`, the fallback fields and `schema_validation`.

**What is lost after 90 days is only the ability to say whose run it was.**

## Why it extends the canonical function instead of adding one

#1259 added a second function, `ai_runs_apply_retention`, doing very nearly
this. It was closed and its orphan production function reverted. The capability
was right; the second home was not — two functions would mean two answers to
one question, free to drift.

Worth noting what the duplicate got wrong beyond duplication: it guarded only
`p_older_than >= interval '1 day'`. The canonical function raises `22023` on
anything below 90 days, so its horizon cannot be shortened by a caller. This
change carries that floor over untouched.

## Checks done before writing the SQL

- **Copied from the LIVE body, not from an ancestor file.** `pg_get_functiondef`
  on production, 2026-08-24: production and 20260808130000 are byte-identical
  in their executable bodies. This repo has been bitten before by a
  `create or replace` that silently reverted an intervening change, and the
  diff of a restated function hides a subtraction.
- **No reader depends on either column.** `ai_runs` has three call sites in the
  whole repo: the audit INSERT (`lib/ai/runtime/audit-store.ts`), a same-day
  count for the daily budget guard, and the activation report — which selects
  `created_at, task_type, provider, actual_cost_usd` and nothing else. No
  legal, security or accounting path depends on 90-day-old subject attribution.
- **No capability is added.** No grant is widened, no table-level UPDATE or
  DELETE on `ai_runs` is introduced, and `run_ai_runs_retention_sweep()` is not
  modified — it still calls with no argument, so the scheduler still cannot
  control the horizon.

## Blast radius today: zero rows

Production `ai_runs` holds **0 rows** (`AI_PROVIDER_MODE` is disabled and both
write paths gate on `cfg.state === "live"`). The daily cron
`ai-runs-retention-daily` has run **16/16 consecutive days with zero failures**
and redacted **0 rows**. Applying this narrows a capability; it takes no action
on any existing row.

That also means the honest status of the whole retention mechanism is: **proven
to RUN, unverified on real data.** Do not read 16 green sweeps as evidence that
redaction works — they each matched nothing.

## Why this ships unapproved

The migration deliberately does **not** carry `@human-gate-approved`. The owner
gave the direction; no approval has been recorded against this SQL. Writing the
marker would be the authoring session approving its own privacy change. A guard
test pins that absence.

## What the owner is being asked

1. Confirm the direction as implemented — three columns, 90 days, the existing
   function, no deletion.
2. Confirm that no legal, security or accounting obligation requires subject
   attribution on `ai_runs` past 90 days. If one exists, **name it** and the
   function should be narrowed rather than the linkage kept by default because
   nobody checked.
3. If approved: add `@human-gate-approved` to the migration header and apply via
   Supabase MCP `apply_migration`. Never `db push`.

## Separately — a production ledger row needs cleaning

`supabase_migrations.schema_migrations` still holds the #1259 duplicate row
`20260824114251`, recording the name `ai_runs_retention_redaction_v1` a second
time. The function it created is gone; only the bookkeeping row survives.

Low priority, and deliberately not fixed here: `check-migration-parity` still
PASSes, because it matches on `name` and that name has a repository file — the
canonical one. So the residue is a duplicate ledger identity rather than a
missing file, and cleaning it is a separate, data-only correction. Recorded in
`APPLIED_LEDGER.md` so the next session that notices it can stop where this one
did instead of re-deriving it.
