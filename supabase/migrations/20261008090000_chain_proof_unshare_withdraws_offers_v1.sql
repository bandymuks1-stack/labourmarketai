-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT. OWNER APPROVAL given in chat
-- 2026-10-08 (apply PR #2191). SECURITY DEFINER bodies + data DML => RED class.
-- Body verified in a rolled-back production transaction.
-- ============================================================================
-- 20261008090000 — chain-proof fixes v1: unshare withdraws live offers; clear
-- duplicate service request message.
--
-- FOUND BY a rolled-back production walk (2026-10-07, synthetic rows, zero
-- residue):
--
-- 1. unshare_request_v1 revoked the request share but left the agency's
--    'offered' candidate offers untouched. The client's own list
--    (list_agency_offered_candidates_for_request_v2) stopped showing them, but
--    the offer stayed live for the agency, and the client could still accept it
--    by calling respond_agency_candidate_offer_v1 directly. revoke_agency_client_
--    connection_v1 already withdraws offers; unshare now does the same, for the
--    offers that hang off THIS share only. Pure tightening - no access-control or
--    table change.
--
-- 2. request_service_offering surfaced the raw unique-index violation
--    (service_offering_requests_one_open_idx) when a buyer already had an open
--    request. It now raises a named message with the SAME errcode (23505) the
--    application already maps to its localized "duplicate" state, so the web
--    path is unchanged and a direct caller gets a readable reason.
--
-- 3. Defence in depth: respond_agency_candidate_offer_v1 now also refuses
--    (offer_not_open, same errcode P0004) when the share the offer hangs off is no
--    longer active, even if a stale 'offered' row were left behind by some other
--    path. Offers are never deleted: withdrawal is a status transition
--    (withdrawn_by / withdrawn_at); decided and withdrawn rows stay as history.
--
-- All three are CREATE OR REPLACE of existing SECURITY DEFINER functions with the
-- same signature and search_path (execute rights are preserved by REPLACE). Rollback:
-- supabase/rollbacks/20261008090000_chain_proof_unshare_withdraws_offers_v1.down.sql
-- ============================================================================
begin;

create or replace function public.unshare_request_v1(p_share_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_upd int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Only the client owner of the share's connection may revoke it.
  update public.agency_client_request_shares s
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
    from public.agency_client_connections c
   where s.id = p_share_id
     and c.id = s.connection_id
     and s.status = 'active'
     and c.client_company_id is not null
     and public.owns_company(c.client_company_id);
  get diagnostics v_upd = row_count;
  if v_upd > 0 then
    -- A withdrawn share must not leave live offers behind (same rule as
    -- revoke_agency_client_connection_v1). Only offers on THIS share.
    update public.agency_candidate_offers
       set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now(), updated_at = now()
     where request_share_id = p_share_id and status = 'offered';
  end if;
  return case when v_upd > 0 then 'unshared' else 'not_found' end;
end;
$function$;

create or replace function public.request_service_offering(p_offering_id uuid, p_message text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_provider uuid; v_status text; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select provider_id, status into v_provider, v_status
    from public.service_offerings where id = p_offering_id;
  if not found then raise exception 'offering_not_found' using errcode = 'P0002'; end if;
  if v_status <> 'active' then raise exception 'offering_not_active' using errcode = 'P0002'; end if;
  if v_provider = uid then raise exception 'cannot_request_own_offering' using errcode = '42501'; end if;

  -- One open request per (offering, buyer): say so, with the errcode the app
  -- already maps to its localized "duplicate" state.
  if exists (select 1 from public.service_offering_requests r
              where r.offering_id = p_offering_id and r.buyer_id = uid and r.status = 'sent') then
    raise exception 'request_already_open' using errcode = '23505';
  end if;

  insert into public.service_offering_requests (offering_id, provider_id, buyer_id, message, status)
  values (p_offering_id, v_provider, uid,
          nullif(btrim(coalesce(p_message, '')), ''), 'sent')
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.respond_agency_candidate_offer_v1(p_offer_id uuid, p_decision text, p_note text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_offer   public.agency_candidate_offers%rowtype;
  v_booking uuid;
  v_role    text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('accepted', 'declined') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  select * into v_offer from public.agency_candidate_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = '42501'; end if;

  if not public.owns_company(v_offer.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_offer.status <> 'offered' then
    raise exception 'offer_not_open' using errcode = 'P0004';
  end if;
  -- Defence in depth: the offer's authority is the request share. A withdrawn
  -- share means the offer is not actionable, whatever the row says.
  if not exists (select 1 from public.agency_client_request_shares s
                  where s.id = v_offer.request_share_id and s.status = 'active') then
    raise exception 'offer_not_open' using errcode = 'P0004';
  end if;

  if p_decision = 'accepted' then
    select left(coalesce(nullif(btrim(r.payload->>'role'), ''),
                         nullif(btrim(r.role_or_work_type), ''),
                         nullif(btrim(r.title), '')), 200)
      into v_role
      from public.customer_requests r where r.id = v_offer.request_id;
    v_booking := public.propose_booking_request_v3(
      v_offer.request_id, v_offer.worker_id,
      null, null, null, v_role,
      v_note
    );
  end if;

  update public.agency_candidate_offers
     set status        = p_decision,
         decided_at    = now(),
         decided_by    = v_uid,
         decision_note = v_note,
         booking_id    = v_booking,
         updated_at    = now()
   where id = p_offer_id;

  return coalesce(v_booking, p_offer_id);
end;
$function$;

commit;
