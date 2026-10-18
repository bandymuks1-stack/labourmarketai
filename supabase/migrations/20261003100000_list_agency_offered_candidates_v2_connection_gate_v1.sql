-- @human-gate-approved
-- ============================================================================
-- DRAFT -- needs-human-gate -- DO NOT APPLY automatically.
-- RED class: SECURITY DEFINER disclosure function. Draft PR + owner approval;
-- prod apply stays MANUAL via Supabase MCP `apply_migration`. Never `db push`.
-- ============================================================================
--
-- list_agency_offered_candidates_for_request_v2 -- connection/share gate (#1815 successor)
--
-- DEFECT (confirmed on production): the L1 fix in
-- 20260901052300_agency_disclosure_revocation_v1 gated
-- list_agency_offered_candidates_for_request_v1 on
-- `connection.status = 'active' and share.status = 'active'`. The v2 function
-- added later by 20260903101000_agency_candidate_offer_decision_v1 (and the
-- one apps/web/lib/agency/bridge-read.ts prefers) was written WITHOUT that
-- gate. After the agency/client connection is revoked, or the request share is
-- revoked, the client still reads every non-withdrawn offer (offered, accepted
-- and declined): candidate worker_ids, agency name, note, booking_id.
--
-- FIX (minimal, forward-only): CREATE OR REPLACE v2 with the identical
-- signature, return shape, LANGUAGE sql STABLE, SECURITY DEFINER,
-- search_path=public, and ACL (authenticated only); the ONLY change is two
-- inner joins + two predicates copied verbatim from v1:
--     join agency_client_request_shares s on s.id = o.request_share_id
--     join agency_client_connections    c on c.id = o.connection_id
--     and c.status = 'active' and s.status = 'active'
-- request_share_id / connection_id are NOT NULL on the table, so the inner
-- joins drop no row that was legitimately visible. The caller-owns-the-demand
-- predicate, the `status <> 'withdrawn'` filter and the ordering are unchanged.
--
-- SEMANTICS: revoke/unshare removes FUTURE read access. No row is modified or
-- deleted; offers, decisions, bookings, audit and event rows are untouched
-- (decided offers remain stored; they are simply not disclosed through this
-- read while the authorizing connection/share is not active).
--
-- ROLLBACK: supabase/rollbacks/20261003100000_list_agency_offered_candidates_v2_connection_gate_v1.down.sql
--   (restores the exact pre-image, i.e. the ungated production definition).
-- ============================================================================

create or replace function public.list_agency_offered_candidates_for_request_v2(p_request_id uuid)
returns table (
  offer_id     uuid,
  worker_id    uuid,
  agency_name  text,
  note         text,
  offer_status text,
  booking_id   uuid,
  decided_at   timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note,
         o.status, o.booking_id, o.decided_at, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
    join public.agency_client_request_shares s on s.id = o.request_share_id
    join public.agency_client_connections c on c.id = o.connection_id
   where o.request_id = p_request_id
     and o.status <> 'withdrawn'
     and c.status = 'active'
     and s.status = 'active'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by (o.status = 'offered') desc, o.created_at desc
   limit 100;
$$;

-- Grant hygiene (re-assert; create or replace keeps the ACL).
revoke execute on function public.list_agency_offered_candidates_for_request_v2(uuid) from public, anon;
grant execute on function public.list_agency_offered_candidates_for_request_v2(uuid) to authenticated;
