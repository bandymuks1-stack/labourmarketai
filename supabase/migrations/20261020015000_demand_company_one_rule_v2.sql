-- 20261020015000_demand_company_one_rule_v2
--
-- @human-gate-approved (acknowledgement: RED by SECURITY DEFINER-adjacent helper replace;
--   forward fix of 20261020010000 within the owner-approved #2531 scope)
--
-- Review finding on 20261020010000 (PR #2539): for a need WITHOUT an
-- organization the helper fell back to the poster's OLDEST company. The demand
-- spine treats organization_id NULL as personal / unattributed (a private
-- person's buyer_request draft is saved with NULL), so a person who owns a
-- company would see their PERSONAL need shown under — and gated by — an
-- unrelated company. Attribution must not be invented: NULL organization →
-- NULL company. The five callers then treat such a row exactly as "no
-- verified company" (not on the worker / team boards, contact gate closed),
-- which is what an unattributed row is.
--
-- Measured on production 2026-10-20: submitted board-kind needs with
-- organization_id NULL: 0 — no visible row changes. The helper keeps its
-- signature (p_profile_id unused) so none of the five callers is touched.
--
-- Rollback: supabase/rollbacks/20261020015000_demand_company_one_rule_v2.down.sql

begin;

create or replace function public.demand_company_id_v1(p_organization_id uuid, p_profile_id uuid)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  -- The need's OWN organization's company. No organization = no company:
  -- p_profile_id is deliberately unused (kept for the callers' signature).
  select o.legacy_company_id from public.organizations o where o.id = p_organization_id
$function$;

revoke all on function public.demand_company_id_v1(uuid, uuid) from public, anon, authenticated;

commit;
