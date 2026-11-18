-- Rollback of 20261003150800_ai_runs_retention_classes_v2.
-- Restores the LIVE one-column sweep (verified via pg_get_functiondef,
-- 2026-10-04). Rows whose profile_id was already nulled stay null: retention is
-- one-way and a rollback must not pretend it can resurrect an attribution.

begin;

drop trigger if exists ai_runs_enforce_retention_classes on public.ai_runs;
drop function if exists public.ai_runs_enforce_retention_classes();
drop function if exists public.privacy_export_ai_runs_subject_v1();
drop function if exists public.ai_runs_delink_subject(uuid);

create or replace function public.redact_expired_ai_run_content(
  p_retention_days integer default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

  update public.ai_runs
     set output_excerpt = null
   where created_at < now() - make_interval(days => v_days)
     and output_excerpt is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.redact_expired_ai_run_content(integer) is
  'W14 item 6 (owner decision D1, REDACT-NOT-DELETE): nulls ai_runs.output_excerpt on rows older than the retention horizon. Touches no other column and deletes no row. Idempotent. Returns rows redacted.';

revoke all on function public.redact_expired_ai_run_content(integer) from public;
revoke all on function public.redact_expired_ai_run_content(integer) from anon;
revoke all on function public.redact_expired_ai_run_content(integer) from authenticated;
grant execute on function public.redact_expired_ai_run_content(integer) to service_role;

-- Dropped last: nothing above depends on it, and the policy function is the
-- registry the new objects read.
drop function if exists public.ai_runs_retention_policy();

commit;
