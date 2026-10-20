-- ============================================================================
-- team_offer_agree_seen_terms_v1 — "Agree to vN" agrees to vN, or to nothing
-- (audit 2026-10-20, HIGH, B2B).
--
-- respond_team_demand_offer_v1 accepts whichever terms row is `proposed` at
-- the moment it runs; no version reaches it. The buyer reads v2, the supplier
-- posts v3 with a higher rate, the buyer clicks "Agree" — and v3 is recorded
-- as accepted. An agreement the person never saw.
--
-- Change: respond_team_demand_offer_v2(p_offer_id, p_decision,
-- p_expected_version). After the same party check v1 makes, an ACCEPT locks
-- the currently proposed terms row and refuses with `terms_changed` (22023)
-- when its version is not the one the person agreed to (null = "no terms").
-- Then it hands over to v1 unchanged — every rule of v1 still applies, inside
-- the same transaction and lock. A DECLINE is never blocked. v1 stays for the
-- window between this apply and the app deploy.
--
-- SECURITY DEFINER, search_path public, auth.uid() required, EXECUTE for
-- authenticated only. No table, policy or data changes.
--
-- Rollback: supabase/rollbacks/20261020172000_team_offer_agree_seen_terms_v1.down.sql
-- ============================================================================

create or replace function public.respond_team_demand_offer_v2(
  p_offer_id uuid,
  p_decision text,
  p_expected_version integer
)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_current integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if public.team_offer_party_side_v1(p_offer_id) is null then
    raise exception 'Not authorized to answer this offer' using errcode = '42501';
  end if;
  if p_decision = 'accept' then
    select t.version into v_current
      from public.team_demand_offer_terms t
     where t.offer_id = p_offer_id and t.status = 'proposed'
     for update;
    if v_current is distinct from p_expected_version then
      raise exception 'terms_changed' using errcode = '22023';
    end if;
  end if;
  return public.respond_team_demand_offer_v1(p_offer_id, p_decision);
end;
$function$;

revoke all on function public.respond_team_demand_offer_v2(uuid, text, integer) from public, anon;
grant execute on function public.respond_team_demand_offer_v2(uuid, text, integer) to authenticated;
