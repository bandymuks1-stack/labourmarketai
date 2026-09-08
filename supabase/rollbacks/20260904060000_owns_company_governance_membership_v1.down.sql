-- 20260904060000_owns_company_governance_membership_v1.down.sql
-- Restores the creator-only `owns_company` and the inline creator test in
-- `create_agency_client_connection_v1`, both verbatim as they were on
-- production before the migration. No table data is touched. Any owner/admin
-- member relying on the widened rule loses company authority again (that is
-- the previous state).

create or replace function public.owns_company(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
$$;

create or replace function public.create_agency_client_connection_v1(
  p_agency_company_id uuid,
  p_invited_email text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_id    uuid;
  v_ctype text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Caller must OWN the agency company, and it must be a staffing_agency.
  select c.company_type into v_ctype from public.companies c
   where c.id = p_agency_company_id and c.profile_id = v_uid;
  if v_ctype is null then raise exception 'not_owner' using errcode = '42501'; end if;
  if v_ctype <> 'staffing_agency' then raise exception 'not_agency' using errcode = '42501'; end if;
  if v_email = '' or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  -- Idempotent: reuse an existing non-terminal invite for this (agency, email).
  select id into v_id from public.agency_client_connections
   where agency_company_id = p_agency_company_id
     and lower(invited_email) = v_email
     and status in ('pending', 'active');
  if v_id is not null then return v_id; end if;

  insert into public.agency_client_connections (agency_company_id, invited_email, invited_by)
  values (p_agency_company_id, v_email, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- Grants restated so a clean local reset reproduces production exactly
-- (production ACL today: postgres + authenticated; anon has no EXECUTE).
revoke all on function public.owns_company(uuid) from public;
revoke all on function public.owns_company(uuid) from anon;
grant execute on function public.owns_company(uuid) to authenticated;
revoke all on function public.create_agency_client_connection_v1(uuid, text) from public;
revoke all on function public.create_agency_client_connection_v1(uuid, text) from anon;
grant execute on function public.create_agency_client_connection_v1(uuid, text) to authenticated;
