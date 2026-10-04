-- @human-gate-approved
--
-- SAFETY CLASS: RED (SECURITY DEFINER authorization change on the confirmation
-- write path = auth-core of the trust model; two new RLS-bearing tables; a
-- trigger-function replacement). Draft PR + `needs-human-gate`; apply ONLY via
-- Supabase MCP `apply_migration` after explicit owner approval. This marker is
-- the risk ACKNOWLEDGEMENT, not an approval. NOT APPLIED to any database.
--
-- 20261003150500 - CONFIRMATION AUTHORITY DERIVES FROM THE REAL WORK
-- RELATIONSHIP (slice 1 of the EVID-2 redesign; replaces rejected PR #2143).
--
-- OWNER PRINCIPLE (locked): who may accept this work is "the legitimate
-- counterparty of the work relationship", never "someone other than the
-- author". Security objective: THE SUBJECT MUST NOT IMPERSONATE THE
-- COUNTERPARTY. A second login the worker controls, or any manager inside the
-- worker's OWN organization, does not become the counterparty by existing.
-- Authority source = the PARTY (organization + relationship); the logged-in
-- profile is only the ACTOR exercising it.
--
-- WHAT WAS WRONG WITH #2143: a blanket `confirmer = author` refusal (a) blocks
-- the wrong thing - it is bypassed by any second profile, and it treats
-- "another manager of the same sole-trader organization" as legitimate; (b)
-- gives a freelancer / contractor / service provider NO legitimate path at all
-- (relationship_types.journal_reviewable is false for them), so their only
-- option was self-declaration forever.
--
-- WHAT THIS MIGRATION DOES (additive; same signatures; same ACLs):
--
--  1. ONE canonical counterparty relation: work_counterparty_links. It is the
--     journal-side sibling of organization_evidence_parties and reuses its
--     role vocabulary (client / end_client / project_owner ...) and its
--     authority predicate (actor manages the party organization; actor is not
--     the subject; actor does not manage the subject's own organization).
--     organization_evidence_parties itself CANNOT be that relation: every row
--     is welded to ONE evidence record by a composite FK
--     (record_id, organization_id) and is created by the SUPPLYING
--     organization about its own record - it describes a record, not a
--     durable work relationship, and it holds 0 rows on production. See the PR
--     body for the full audit. Nothing is backfilled and nothing is seeded:
--     a link exists only when the COUNTERPARTY's own authorized representative
--     creates it from a REAL platform fact (the counterparty organization owns
--     a project and has an ACTIVE assignment of this worker on it).
--  2. journal_entry_review_submissions: the explicit, append-only SUBMIT FOR
--     REVIEW event that also records the RESOLVED counterparty. Creating a
--     journal entry never implies submission. (The employer path is
--     unchanged: employer review continues to need no submission.)
--  3. journal_entry_review_authority_v1(entry, actor): THE single resolver of
--     'employer' | 'counterparty' | NULL. Called from the guard trigger (the
--     one choke point for every writer, incl. the RLS direct-INSERT policy and
--     confirm_entry_and_verify_skills / apply_learning_auto_confirmation) and
--     from review_journal_entry / reviewable_journal_entry_ids.
--  4. journal_entry_confirmations_guard() now refuses a confirmation whose
--     actor has no authority from the relationship, whose recorded authority
--     basis disagrees with the resolver, or that claims a RECONSTRUCTED
--     (historical) origin - a platform confirmation row is a platform action
--     by a platform actor; a historical client is never made to have clicked
--     LabourMarket.ai.
--  5. review_journal_entry gains the counterparty path (ACCEPT /
--     REQUEST_CORRECTION / DISPUTE, mapped onto the EXISTING decision
--     vocabulary approved / changes_requested / rejected - no second status
--     system). Counterparty rows carry action 'client_accept' /
--     'client_request_correction' / 'client_dispute' (NOT 'confirm'), so the
--     confirmed-work counters that read action = 'confirm' never count a
--     client acceptance as a manager confirmation: CLIENT_ACCEPTED stays a
--     distinct proof concept. Correction = the canonical journal correction
--     (new entry, correction_of -> old, old.superseded_by; history immutable);
--     resubmission = a new submission that records resubmission_of_entry_id;
--     dispute withdrawal/resolution = a later 'approved' row by the same
--     authorized party (append-only, latest wins, history kept); once
--     ACCEPTED the counterparty decision is final for that entry.
--  6. reviewable_journal_entry_ids() offers each reviewer only entries they
--     have authority over; list_counterparty_review_queue_v1() is the narrow
--     read door for a counterparty (journal_entries RLS is NOT widened: the
--     entry is closed by default and the explicit submission is the grant).
--
-- PROVENANCE: every row written here carries confirmation_scope.provenance
-- with separate effective_event_time / recorded_at / imported_at / origin /
-- recorded_by / imported_by / confirmed_by fields. origin is
-- NATIVE_PLATFORM_EMPLOYER_CONFIRMATION or NATIVE_PLATFORM_CLIENT_CONFIRMATION.
-- RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION exists as a contract value but
-- is NEVER written to this table (historical rows go through the existing
-- import mechanism, organization_evidence_*; the importer is never the
-- confirmer).
--
-- KNOWN LIMIT (stated, not hidden): the database cannot prove that a
-- counterparty ORGANIZATION is a real, independent company - only that no
-- profile is an active member of both the subject's and the counterparty's
-- organization and that the counterparty itself created the link from a real
-- project assignment. Organization independence beyond that is the later
-- INDEPENDENTLY_VERIFIED tier, which this file does not touch.
--
-- NOT TOUCHED: any existing row (the 5 historical self-confirmations and the 2
-- self-verified worker_skills rows are preserved byte for byte; they are only
-- classified at read time), grants/policies on existing tables,
-- confirm_entry_and_verify_skills / apply_learning_auto_confirmation (they
-- stay employer-only and are protected by the trigger), the confirmer_role
-- CHECK, journal_entries, engagement_contexts, organization_evidence_*.
--
-- Rollback: supabase/rollbacks/20261003150500_journal_counterparty_review_authority_v1.down.sql

begin;

-- ===========================================================================
-- 0. Profile-parameterised organization predicates (internal only)
--    Same predicate as public.manages_organization(), but for an explicit
--    profile so the guard trigger can judge ANY confirmer, not just auth.uid().
--    EXECUTE is not granted to anyone but the owner: these answer "which orgs
--    does this profile belong to", which must not become an enumeration oracle.
-- ===========================================================================
create or replace function public.profile_manages_organization_v1(p_profile uuid, p_org uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select p_profile is not null and p_org is not null and (
    exists (select 1 from public.engagement_contexts ec
             where ec.profile_id = p_profile and ec.organization_id = p_org
               and ec.status = 'active'
               and ec.relationship_slug in ('manager','owner','external_manager'))
    or exists (select 1 from public.company_memberships m
                where m.profile_id = p_profile and m.organization_id = p_org
                  and m.status = 'active'
                  and m.role in ('owner','admin','manager','external_manager')));
$$;

create or replace function public.profiles_share_organization_v1(p_a uuid, p_b uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with a as (
    select ec.organization_id org from public.engagement_contexts ec
     where ec.profile_id = p_a and ec.status = 'active' and ec.organization_id is not null
    union
    select m.organization_id from public.company_memberships m
     where m.profile_id = p_a and m.status = 'active'),
  b as (
    select ec.organization_id org from public.engagement_contexts ec
     where ec.profile_id = p_b and ec.status = 'active' and ec.organization_id is not null
    union
    select m.organization_id from public.company_memberships m
     where m.profile_id = p_b and m.status = 'active')
  select p_a is not null and p_b is not null
     and exists (select 1 from a join b using (org));
$$;

create or replace function public.profiles_co_manage_organization_v1(p_a uuid, p_b uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with a as (
    select ec.organization_id org from public.engagement_contexts ec
     where ec.profile_id = p_a and ec.status = 'active' and ec.organization_id is not null
       and ec.relationship_slug in ('manager','owner','external_manager')
    union
    select m.organization_id from public.company_memberships m
     where m.profile_id = p_a and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')),
  b as (
    select ec.organization_id org from public.engagement_contexts ec
     where ec.profile_id = p_b and ec.status = 'active' and ec.organization_id is not null
       and ec.relationship_slug in ('manager','owner','external_manager')
    union
    select m.organization_id from public.company_memberships m
     where m.profile_id = p_b and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager'))
  select p_a is not null and p_b is not null
     and exists (select 1 from a join b using (org));
$$;

create or replace function public.profile_is_member_of_organization_v1(p_profile uuid, p_org uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select p_profile is not null and p_org is not null and (
    exists (select 1 from public.engagement_contexts ec
             where ec.profile_id = p_profile and ec.organization_id = p_org and ec.status = 'active')
    or exists (select 1 from public.company_memberships m
                where m.profile_id = p_profile and m.organization_id = p_org and m.status = 'active'));
$$;

-- ===========================================================================
-- 1. The canonical counterparty relation (the PARTY, not the login)
-- ===========================================================================
create table public.work_counterparty_links (
  id                           uuid primary key default gen_random_uuid(),
  worker_id                    uuid not null references public.workers(id),
  project_id                   uuid not null references public.projects(id),
  counterparty_organization_id uuid not null references public.organizations(id),
  -- Same vocabulary as organization_evidence_parties.party_role (+ customer /
  -- contracting_party for the service and contractor relationships).
  party_role                   text not null check (party_role in (
                                 'client','end_client','project_owner','customer','contracting_party')),
  -- The real platform fact the link is derived from. One basis in slice 1.
  basis                        text not null default 'project_assignment'
                                 check (basis in ('project_assignment')),
  established_by               uuid not null references public.profiles(id),
  established_at               timestamptz not null default now(),
  revoked_at                   timestamptz,
  revoked_by                   uuid references public.profiles(id),
  constraint work_counterparty_links_revocation_shape
    check ((revoked_at is null) = (revoked_by is null))
);
create unique index work_counterparty_links_one_active
  on public.work_counterparty_links (worker_id, project_id, counterparty_organization_id, party_role)
  where revoked_at is null;
create index work_counterparty_links_org_idx
  on public.work_counterparty_links (counterparty_organization_id) where revoked_at is null;

comment on table public.work_counterparty_links is
  'WHO is the legitimate counterparty of one worker''s work on one project: an organization (the PARTY) in an explicit role. Created only by the counterparty organization''s own authorized representative from a real project assignment - never by the subject, never backfilled. Append-only: only revocation (revoked_at/revoked_by) may be written afterwards. The authority to accept work derives from this relation; the logged-in profile is only the actor. Reuses the party_role vocabulary and the authority predicate of organization_evidence_parties.';

create table public.journal_entry_review_submissions (
  id                         uuid primary key default gen_random_uuid(),
  entry_id                   uuid not null unique references public.journal_entries(id),
  worker_id                  uuid not null references public.workers(id),
  link_id                    uuid not null references public.work_counterparty_links(id),
  submitted_by               uuid not null references public.profiles(id),
  submitted_at               timestamptz not null default now(),
  -- Set by the server when this entry is the canonical correction
  -- (journal_entries.correction_of) of an entry that was itself submitted.
  resubmission_of_entry_id   uuid references public.journal_entries(id)
);
create index journal_entry_review_submissions_link_idx
  on public.journal_entry_review_submissions (link_id);

comment on table public.journal_entry_review_submissions is
  'Explicit, append-only SUBMIT FOR REVIEW event of one journal entry to its resolved counterparty. Creating an entry does not submit it. One row per entry (idempotent); a corrected entry is a new entry and gets its own submission carrying resubmission_of_entry_id.';

create or replace function public.work_counterparty_append_only_v1()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: % rows cannot be deleted', tg_table_name using errcode = '42501';
  end if;
  if tg_table_name = 'work_counterparty_links' then
    if old.revoked_at is not null
       or (new.id, new.worker_id, new.project_id, new.counterparty_organization_id,
           new.party_role, new.basis, new.established_by, new.established_at)
          is distinct from
          (old.id, old.worker_id, old.project_id, old.counterparty_organization_id,
           old.party_role, old.basis, old.established_by, old.established_at) then
      raise exception 'append_only: only a first revocation may be written to work_counterparty_links'
        using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'append_only: % rows cannot be updated', tg_table_name using errcode = '42501';
end $$;

create trigger work_counterparty_links_append_only
  before update or delete on public.work_counterparty_links
  for each row execute function public.work_counterparty_append_only_v1();
create trigger journal_entry_review_submissions_append_only
  before update or delete on public.journal_entry_review_submissions
  for each row execute function public.work_counterparty_append_only_v1();

alter table public.work_counterparty_links enable row level security;
alter table public.journal_entry_review_submissions enable row level security;
revoke all on public.work_counterparty_links, public.journal_entry_review_submissions from public, anon;
grant select on public.work_counterparty_links, public.journal_entry_review_submissions to authenticated;

-- Reads only; every write goes through the SECURITY DEFINER commands below.
create policy work_counterparty_links_select on public.work_counterparty_links
  for select to authenticated
  using (public.owns_worker(worker_id)
         or public.manages_organization(counterparty_organization_id)
         or public.is_admin());
create policy journal_entry_review_submissions_select on public.journal_entry_review_submissions
  for select to authenticated
  using (public.owns_worker(worker_id)
         or exists (select 1 from public.work_counterparty_links l
                     where l.id = journal_entry_review_submissions.link_id
                       and public.manages_organization(l.counterparty_organization_id))
         or public.is_admin());

-- ===========================================================================
-- 2. A link is only as good as the fact under it (re-checked at every use)
-- ===========================================================================
create or replace function public.work_counterparty_link_valid_v1(p_link_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select exists (
    select 1
      from public.work_counterparty_links l
      join public.projects p on p.id = l.project_id
      join public.workers w on w.id = l.worker_id
     where l.id = p_link_id
       and l.revoked_at is null
       and p.organization_id = l.counterparty_organization_id
       and exists (select 1 from public.project_worker_assignments a
                    where a.project_id = l.project_id and a.worker_id = l.worker_id
                      and a.status = 'active')
       -- a member of the counterparty organization is that organization's
       -- employee, not its counterparty: employer review is their path.
       and not public.profile_is_member_of_organization_v1(w.profile_id, l.counterparty_organization_id));
$$;

-- ===========================================================================
-- 3. THE resolver: employer | counterparty | NULL
-- ===========================================================================
create or replace function public.journal_entry_review_authority_v1(p_entry_id uuid, p_actor uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_worker uuid; v_subject uuid; v_org uuid; v_enabled boolean; v_project uuid;
  v_sub uuid; v_link uuid; v_party uuid; v_role text;
begin
  if p_actor is null then return null; end if;
  select je.worker_id, w.profile_id, ec.organization_id,
         coalesce(ec.journal_review_enabled, false), je.project_id
    into v_worker, v_subject, v_org, v_enabled, v_project
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join public.workers w on w.id = je.worker_id
   where je.id = p_entry_id;
  if not found then return null; end if;
  -- The subject can never be the party that accepts their own work.
  if v_subject is not null and v_subject = p_actor then return null; end if;

  -- EMPLOYER: the organization of the entry's own (review-enabled) engagement.
  -- The actor must manage it and must NOT be a co-manager of any organization
  -- the subject manages: the manager of the subject's own sole-trader / own
  -- organization is the subject's side, not an employer.
  if v_org is not null and v_enabled
     and public.profile_manages_organization_v1(p_actor, v_org)
     and not public.profiles_co_manage_organization_v1(v_subject, p_actor) then
    return jsonb_build_object('basis', 'employer', 'party_organization_id', v_org);
  end if;

  -- COUNTERPARTY: an explicitly SUBMITTED entry whose resolved counterparty
  -- link is still valid, reviewed by an authorized representative of that
  -- party who shares no organization with the subject.
  if v_project is not null and v_worker is not null then
    select s.id, l.id, l.counterparty_organization_id, l.party_role
      into v_sub, v_link, v_party, v_role
      from public.journal_entry_review_submissions s
      join public.work_counterparty_links l on l.id = s.link_id
     where s.entry_id = p_entry_id
       and l.worker_id = v_worker and l.project_id = v_project
       and public.work_counterparty_link_valid_v1(l.id)
       and l.counterparty_organization_id is distinct from v_org
       and public.profile_manages_organization_v1(p_actor, l.counterparty_organization_id)
       and not public.profiles_share_organization_v1(v_subject, p_actor);
    if found then
      return jsonb_build_object('basis', 'counterparty', 'party_organization_id', v_party,
                                'link_id', v_link, 'submission_id', v_sub, 'party_role', v_role);
    end if;
  end if;
  return null;
end $$;

-- ===========================================================================
-- 4. The single choke point
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.journal_entry_confirmations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_superseded uuid;
  v_deleted    timestamptz;
  v_worker     uuid;
  v_subject    uuid;
  v_auth       jsonb;
  v_claimed    text;
begin
  -- LOCK STRENGTH (rev12, Codex P1): FOR UPDATE, not FOR KEY SHARE. The two
  -- staleness paths take DIFFERENT locks: the supersedes take an explicit
  -- FOR UPDATE, but journal_entry_soft_delete (0018) is a bare
  -- `update ... set deleted_at, updated_at` touching no key column, so it
  -- takes only FOR NO KEY UPDATE. FOR KEY SHARE conflicts with the former but
  -- NOT the latter, so a confirmation racing a SOFT DELETE could pass this
  -- guard and commit - leaving an append-only confirmation attached to a
  -- deleted entry. FOR UPDATE conflicts with both.
  select superseded_by, deleted_at, worker_id
    into v_superseded, v_deleted, v_worker
    from public.journal_entries
   where id = new.entry_id
   for update;
  if not found then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if v_deleted is not null then
    raise exception 'entry_deleted' using errcode = '42P10';
  end if;
  if v_superseded is not null then
    raise exception 'entry_superseded' using errcode = '55000';
  end if;

  -- A historical confirmation is not a platform action. This table records
  -- what a platform actor did on the platform; it must never carry a
  -- reconstructed origin (historical rows use the import mechanism).
  if coalesce(new.confirmation_scope #>> '{provenance,origin}', '') like 'RECONSTRUCTED%' then
    raise exception 'historical_confirmation_not_a_platform_action' using errcode = '22023';
  end if;

  -- AUTHORITY FROM THE WORK RELATIONSHIP. Whoever the confirmer is, they must
  -- be the actor of a legitimate party of this entry's work relationship.
  v_auth := public.journal_entry_review_authority_v1(new.entry_id, new.confirmer_id);
  if v_auth is null then
    select w.profile_id into v_subject from public.workers w where w.id = v_worker;
    if v_subject is not null and v_subject = new.confirmer_id then
      raise exception 'self_review_not_allowed' using errcode = '42501';
    end if;
    raise exception 'review_authority_not_established' using errcode = '42501';
  end if;
  -- The recorded basis must be the resolved one, so a row can never be
  -- written as an employer confirmation by a counterparty, or the reverse.
  v_claimed := coalesce(new.confirmation_scope #>> '{authority,basis}', 'employer');
  if v_claimed is distinct from (v_auth ->> 'basis') then
    raise exception 'authority_basis_mismatch' using errcode = '42501';
  end if;
  return new;
end $function$;

-- ===========================================================================
-- 5. Register / revoke the counterparty (done by the PARTY)
-- ===========================================================================
create or replace function public.register_work_counterparty_link_v1(
  p_project_id uuid, p_worker_id uuid, p_party_role text default 'client')
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_subject uuid; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_party_role is null or p_party_role not in
     ('client','end_client','project_owner','customer','contracting_party') then
    return 'invalid_party_role';
  end if;
  select p.organization_id into v_org from public.projects p where p.id = p_project_id;
  if not found then return 'project_not_found'; end if;
  if v_org is null then return 'project_has_no_organization'; end if;
  if not public.profile_manages_organization_v1(uid, v_org) then return 'not_authorized'; end if;
  select w.profile_id into v_subject from public.workers w where w.id = p_worker_id;
  if not found then return 'worker_not_found'; end if;
  if v_subject is not null and v_subject = uid then return 'subject_cannot_register_own_counterparty'; end if;
  if not exists (select 1 from public.project_worker_assignments a
                  where a.project_id = p_project_id and a.worker_id = p_worker_id and a.status = 'active') then
    return 'no_work_relationship';
  end if;
  if public.profile_is_member_of_organization_v1(v_subject, v_org) then
    return 'subject_is_member_of_counterparty';
  end if;
  if public.profiles_share_organization_v1(v_subject, uid) then
    return 'counterparty_not_independent';
  end if;

  select l.id into v_id from public.work_counterparty_links l
   where l.worker_id = p_worker_id and l.project_id = p_project_id
     and l.counterparty_organization_id = v_org and l.party_role = p_party_role
     and l.revoked_at is null;
  if found then return 'already_registered'; end if;

  insert into public.work_counterparty_links
    (worker_id, project_id, counterparty_organization_id, party_role, basis, established_by)
  values (p_worker_id, p_project_id, v_org, p_party_role, 'project_assignment', uid)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'register_work_counterparty_link', 'work_counterparty_links', v_id,
    jsonb_build_object('project_id', p_project_id, 'worker_id', p_worker_id,
                       'counterparty_organization_id', v_org, 'party_role', p_party_role));
  return 'registered';
end $$;

create or replace function public.revoke_work_counterparty_link_v1(p_link_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_revoked timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select l.counterparty_organization_id, l.revoked_at into v_org, v_revoked
    from public.work_counterparty_links l where l.id = p_link_id;
  if not found then return 'link_not_found'; end if;
  if not public.profile_manages_organization_v1(uid, v_org) then return 'not_authorized'; end if;
  if v_revoked is not null then return 'already_revoked'; end if;
  update public.work_counterparty_links set revoked_at = now(), revoked_by = uid where id = p_link_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'revoke_work_counterparty_link', 'work_counterparty_links', p_link_id,
          jsonb_build_object('counterparty_organization_id', v_org));
  return 'revoked';
end $$;

-- ===========================================================================
-- 6. Explicit SUBMIT FOR REVIEW (the subject's act; resolves the counterparty)
-- ===========================================================================
create or replace function public.submit_journal_entry_for_review_v1(
  p_entry_id uuid, p_link_id uuid default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_worker uuid; v_project uuid; v_superseded uuid; v_deleted timestamptz; v_corr uuid;
  v_link uuid; v_n int; v_existing uuid; v_resub uuid; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select je.worker_id, je.project_id, je.superseded_by, je.deleted_at, je.correction_of
    into v_worker, v_project, v_superseded, v_deleted, v_corr
    from public.journal_entries je where je.id = p_entry_id for update;
  if not found then return 'entry_not_found'; end if;
  if not public.owns_worker(v_worker) then return 'not_authorized'; end if;
  if v_deleted is not null then return 'entry_deleted'; end if;
  if v_superseded is not null then return 'entry_superseded'; end if;
  select s.id into v_existing from public.journal_entry_review_submissions s where s.entry_id = p_entry_id;
  if found then return 'already_submitted'; end if;
  if v_project is null then return 'entry_has_no_project'; end if;

  if p_link_id is not null then
    if not exists (select 1 from public.work_counterparty_links l
                    where l.id = p_link_id and l.worker_id = v_worker and l.project_id = v_project)
       or not public.work_counterparty_link_valid_v1(p_link_id) then
      return 'counterparty_not_valid';
    end if;
    v_link := p_link_id;
  else
    select count(*), min(l.id::text)::uuid into v_n, v_link
      from public.work_counterparty_links l
     where l.worker_id = v_worker and l.project_id = v_project
       and public.work_counterparty_link_valid_v1(l.id);
    if v_n = 0 then return 'no_counterparty_registered'; end if;
    if v_n > 1 then return 'counterparty_ambiguous'; end if;
  end if;

  -- Server-derived (never caller input): this entry is the canonical correction
  -- of an entry that was itself submitted.
  select s.entry_id into v_resub from public.journal_entry_review_submissions s where s.entry_id = v_corr;

  insert into public.journal_entry_review_submissions
    (entry_id, worker_id, link_id, submitted_by, resubmission_of_entry_id)
  values (p_entry_id, v_worker, v_link, uid, v_resub)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'submit_journal_entry_for_review', 'journal_entries', p_entry_id,
          jsonb_build_object('link_id', v_link, 'submission_id', v_id, 'resubmission_of_entry_id', v_resub));
  return 'submitted';
end $$;

-- ===========================================================================
-- 7. review_journal_entry: employer path unchanged in behaviour, counterparty
--    path added, authority resolved from the relationship
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.review_journal_entry(p_entry_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_org uuid; v_worker uuid; v_eng uuid; v_role text; v_action text; v_enabled boolean;
  v_superseded uuid; v_deleted timestamptz;
  v_subject uuid; v_auth jsonb; v_basis text; v_party uuid; v_last text; v_entry_created timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected','changes_requested') then return 'invalid_decision'; end if;

  select ec.organization_id, je.worker_id, coalesce(ec.journal_review_enabled, false),
         je.superseded_by, je.deleted_at, je.created_at
    into v_org, v_worker, v_enabled, v_superseded, v_deleted, v_entry_created
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where je.id = p_entry_id;
  if not found then return 'entry_not_found'; end if;
  -- Stale-confirmation refusal (owner-hold v4 items 2/3): a superseded or
  -- deleted entry can no longer be confirmed. The BEFORE INSERT guard
  -- trigger on journal_entry_confirmations is the hard serialization point;
  -- this check returns the clean status in the common (non-racing) case.
  if v_deleted is not null then return 'entry_deleted'; end if;
  if v_superseded is not null then return 'entry_superseded'; end if;

  select w.profile_id into v_subject from public.workers w where w.id = v_worker;
  v_auth := public.journal_entry_review_authority_v1(p_entry_id, uid);

  if v_auth is null then
    -- Clean statuses, in the order the pre-existing function gave them.
    if v_org is null then return 'entry_not_org_scoped'; end if;
    if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;
    if v_subject is not null and v_subject = uid then return 'self_review_not_allowed'; end if;
    if not v_enabled then return 'review_not_enabled'; end if;
    if not exists (select 1 from public.engagement_contexts ec
                    where ec.profile_id = uid and ec.organization_id = v_org and ec.status = 'active'
                      and ec.relationship_slug in ('manager','owner','external_manager')) then
      return 'no_reviewer_engagement';
    end if;
    return 'review_authority_not_established';
  end if;

  v_basis := v_auth ->> 'basis';
  v_party := (v_auth ->> 'party_organization_id')::uuid;

  select ec.id, ec.relationship_slug into v_eng, v_role
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id = v_party and ec.status = 'active'
    and ec.relationship_slug in ('manager','owner','external_manager') limit 1;
  if v_eng is null then return 'no_reviewer_engagement'; end if;

  if v_basis = 'counterparty' then
    -- ACCEPT is final; a dispute may be withdrawn/resolved only by a later
    -- acceptance; repeating the same decision is idempotent (no new row).
    select c.confirmation_scope ->> 'decision' into v_last
      from public.journal_entry_confirmations c
     where c.entry_id = p_entry_id and c.confirmation_scope #>> '{authority,basis}' = 'counterparty'
     order by c.created_at desc, c.id desc limit 1;
    if v_last is not null then
      if v_last = p_decision then return p_decision; end if;
      if v_last = 'approved' then return 'already_accepted'; end if;
    end if;
    v_action := case p_decision when 'approved' then 'client_accept'
                                when 'rejected' then 'client_dispute'
                                else 'client_request_correction' end;
  else
    v_action := case p_decision when 'approved' then 'confirm'
                                when 'rejected' then 'reject'
                                else 'request_changes' end;
  end if;

  insert into public.journal_entry_confirmations
    (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
  values (p_entry_id, uid, v_eng, v_role,
    jsonb_build_object('action', v_action, 'decision', p_decision,
      'note', nullif(btrim(coalesce(p_note,'')), ''),
      'authority', v_auth,
      'provenance', jsonb_build_object(
        'origin', case v_basis when 'counterparty' then 'NATIVE_PLATFORM_CLIENT_CONFIRMATION'
                               else 'NATIVE_PLATFORM_EMPLOYER_CONFIRMATION' end,
        'effective_event_time', null,
        'entry_created_at', v_entry_created,
        'recorded_at', now(),
        'recorded_by', uid,
        'imported_at', null,
        'imported_by', null,
        'confirmed_by_profile_id', uid,
        'confirmed_by_party_organization_id', v_party,
        'subject_profile_id', v_subject,
        'source', 'platform_native')));

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'review_journal_entry', 'journal_entries', p_entry_id,
    jsonb_build_object('decision', p_decision, 'organization_id', v_party, 'worker_id', v_worker,
                       'authority_basis', v_basis));
  return p_decision;
end $function$;

-- ===========================================================================
-- 8. Review queue: only entries the reviewer has authority over
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.reviewable_journal_entry_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  return query
    -- EMPLOYER: as before, but never the actor's own entries, never entries
    -- the actor has no authority over, and an entry whose ONLY confirmations
    -- are the subject's own historical self-confirmations stays reviewable.
    select je.id
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join public.workers w on w.id = je.worker_id
    where ec.organization_id is not null
      -- Stale rows are no longer reviewable (owner-hold v4 follow-through).
      and je.superseded_by is null
      and je.deleted_at is null
      and coalesce(ec.journal_review_enabled, false) is true
      and coalesce(w.profile_id <> uid, true)
      and (public.journal_entry_review_authority_v1(je.id, uid) ->> 'basis') = 'employer'
      and not exists (select 1 from public.journal_entry_confirmations c
                       where c.entry_id = je.id
                         and c.confirmer_id is distinct from w.profile_id)
    union
    -- COUNTERPARTY: submitted, not yet decided by the counterparty.
    select s.entry_id
    from public.journal_entry_review_submissions s
    join public.journal_entries je on je.id = s.entry_id
    where je.superseded_by is null and je.deleted_at is null
      and (public.journal_entry_review_authority_v1(s.entry_id, uid) ->> 'basis') = 'counterparty'
      and not exists (select 1 from public.journal_entry_confirmations c
                       where c.entry_id = s.entry_id
                         and c.confirmation_scope #>> '{authority,basis}' = 'counterparty');
end $function$;

-- ===========================================================================
-- 9. The counterparty's narrow read door (journal_entries RLS NOT widened)
-- ===========================================================================
create or replace function public.list_counterparty_review_queue_v1()
 returns table (
   entry_id uuid, submission_id uuid, link_id uuid, project_id uuid, worker_id uuid,
   party_organization_id uuid, party_role text, original_text text, original_language text,
   entry_created_at timestamptz, submitted_at timestamptz, resubmission_of_entry_id uuid,
   latest_decision text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  return query
    select je.id, s.id, s.link_id, je.project_id, je.worker_id,
           l.counterparty_organization_id, l.party_role, je.original_text, je.original_language::text,
           je.created_at, s.submitted_at, s.resubmission_of_entry_id,
           (select c.confirmation_scope ->> 'decision' from public.journal_entry_confirmations c
             where c.entry_id = je.id and c.confirmation_scope #>> '{authority,basis}' = 'counterparty'
             order by c.created_at desc, c.id desc limit 1)
      from public.journal_entry_review_submissions s
      join public.journal_entries je on je.id = s.entry_id
      join public.work_counterparty_links l on l.id = s.link_id
     where je.deleted_at is null and je.superseded_by is null
       and (public.journal_entry_review_authority_v1(s.entry_id, uid) ->> 'basis') = 'counterparty'
     order by s.submitted_at desc;
end $$;

-- ===========================================================================
-- 10. ACLs, one explicit statement per function (anon never reaches any of
--     them; replaced functions keep the grants production already has, so the
--     REVOKEs below are no-ops there). New commands -> authenticated only;
--     helpers/resolver/guard -> owner only.
-- ===========================================================================
revoke all on function public.register_work_counterparty_link_v1(uuid, uuid, text) from public, anon;
revoke all on function public.revoke_work_counterparty_link_v1(uuid) from public, anon;
revoke all on function public.submit_journal_entry_for_review_v1(uuid, uuid) from public, anon;
revoke all on function public.list_counterparty_review_queue_v1() from public, anon;
revoke all on function public.review_journal_entry(uuid, text, text) from public, anon;
revoke all on function public.reviewable_journal_entry_ids() from public, anon;
grant execute on function public.register_work_counterparty_link_v1(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_work_counterparty_link_v1(uuid) to authenticated;
grant execute on function public.submit_journal_entry_for_review_v1(uuid, uuid) to authenticated;
grant execute on function public.list_counterparty_review_queue_v1() to authenticated;
revoke all on function public.profile_manages_organization_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.profiles_share_organization_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.profiles_co_manage_organization_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.profile_is_member_of_organization_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.work_counterparty_link_valid_v1(uuid) from public, anon, authenticated;
revoke all on function public.journal_entry_review_authority_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.journal_entry_confirmations_guard() from public, anon, authenticated;
revoke all on function public.work_counterparty_append_only_v1() from public, anon, authenticated;

commit;
