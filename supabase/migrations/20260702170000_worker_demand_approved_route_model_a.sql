-- @human-gate-approved
-- 20260702170000 — Approved-route Model A: route VERIFIED company demand to
-- workers (owner decision 2026-07-02: "approved-route model = A").
--
-- Problem (finding F-E1): list_open_demand_for_workers() (20260614120000,
-- applied) returns no approval signal, so the app's default-closed gate
-- (isApprovedRouteRow) blocks every row — no worker ever sees any demand.
--
-- Model A: reuse companies.verification_status = 'verified' as the approved
-- supply route. 'verified' is admin-only reachable (CHECK ladder
-- 20260604140000 + defense-in-depth trigger 20260604120000 + admin RPC
-- 20260604130000), so this join is a genuine, admin-controlled gate.
-- NO new column, NO new approval system (model B explicitly rejected).
--
-- The function is dropped + recreated because the return table gains two
-- curated columns the already-shipped board reads by name:
--   company_name — the VERIFIED company's display/legal name (safe to show
--                  precisely because it is verified; never an unverified
--                  identity);
--   route_status — constant 'approved_direct_partner' (model A has exactly
--                  one route class; the app whitelist accepts it).
-- Everything else is unchanged: worker-only caller gate, structured-columns
-- projection (NEVER need_summary / notes / payload.role / location /
-- contacts / profile ids), accommodation enum whitelist, definer read with
-- pinned search_path, execute revoked from public and granted to
-- authenticated. customer_requests RLS stays untouched.
--
-- Owner-approved apply via Supabase MCP; rollback restores the previous
-- (applied) definition exactly.

begin;

drop function if exists public.list_open_demand_for_workers();

create or replace function public.list_open_demand_for_workers()
returns table (
  id            uuid,
  role_text     text,
  country       text,
  team_size     int,
  start_period  text,
  accommodation text,
  created_at    timestamptz,
  company_name  text,
  route_status  text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker → empty, never an error surface
  end if;

  return query
  select cr.id,
         -- Structured columns ONLY — never the free-text title / need_summary /
         -- notes, never payload.role, never payload.location.
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         case
           when cr.payload ->> 'accommodation' in (
             'provided_free', 'provided_paid', 'provided_deducted',
             'not_provided', 'yes', 'no', 'unknown'
           ) then cr.payload ->> 'accommodation'
           else null
         end as accommodation,
         cr.created_at,
         -- Model A: identity of the VERIFIED company only. Coalesce of the
         -- trimmed display/legal name; NULL never leaks anything.
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'   -- the approval gate (model A)
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_workers() from public;
grant execute on function
  public.list_open_demand_for_workers() to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260702170000_worker_demand_approved_route_model_a.down.sql
-- restores the exact 20260614120000 definition (no approval columns).
