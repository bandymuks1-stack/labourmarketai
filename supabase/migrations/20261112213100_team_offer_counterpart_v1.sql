-- 20261112213100 - team_offer_counterpart_v1: the OTHER party of a team offer,
-- to the party asking, so the offer notifications (v12, 20261111230000) reach
-- a person (Swedish employer audit 2026-11-11, N-1).
--
-- WHY A FUNCTION AND NOT A GRANT. A team offer joins two organizations that
-- cannot read each other: the offering team cannot read the need's owner
-- (customer_requests RLS) and the answering company cannot read who offered
-- (team_demand_offers_select_v1 admits the team side only). The owner refused
-- service_role column grants for this (2026-11-12); this gated SECURITY
-- DEFINER answers ONE uuid, and only to a party to the offer:
--   * a manager / owner of the TEAM organization  -> the need's owner;
--   * the need's owner, or a member with demand access to the need's
--     organization                                 -> the person who offered;
--   * anybody else, or an unknown offer            -> NULL (never an error
--     surface that would confirm the offer exists).
-- No table, no column, no policy, no data change. Read-only (STABLE).
--
-- GATE: RED (privilege surface: a new SECURITY DEFINER + EXECUTE to
-- authenticated). Owner approval before apply. Apply via Supabase MCP
-- apply_migration only, never db push.
-- ROLLBACK: supabase/rollbacks/20261112213100_team_offer_counterpart_v1.down.sql
-- @human-gate-approved

begin;

create or replace function public.team_offer_counterpart_v1(p_offer_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid        uuid := auth.uid();
  v_team     uuid;
  v_request  uuid;
  v_offered  uuid;
  v_owner    uuid;
  v_org      uuid;
begin
  if uid is null or p_offer_id is null then
    return null;
  end if;

  select t.team_org_id, t.request_id, t.offered_by
    into v_team, v_request, v_offered
    from public.team_demand_offers t
   where t.id = p_offer_id;
  if v_team is null then
    return null;
  end if;

  select cr.profile_id, cr.organization_id
    into v_owner, v_org
    from public.customer_requests cr
   where cr.id = v_request;

  -- The team side asks: who owns the need it offered itself to.
  if coalesce(public.manages_organization(v_team), false)
     or exists (select 1 from public.organizations g
                 where g.id = v_team and g.owner_profile_id = uid) then
    return case when v_owner is distinct from uid then v_owner end;
  end if;

  -- The demand side asks: who made the offer it is answering.
  if v_owner = uid
     or (v_org is not null and coalesce(public.has_org_demand_access(v_org), false)) then
    return case when v_offered is distinct from uid then v_offered end;
  end if;

  return null;
end
$function$;

revoke all on function public.team_offer_counterpart_v1(uuid) from public, anon;
grant execute on function public.team_offer_counterpart_v1(uuid) to authenticated;

commit;
