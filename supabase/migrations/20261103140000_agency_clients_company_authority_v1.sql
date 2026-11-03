-- @human-gate-approved — RED draft (replaces three SECURITY DEFINER commands on agency_clients); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261103140000_agency_clients_company_authority_v1
--
-- ██ RED CLASS — human gate (SECURITY DEFINER authority change on three write
-- ██ commands). Draft; owner-channel apply only.
--
-- DEFECT: save_agency_client_v1, remove_agency_client_v1 and
-- set_demand_agency_client_v1 (20260713160000) resolve the agency's company
-- ONLY by companies.profile_id = auth.uid(). Every other agency command and
-- the agency_clients select policy itself use owns_company(company_id): the
-- profile owner OR an active owner/admin member. So an owner/admin member who
-- is not the profile owner could READ the agency's client records but was
-- refused every write; and for a person owning several companies,
-- `select … into` without ORDER picked an arbitrary one.
--
-- CHANGE (authority only; validation, caps and return values verbatim):
--   * save — new rows go to the caller's governed company, chosen
--     deterministically: a company that acts as an agency first
--     (company_acts_as_agency), then the oldest (created_at, id). Candidates
--     are companies the caller owns by profile or by an active membership,
--     each re-checked by owns_company — the same shape as
--     caller_agency_company_id(), without narrowing non-agency companies
--     that could already keep client records. Updates (p_client_id) are
--     allowed for a client of ANY company the caller owns_company.
--   * remove — deletes a client of a company the caller owns_company.
--   * set_demand — the client must belong to a company the caller
--     owns_company; the demand must still be the caller's own
--     (customer_requests.profile_id = auth.uid()), unchanged.
-- A manager/member/viewer, another organization's owner or an unrelated user
-- is still refused. No data change, no grant change, no policy change.
-- Rollback: supabase/rollbacks/20261103140000_agency_clients_company_authority_v1.down.sql

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
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_count int;
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_contact_name text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_contact_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'not_company_owner' using errcode = '42501';
  end if;

  select c.id into v_company_id
    from public.companies c
   where (
       c.profile_id = v_uid
       or exists (
         select 1
           from public.organizations o
           join public.company_memberships m on m.organization_id = o.id
          where o.legacy_company_id = c.id
            and m.profile_id = v_uid
            and m.status = 'active'
       )
     )
     and public.owns_company(c.id)
   order by public.company_acts_as_agency(c.id) desc, c.created_at, c.id
   limit 1;
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
    update public.agency_clients ac set
      name          = v_name,
      contact_name  = v_contact_name,
      contact_email = v_contact_email,
      note          = v_note,
      updated_at    = now()
    where ac.id = p_client_id and public.owns_company(ac.company_id)
    returning ac.id into v_id;
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
    (v_company_id, v_name, v_contact_name, v_contact_email, v_note, v_uid)
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
  if auth.uid() is null then
    return false;
  end if;
  delete from public.agency_clients ac
   where ac.id = p_id
     and public.owns_company(ac.company_id);
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

  if p_client_id is not null and not exists (
    select 1
    from public.agency_clients ac
    where ac.id = p_client_id and public.owns_company(ac.company_id)
  ) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;

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
