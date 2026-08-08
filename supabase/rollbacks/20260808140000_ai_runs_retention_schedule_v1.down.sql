-- Rollback for 20260808140000_ai_runs_retention_schedule_v1.
--
-- Removes the schedule, the caller, the health read and the telemetry table.
--
-- `pg_cron` is deliberately NOT dropped: dropping a shared extension is never
-- part of a feature rollback, and an installed-but-unscheduled extension is
-- inert.
--
-- Rows already redacted stay redacted. A rollback cannot resurrect content that
-- was deliberately destroyed, and pretending otherwise would be the dishonest
-- part. Running this restores the KNOWN gap it closed: the retention capability
-- exists but nothing calls it, so `output_excerpt` past the 90-day horizon stays
-- readable until someone runs the function by hand.

begin;

-- The guard probes whether `cron.job` is REACHABLE, not whether `pg_extension`
-- holds a pg_cron row. Those are not the same question: the thing that would
-- error here is a missing relation, and an environment can have the job table
-- without the catalog row (a shimmed harness) or, after a manual
-- `drop extension`, the row without the table. Probing the relation is what
-- actually prevents the failure — and it is what makes this rollback do its
-- job rather than silently skip the unschedule. Caught by
-- scripts/db-proof/w14-retention-schedule.sh, which failed on exactly this.
do $$
begin
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'ai-runs-retention-daily') then
    perform cron.unschedule('ai-runs-retention-daily');
  end if;
end $$;

drop function if exists public.ai_runs_retention_health();
drop function if exists public.run_ai_runs_retention_sweep();
drop table if exists public.ai_runs_retention_sweeps;

commit;
