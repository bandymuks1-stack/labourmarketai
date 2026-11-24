-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session, in the
-- train's stated order. Never `db push`.
--
-- @human-gate-approved — pre-approved by owner mandate 2026-08-17 (autonomous
-- functional completion train V2, §4 migration authority). Safety class:
-- ADDITIVE (one new RLS-bearing table + one helper + four new SECURITY
-- DEFINER RPCs; no existing table, policy, grant or function is touched).
-- SECURITY DEFINER + GRANT/REVOKE + create trigger are RED-class by
-- construction; the annotation states the ROUTE, not the decision.
--
-- 20260817150000 — work_objects v1: the OBJECT/SITE entity (full-reality
-- audit 2026-08-17, WORK section: "object/site PARTIAL — no object entity").
--
-- PROBLEM: real work happens at objects/sites (a building, a street section,
-- a factory hall). Today the product has NO object entity at all: the
-- project row carries a free-text location, and the only prepared site-ish
-- store (20260713120000_company_locations_v1) is UNAPPLIED and carries the
-- STALE single-owner authority model (companies.profile_id) that predates
-- company_memberships. Train M verdict (lead decision, binding): that
-- migration must NOT be applied; THIS table is the canonical location/site
-- truth going forward.
--
-- SOLUTION (smallest honest slice): ONE org-scoped table + ONE read helper +
-- FOUR gated write RPCs.
--
--   1. work_objects — a bounded object/site row: org-owned (NOT NULL
--      organization_id), optional project pointer, name 2..160, bounded
--      address fields (ISO-2 country / region / city / free line), OPTIONAL
--      approximate coordinates (both-or-neither — a half coordinate cannot
--      render), optional responsible person, honest active/archived status.
--      OBJECT geography only; this table never stores private worker
--      coordinates.
--   2. Reads are MEMBER-VISIBLE through BOTH membership truths:
--      is_org_member_or_engaged_v1() = an ACTIVE company_memberships row OR
--      an ACTIVE engagement_contexts row in that organization (+ is_admin).
--      NOT the legacy companies.profile_id single-owner pattern.
--   3. Writes are RPC-only (direct insert/update/delete REVOKEd, no write
--      policies): create / update / set-status / set-responsible, all
--      SECURITY DEFINER, all re-checking MANAGING authority server-side via
--      the EXISTING has_org_demand_access() membership predicate
--      (owner/admin/manager/external_manager) or is_admin().
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO hard delete — archive is the terminal user action (history keeps
--     pointing at real rows);
--   - NO public/anon read of any kind;
--   - NO change to company_locations (stays committed, UNAPPLIED,
--     superseded — see APPLIED_LEDGER Deferred note);
--   - NO recreate of ANY existing function/table/policy.
--
-- RLS DECISION, STATED EXPLICITLY: SELECT for org members + engaged workers
-- (both membership truths) + admins; a caller with no active relationship to
-- the organization cannot learn a row exists. No INSERT/UPDATE/DELETE policy
-- exists — the four definer RPCs are the only write paths.
--
-- ROLLBACK: supabase/rollbacks/20260817150000_work_objects_v1.down.sql
-- drops ONLY the four NEW functions, the one NEW helper, the one NEW trigger
-- and the one NEW table (feature-created rows live only in that table; a
-- 0-row assertion guards the drop).
-- ============================================================================

begin;

-- ── 1. Read helper: BOTH membership truths, one predicate ──────────────────
-- company_memberships (canonical org membership) OR engagement_contexts (the
-- employment-context spine minted by booking accepts / provisioning). Either
-- ACTIVE relationship makes the caller a member-level reader of org objects.
create or replace function public.is_org_member_or_engaged_v1(
  p_organization_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_organization_id is not null and (
    exists (
      select 1 from public.company_memberships m
       where m.organization_id = p_organization_id
         and m.profile_id = auth.uid()
         and m.status = 'active'
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.organization_id = p_organization_id
         and ec.profile_id = auth.uid()
         and ec.status = 'active'
    )
  )
$$;
revoke all on function public.is_org_member_or_engaged_v1(uuid) from public;
revoke all on function public.is_org_member_or_engaged_v1(uuid) from anon;
grant execute on function public.is_org_member_or_engaged_v1(uuid) to authenticated;

-- ── 2. work_objects — the canonical object/site row ────────────────────────
create table if not exists public.work_objects (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  -- Optional project binding; the structured object is the location truth,
  -- the project's free-text `location` stays only for compat display.
  project_id             uuid references public.projects(id) on delete set null,
  name                   text not null check (
                           char_length(trim(name)) >= 2
                           and char_length(name) <= 160
                         ),
  country                text check (country is null or country ~ '^[A-Z]{2}$'),
  region                 text check (region is null or char_length(region) <= 120),
  city                   text check (city is null or char_length(city) <= 120),
  address_line           text check (address_line is null or char_length(address_line) <= 200),
  latitude               double precision check (latitude  is null or (latitude  >= -90  and latitude  <= 90)),
  longitude              double precision check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint work_objects_coord_pair check ((latitude is null) = (longitude is null)),
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  status                 text not null default 'active'
                           check (status in ('active','archived')),
  created_by             uuid not null references public.profiles(id) on delete cascade,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists work_objects_org_status_idx
  on public.work_objects (organization_id, status);
create index if not exists work_objects_project_idx
  on public.work_objects (project_id)
  where project_id is not null;

drop trigger if exists trg_work_objects_updated_at on public.work_objects;
create trigger trg_work_objects_updated_at
  before update on public.work_objects
  for each row execute function public.set_updated_at();

alter table public.work_objects enable row level security;

drop policy if exists work_objects_select on public.work_objects;
create policy work_objects_select on public.work_objects
  for select to authenticated
  using (
    public.is_org_member_or_engaged_v1(organization_id)
    or public.is_admin()
  );
-- No insert/update/delete policy: the four gated RPCs below are the ONLY
-- write paths (direct writes are REVOKEd further down).

-- ── 3. Shared managing-authority + validation notes ────────────────────────
-- Managing authority = has_org_demand_access(org) (ACTIVE membership with
-- role owner/admin/manager/external_manager — 20260806200000) or is_admin().
-- Anti-oracle rule: a caller with no read relationship to the object gets
-- 'not_found', never 'not_allowed' (one answer, no existence leak).

-- ── 4. create_work_object_v1 — the ONLY insert path ────────────────────────
create or replace function public.create_work_object_v1(
  p_organization_id text,
  p_name            text,
  p_project_id      text,
  p_country         text,
  p_region          text,
  p_city            text,
  p_address_line    text,
  p_latitude        double precision,
  p_longitude       double precision
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_org     uuid := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  v_name    text := nullif(trim(coalesce(p_name, '')), '');
  v_project uuid := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_region  text := nullif(trim(coalesce(p_region, '')), '');
  v_city    text := nullif(trim(coalesce(p_city, '')), '');
  v_line    text := nullif(trim(coalesce(p_address_line, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_org is null then
    return 'invalid';
  end if;
  if not (public.has_org_demand_access(v_org) or public.is_admin()) then
    return 'not_allowed';
  end if;
  if v_name is null
     or char_length(v_name) < 2
     or char_length(v_name) > 160 then
    return 'invalid';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    return 'invalid';
  end if;
  if (v_region is not null and char_length(v_region) > 120)
     or (v_city is not null and char_length(v_city) > 120)
     or (v_line is not null and char_length(v_line) > 200) then
    return 'invalid';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    return 'invalid';
  end if;
  if p_latitude is not null
     and not (p_latitude between -90 and 90 and p_longitude between -180 and 180) then
    return 'invalid';
  end if;
  -- The project (when given) must belong to the SAME organization — an
  -- object may never bridge two organizations.
  if v_project is not null and not exists (
    select 1 from public.projects pr
     where pr.id = v_project and pr.organization_id = v_org
  ) then
    return 'invalid';
  end if;
  -- Abuse cap: an org's object register is a real list, not a data dump.
  if (select count(*) from public.work_objects wo
       where wo.organization_id = v_org) >= 500 then
    return 'limit_reached';
  end if;

  insert into public.work_objects
    (organization_id, project_id, name, country, region, city, address_line,
     latitude, longitude, status, created_by)
  values
    (v_org, v_project, v_name, v_country, v_region, v_city, v_line,
     p_latitude, p_longitude, 'active', uid);

  return 'created';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.create_work_object_v1(text, text, text, text, text, text, text, double precision, double precision) from public;
revoke all on function public.create_work_object_v1(text, text, text, text, text, text, text, double precision, double precision) from anon;
grant execute on function public.create_work_object_v1(text, text, text, text, text, text, text, double precision, double precision) to authenticated;

-- ── 5. update_work_object_v1 — bounded field edit ──────────────────────────
create or replace function public.update_work_object_v1(
  p_object_id    text,
  p_name         text,
  p_project_id   text,
  p_country      text,
  p_region       text,
  p_city         text,
  p_address_line text,
  p_latitude     double precision,
  p_longitude    double precision
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_id      uuid := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
  v_org     uuid;
  v_name    text := nullif(trim(coalesce(p_name, '')), '');
  v_project uuid := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_region  text := nullif(trim(coalesce(p_region, '')), '');
  v_city    text := nullif(trim(coalesce(p_city, '')), '');
  v_line    text := nullif(trim(coalesce(p_address_line, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_id is null then
    return 'invalid';
  end if;

  select wo.organization_id into v_org
    from public.work_objects wo
   where wo.id = v_id
   for update;
  if not found then
    return 'not_found';
  end if;
  -- Anti-oracle: a caller who cannot even READ the row gets the same answer
  -- as a missing row; a member without managing authority gets 'not_allowed'.
  if not (public.has_org_demand_access(v_org) or public.is_admin()) then
    if public.is_org_member_or_engaged_v1(v_org) then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  if v_name is null
     or char_length(v_name) < 2
     or char_length(v_name) > 160 then
    return 'invalid';
  end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    return 'invalid';
  end if;
  if (v_region is not null and char_length(v_region) > 120)
     or (v_city is not null and char_length(v_city) > 120)
     or (v_line is not null and char_length(v_line) > 200) then
    return 'invalid';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    return 'invalid';
  end if;
  if p_latitude is not null
     and not (p_latitude between -90 and 90 and p_longitude between -180 and 180) then
    return 'invalid';
  end if;
  if v_project is not null and not exists (
    select 1 from public.projects pr
     where pr.id = v_project and pr.organization_id = v_org
  ) then
    return 'invalid';
  end if;

  update public.work_objects wo
     set name         = v_name,
         project_id   = v_project,
         country      = v_country,
         region       = v_region,
         city         = v_city,
         address_line = v_line,
         latitude     = p_latitude,
         longitude    = p_longitude,
         updated_at   = now()
   where wo.id = v_id;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.update_work_object_v1(text, text, text, text, text, text, text, double precision, double precision) from public;
revoke all on function public.update_work_object_v1(text, text, text, text, text, text, text, double precision, double precision) from anon;
grant execute on function public.update_work_object_v1(text, text, text, text, text, text, text, double precision, double precision) to authenticated;

-- ── 6. set_work_object_status_v1 — archive / restore ───────────────────────
create or replace function public.set_work_object_status_v1(
  p_object_id text,
  p_status    text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_org    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_id is null or v_status is null or v_status not in ('active','archived') then
    return 'invalid';
  end if;

  select wo.organization_id into v_org
    from public.work_objects wo
   where wo.id = v_id
   for update;
  if not found then
    return 'not_found';
  end if;
  if not (public.has_org_demand_access(v_org) or public.is_admin()) then
    if public.is_org_member_or_engaged_v1(v_org) then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  update public.work_objects wo
     set status     = v_status,
         updated_at = now()
   where wo.id = v_id;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.set_work_object_status_v1(text, text) from public;
revoke all on function public.set_work_object_status_v1(text, text) from anon;
grant execute on function public.set_work_object_status_v1(text, text) to authenticated;

-- ── 7. set_work_object_responsible_v1 — the responsible person ─────────────
create or replace function public.set_work_object_responsible_v1(
  p_object_id  text,
  p_profile_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
  v_target uuid := nullif(trim(coalesce(p_profile_id, '')), '')::uuid;
  v_org    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_id is null then
    return 'invalid';
  end if;

  select wo.organization_id into v_org
    from public.work_objects wo
   where wo.id = v_id
   for update;
  if not found then
    return 'not_found';
  end if;
  if not (public.has_org_demand_access(v_org) or public.is_admin()) then
    if public.is_org_member_or_engaged_v1(v_org) then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  -- The responsible person must have a REAL active relationship with this
  -- organization (either membership truth). NULL clears the pointer.
  if v_target is not null and not (
    exists (
      select 1 from public.company_memberships m
       where m.organization_id = v_org
         and m.profile_id = v_target
         and m.status = 'active'
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.organization_id = v_org
         and ec.profile_id = v_target
         and ec.status = 'active'
    )
  ) then
    return 'invalid_target';
  end if;

  update public.work_objects wo
     set responsible_profile_id = v_target,
         updated_at             = now()
   where wo.id = v_id;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.set_work_object_responsible_v1(text, text) from public;
revoke all on function public.set_work_object_responsible_v1(text, text) from anon;
grant execute on function public.set_work_object_responsible_v1(text, text) to authenticated;

-- ── 8. Grants — SELECT only to authenticated; writes are RPC-only ──────────
grant select on public.work_objects to authenticated;
revoke insert, update, delete on public.work_objects from authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817150000_work_objects_v1.down.sql
-- drops the four NEW functions, the NEW helper and the NEW table (0-row
-- assertion before the table drop; nothing existing was recreated).
