-- Rollback of 20261122200000_company_offer_to_work_v1.
-- Refuses while the new columns hold anything (a confirmation, a place, a
-- named crew): those are agreements people made and must not vanish — then
-- forward-fix instead. Otherwise drops the eight new functions and the columns.
-- No existing function, policy or grant was changed, so none is restored.

begin;

do $$
begin
  if exists (select 1 from public.team_demand_offers where unit_team_org_id is not null) then
    raise exception 'named crews exist - forward-fix, do not roll back';
  end if;
  if exists (select 1 from public.team_demand_offer_terms
              where place_text is not null
                 or supplier_confirmed_at is not null or receiver_confirmed_at is not null) then
    raise exception 'confirmed terms or places exist - forward-fix, do not roll back';
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'team_demand_offer_terms'
       and column_name in ('supplier_confirmed_by', 'receiver_confirmed_by');
  end if;
end $$;

drop function if exists public.hand_off_team_demand_offer_v2(uuid, uuid, uuid, uuid);
drop function if exists public.team_demand_offer_progress_v1(uuid);
drop function if exists public.name_team_demand_offer_unit_v1(uuid, uuid);
drop function if exists public.list_offer_crew_options_v1(uuid);
drop function if exists public.offer_crew_eligible_v1(uuid, uuid);
drop function if exists public.confirm_team_demand_offer_terms_v1(uuid, integer);
drop function if exists public.list_team_demand_offer_terms_v2(uuid);
drop function if exists public.propose_team_demand_offer_terms_v2(uuid, integer, text, date, date, text, text, text);

alter table public.team_demand_offer_terms
  drop column if exists receiver_confirmed_by,
  drop column if exists receiver_confirmed_at,
  drop column if exists supplier_confirmed_by,
  drop column if exists supplier_confirmed_at,
  drop column if exists place_text;
alter table public.team_demand_offers
  drop column if exists unit_team_org_id;

commit;
