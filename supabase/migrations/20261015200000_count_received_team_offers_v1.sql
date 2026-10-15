-- 20261015200000 — count_received_team_offers_v1: one read instead of N
--
-- WHY (production, 2026-10-15): the notification spine renders on EVERY
-- dashboard page. For an employer/manager/agency workspace it counted the team
-- / brigade offers waiting on the company's open needs by calling
-- list_team_offers_for_request_v2 ONCE PER NEED (up to 20 calls per page view;
-- 2,485 calls/day, ~227 ms average, busiest minutes 60-115 calls). Each call
-- also builds per-offer skill / language / member aggregates the badge never
-- uses. The P0 latency cause measured the same day is PostgREST pool
-- queueing (#2415): a page's fan-out of requests is what makes it slow.
--
-- WHAT: one SECURITY DEFINER count over the same rows with the SAME receiver
-- rule (public.team_offer_receiver_v1 per request — the check
-- list_team_offers_for_request_v1/v2 apply) and the SAME filter the app
-- applied (status = 'offered', joined to the offering organization). Returns
-- (request_id, offered) only — no team identity, no member data, nothing the
-- v2 read does not already give the same caller.
--
-- PARITY (production, rolled back): QA owner with two synthetic offered
-- offers + one declined on its own needs: old N-call sum 2, new 2; a worker
-- without access: 0 / 0; anon refused EXECUTE. QA cast without offers: 0 / 0
-- (old 3 calls 138 ms → new 0.5 ms).
--
-- At most 20 request ids are considered (the app's OPEN_TEAM_OFFER_SCAN_LIMIT).
-- EXECUTE for `authenticated` only (anon/public revoked).
--
-- @human-gate-approved  (acknowledgement only: PR is DRAFT + needs-human-gate; prod apply waits for the owner)
--
-- UNDO: supabase/rollbacks/20261015200000_count_received_team_offers_v1.down.sql

create or replace function public.count_received_team_offers_v1(p_request_ids uuid[])
returns table (request_id uuid, offered integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.request_id, count(*)::integer
    from public.team_demand_offers o
    join public.organizations g on g.id = o.team_org_id
   where auth.uid() is not null
     and o.request_id = any (p_request_ids[1:20])
     and o.status = 'offered'
     and public.team_offer_receiver_v1(o.request_id)
   group by o.request_id
$$;

revoke all on function public.count_received_team_offers_v1(uuid[]) from public, anon;
grant execute on function public.count_received_team_offers_v1(uuid[]) to authenticated;

comment on function public.count_received_team_offers_v1(uuid[]) is
  'Receiver-side count of offered team/organization offers per request (same rule as list_team_offers_for_request_v2), for the notification spine (2026-10-15).';
