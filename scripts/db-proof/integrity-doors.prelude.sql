-- ============================================================================
-- INTEGRITY DOORS v1 - PROOF HARNESS PRELUDE (throwaway PostgreSQL only).
--
-- Reproduces the PRODUCTION shape (read-only pg_policy / pg_get_functiondef /
-- pg_get_constraintdef / pg_trigger / role_column_grants on project
-- gorgitwvdzxbnaxhrsrw, 2026-10-05) of exactly the objects the four doors turn
-- on:
--   G-1 journal_entries (+ policies, FKs, create_journal_entry_full is loaded
--       VERBATIM from the repo by the .sh, journal_entry_supersede_v2 likewise)
--   G-4 organization_people (+ policies, CHECKs, the live consent guard) and the
--       evidence records / events policies that read link_state
--   G-5 worker_skills (+ policies, CHECKs, set_updated_at, live column grants)
--   F-5 organization_evidence_events (+ every live INSERT policy, PERMISSIVE and
--       RESTRICTIVE, CHECKs, the dispute-state guard)
-- Anything not named here is a minimal stand-in carrying only the columns the
-- measured predicates touch. auth.uid() is a session-GUC stub so one psql
-- session can act as any actor; every probe runs `set local role authenticated`.
-- Definer functions are owned by postgres and RLS is not forced, as in prod.
-- Never point this at production or a shared local stack. It DROPs schema public.
-- ============================================================================
drop schema if exists public cascade; create schema public;
drop schema if exists auth cascade;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;
grant usage on schema public to authenticated, anon, service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ── identity / org spine (stand-ins, columns as used by the predicates) ──────
create table public.profiles (id uuid primary key, active_role text);
create table public.organizations (id uuid primary key, display_name text);
create table public.workers (id uuid primary key, profile_id uuid unique references public.profiles(id), display_name text);
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid, organization_id uuid, status text, role text);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  status text not null default 'active',
  relationship_slug text);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  status text, title text);
create table public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id),
  project_id uuid references public.projects(id),
  status text not null default 'active');
create table public.professions (id uuid primary key default gen_random_uuid());
create table public.skills (id uuid primary key default gen_random_uuid(), slug text unique, is_active boolean default true);
create table public.productivity_units (slug text primary key);

create function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
$$;
-- live owns_worker (verbatim)
create function public.owns_worker(w uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.workers x where x.id = w and x.profile_id = auth.uid())
$$;
create function public.manages_organization(org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.engagement_contexts ec where ec.profile_id = auth.uid() and ec.organization_id = org
                   and ec.status = 'active' and ec.relationship_slug in ('manager','owner','external_manager'))
  or exists (select 1 from public.company_memberships m where m.profile_id = auth.uid() and m.organization_id = org
                   and m.status = 'active' and m.role in ('owner','admin','manager','external_manager'))
$$;
create function public.can_manage_project(p_project_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.projects p where p.id = p_project_id
                   and (public.manages_organization(p.organization_id) or public.is_admin()))
$$;

alter table public.engagement_contexts enable row level security;
create policy ec_self on public.engagement_contexts for select using (profile_id = auth.uid() or public.manages_organization(organization_id) or public.is_admin());
alter table public.workers enable row level security;
create policy workers_read on public.workers for select using (true);
alter table public.projects enable row level security;
create policy projects_read on public.projects for select using (true);
alter table public.project_worker_assignments enable row level security;
create policy pwa_read on public.project_worker_assignments for select using (true);
grant select on public.profiles, public.organizations, public.workers, public.company_memberships,
  public.engagement_contexts, public.projects, public.project_worker_assignments,
  public.professions, public.skills, public.productivity_units to authenticated;

-- ── G-1: journal_entries (live columns / constraints / policies; NO trigger) ─
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete restrict,
  entry_type_slug text not null check (entry_type_slug = any (array['freeform','structured','hybrid'])),
  profession_id uuid references public.professions(id),
  original_text text not null,
  original_language char(2) not null,
  hash_prev text, hash_self text,
  visibility_scope text not null default 'closed'
    check (visibility_scope = any (array['closed','team','org','client_report','public_proof_link'])),
  correction_of uuid references public.journal_entries(id),
  superseded_by uuid references public.journal_entries(id),
  project_id uuid references public.projects(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create table public.journal_entry_metrics (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.journal_entries(id), metric_slug text, value_text text,
  value_numeric numeric, unit_slug text, source text);
create table public.journal_entry_confirmations (id uuid primary key default gen_random_uuid(), entry_id uuid references public.journal_entries(id));
create table public.journal_entry_photos (
  id uuid primary key default gen_random_uuid(), entry_id uuid references public.journal_entries(id),
  upload_status text, updated_at timestamptz);
create table public.journal_entry_skills (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references public.journal_entries(id), worker_id uuid, skill_id uuid,
  unique (journal_entry_id, skill_id));
alter table public.journal_entries enable row level security;
create policy journal_entries_select on public.journal_entries for select using (
  owns_worker(worker_id) OR is_admin() OR (EXISTS (SELECT 1 FROM engagement_contexts ec
    WHERE ((ec.id = journal_entries.engagement_context_id) AND manages_organization(ec.organization_id)))));
create policy journal_entries_insert on public.journal_entries for insert
  with check ((owns_worker(worker_id) AND (visibility_scope = 'closed'::text)));
-- live grants: authenticated has table SELECT + INSERT only (no UPDATE/DELETE)
grant select, insert on public.journal_entries to authenticated;
grant select, insert on public.journal_entry_metrics, public.journal_entry_skills to authenticated;

-- ── G-5: worker_skills (live columns / constraints / policies / grants) ──────
create table public.worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete cascade,
  self_rated_level integer check (self_rated_level >= 1 and self_rated_level <= 5),
  verified boolean not null default false,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'self_declared'
    check (source = any (array['self_declared','work_journal','manager_confirmed'])),
  current_pace_value numeric,
  current_pace_unit_slug text references public.productivity_units(slug),
  confidence_score integer not null default 0,
  confidence_bin text not null default 'red' check (confidence_bin = any (array['red','green','yellow'])),
  last_recompute_at timestamptz,
  unique (worker_id, skill_id));
create trigger set_updated_at before update on public.worker_skills for each row execute function public.set_updated_at();
alter table public.worker_skills enable row level security;
create policy worker_skills_select on public.worker_skills for select using (true);  -- (live: can_view_worker; not measured here)
create policy worker_skills_write on public.worker_skills for all
  using (owns_worker(worker_id) OR is_admin()) with check (owns_worker(worker_id) OR is_admin());
grant select, insert, update, delete on public.worker_skills to authenticated;

-- A stand-in for the SECURITY DEFINER pipeline writers. The UPDATE statement is
-- copied VERBATIM from confirm_entry_and_verify_skills / apply_learning_auto_
-- confirmation (20260720150000 lines 609-614, 20260627132759 lines 285-290);
-- the surrounding review authority checks are NOT reproduced (not under test).
create function public.confirm_entry_and_verify_skills(p_worker uuid, p_skill_ids uuid[])
returns int language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); v_worker uuid := p_worker; v_n int;
begin
  update public.worker_skills
     set verified = true, verified_by = uid, verified_at = now(),
         source = 'manager_confirmed', confidence_bin = 'green', updated_at = now()
   where worker_id = v_worker and skill_id = any(p_skill_ids)
     and (verified is distinct from true);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.confirm_entry_and_verify_skills(uuid, uuid[]) from public, anon;
grant execute on function public.confirm_entry_and_verify_skills(uuid, uuid[]) to authenticated;

-- ── G-4 / F-5: organization evidence (live columns, CHECKs, policies) ────────
create table public.organization_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  normalized_name text not null default 'x' check (char_length(normalized_name) between 1 and 200),
  external_ref text, source_note text,
  relationship_kind text not null default 'employee',
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
create table public.evidence_import_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid, supplied_by_organization_id uuid,
  supplier_role text, source_kind text, actor_kind text, source_bytes_sha256 text);
create table public.org_documents (id uuid primary key default gen_random_uuid(), organization_id uuid, document_type_slug text, status text, classification text);
create table public.document_files (id uuid primary key default gen_random_uuid(), org_document_id uuid, content_sha256 text, superseded_at timestamptz);
create table public.organization_evidence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  organization_person_id uuid,
  supplier_role text, session_id uuid, supplied_by_organization_id uuid, source_kind text, row_origin text,
  imported_by_profile_id uuid, hours numeric, activity_date date,
  constraint organization_evidence_records_org_scope unique (id, organization_id),
  foreign key (organization_person_id, organization_id) references public.organization_people(id, organization_id));
create table public.organization_evidence_parties (
  id uuid primary key default gen_random_uuid(), organization_id uuid, record_id uuid references public.organization_evidence_records(id),
  party_organization_id uuid, party_role text);
create table public.organization_evidence_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  record_id uuid not null,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_organization_id uuid references public.organizations(id) on delete set null,
  actor_role text,
  note text,
  replacement_record_id uuid references public.organization_evidence_records(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_evidence_events_record_fk foreign key (record_id, organization_id)
    references public.organization_evidence_records(id, organization_id) on delete cascade,
  constraint organization_evidence_events_actor_role check (
    (event_type = any (array['attested','independently_verified'])) = (actor_role is not null)),
  constraint organization_evidence_events_actor_role_check check (
    actor_role is null or actor_role = any (array['employer','agency','client','end_client','project_owner','subcontractor','education_provider','training_provider','assessor','verifier','placement_provider','public_body','sector_body','other'])),
  constraint organization_evidence_events_event_type_chk check (
    event_type = any (array['attested','attestation_withdrawn','independently_verified','verification_withdrawn','withdrawn','reinstated','disputed','dispute_withdrawn','corrected','source_preserved'])),
  constraint organization_evidence_events_note_check check (note is null or char_length(note) <= 1000));

-- live consent guard (verbatim) + live dispute-state guard (verbatim)
create function public.organization_people_guard_subject_consent() returns trigger
language plpgsql set search_path to 'public' as $function$
begin
  if new.link_state = 'linked'
     and new.link_method = 'worker_confirmed'
     and (old.link_state is distinct from 'linked'
          or old.link_method is distinct from 'worker_confirmed'
          or old.linked_profile_id is distinct from new.linked_profile_id)
  then
    if new.linked_profile_id is null or auth.uid() is distinct from new.linked_profile_id then
      raise exception 'roster link confirmation is the subject''s alone'
        using errcode = '42501';
    end if;
    new.linked_by := new.linked_profile_id;
    new.linked_at := coalesce(new.linked_at, now());
  end if;
  return new;
end;
$function$;
create trigger organization_people_subject_consent_guard before update on public.organization_people
  for each row execute function public.organization_people_guard_subject_consent();
create function public.organization_evidence_dispute_state_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_latest text;
begin
  if new.event_type not in ('disputed', 'dispute_withdrawn') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.record_id::text || ':' || coalesce(new.actor_profile_id::text, ''), 0));
  select e.event_type into v_latest from public.organization_evidence_events e
   where e.record_id = new.record_id and e.actor_profile_id is not distinct from new.actor_profile_id
     and e.event_type in ('disputed', 'dispute_withdrawn')
   order by e.created_at desc, (e.event_type = 'dispute_withdrawn') desc limit 1;
  if new.event_type = 'disputed' and v_latest is not distinct from 'disputed' then
    raise exception 'a contest by this actor already stands on this record' using errcode = '23505'; end if;
  if new.event_type = 'dispute_withdrawn' and v_latest is distinct from 'disputed' then
    raise exception 'no standing contest by this actor on this record' using errcode = '23514'; end if;
  return new;
end; $function$;
create trigger organization_evidence_events_dispute_state_guard before insert on public.organization_evidence_events
  for each row when (new.event_type = any (array['disputed','dispute_withdrawn']))
  execute function public.organization_evidence_dispute_state_guard();

alter table public.organization_people enable row level security;
alter table public.organization_evidence_records enable row level security;
alter table public.organization_evidence_parties enable row level security;
alter table public.organization_evidence_events enable row level security;
grant select, insert, update on public.organization_people to authenticated;
grant select, insert on public.organization_evidence_records, public.organization_evidence_events to authenticated;
grant select on public.organization_evidence_parties to authenticated;

-- live organization_people policies (verbatim)
create policy organization_people_insert on public.organization_people for insert to authenticated
  with check (manages_organization(organization_id) AND (created_by = auth.uid()) AND (link_state = 'unlinked'::text) AND (linked_worker_id IS NULL) AND (linked_profile_id IS NULL));
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
  with check (((link_state = 'linked'::text) AND (link_method = 'worker_confirmed'::text) AND (linked_profile_id = auth.uid()) AND (EXISTS (SELECT 1 FROM workers w WHERE ((w.id = organization_people.linked_worker_id) AND (w.profile_id = auth.uid())))))
    OR ((link_state = 'unlinked'::text) AND (linked_profile_id IS NULL) AND (linked_worker_id IS NULL)));

-- live records policies (select verbatim; insert reduced to the permissive arm)
create policy organization_evidence_records_insert on public.organization_evidence_records for insert to authenticated
  with check (manages_organization(organization_id) AND (imported_by_profile_id = auth.uid()));
create policy organization_evidence_records_select on public.organization_evidence_records for select to authenticated
  using (manages_organization(organization_id) OR (EXISTS (SELECT 1 FROM organization_people op
    WHERE ((op.id = organization_evidence_records.organization_person_id) AND (op.linked_profile_id = auth.uid()) AND (op.link_state = 'linked'::text))))
    OR (EXISTS (SELECT 1 FROM organization_evidence_parties p WHERE ((p.record_id = organization_evidence_records.id) AND (p.party_organization_id IS NOT NULL) AND manages_organization(p.party_organization_id))))
    OR is_admin());

-- live events policies (verbatim). hist_p4 is RESTRICTIVE (ANDed), the other
-- four are PERMISSIVE (ORed): a row must satisfy >=1 permissive AND hist_p4.
create policy organization_evidence_events_select on public.organization_evidence_events for select to authenticated
  using (manages_organization(organization_id) OR (EXISTS (SELECT 1 FROM organization_evidence_records r JOIN organization_people op ON ((op.id = r.organization_person_id))
    WHERE ((r.id = organization_evidence_events.record_id) AND (op.linked_profile_id = auth.uid()) AND (op.link_state = 'linked'::text))))
    OR (EXISTS (SELECT 1 FROM organization_evidence_parties p WHERE ((p.record_id = organization_evidence_events.record_id) AND (p.party_organization_id IS NOT NULL) AND manages_organization(p.party_organization_id))))
    OR is_admin());
create policy organization_evidence_events_attest on public.organization_evidence_events for insert to authenticated
  with check (manages_organization(organization_id) AND (actor_profile_id = auth.uid()) AND (event_type <> 'independently_verified'::text));
create policy organization_evidence_events_verify on public.organization_evidence_events for insert to authenticated
  with check ((event_type = 'independently_verified'::text) AND (actor_profile_id = auth.uid()) AND (NOT manages_organization(organization_id)) AND (actor_organization_id IS NOT NULL) AND manages_organization(actor_organization_id)
    AND (EXISTS (SELECT 1 FROM organization_evidence_parties p WHERE ((p.record_id = organization_evidence_events.record_id) AND (p.party_organization_id = organization_evidence_events.actor_organization_id)
        AND (p.party_role = ANY (ARRAY['client','end_client','project_owner','assessor','verifier','public_body'])))))
    AND (NOT (EXISTS (SELECT 1 FROM organization_evidence_records r JOIN organization_people op ON ((op.id = r.organization_person_id)
        ) WHERE ((r.id = organization_evidence_events.record_id) AND (op.linked_profile_id = auth.uid()))))));
create policy organization_evidence_events_subject_dispute on public.organization_evidence_events for insert to authenticated
  with check ((event_type = 'disputed'::text) AND (actor_profile_id = auth.uid()) AND (actor_role IS NULL) AND (actor_organization_id IS NULL) AND (replacement_record_id IS NULL) AND (NOT manages_organization(organization_id))
    AND (EXISTS (SELECT 1 FROM organization_evidence_records r JOIN organization_people op ON ((op.id = r.organization_person_id))
      WHERE ((r.id = organization_evidence_events.record_id) AND (r.organization_id = organization_evidence_events.organization_id) AND (op.organization_id = organization_evidence_events.organization_id) AND (op.linked_profile_id = auth.uid()) AND (op.link_state = 'linked'::text)))));
create policy hist_p4_events_insert on public.organization_evidence_events as restrictive for insert to authenticated
  with check (((event_type = ANY (ARRAY['disputed','independently_verified','verification_withdrawn'])) AND (NOT manages_organization(organization_id)))
    OR (((EXISTS (SELECT 1 FROM company_memberships m WHERE ((m.profile_id = auth.uid()) AND (m.organization_id = organization_evidence_events.organization_id) AND (m.status = 'active') AND (m.role = ANY (ARRAY['owner','admin','manager'])))))
         OR (EXISTS (SELECT 1 FROM engagement_contexts ec WHERE ((ec.profile_id = auth.uid()) AND (ec.organization_id = organization_evidence_events.organization_id) AND (ec.status = 'active') AND (ec.relationship_slug = ANY (ARRAY['owner','manager']))))))
      AND ((actor_organization_id IS NULL) OR (actor_organization_id = organization_id))
      AND (event_type = ANY (ARRAY['attested','attestation_withdrawn','withdrawn','reinstated','corrected','source_preserved']))
      AND ((event_type <> 'attested') OR ((actor_organization_id = organization_id) AND (EXISTS (SELECT 1 FROM organization_evidence_records r
            WHERE ((r.id = organization_evidence_events.record_id) AND (r.organization_id = organization_evidence_events.organization_id) AND (r.supplier_role = organization_evidence_events.actor_role))))))
      AND ((event_type <> 'source_preserved') OR (((EXISTS (SELECT 1 FROM company_memberships m WHERE ((m.profile_id = auth.uid()) AND (m.organization_id = organization_evidence_events.organization_id) AND (m.status = 'active') AND (m.role = ANY (ARRAY['owner','admin'])))))
           OR (EXISTS (SELECT 1 FROM engagement_contexts ec WHERE ((ec.profile_id = auth.uid()) AND (ec.organization_id = organization_evidence_events.organization_id) AND (ec.status = 'active') AND (ec.relationship_slug = 'owner')))))
         AND (EXISTS (SELECT 1 FROM (((org_documents od JOIN document_files df ON ((df.org_document_id = od.id))) JOIN evidence_import_sessions s ON (((s.source_bytes_sha256 = df.content_sha256) AND (s.organization_id = od.organization_id)))) JOIN organization_evidence_records r ON ((r.session_id = s.id)))
              WHERE ((r.id = organization_evidence_events.record_id) AND (od.organization_id = organization_evidence_events.organization_id) AND (od.document_type_slug = 'org_import_source') AND (od.status = 'active') AND (od.classification = 'classified') AND (df.superseded_at IS NULL))))))));

-- remaining surfaces that read link_state (LIVE bodies, verbatim)
create table public.evidence_import_rows (
  id uuid primary key default gen_random_uuid(), organization_id uuid, organization_person_id uuid, session_id uuid,
  row_index int, person_label text, activity_kind text, outcome_kind text, activity_date date, period_start date, period_end date,
  hours numeric, status text, row_origin text, work_object_id uuid, project_id uuid, created_at timestamptz default now());
create table public.organization_evidence_competency_signals (id uuid primary key default gen_random_uuid(), organization_id uuid, record_id uuid, slug text);
create or replace function public.is_evidence_record_subject(p_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.organization_evidence_records r
      join public.organization_people op on op.id = r.organization_person_id
     where r.id = p_record_id
       and op.linked_profile_id = auth.uid()
       and op.link_state = 'linked'
  );
$function$;

create or replace function public.privacy_export_evidence_import_rows_v1()
returns setof jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', r.id,
    'organization_id', r.organization_id,
    'organization_person_id', r.organization_person_id,
    'row_index', r.row_index,
    'person_label', case when lower(btrim(r.person_label)) = lower(btrim(op.display_name))
                         then r.person_label end,
    'activity_kind', r.activity_kind,
    'outcome_kind', r.outcome_kind,
    'activity_date', r.activity_date,
    'period_start', r.period_start,
    'period_end', r.period_end,
    'hours', r.hours,
    'status', r.status,
    'row_origin', r.row_origin,
    'work_object_id', r.work_object_id,
    'project_id', r.project_id,
    'created_at', r.created_at
  )
  from public.evidence_import_rows r
  join public.organization_people op on op.id = r.organization_person_id
  where auth.uid() is not null
    and op.linked_profile_id = auth.uid()
    and op.link_state = 'linked'
  order by r.created_at, r.id
$function$;

create or replace function public.withdraw_organization_evidence_dispute_v1(
  p_record_id uuid, p_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_latest  text;
  v_event   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select r.organization_id into v_org
    from public.organization_evidence_records r
    join public.organization_people op
      on op.id = r.organization_person_id
     and op.organization_id = r.organization_id
   where r.id = p_record_id
     and op.linked_profile_id = v_uid
     and op.link_state = 'linked';

  if v_org is null
     or public.manages_organization(v_org) is distinct from false then
    raise exception 'only the subject of this record may withdraw their contest'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note must be 1000 characters or fewer' using errcode = '22001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_record_id::text || ':' || v_uid::text, 0));

  select e.event_type into v_latest
    from public.organization_evidence_events e
   where e.record_id = p_record_id
     and e.actor_profile_id = v_uid
     and e.event_type in ('disputed', 'dispute_withdrawn')
   order by e.created_at desc, (e.event_type = 'dispute_withdrawn') desc
   limit 1;

  if v_latest is distinct from 'disputed' then
    return jsonb_build_object(
      'standing', false, 'withdrawn', false, 'idempotent', true, 'event_id', null);
  end if;

  insert into public.organization_evidence_events
    (organization_id, record_id, event_type, actor_profile_id, actor_role,
     actor_organization_id, replacement_record_id, note, created_at)
  values
    (v_org, p_record_id, 'dispute_withdrawn', v_uid, null, null, null, v_note,
     clock_timestamp())
  returning id into v_event;

  return jsonb_build_object(
    'standing', false, 'withdrawn', true, 'idempotent', false, 'event_id', v_event);
end;
$function$;

revoke all on function public.is_evidence_record_subject(uuid) from public, anon;
grant execute on function public.is_evidence_record_subject(uuid) to authenticated;
revoke all on function public.privacy_export_evidence_import_rows_v1() from public, anon;
grant execute on function public.privacy_export_evidence_import_rows_v1() to authenticated;
revoke all on function public.withdraw_organization_evidence_dispute_v1(uuid, text) from public, anon;
grant execute on function public.withdraw_organization_evidence_dispute_v1(uuid, text) to authenticated;
create policy organization_evidence_parties_select on public.organization_evidence_parties for select to authenticated
  using (manages_organization(organization_id) OR ((party_organization_id IS NOT NULL) AND manages_organization(party_organization_id)) OR is_evidence_record_subject(record_id) OR is_admin());
alter table public.organization_evidence_competency_signals enable row level security;
grant select on public.organization_evidence_competency_signals to authenticated;
create policy organization_evidence_competency_signals_select on public.organization_evidence_competency_signals for select to authenticated
  using (manages_organization(organization_id) OR (EXISTS (SELECT 1 FROM organization_evidence_records r JOIN organization_people op ON ((op.id = r.organization_person_id))
    WHERE ((r.id = organization_evidence_competency_signals.record_id) AND (op.linked_profile_id = auth.uid()) AND (op.link_state = 'linked'::text)))) OR is_admin());
