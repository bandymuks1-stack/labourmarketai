# HUMAN GATE — W14 item 6, the retention SCHEDULER

Migration: `supabase/migrations/20260808140000_ai_runs_retention_schedule_v1.sql`
Rollback:  `supabase/rollbacks/20260808140000_ai_runs_retention_schedule_v1.down.sql`

State: `AI_RUNS_RETENTION_SCHEDULER_BUILT_AND_PROVEN_APPLY_NOT_APPROVED`

## What is and is not already approved

The owner's 2026-08-08 decision approved the retention **capability**
(`20260808130000`, applied to production the same day). It said nothing about
**installing a new database extension**, and this migration does exactly that.

So this ships built, proven and unapplied. Stating that plainly is the point:
`docs/human-gates/w14-ai-runs-retention-gate.md` explicitly listed "no
scheduler" among the things that gate did not approve, and quietly applying one
under the same approval would make that sentence false.

**The one new decision requested: install `pg_cron` on `gorgitwvdzxbnaxhrsrw`.**
Everything else here is ordinary additive DDL.

## Checksums

- migration sha256 `53ae7ee983373b5d0a44356a8db0c3df374d3d958edd431145aee8706f5df0ef`
- rollback sha256 `22cec4f4a05e0eb30d3d1a708156d9b827c7830c34d9264ec9d54c6911e4f8cc`
- comment-stripped **executable** sha256
  `699bfd931fc909e36141cbc13494d3c93280718f4216c1ef0e8fa19e485a4fea`

## Why pg_cron, re-derived rather than assumed

The repo's entire scheduling inventory:

| option | verdict |
|---|---|
| **GitHub Actions** | The only scheduler that exists here (`codeql.yml`, `cron: "23 5 * * 1"`). Both product workflows are **deliberately secret-free** — `quality.yml` says so in its own header. Calling this function from CI means putting `SUPABASE_SERVICE_ROLE_KEY` into Actions secrets: a new production credential in a new place, which is an owner-only gate under CLAUDE.md §4, to schedule a job that needs no credential at all. Also: this account's Actions billing has been intermittently blocked, so it is not a dependable clock. |
| **Vercel Cron** | The app deploys on Vercel, but there is **no `vercel.json` anywhere in the repo**. It would need a new cron config, a new route handler, and a new `CRON_SECRET` — three new pieces of surface, one a secret, for a sweep that touches only the database. |
| **pg_cron** | Available on this project (`default_version 1.6.4`, `installed_version` null). The job runs **inside** the database: no HTTP, no route, no service-role key in a second system, no secret in source or CI. Supabase's own scheduling primitive — using the platform, not inventing a parallel scheduler. |

The cost is honest and is the whole of the ask: **pg_cron is a new extension on
this project.**

## Cadence

**Daily, 03:17 UTC.** No product document specifies one, so the lowest
operationally reasonable cadence for a 90-day boundary was chosen: a row becomes
eligible on a day boundary, so a daily check bounds the "still readable past the
horizon" window to under 24 hours. Anything finer is work with no corresponding
accuracy against a privileged, destructive-by-design capability. 03:17 rather
than 03:00 to avoid the top-of-hour pile-up.

## Honest telemetry — and why there is deliberately no exception handler

`public.ai_runs_retention_sweeps` records one row per **completed** sweep.

A plpgsql exception handler cannot honestly record its own failure: the
telemetry INSERT sits in the transaction being rolled back, so writing "the
sweep failed" and re-raising discards the row that says so — and catching
without re-raising reports a broken sweep to pg_cron as a success. Both are
worse than nothing.

The semantics are therefore structural:

> **a sweep row exists ⟺ that sweep completed.**
> No row for a day ⟹ that day's sweep did not complete.

Absence of evidence is reported as absence, never as success. The failure text
is not lost — pg_cron writes it to `cron.job_run_details`, and
`public.ai_runs_retention_health()` reads **both** sources and refuses to call a
day healthy on the strength of either alone.

## Proof — 48 passed, 0 failed

`scripts/db-proof/w14-retention-schedule.sh` on a throwaway `postgres:15`
container.

**One deviation, printed by the runner rather than buried**: the
`create extension if not exists pg_cron` line is stripped, because pg_cron needs
`shared_preload_libraries` and there is no way to fake a `pg_extension` row.
Every other statement runs verbatim against a faithful `cron.job` /
`cron.job_run_details` / `cron.schedule` / `cron.unschedule` shim. **Whether the
real extension installs and the real job fires is a production fact and must be
verified there, against `cron.job`, after apply — it is not inferred from this
harness.**

**§9 scheduler safety** — job scheduled under its canonical name; cadence
`17 3 * * *`; command is exactly `select public.run_ai_runs_retention_sweep()`;
the wrapper passes **no** horizon argument; contains no `delete`; never writes
`ai_runs` itself; SECURITY DEFINER with pinned `search_path`; `authenticated`
and `anon` cannot invoke it, `service_role` can; telemetry is append-only with
**zero** write grants for any non-owner role and nothing at all for `anon`;
`ai_runs` still has no non-owner write grant; **no credential string in any
executable line**.

**§10 failure semantics**

| scenario | result |
|---|---|
| 0 eligible rows | returns **0**, one telemetry row, `retention_days` 90 — success, not failure |
| eligible rows | redacts **exactly** the 2 eligible, leaves the fresh row, deletes nothing |
| re-run | **0** more, no additional mutation |
| **capability unavailable** | fails loudly **and writes no telemetry row** — absence, not false success |
| **telemetry unwritable** | sweep fails **and the redaction rolls back with it** — no half-done sweep |

**Health read** — healthy only on positive evidence: true after a fresh
completed sweep with the job scheduled; **false** when the last sweep is 5 days
old, when no sweep has ever run (`last_sweep_at` is NULL, not a comforting
zero), when a failed cron run postdates the last sweep (and the failure time is
surfaced), and when the job is unscheduled even with a fresh sweep.

**Idempotent re-apply** — one job, not a duplicate; telemetry history preserved.

**Rollback** — unschedules the job, drops the wrapper, health read and telemetry
table; **leaves #1091's capability intact** (not ours to drop); leaves `ai_runs`
append-only; already-redacted rows **stay redacted**.

### A defect the proof caught in the rollback

The rollback's guard originally read
`exists (select 1 from pg_extension where extname = 'pg_cron')`. That probes the
wrong thing: what would error is a **missing relation**, and an environment can
hold one without the other — after a manual `drop extension`, or in a shimmed
harness. The consequence was that the rollback **silently skipped its own
unschedule**, leaving the job running after a rollback that reported success.
Now `to_regclass('cron.job') is not null`, in both the migration and the
rollback, and the guard test pins it.

## Production context

`public.ai_runs` holds **0 rows** and `AI_PROVIDER_MODE` is `disabled`, so the
sweep has nothing to do today. That is an argument about *timing*, not about
*need*: the scheduler must exist **before** AI is enabled, not before rows
appear, or the first 90 days of real model output age past the horizon with
nothing running.

## THE APPLY QUESTION (owner decision requested)

> Approve installing **`pg_cron`** on production `gorgitwvdzxbnaxhrsrw` and
> applying `20260808140000_ai_runs_retention_schedule_v1`
> (executable sha256 `699bfd931fc909e36141cbc13494d3c93280718f4216c1ef0e8fa19e485a4fea`)
> via Supabase MCP `apply_migration`?
>
> It schedules ONE daily job that calls ONE approved function with no argument,
> records one telemetry row per completed sweep, and adds an operator health
> read. It deletes nothing, changes no retention horizon, activates no AI
> provider, creates no `ai_runs` row, and introduces no secret anywhere.

Until that decision: the migration stays unapplied, the PR stays Draft/RED, and
the retention capability remains callable only by hand.

## Post-apply verification to run (not yet run)

1. `select extname from pg_extension where extname='pg_cron'` → one row.
2. `select jobname, schedule, command, active from cron.job where jobname='ai-runs-retention-daily'` → `17 3 * * *`, the exact command, active.
3. `select * from public.ai_runs_retention_health()` → `job_scheduled` true, `last_sweep_at` NULL, `healthy` **false** (correct: nothing has run yet).
4. After the first 03:17 UTC tick: `cron.job_run_details` shows `succeeded`, one `ai_runs_retention_sweeps` row with `redacted_count = 0`, and `healthy` becomes true.
5. Security advisors: no new ERROR.
