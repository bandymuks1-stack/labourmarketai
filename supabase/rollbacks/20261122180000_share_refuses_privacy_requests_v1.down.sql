-- Rollback for 20261122180000_share_refuses_privacy_requests_v1: restores share_request_with_agency_v1 exactly as in
-- 20260723180000_agency_real_client_bridge_v1. No data to undo.

create or replace function public.share_request_with_agency_v1(
  p_connection_id uuid,
  p_request_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_client uuid;
  v_status text;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- The connection must be ACTIVE and the caller must own its client company.
  select client_company_id, status into v_client, v_status
    from public.agency_client_connections where id = p_connection_id;
  if v_client is null or v_status <> 'active' then
    raise exception 'connection_not_active' using errcode = '42501';
  end if;
  if not public.owns_company(v_client) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  -- The request must be the CALLER'S OWN row (only own rows are probed —
  -- no foreign-request-by-uuid access, no existence oracle).
  if not exists (
    select 1 from public.customer_requests r
    where r.id = p_request_id and r.profile_id = v_uid
  ) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  -- Idempotent: reuse an existing active share.
  select id into v_id from public.agency_client_request_shares
   where connection_id = p_connection_id and request_id = p_request_id and status = 'active';
  if v_id is not null then return v_id; end if;

  insert into public.agency_client_request_shares (connection_id, request_id, shared_by)
  values (p_connection_id, p_request_id, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.share_request_with_agency_v1(uuid, uuid) from public;
revoke all on function public.share_request_with_agency_v1(uuid, uuid) from anon;
grant execute on function public.share_request_with_agency_v1(uuid, uuid) to authenticated;
