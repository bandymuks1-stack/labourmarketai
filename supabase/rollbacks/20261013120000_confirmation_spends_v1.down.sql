-- ROLLBACK of 20261013120000_confirmation_spends_v1.sql
--
-- Safe at any time: rows are spent-token digests that expire with their
-- tokens (5 minutes). Dropping the table returns the dispatcher to
-- fingerprint-only replay protection (it degrades on 42P01, never fails open
-- silently — see lib/conversation/confirmation-spend.ts).

begin;

do $$
begin
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'confirmation-spends-purge-daily') then
    perform cron.unschedule('confirmation-spends-purge-daily');
  end if;
end $$;

drop table if exists public.confirmation_spends;

commit;
