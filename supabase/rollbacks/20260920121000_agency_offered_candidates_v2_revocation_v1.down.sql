-- DOWN for 20260920121000_agency_offered_candidates_v2_revocation_v1
-- Restores list_agency_offered_candidates_for_request_v2 VERBATIM as applied
-- by 20260903101000_agency_candidate_offer_decision_v1.sql (the body live on
-- production when this draft was authored, 2026-09-20): no active-connection
-- / active-share joins. Same signature, same STABLE SECURITY DEFINER +
-- search_path. Grants are not touched in either direction (`create or
-- replace` keeps the ACL: EXECUTE for authenticated only). No data is touched.
-- WARNING: rolling back REOPENS the ARCH-4 exposure — a severed client
-- regains read of the agency's accepted / declined offers (note + worker_id)
-- through the function the app prefers.

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
   where o.request_id = p_request_id
     and o.status <> 'withdrawn'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by (o.status = 'offered') desc, o.created_at desc
   limit 100;
$$;
