-- 20261112213100 - team_offer_counterpart_v1: the OTHER party of a team offer,
-- resolved for the SERVER so the offer notifications (v12, 20261111230000)
-- reach a person (Swedish employer audit 2026-11-11, N-1).
--
-- WHY A FUNCTION AND NOT A GRANT. A team offer joins two organizations that
-- cannot read each other: the offering team cannot read the need's owner
-- (customer_requests RLS) and the answering company cannot read who offered
-- (team_demand_offers_select_v1 admits the team side only). The owner refused
-- service_role COLUMN grants for this (2026-11-12).
--
-- DECISION 0033 (R2 P2-1 on #3231, 2026-11-24). The counterpart's identity
-- must never reach the other side. So no signed-in user can call this:
-- EXECUTE goes to service_role only. The server action that wrote or answered
-- the offer passes the caller id it verified from the session (never browser
-- input) and the event it is notifying; the id that comes back addresses one
-- notification row server-side and is never returned to the browser, MCP or
-- chat.
--
-- THE GATE. One uuid, only for an event the offer's CURRENT state matches,
-- and only to the side that caused it:
--   * 'offered'   (status offered)    - caller manages / owns the TEAM
--                                      -> the need's owner;
--   * 'withdrawn' (status withdrawn)  - caller manages / owns the TEAM
--                                      -> the need's owner;
--   * 'accepted' / 'declined' (status equal) - caller is the need's owner or
--                                      has demand access to its organization
--                                      -> the person who offered.
--   Anything else (other event, other state, the wrong side, a caller on both
--   sides, a plain team member, an outsider, a NULL caller, an unknown offer)
--   -> NULL, never an error.
-- No table, no column, no policy, no data change.
--
-- The existing authority helpers (manages_organization, has_org_demand_access)
-- read auth.uid(). They are evaluated as the VERIFIED caller by setting the
-- request claims for the duration of the call; the previous claims are put
-- back before every return, so nothing leaks into the rest of the request.
--
-- GATE: RED (privilege surface: a new SECURITY DEFINER). Owner approval
-- before apply. Apply via Supabase MCP apply_migration only, never db push.
-- PROOF: scripts/db-proof/team-offer-counterpart-v1.sh (real PostgreSQL).
-- ROLLBACK: supabase/rollbacks/20261112213100_team_offer_counterpart_v1.down.sql
-- @human-gate-approved

begin;

create or replace function public.team_offer_counterpart_v1(
  p_offer_id uuid,
  p_caller   uuid,
  p_event    text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_team        uuid;
  v_request     uuid;
  v_offered     uuid;
  v_status      text;
  v_owner       uuid;
  v_org         uuid;
  v_team_side   boolean;
  v_demand_side boolean;
  v_result      uuid;
  v_prev_sub    text := current_setting('request.jwt.claim.sub', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
begin
  if p_caller is null or p_offer_id is null
     or p_event is null or p_event not in ('offered', 'withdrawn', 'accepted', 'declined') then
    return null;
  end if;

  select t.team_org_id, t.request_id, t.offered_by, t.status
    into v_team, v_request, v_offered, v_status
    from public.team_demand_offers t
   where t.id = p_offer_id;
  if v_team is null or v_status is distinct from p_event then
    return null;
  end if;

  select cr.profile_id, cr.organization_id
    into v_owner, v_org
    from public.customer_requests cr
   where cr.id = v_request;

  perform set_config('request.jwt.claim.sub', p_caller::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_caller::text, 'role', 'authenticated')::text, true);

  v_team_side := coalesce(public.manages_organization(v_team), false)
                 or exists (select 1 from public.organizations g
                             where g.id = v_team and g.owner_profile_id = p_caller);
  v_demand_side := coalesce(v_owner = p_caller, false)
                   or (v_org is not null and coalesce(public.has_org_demand_access(v_org), false));

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);

  if p_event in ('offered', 'withdrawn') and v_team_side and not v_demand_side then
    v_result := case when v_owner is distinct from p_caller then v_owner end;
  elsif p_event in ('accepted', 'declined') and v_demand_side and not v_team_side then
    v_result := case when v_offered is distinct from p_caller then v_offered end;
  end if;
  return v_result;
end
$function$;

revoke all on function public.team_offer_counterpart_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.team_offer_counterpart_v1(uuid, uuid, text) to service_role;

commit;
