-- @human-gate-approved  (owner-approved 2026-10-12 in chat; APPLIED)
-- team_offer_thread_party_v1 — who the OTHER side of a brigade / organization
-- offer is, for the offer's own parties only (production walk 2026-10-12).
--
-- WHY. openTeamOfferConversationAction (#2289) resolved the counterpart with
-- the service-role client: the supplier read customer_requests.profile_id, the
-- receiver read team_demand_offers.offered_by, both read organizations. In
-- production service_role holds NO privilege on those tables (least privilege,
-- measured 2026-10-12), every read answered 42501, the counterpart was null and
-- the thread redirected to ?notice=cannot_open — for BOTH sides, since the day
-- it shipped. No negotiation conversation could ever open.
--
-- WHAT. One read, gated by team_offer_party_side_v1 (applied with
-- 20261011200000): a caller who is neither the offering organization's manager
-- nor the need's owner / demand-access holder gets ZERO rows. A party gets its
-- side, the offer status, the counterpart's profile id (the person the thread
-- is opened with — who becomes a participant anyway) and the offering
-- organization's display name as the thread subject. Nothing else.
--
-- No table, policy or grant on a table changes. service_role is not used.
--
-- -- ROLLBACK
-- drop function if exists public.team_offer_thread_party_v1(uuid);
-- (also: supabase/rollbacks/20261012110000_team_offer_thread_party_v1.down.sql)

begin;

create or replace function public.team_offer_thread_party_v1(p_offer_id uuid)
returns table (
  side                   text,
  offer_status           text,
  counterpart_profile_id uuid,
  subject                text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_side text;
  o      record;
begin
  if auth.uid() is null or p_offer_id is null then
    return;
  end if;
  v_side := public.team_offer_party_side_v1(p_offer_id);
  if v_side is null then
    return;
  end if;
  select t.status, t.offered_by, t.request_id, t.team_org_id into o
    from public.team_demand_offers t where t.id = p_offer_id;
  if not found then
    return;
  end if;
  return query
  select v_side,
         o.status,
         case when v_side = 'supplier'
              then (select cr.profile_id from public.customer_requests cr where cr.id = o.request_id)
              else o.offered_by
         end,
         (select nullif(btrim(g.display_name), '') from public.organizations g where g.id = o.team_org_id);
end;
$$;

revoke all on function public.team_offer_thread_party_v1(uuid) from public;
revoke all on function public.team_offer_thread_party_v1(uuid) from anon;
grant execute on function public.team_offer_thread_party_v1(uuid) to authenticated;

commit;
