-- @human-gate-approved — pending owner approval "Apply Lane A ownership 2026-09-04" (draft, needs-human-gate)
-- 20260904060000_owns_company_governance_membership_v1
--
-- ██ RED CLASS — human gate (migration-safety: CREATE OR REPLACE of two
-- ██ SECURITY DEFINER functions). Draft; owner-channel apply only.
--
-- WHY (real recruiter pilot, 2026-09-04). The owner decided that the first
-- real recruiter account represents the EXISTING verified staffing agency
-- "Labour market ai Sp. z o.o" (companies 788225e9…, organisation 19f47e78…)
-- and that no duplicate company may be created. That organisation already
-- has an active creator account (owner membership, active workspace, roster,
-- demands). Company authority today is CREATOR-bound: `owns_company(c)` is
-- `companies.profile_id = auth.uid()` and it gates the roster tables, the
-- agency↔client bridge tables (RLS) and 20+ SECURITY DEFINER commands. So a
-- second person can only act for the agency by TAKING the creator pointer
-- away from the first — which would silently break the first account. That
-- is not a connection, it is a transfer, and it is not safe.
--
-- WHAT (semantics widen by exactly one arm, nothing narrows):
--   owns_company(c) = the caller CREATED company c
--                  OR the caller holds an ACTIVE `owner` / `admin`
--                     membership in the organisation bound to c
--                     (organizations.legacy_company_id = c).
-- This is the doctrine already stated in M-P0-4 §11 ("membership proves the
-- role; the creator is kept as an owner-equivalent compatibility arm") and
-- already used by `save_company_setup_v3` and the app's employer resolver.
-- `manager` / `external_manager` / `member` do NOT gain company authority.
--
-- `create_agency_client_connection_v1` carried the same creator test inline;
-- it now asks `owns_company()` like every other bridge command, so one rule
-- decides agency authority everywhere.
--
-- Who can now do what they could not: an active owner/admin MEMBER of a
-- company-bound organisation can read/write that company's roster and roster
-- invitations, and act as that company on the agency bridge (invite clients,
-- see shared requests, offer roster candidates, decide on offers as a
-- client). Memberships themselves are still created only through the
-- membership commands / an owner-approved grant — this migration grants
-- nobody anything.
--
-- No table, column, policy or data changes. The EXECUTE grants are restated
-- exactly as production holds them today (authenticated only; anon revoked)
-- so a clean reset reproduces production. Rollback restores both function
-- bodies verbatim.
--
-- Proof (2026-09-04, read-only on production rows — the rolled-back DDL+grant
-- dry run was blocked by the session permission layer and runs as the
-- post-apply readback instead): with the hypothetical admin membership, the
-- real account satisfies the rule through the membership arm only; the
-- creator account through both arms (unchanged); a manager-role member, the
-- platform owner's own account and anon satisfy neither; 0 existing accounts
-- change authority (no company has a second owner/admin member today).

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
  or exists (
    select 1
      from public.organizations o
      join public.company_memberships m on m.organization_id = o.id
     where o.legacy_company_id = c
       and m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
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
  -- Caller must hold company authority (creator or active owner/admin
  -- member — the one rule in owns_company), and it must be a staffing_agency.
  if not public.owns_company(p_agency_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select c.company_type into v_ctype from public.companies c
   where c.id = p_agency_company_id;
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

-- ROLLBACK: see supabase/rollbacks/20260904060000_owns_company_governance_membership_v1.down.sql
-- (restores the creator-only owns_company and the inline creator test in
-- create_agency_client_connection_v1, both verbatim).
