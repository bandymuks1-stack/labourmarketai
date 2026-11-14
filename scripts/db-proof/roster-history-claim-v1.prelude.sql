-- ============================================================================
-- roster-history-claim-v1 PRELUDE — stand-ins for the live schema the real
-- migration needs. Throwaway PostgreSQL 16 only; synthetic data only.
--
-- Everything the proof MEASURES is loaded verbatim from the repository by the
-- script (the migration under proof, its rollback, and the live
-- respond_to_roster_link_v1). What is here is only the surrounding schema the
-- live database already has: the roster table with its real CHECKs, the three
-- live roster-link triggers, the live organization_people and
-- organization_evidence_* policies, and the authority helpers. Each is copied
-- from the migration that defines it, cited above it.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;
grant usage on schema public to authenticated, anon, service_role;

create schema auth;
-- PostgREST-style claims, as the live auth.uid() / auth.jwt() read them.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', nullif(current_setting('app.email', true), ''));
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid(), auth.jwt() to authenticated, anon, service_role;

-- ── identity ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key, full_name text, email text, active_role text);
create table public.organizations (
  id uuid primary key, display_name text, legal_name text, organization_type text default 'company');
create table public.workers (
  id uuid primary key, profile_id uuid unique references public.profiles(id), display_name text);
create table public.company_memberships (
  profile_id uuid references public.profiles(id), organization_id uuid references public.organizations(id),
  status text, role text);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id), status text, relationship_slug text,
  started_at date, ended_at date);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text,
  entity_id uuid, payload jsonb, occurred_at timestamptz not null default now());
grant select, insert on public.audit_logs to authenticated;

-- 0024_is_admin_dual_signal.sql
create function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active_role = 'admin');
$$;
-- 20260806180000_membership_authority_widening_v1.sql (engagement OR membership arm)
create function public.manages_organization(org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select org is not null and (
    exists (select 1 from public.engagement_contexts ec
             where ec.profile_id = auth.uid() and ec.organization_id = org and ec.status = 'active'
               and ec.relationship_slug in ('manager','owner','external_manager'))
    or exists (select 1 from public.company_memberships m
                where m.profile_id = auth.uid() and m.organization_id = org and m.status = 'active'
                  and m.role in ('owner','admin','manager','external_manager')));
$$;
-- 20261003151000_email_verified_boundary_v1.sql — the session's address is proven.
create table public.proven_emails (profile_id uuid, email text);
create function public.session_email_verified_v1() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.proven_emails v
                  where v.profile_id = auth.uid()
                    and lower(btrim(v.email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))));
$$;
grant execute on function public.is_admin(), public.manages_organization(uuid), public.session_email_verified_v1()
  to authenticated, anon;

-- ── the roster row (20260907114500, kinds widened 20260910120000) ────────────
create table public.organization_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  normalized_name text not null default 'x' check (char_length(normalized_name) between 1 and 200),
  external_ref text, source_note text,
  relationship_kind text not null default 'employee' check (relationship_kind = any (array[
    'candidate','employee','former_employee','agency_worker','subcontractor','contractor',
    'student','graduate','trainee','apprentice','programme_participant','volunteer','other'])),
  link_state text not null default 'unlinked' check (link_state = any (array['unlinked','link_proposed','linked'])),
  link_method text check (link_method is null or link_method = any (array['manager_link','manager_offer','worker_confirmed','invitation'])),
  linked_worker_id uuid references public.workers(id) on delete set null,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  linked_by uuid references public.profiles(id) on delete set null,
  linked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_people_org_scope unique (id, organization_id),
  constraint organization_people_link_pairing check (
    ((linked_worker_id is null) = (linked_profile_id is null))
    and ((link_state = 'unlinked') = (linked_worker_id is null))));

-- organization-supplied history (20260907114500, trimmed to what is measured)
create table public.organization_evidence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  organization_person_id uuid,
  evidence_state text not null default 'ORGANIZATION_REPORTED',
  supplied_by_organization_id uuid, supplier_role text, session_id uuid,
  imported_by_profile_id uuid, hours numeric, activity_date date,
  period_start date, period_end date,
  constraint organization_evidence_records_org_scope unique (id, organization_id),
  foreign key (organization_person_id, organization_id)
    references public.organization_people(id, organization_id));
create table public.organization_evidence_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, record_id uuid not null,
  event_type text not null, actor_profile_id uuid, occurred_at timestamptz not null default now());

-- The live grants on the surrounding tables (a policy's own subquery, e.g. the
-- workers EXISTS in organization_people_subject_decides, runs as the caller).
grant select on public.profiles, public.organizations, public.workers,
  public.company_memberships, public.engagement_contexts to authenticated;
alter table public.workers enable row level security;
create policy workers_select_own on public.workers for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
grant select, insert, update on public.organization_people to authenticated;
grant select, insert on public.organization_evidence_records, public.organization_evidence_events to authenticated;

-- ── the three live roster-link triggers, verbatim ───────────────────────────
-- 20260918070000: only the subject may turn a row into (linked, worker_confirmed).
create or replace function public.organization_people_guard_subject_consent()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.link_state = 'linked'
     and new.link_method = 'worker_confirmed'
     and (old.link_state is distinct from 'linked'
          or old.link_method is distinct from 'worker_confirmed'
          or old.linked_profile_id is distinct from new.linked_profile_id)
  then
    if new.linked_profile_id is null or auth.uid() is distinct from new.linked_profile_id then
      raise exception 'roster link confirmation is the subject''s alone' using errcode = '42501';
    end if;
    new.linked_by := new.linked_profile_id;
    new.linked_at := coalesce(new.linked_at, now());
  end if;
  return new;
end; $$;
create trigger organization_people_subject_consent_guard before update on public.organization_people
  for each row execute function public.organization_people_guard_subject_consent();

-- 20261003151300 (G-4): end-user roles can never write `linked` by another method.
create or replace function public.organization_people_linked_requires_consent_guard_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.link_state = 'linked' and new.link_method is distinct from 'worker_confirmed' then
    raise exception 'a roster link becomes linked only by the subject''s own confirmation' using errcode = '42501';
  end if;
  return new;
end; $$;
create trigger organization_people_linked_requires_consent_guard_v1
  before insert or update on public.organization_people
  for each row execute function public.organization_people_linked_requires_consent_guard_v1();

-- 20261020170000: clearing one side of a link clears both and unlinks.
create or replace function public.organization_people_clear_both_link_sides_v1()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if (old.linked_profile_id is not null or old.linked_worker_id is not null)
     and (new.linked_profile_id is null or new.linked_worker_id is null) then
    new.linked_profile_id := null; new.linked_worker_id := null;
    new.link_state := 'unlinked'; new.link_method := null;
    new.linked_at := null; new.linked_by := null;
  end if;
  return new;
end; $$;
create trigger organization_people_0_clear_both_link_sides_v1
  before update of linked_profile_id, linked_worker_id on public.organization_people
  for each row execute function public.organization_people_clear_both_link_sides_v1();

-- ── the live policies, verbatim ─────────────────────────────────────────────
alter table public.organization_people enable row level security;
alter table public.organization_evidence_records enable row level security;
alter table public.organization_evidence_events enable row level security;

create policy organization_people_insert on public.organization_people for insert to authenticated
  with check (manages_organization(organization_id) AND (created_by = auth.uid()) AND (link_state = 'unlinked'::text)
    AND (linked_worker_id IS NULL) AND (linked_profile_id IS NULL));
create policy organization_people_manager_update on public.organization_people for update to authenticated
  using (manages_organization(organization_id))
  with check (manages_organization(organization_id) AND ((linked_profile_id IS NULL) OR (EXISTS (SELECT 1 FROM engagement_contexts ec
    WHERE ((ec.profile_id = organization_people.linked_profile_id) AND (ec.organization_id = organization_people.organization_id) AND (ec.status = 'active'::text))))
    OR (EXISTS (SELECT 1 FROM company_memberships m
    WHERE ((m.profile_id = organization_people.linked_profile_id) AND (m.organization_id = organization_people.organization_id) AND (m.status = 'active'::text))))));
create policy organization_people_select on public.organization_people for select to authenticated
  using (manages_organization(organization_id) OR (linked_profile_id = auth.uid()) OR is_admin());
create policy organization_people_subject_decides on public.organization_people for update to authenticated
  using (linked_profile_id = auth.uid())
  with check (((link_state = 'linked'::text) AND (link_method = 'worker_confirmed'::text) AND (linked_profile_id = auth.uid())
      AND (EXISTS (SELECT 1 FROM workers w WHERE ((w.id = organization_people.linked_worker_id) AND (w.profile_id = auth.uid())))))
    OR ((link_state = 'unlinked'::text) AND (linked_profile_id IS NULL) AND (linked_worker_id IS NULL)));

-- 20261003151300: the subject arm requires worker_confirmed, not merely linked.
create policy organization_evidence_records_select on public.organization_evidence_records for select to authenticated
  using (manages_organization(organization_id) OR (EXISTS (SELECT 1 FROM organization_people op
    WHERE ((op.id = organization_evidence_records.organization_person_id) AND (op.linked_profile_id = auth.uid())
      AND (op.link_state = 'linked'::text) AND (op.link_method = 'worker_confirmed'::text)))) OR is_admin());
create policy organization_evidence_records_insert on public.organization_evidence_records for insert to authenticated
  with check (manages_organization(organization_id) AND (imported_by_profile_id = auth.uid()));
create policy organization_evidence_events_select on public.organization_evidence_events for select to authenticated
  using (manages_organization(organization_id) OR is_admin());
