-- Rollback for 20260805090100_worker_display_name_backfill_v1.sql
--
-- Restores the exact BEFORE values (including NULL) for exactly the rows the
-- forward backfill changed, using the reversal ledger
-- `public.worker_display_name_backfill_20260805` that the forward migration
-- wrote from the pre-update rows. No other row is touched.
--
-- WHAT ROLLING BACK COSTS: the repaired rows return to NULL display names, so
-- employer-facing rosters fall back again (down to a raw UUID fragment in
-- `listProjectAssignments`). The pre-backfill state is the broken one.
--
-- WHAT ROLLING BACK DOES NOT DO: it does not touch rows the backfill never
-- changed, and it does not touch names written by the repaired write path
-- after the backfill ran (guarded below: a row is only restored while its
-- CURRENT value still equals the ledger's AFTER value — if the person has
-- since re-onboarded and corrected their name, that newer name wins and the
-- ledger row is left in place for audit).
--
-- The ledger table itself is intentionally NOT dropped here: it is the only
-- audit record of what the backfill did. Drop it in a separate, deliberate
-- statement once the episode is closed:
--   drop table public.worker_display_name_backfill_20260805;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name = 'worker_display_name_backfill_20260805'
  ) then
    raise exception
      'reversal ledger worker_display_name_backfill_20260805 not found — '
      'nothing to roll back (was the forward backfill ever applied?)';
  end if;
end $$;

-- Before counts, for the operator applying this.
do $$
declare
  restorable bigint;
begin
  select count(*) into restorable
    from public.workers w
    join public.worker_display_name_backfill_20260805 l
      on l.profile_id = w.profile_id
   where w.display_name is not distinct from l.display_name_after
      or w.current_location_country
           is not distinct from l.location_country_after;
  raise notice 'ROLLBACK BEFORE: ledger-matched rows restorable=%', restorable;
end $$;

-- Column-independent restore: each column is only reverted while its CURRENT
-- value still equals the ledger''s AFTER value for that column; a value the
-- person has since changed through the repaired write path is preserved.
update public.workers w
   set display_name =
         case when w.display_name is not distinct from l.display_name_after
              then l.display_name_before
              else w.display_name end,
       current_location_country =
         case when w.current_location_country
                     is not distinct from l.location_country_after
              then l.location_country_before
              else w.current_location_country end,
       -- public.workers has no set_updated_at trigger; set it by hand.
       updated_at = now()
  from public.worker_display_name_backfill_20260805 l
 where l.profile_id = w.profile_id
   and (w.display_name is not distinct from l.display_name_after
        or w.current_location_country
             is not distinct from l.location_country_after)
   -- Skip rows that are already fully back to their BEFORE state (re-run
   -- safety: a second application touches nothing).
   and (w.display_name is distinct from l.display_name_before
        or w.current_location_country
             is distinct from l.location_country_before);

do $$
declare
  still_after bigint;
begin
  select count(*) into still_after
    from public.workers w
    join public.worker_display_name_backfill_20260805 l
      on l.profile_id = w.profile_id
   where w.display_name is not distinct from l.display_name_after
     and w.display_name is distinct from l.display_name_before;
  raise notice 'ROLLBACK AFTER: rows still carrying the backfilled name=% '
    '(0 expected unless before=after for that row)', still_after;
end $$;
