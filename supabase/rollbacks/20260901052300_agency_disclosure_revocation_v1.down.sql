-- Rollback for 20260901052300_agency_disclosure_revocation_v1.sql.
-- Restores the three function definitions and the agency_candidate_offers
-- SELECT policy EXACTLY as applied by
-- 20260723180000_agency_real_client_bridge_v1.sql (verbatim copies).
-- WARNING: rolling back REOPENS the L1 defect (severed clients regain read of
-- the agency's candidate worker_ids + notes). Offers already flipped to
-- 'withdrawn' by a revoke are NOT flipped back (that history is real).

begin;

-- ── original list_agency_offered_candidates_for_request_v1 (no active gates) ─
create or replace function public.list_agency_offered_candidates_for_request_v1(p_request_id uuid)
returns table (
  offer_id     uuid,
  worker_id    uuid,
  agency_name  text,
  note         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
   where o.request_id = p_request_id
     and o.status = 'offered'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by o.created_at desc
   limit 100;
$$;

-- ── original list_agency_offer_progress_v1 (no active gates) ────────────────
create or replace function public.list_agency_offer_progress_v1()
returns table (
  offer_id     uuid,
  request_id   uuid,
  worker_id    uuid,
  offer_status text,
  review_stage text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.request_id, o.worker_id, o.status,
    case
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'accepted') then 'accepted'
      when exists (select 1 from public.booking_requests b
                    where b.request_id = o.request_id and b.worker_id = o.worker_id
                      and b.status = 'proposed') then 'booking_started'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)
                      and d.status = 'not_fit') then 'rejected'
      when exists (select 1 from public.conversations cv
                    join public.workers w on w.id = o.worker_id
                    join public.conversation_participants cp
                      on cp.conversation_id = cv.id and cp.profile_id = w.profile_id
                    where cv.source_type = 'scouting' and cv.source_id = o.request_id) then 'contacted'
      when exists (select 1 from public.demand_shortlist d
                    where d.request_id = o.request_id and d.worker_id = o.worker_id
                      and d.owner_id = (select r.profile_id from public.customer_requests r where r.id = o.request_id)) then 'reviewed'
      else 'offered'
    end as review_stage,
    o.created_at
    from public.agency_candidate_offers o
   where public.owns_company(o.agency_company_id)  -- caller = agency owner
   order by o.created_at desc
   limit 200;
$$;

-- ── original revoke_agency_client_connection_v1 (no offer withdrawal) ───────
create or replace function public.revoke_agency_client_connection_v1(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Either side (agency owner or client owner) may revoke a pending/active link.
  -- Soft revoke: history is kept; shares/offers stay in the audit but the
  -- revoked connection grants no new rights (share/offer RPCs re-check 'active').
  update public.agency_client_connections c
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where c.id = p_connection_id
     and c.status in ('pending', 'active')
     and (public.owns_company(c.agency_company_id)
          or (c.client_company_id is not null and public.owns_company(c.client_company_id)));
  get diagnostics v_upd = row_count;
  if v_upd = 0 then return 'not_found'; end if;
  -- Revoking also revokes the client's active shares on this connection
  -- (no new candidate can be offered once the link is gone).
  update public.agency_client_request_shares
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where connection_id = p_connection_id and status = 'active';
  return 'revoked';
end;
$$;

-- ── original agency_candidate_offers_select (unconditional client read) ─────
drop policy if exists agency_candidate_offers_select on public.agency_candidate_offers;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(agency_company_id)
    or public.owns_company(client_company_id)
    or public.is_admin()
  );

-- ── grant hygiene (same as the bridge migration) ────────────────────────────
revoke all on function public.list_agency_offered_candidates_for_request_v1(uuid) from public;
revoke all on function public.list_agency_offered_candidates_for_request_v1(uuid) from anon;
grant execute on function public.list_agency_offered_candidates_for_request_v1(uuid) to authenticated;
revoke all on function public.list_agency_offer_progress_v1() from public;
revoke all on function public.list_agency_offer_progress_v1() from anon;
grant execute on function public.list_agency_offer_progress_v1() to authenticated;
revoke all on function public.revoke_agency_client_connection_v1(uuid) from public;
revoke all on function public.revoke_agency_client_connection_v1(uuid) from anon;
grant execute on function public.revoke_agency_client_connection_v1(uuid) to authenticated;

commit;
