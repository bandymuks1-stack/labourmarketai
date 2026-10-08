-- ROLLBACK for 20261007150000_team_demand_offer_v1.sql
--
-- REFUSES while ANY team_demand_offers row exists: those rows are real
-- decision history (who offered which unit to which demand, and what the
-- receiver answered). After real use the correct move is a FORWARD FIX.
--
-- With zero rows it removes exactly what the migration added and nothing
-- else. The forward migration touched no existing function, policy, grant,
-- column or constraint, so there is nothing to restore. team_assignments rows
-- created through hand-off are NOT touched (they are ordinary assignments and
-- end through end_team_assignment_v1).

begin;

do $$
declare
  n bigint;
begin
  if to_regclass('public.team_demand_offers') is not null then
    execute 'select count(*) from public.team_demand_offers' into n;
    if n > 0 then
      raise exception
        'team_demand_offer rollback refused: % row(s) of offer history exist - forward-fix instead', n;
    end if;
  end if;
end $$;

drop function if exists public.hand_off_team_demand_offer_v1(uuid, uuid, uuid, uuid);
drop function if exists public.respond_team_demand_offer_v1(uuid, text);
drop function if exists public.list_team_offers_for_request_v1(uuid);
drop function if exists public.list_team_demand_offers_for_team_v1(uuid);
drop function if exists public.withdraw_team_demand_offer_v1(uuid);
drop function if exists public.offer_team_to_demand_v1(uuid, uuid, text);
drop function if exists public.list_open_demand_for_team_offer_v1(uuid);
drop function if exists public.team_offer_receiver_v1(uuid);

drop policy if exists team_demand_offers_select_v1 on public.team_demand_offers;
drop index if exists public.team_demand_offers_one_open_v1;
drop index if exists public.team_demand_offers_request_idx;
drop index if exists public.team_demand_offers_team_idx;
drop table if exists public.team_demand_offers;

commit;
