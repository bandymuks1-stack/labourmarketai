-- @human-gate-approved — owner approved PR #2596 (2026-10-21): Agree locks the offer before reading the version. Minimal rights,
-- unauthorized access and re-run safety checked in a rolled-back production test. Scope: this SQL only.
-- ============================================================================
-- team_offer_agree_lock_offer_v1 — "Agree" locks the OFFER before it reads the
-- proposed version (review of #2591, 2026-10-20).
--
-- respond_team_demand_offer_v2 (20261020172000) locked only the proposed terms
-- row. When the person agreed to an offer WITH NO terms, that read found no
-- row and took no lock: a concurrent propose_team_demand_offer_terms_v1 (which
-- locks the offer row first) could insert a new proposed version before v1
-- locked the offer, and v1 would accept that unseen version — the very race
-- v2 exists to prevent.
--
-- Change: v2 locks the offer row FOR UPDATE first — the proposal RPC's own
-- lock order — and only then reads and compares the proposed version. Every
-- other rule is unchanged (party check before anything, v1 for the rest).
-- SECURITY DEFINER, search_path public, EXECUTE for authenticated only.
--
-- Rollback: supabase/rollbacks/20261020174000_team_offer_agree_lock_offer_v1.down.sql
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
    -- the offer first (the proposal RPC's lock order), then its terms
    perform 1 from public.team_demand_offers o where o.id = p_offer_id for update;
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
