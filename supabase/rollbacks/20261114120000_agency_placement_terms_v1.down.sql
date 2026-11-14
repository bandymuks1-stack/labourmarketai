-- Rollback for 20261114120000_agency_placement_terms_v1.
--
-- One transaction. It REFUSES while any agency term, suggestion row or
-- accepted-term record exists: dropping them would erase which commercial
-- term an employer accepted on a hire decision. Roster rows created by
-- join_suggested_agency_v1 are ordinary company_workers rows and are left
-- untouched (the worker withdraws through end_roster_link_v1 as before).
begin;

do $$
declare
  n_terms bigint;
  n_sugg  bigint;
  n_acc   bigint;
begin
  select count(*) into n_terms from public.agency_placement_terms;
  select count(*) into n_sugg from public.platform_suggested_agencies;
  select count(*) into n_acc from public.agency_candidate_offers where accepted_placement_term_id is not null;
  if n_terms > 0 or n_sugg > 0 or n_acc > 0 then
    raise exception
      'ROLLBACK REFUSED: % placement term(s), % suggestion row(s), % accepted-term record(s) exist.',
      n_terms, n_sugg, n_acc;
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where table_name in ('agency_placement_terms', 'platform_suggested_agencies');
  end if;
end $$;

drop function if exists public.join_suggested_agency_v1(uuid, text);
drop function if exists public.list_agency_suggestions_for_me_v1();
drop function if exists public.respond_agency_candidate_offer_v2(uuid, text, text, uuid);
drop function if exists public.retire_agency_placement_term_v1(uuid);
drop function if exists public.set_agency_placement_term_v1(uuid, numeric, text, text, text, text);

-- The terms policy reads the offers column: it goes first.
drop policy if exists agency_placement_terms_select on public.agency_placement_terms;

alter table public.agency_candidate_offers
  drop column if exists placement_term_accepted_at,
  drop column if exists accepted_placement_term_id;

drop policy if exists platform_suggested_agencies_admin on public.platform_suggested_agencies;
drop table if exists public.platform_suggested_agencies;

drop index if exists public.agency_placement_terms_one_current;
drop table if exists public.agency_placement_terms;

commit;
