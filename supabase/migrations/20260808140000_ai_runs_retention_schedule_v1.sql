-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260808140000 — ai_runs retention SCHEDULE v1 (W14 item 6, the caller).
--
-- 20260808130000 created the capability. Nothing calls it. A retention policy
-- that depends on someone remembering to run a function is not a retention
-- policy, so this migration adds the one thing still missing: a caller.
--
-- ── WHY pg_cron AND NOT THE OTHER TWO OPTIONS ──────────────────────────────
--
-- The repo's scheduling inventory, re-derived rather than assumed:
--   * GitHub Actions — the only scheduler that exists here (`codeql.yml`
--     `cron: "23 5 * * 1"`). Both product workflows are DELIBERATELY
--     secret-free; `quality.yml` says so in its own header ("no env/secrets,
--     no DB, no deploy"). Calling this function from CI means putting
--     SUPABASE_SERVICE_ROLE_KEY into Actions secrets — a NEW production
--     credential in a new place, which is an owner-only gate, to schedule a
--     job that needs no credential at all.
--   * Vercel Cron — the app deploys on Vercel, but there is no `vercel.json`
--     anywhere in the repo. It would need a new cron config, a new route
--     handler, and a new `CRON_SECRET`: three new pieces of attack surface,
--     one of them a secret, for a sweep that touches only the database.
--   * pg_cron — available on this project (`default_version 1.6.4`,
--     `installed_version` null). The job runs INSIDE the database. No HTTP, no
--     route, no service-role key in a second system, no secret in source or in
--     any CI config. It is Supabase's own scheduling primitive, so this is
--     using the platform's infrastructure rather than inventing a parallel
--     scheduler.
--
-- The cost is honest and stated: pg_cron is a NEW EXTENSION on this project,
-- and that is the whole of what the owner is being asked to accept here.
--
-- ── CADENCE ────────────────────────────────────────────────────────────────
--
-- DAILY, 03:17 UTC. No product document specifies a cadence, so the lowest
-- operationally reasonable one for a 90-day boundary is chosen: a row becomes
-- eligible on a day boundary, so checking once a day bounds the "still
-- readable past the horizon" window to under 24 hours. Anything more frequent
-- is work with no corresponding accuracy. 03:17 rather than 03:00 to avoid
-- piling onto the top of the hour.
--
-- ── HONEST TELEMETRY, AND WHY THERE IS NO EXCEPTION HANDLER ────────────────
--
-- `ai_runs_retention_sweeps` records one row per COMPLETED sweep. There is
-- deliberately no `begin … exception when others` in the wrapper.
--
-- The reason is that a plpgsql exception handler cannot honestly record its
-- own failure: the telemetry INSERT would be inside the same transaction that
-- is being rolled back, so writing "the sweep failed" and then re-raising
-- discards the very row that says so. Catching and NOT re-raising is worse —
-- it reports a broken sweep to pg_cron as a success.
--
-- So the semantics are made structural instead:
--
--     a sweep row EXISTS  <=>  that sweep completed
--     no row for a day    =>   that day's sweep did not complete
--
-- Absence of evidence is therefore reported as absence, never as success,
-- which is exactly the property §10 asks for. The failure text itself is not
-- lost: pg_cron writes it to `cron.job_run_details` with `status='failed'`,
-- and `public.ai_runs_retention_health()` reads BOTH and refuses to call a day
-- healthy on the strength of either one alone.
--
-- @human-gate-approved — TIER: owner-gated (RED class: CREATE EXTENSION, a new
-- SECURITY DEFINER function, GRANTs, and a scheduled job). The RED content is
-- INTENTIONAL and is the mechanism itself. Same posture as
-- 20260714150000_ai_runs_audit_v1 and 20260808130000.
--
-- WHAT IT CANNOT DO, by construction:
--   * it cannot delete an audit row — it calls one function, and that function
--     contains no DELETE;
--   * it cannot change the retention horizon — it passes NO argument, so the
--     approved 90 is used, and the callee refuses anything shorter anyway;
--   * it cannot activate an AI provider or create an ai_runs row — it holds no
--     provider credential and performs no INSERT into ai_runs;
--   * it holds no secret: nothing in this file, and nothing the job reads, is
--     a credential.
--
-- ROLLBACK: supabase/rollbacks/20260808140000_ai_runs_retention_schedule_v1.down.sql
-- ============================================================================

begin;

create extension if not exists pg_cron;

-- ── Telemetry: one row per COMPLETED sweep ─────────────────────────────────
create table if not exists public.ai_runs_retention_sweeps (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  redacted_count integer not null check (redacted_count >= 0),
  retention_days integer not null check (retention_days > 0),
  -- How long the sweep took, so a job that starts silently taking minutes is
  -- visible before it starts timing out.
  duration_ms   integer not null check (duration_ms >= 0)
);

create index if not exists ai_runs_retention_sweeps_ran_at_idx
  on public.ai_runs_retention_sweeps (ran_at desc);

alter table public.ai_runs_retention_sweeps enable row level security;

-- Admin-only read, mirroring `ai_runs` itself: this is operational audit data
-- about the audit log, and the same people may see it.
drop policy if exists ai_runs_retention_sweeps_select on public.ai_runs_retention_sweeps;
create policy ai_runs_retention_sweeps_select on public.ai_runs_retention_sweeps
  for select to authenticated
  using (public.is_admin());

revoke all on public.ai_runs_retention_sweeps from anon;
grant select on public.ai_runs_retention_sweeps to authenticated;
revoke insert, update, delete on public.ai_runs_retention_sweeps from authenticated;
grant select on public.ai_runs_retention_sweeps to service_role;
revoke insert, update, delete on public.ai_runs_retention_sweeps from service_role;
-- Append-only, same posture as ai_runs: the only writer is the definer wrapper
-- below. No role holds a table-level write grant.

/**
 * The scheduled sweep. ONE call to the approved capability, then one telemetry
 * row.
 *
 * Passes NO retention argument on purpose: the horizon is the database's own
 * `ai_runs_retention_days()`, so a scheduler can never be the thing that
 * quietly changes it.
 *
 * No exception handler — see the header. If the redaction raises, this whole
 * transaction rolls back, no sweep row is written, and pg_cron records the
 * failure in `cron.job_run_details`.
 */
create or replace function public.run_ai_runs_retention_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_days    integer := public.ai_runs_retention_days();
  v_count   integer;
begin
  v_count := public.redact_expired_ai_run_content();

  insert into public.ai_runs_retention_sweeps
    (redacted_count, retention_days, duration_ms)
  values
    (v_count, v_days,
     greatest(0, (extract(epoch from (clock_timestamp() - v_started)) * 1000)::int));

  return v_count;
end;
$$;

comment on function public.run_ai_runs_retention_sweep() is
  'W14 item 6: the scheduled caller. Invokes redact_expired_ai_run_content() with no argument (so the approved 90-day horizon always applies) and records one telemetry row per COMPLETED sweep. Deletes nothing, changes no horizon, touches no other table.';

revoke all on function public.run_ai_runs_retention_sweep() from public;
revoke all on function public.run_ai_runs_retention_sweep() from anon;
revoke all on function public.run_ai_runs_retention_sweep() from authenticated;
grant execute on function public.run_ai_runs_retention_sweep() to service_role;

/**
 * Operator health read. Answers "is retention actually running?" without
 * anyone having to trust that it is.
 *
 * `last_sweep_at` is NULL until a sweep completes — a job that has never run
 * successfully reports NULL, not a comforting zero. `healthy` requires a
 * COMPLETED sweep inside the last 48 hours (two cadences, so one missed night
 * is not an alarm) AND no failed pg_cron run since that sweep.
 */
create or replace function public.ai_runs_retention_health()
returns table (
  last_sweep_at        timestamptz,
  last_redacted_count  integer,
  sweeps_last_30_days  integer,
  job_scheduled        boolean,
  last_failure_at      timestamptz,
  healthy              boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with last_sweep as (
    select ran_at, redacted_count
      from public.ai_runs_retention_sweeps
     order by ran_at desc
     limit 1
  ),
  recent as (
    select count(*)::int as n
      from public.ai_runs_retention_sweeps
     where ran_at > now() - interval '30 days'
  ),
  job as (
    select count(*) > 0 as scheduled
      from cron.job
     where jobname = 'ai-runs-retention-daily'
  ),
  failure as (
    select max(d.end_time) as at
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where j.jobname = 'ai-runs-retention-daily'
       and d.status <> 'succeeded'
  )
  select
    (select ran_at from last_sweep),
    (select redacted_count from last_sweep),
    (select n from recent),
    (select scheduled from job),
    (select at from failure),
    -- Healthy only on POSITIVE evidence: a completed sweep, recent enough,
    -- with no failed run after it. Any NULL collapses this to false.
    coalesce(
      (select scheduled from job)
      and (select ran_at from last_sweep) > now() - interval '48 hours'
      and (
        (select at from failure) is null
        or (select at from failure) < (select ran_at from last_sweep)
      ),
      false
    );
$$;

comment on function public.ai_runs_retention_health() is
  'W14 item 6: is retention actually running? Reads BOTH the completed-sweep table and cron.job_run_details. `healthy` is true only on positive evidence — a completed sweep within 48h and no failed cron run after it. NULL/absent evidence is never healthy.';

revoke all on function public.ai_runs_retention_health() from public;
revoke all on function public.ai_runs_retention_health() from anon;
grant execute on function public.ai_runs_retention_health() to authenticated;
grant execute on function public.ai_runs_retention_health() to service_role;

-- ── The schedule itself ────────────────────────────────────────────────────
-- Idempotent: unschedule-if-present, then schedule. `cron.schedule` upserts by
-- name on pg_cron >= 1.4, but the explicit unschedule keeps re-apply clean on
-- any version and makes the intent readable.
do $$
begin
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'ai-runs-retention-daily') then
    perform cron.unschedule('ai-runs-retention-daily');
  end if;
  perform cron.schedule(
    'ai-runs-retention-daily',
    '17 3 * * *',
    $job$select public.run_ai_runs_retention_sweep()$job$
  );
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/)
--
--   begin;
--   do $$ begin
--     if exists (select 1 from cron.job where jobname = 'ai-runs-retention-daily') then
--       perform cron.unschedule('ai-runs-retention-daily');
--     end if;
--   end $$;
--   drop function if exists public.ai_runs_retention_health();
--   drop function if exists public.run_ai_runs_retention_sweep();
--   drop table if exists public.ai_runs_retention_sweeps;
--   commit;
--
-- `pg_cron` is deliberately NOT dropped: dropping a shared extension is never
-- part of a feature rollback, and an installed-but-unscheduled extension is
-- inert. Rows already redacted stay redacted — a rollback cannot resurrect
-- content that was deliberately destroyed.
-- ════════════════════════════════════════════════════════════════════════════
