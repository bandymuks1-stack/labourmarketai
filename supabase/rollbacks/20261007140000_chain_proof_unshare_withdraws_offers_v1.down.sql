-- Rollback for 20261007140000_chain_proof_unshare_withdraws_offers_v1.sql
-- Restores the previous bodies verbatim. Offers already withdrawn by the new
-- unshare are NOT revived (a withdrawal is a recorded act).
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

  insert into public.service_offering_requests (offering_id, provider_id, buyer_id, message, status)
  values (p_offering_id, v_provider, uid,
          nullif(btrim(coalesce(p_message, '')), ''), 'sent')
  returning id into v_id;
  return v_id;
end $function$;

commit;
