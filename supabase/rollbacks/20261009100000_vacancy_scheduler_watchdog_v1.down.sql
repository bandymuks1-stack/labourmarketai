-- ROLLBACK for 20261009100000_vacancy_scheduler_watchdog_v1.sql
-- Only the watchdog's own objects; pg_net / pg_cron are shared and not dropped.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'vacancy-scheduler-watchdog-5min') then
    perform cron.unschedule('vacancy-scheduler-watchdog-5min');
  end if;
end;
$$;
drop function if exists public.vacancy_scheduler_watchdog_v1();
drop table if exists public.vacancy_scheduler_events;
drop table if exists public.vacancy_scheduler_state;
drop table if exists public.vacancy_scheduler_policy;
