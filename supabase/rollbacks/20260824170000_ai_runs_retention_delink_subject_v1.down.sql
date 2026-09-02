-- ============================================================================
-- ROLLBACK for 20260824170000_ai_runs_retention_delink_subject_v1.sql
--
-- Restores the canonical function to its 20260808130000 body: one column
-- (`output_excerpt`), same 90-day floor, same guard, same grants. This is a
-- RESTORE, not a drop — dropping the function would take the whole retention
-- capability with it and leave the daily sweep
-- (`run_ai_runs_retention_sweep()`, cron job `ai-runs-retention-daily`)
-- calling something that no longer exists. The rollback of "the sweep clears
-- three columns" is "the sweep clears one", never "there is no sweep".
--
-- The body below is byte-identical to 20260808130000's, deliberately. If that
-- migration is ever re-issued this file must be re-diffed against it.
--
-- NOT restored, because it never changed: `ai_runs_retention_days()`, the
-- grants, and the append-only posture of `public.ai_runs`.
--
-- HONEST LIMIT: rows whose `profile_id` and `request_context` were already
-- cleared stay cleared. The FK is ON DELETE SET NULL and nothing shadows the
-- old value, so the linkage is gone for good. A rollback restores the RULE
-- going forward; it cannot resurrect an attribution that was deliberately
-- destroyed, and claiming otherwise would be the dishonest part of an "undo".
-- ============================================================================

begin;

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

commit;
