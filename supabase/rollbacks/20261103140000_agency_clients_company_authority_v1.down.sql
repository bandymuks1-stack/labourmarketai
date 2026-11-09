-- Rollback for 20261103140000_agency_clients_company_authority_v1
-- Restores save_agency_client_v1, remove_agency_client_v1 and
-- set_demand_agency_client_v1 exactly as 20260713160000_agency_clients_v1
-- created them (profile-owner only). Grants unchanged. No data changes: client
-- rows written by member admins while the forward version was live stay.

create or replace function public.save_agency_client_v1(
  p_name          text,
  p_contact_name  text default null,
  p_contact_email text default null,
  p_note          text default null,
  p_client_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_count int;
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_contact_name text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_contact_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select c.id into v_company_id
  from public.companies c
  where c.profile_id = auth.uid();
  if v_company_id is null then
    raise exception 'not_company_owner' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_contact_name is not null and char_length(v_contact_name) > 120 then
    raise exception 'invalid_contact_name' using errcode = '22023';
  end if;
  if v_contact_email is not null
     and (char_length(v_contact_email) > 200 or position('@' in v_contact_email) <= 1) then
    raise exception 'invalid_contact_email' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if p_client_id is not null then
    update public.agency_clients set
      name          = v_name,
      contact_name  = v_contact_name,
      contact_email = v_contact_email,
      note          = v_note,
      updated_at    = now()
    where id = p_client_id and company_id = v_company_id
    returning id into v_id;
    if v_id is null then
      raise exception 'client_not_found' using errcode = 'P0002';
    end if;
    return v_id;
  end if;

  select count(*) into v_count
  from public.agency_clients
  where company_id = v_company_id;
  if v_count >= 200 then
    raise exception 'client_cap_reached' using errcode = 'P0001';
  end if;

  insert into public.agency_clients
    (company_id, name, contact_name, contact_email, note, created_by)
  values
    (v_company_id, v_name, v_contact_name, v_contact_email, v_note, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_agency_client_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  -- FK is ON DELETE SET NULL: linked demands survive, only the link clears.
  delete from public.agency_clients ac
  using public.companies c
  where ac.id = p_id
    and c.id = ac.company_id
    and c.profile_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.set_demand_agency_client_v1(
  p_request_id uuid,
  p_client_id  uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The target client (when set) must belong to the CALLER's own company.
  if p_client_id is not null and not exists (
    select 1
    from public.agency_clients ac
    join public.companies c on c.id = ac.company_id
    where ac.id = p_client_id and c.profile_id = v_uid
  ) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;

  -- The demand must be the CALLER's own row on the canonical demand table.
  update public.customer_requests
     set agency_client_id = p_client_id,
         updated_at = now()
   where id = p_request_id
     and profile_id = v_uid;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.save_agency_client_v1(text, text, text, text, uuid) from public;
revoke all on function public.save_agency_client_v1(text, text, text, text, uuid) from anon;
grant execute on function public.save_agency_client_v1(text, text, text, text, uuid) to authenticated;

revoke all on function public.remove_agency_client_v1(uuid) from public;
revoke all on function public.remove_agency_client_v1(uuid) from anon;
grant execute on function public.remove_agency_client_v1(uuid) to authenticated;

revoke all on function public.set_demand_agency_client_v1(uuid, uuid) from public;
revoke all on function public.set_demand_agency_client_v1(uuid, uuid) from anon;
grant execute on function public.set_demand_agency_client_v1(uuid, uuid) to authenticated;
