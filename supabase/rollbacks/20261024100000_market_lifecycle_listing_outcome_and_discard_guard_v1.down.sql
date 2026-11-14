-- Rollback of 20261024100000 (listing closed outcome + discarded-draft guards).
-- Removes only this migration's own objects: the two triggers, their functions
-- and v3. customer_requests_status_transition_guard is not touched (it was
-- never replaced; 20261109120000 owns its current body).
-- The listing outcome column is dropped only while no outcome is recorded:
-- erasing why a listing closed is not a rollback step. Once outcomes exist the
-- column and its CHECK stay (harmless without v3: the app falls back to v2).
begin;

drop trigger if exists customer_requests_discarded_draft_guard_trg on public.customer_requests;
drop function if exists public.customer_requests_discarded_draft_guard();

drop trigger if exists marketplace_listings_discarded_guard_trg on public.marketplace_listings;
drop function if exists public.marketplace_listings_discarded_guard();

drop function if exists public.set_marketplace_listing_status_v3(uuid, text, text);

do $$
begin
  if exists (select 1 from public.marketplace_listings where closed_outcome is not null) then
    raise notice 'marketplace_listings.closed_outcome kept: listing outcomes are recorded';
  else
    alter table public.marketplace_listings
      drop constraint if exists marketplace_listings_closed_outcome_check;
    alter table public.marketplace_listings
      drop column if exists closed_outcome;
  end if;
end $$;

commit;
