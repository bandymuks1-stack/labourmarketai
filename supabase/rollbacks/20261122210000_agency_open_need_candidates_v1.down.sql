-- Rollback of 20261122210000_agency_open_need_candidates_v1.
-- Refuses while any candidate row exists: a candidate an agency proposed (and
-- possibly one a client chose, which started a booking) is a fact people acted
-- on — forward-fix instead. The connections, shares, candidate offers and
-- bookings a selection created are the EXISTING tables' own rows and are not
-- touched here. Otherwise drops the five functions, the registry rows and the
-- table. No existing function, policy or grant was changed, so none is restored.

begin;

do $$
begin
  if exists (select 1 from public.team_demand_offer_candidates) then
    raise exception 'offer candidates exist - forward-fix, do not roll back';
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'team_demand_offer_candidates';
  end if;
end $$;

drop function if exists public.select_offer_candidate_v1(uuid, text);
drop function if exists public.list_offer_candidates_v1(uuid);
drop function if exists public.withdraw_offer_candidate_v1(uuid);
drop function if exists public.add_offer_candidate_v1(uuid, uuid);
drop function if exists public.offer_agency_company_v1(uuid);
drop table if exists public.team_demand_offer_candidates;

commit;
