-- ============================================================================
-- 20261007140000 — chain-proof fixes v1: unshare withdraws live offers; clear
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
-- Both are CREATE OR REPLACE of existing SECURITY DEFINER functions with the
-- same signature and search_path (execute rights are preserved by REPLACE). Rollback:
-- supabase/rollbacks/20261007140000_chain_proof_unshare_withdraws_offers_v1.down.sql
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

commit;
