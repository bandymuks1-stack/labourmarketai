-- @human-gate-approved
-- ============================================================================
-- 20261124053000_history_read_grant_v1
--
-- RED · needs-human-gate · NOT applied. Owner request 2026-11-23 (coordinator
-- relay): a dedicated synthetic QA account may READ an organization's
-- historical work record, for production Living CV screenshots, under four
-- owner conditions: (1) read-only, no manager rights; (2) only the historical
-- data the Living CV needs; (3) no export, no change of worker data;
-- (4) revoked at once after the check, with an audit row.
--
-- WHY NO EXISTING ROLE (production read 2026-11-23):
--   * every history read is gated by manages_organization(org) =
--     owner / admin / manager / external_manager, and the SAME check opens the
--     write policies (organization_evidence_records/people/events/parties/
--     media/competency_signals/history_periods INSERT, organization_people and
--     projects UPDATE, evidence_import_* INSERT/UPDATE/DELETE) and the definer
--     correct_work_hour_allocation_v1 -> no role reads without writing;
--   * a `member` reads 0 history rows;
--   * a NEW membership role would not be narrow: belongs_to_organization and
--     is_org_member_or_engaged_v1 accept ANY active membership and open
--     work_objects, organization_roles, organization_identifiers and more.
--
-- WHAT THIS ADDS (nothing existing is altered):
--   1. organization_history_read_grants_v1: one row = one person may read one
--      organization's history until expires_at (<= 4 h after granting) or
--      revoked_at. RLS on, no policy, no grant to anon/authenticated: only the
--      owner's SQL (service role / postgres) writes or reads it.
--   2. has_history_read_grant_v1(org): true only for the caller's own live
--      grant. my_history_read_grants_v1(): the caller's own live grants
--      (organization id, name, expiry), for the app's read-only resolver.
--   3. SELECT-only policies, one per history table the Living CV reads. They
--      are permissive, so they only ADD rows to what a caller already sees.
--      No INSERT / UPDATE / DELETE policy is added; manages_organization,
--      belongs_to_organization and is_org_member_or_engaged_v1 are untouched,
--      so every write path and every export gate keeps refusing.
--   NOT opened: journal entries, journal photos, workers, worker skills,
--   evidence media (photos), conversations, timesheets, customer requests.
--
-- Rollback: supabase/rollbacks/20261124053000_history_read_grant_v1.down.sql
-- ============================================================================

create table public.organization_history_read_grants_v1 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('qa_living_cv_screenshots')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint organization_history_read_grants_v1_window
    check (expires_at > granted_at and expires_at <= granted_at + interval '4 hours'),
  constraint organization_history_read_grants_v1_revoked_after
    check (revoked_at is null or revoked_at >= granted_at)
);

alter table public.organization_history_read_grants_v1 enable row level security;
revoke all on table public.organization_history_read_grants_v1 from public, anon, authenticated;

create function public.has_history_read_grant_v1(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select org is not null and exists (
    select 1
      from public.organization_history_read_grants_v1 g
     where g.organization_id = org
       and g.profile_id = auth.uid()
       and g.revoked_at is null
       and now() < g.expires_at
  )
$$;

revoke all on function public.has_history_read_grant_v1(uuid) from public, anon;
grant execute on function public.has_history_read_grant_v1(uuid) to authenticated;

create function public.my_history_read_grants_v1()
returns table (organization_id uuid, organization_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select g.organization_id, o.name, min(g.expires_at)
    from public.organization_history_read_grants_v1 g
    join public.organizations o on o.id = g.organization_id
   where g.profile_id = auth.uid()
     and g.revoked_at is null
     and now() < g.expires_at
   group by g.organization_id, o.name
$$;

revoke all on function public.my_history_read_grants_v1() from public, anon;
grant execute on function public.my_history_read_grants_v1() to authenticated;

-- SELECT only. One policy per table the history and person pages read.
create policy organizations_history_read_grant_select
  on public.organizations for select to authenticated
  using (public.has_history_read_grant_v1(id));

create policy organization_people_history_read_grant_select
  on public.organization_people for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy organization_evidence_records_history_read_grant_select
  on public.organization_evidence_records for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy organization_evidence_parties_history_read_grant_select
  on public.organization_evidence_parties for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy organization_evidence_events_history_read_grant_select
  on public.organization_evidence_events for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy organization_evidence_competency_signals_history_read_grant_select
  on public.organization_evidence_competency_signals for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy organization_history_periods_history_read_grant_select
  on public.organization_history_periods for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy work_objects_history_read_grant_select
  on public.work_objects for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

create policy projects_history_read_grant_select
  on public.projects for select to authenticated
  using (public.has_history_read_grant_v1(organization_id));

-- GDPR erasure v3 registry: the grantee's grant rows go with their account;
-- the granting owner is removed from a grant they made, the grant row stays.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'organization_history_read_grants_v1', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
   'Art. 17(1)(a)/(b): the person''s own time-boxed read grants; deleted with the account',
   'access grants only; no domain state'),
  ('public', 'organization_history_read_grants_v1', 'granted_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'Art. 17(1): the granting owner is removed from the grant; the grant row stays as the access record',
   'FK already SET NULL; v3 runs it explicitly before the account delete')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;
-- ─────────────────────────────────────────────────────────────────────────
