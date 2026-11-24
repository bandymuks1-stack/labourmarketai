-- ============================================================================
-- W14 item 6 SCHEDULER — PROOF HARNESS PRELUDE.
--
-- Builds the real `ai_runs` append-only posture, the real 20260808130000
-- retention capability, and a FAITHFUL pg_cron SHIM, so that
--   supabase/migrations/20260808140000_ai_runs_retention_schedule_v1.sql
--   supabase/rollbacks/20260808140000_ai_runs_retention_schedule_v1.down.sql
-- can be executed against a throwaway Postgres 15 instance.
--
-- ── THE ONE DEVIATION, STATED LOUDLY ───────────────────────────────────────
--
-- `create extension if not exists pg_cron` CANNOT run on a stock postgres:15
-- container: pg_cron needs `shared_preload_libraries`, and there is no way to
-- fake a row in `pg_extension`. The runner therefore strips EXACTLY that one
-- line and prints it, so the deviation is visible rather than buried. Every
-- other statement in the migration — the telemetry table, its RLS and grants,
-- the definer wrapper, the health function, the grants/revokes, and the
-- `cron.schedule` call itself — executes verbatim against the shim.
--
-- The shim below is shaped from pg_cron's real catalog (`cron.job`,
-- `cron.job_run_details`, `cron.schedule(name, schedule, command)`,
-- `cron.unschedule(name)`), which is what the migration and the health
-- function actually read. Whether the real extension installs and fires is a
-- PRODUCTION fact and is verified there, against `cron.job`, after apply —
-- never inferred from this harness.
--
-- Throwaway only. Never point this at production or at a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid; $$;
grant usage on schema auth to authenticated, anon, service_role;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_admin', true), ''), 'false')::boolean;
$$;
grant execute on function public.is_admin() to authenticated, anon, service_role;

create table if not exists public.profiles (id uuid primary key default gen_random_uuid());

-- ── ai_runs: real 20260714150000 shape + append-only grants ────────────────
create table if not exists public.ai_runs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  task_type          text not null,
  provider           text not null,
  model_alias        text not null,
  output_excerpt     text check (char_length(output_excerpt) <= 4000),
  route_reason       text,
  input_tokens       int,
  output_tokens      int,
  actual_cost_usd    numeric,
  estimated_cost_usd numeric,
  profile_id         uuid references public.profiles(id) on delete set null
);
alter table public.ai_runs enable row level security;
drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs for select to authenticated using (public.is_admin());
revoke all on public.ai_runs from anon;
grant select on public.ai_runs to authenticated;
revoke insert, update, delete on public.ai_runs from authenticated;
grant select, insert on public.ai_runs to service_role;
revoke update, delete on public.ai_runs from service_role;

-- ── The real 20260808130000 capability (copied verbatim from that file) ────
create or replace function public.ai_runs_retention_days()
returns integer language sql immutable set search_path = public as $$ select 90 $$;

create or replace function public.redact_expired_ai_run_content(
  p_retention_days integer default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_days  integer := coalesce(p_retention_days, public.ai_runs_retention_days());
  v_count integer;
begin
  if v_days < public.ai_runs_retention_days() then
    raise exception
      'retention window may not be shortened below the approved % days',
      public.ai_runs_retention_days()
      using errcode = '22023';
  end if;
  update public.ai_runs set output_excerpt = null
   where created_at < now() - make_interval(days => v_days)
     and output_excerpt is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.redact_expired_ai_run_content(integer) from public, anon, authenticated;
grant execute on function public.redact_expired_ai_run_content(integer) to service_role;
revoke all on function public.ai_runs_retention_days() from public, anon;
grant execute on function public.ai_runs_retention_days() to authenticated, service_role;

-- ── pg_cron SHIM (see the header: the real extension cannot load here) ─────
create schema if not exists cron;

create table if not exists cron.job (
  jobid    bigserial primary key,
  schedule text not null,
  command  text not null,
  jobname  text unique
);

create table if not exists cron.job_run_details (
  runid    bigserial primary key,
  jobid    bigint not null,
  status   text not null,
  return_message text,
  end_time timestamptz not null default now()
);

create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  insert into cron.job (schedule, command, jobname)
  values (p_schedule, p_command, p_name)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v_id;
  return v_id;
end $$;

create or replace function cron.unschedule(p_name text)
returns boolean language plpgsql as $$
begin
  delete from cron.job where jobname = p_name;
  return found;
end $$;
