-- ============================================================================
-- ██ RED CLASS — NOT APPROVED, NOT APPLIED. ██
--
-- This file deliberately carries NO `-- @human-gate-approved` marker. That
-- marker means "an owner approved THIS migration", every other file bearing it
-- names the recorded decision that granted it, and no such decision exists for
-- this one. Writing it here to make `migration-safety` go green would be the
-- exact dishonesty the gate exists to prevent — so the gate is left RED, which
-- is the correct and intended signal for a file awaiting a human gate.
--
-- Merge path: draft PR + the `needs-human-gate` label + explicit owner
-- approval, then apply via Supabase MCP `apply_migration` — never `db push`.
-- The full SQL and the complete policy set are below, unabridged, for that
-- review.
--
-- THE RED FINDINGS, IN FULL:
--   * GRANT (detector h) - eight new tables need explicit privileges.
--     `pg_default_acl` for schema `public` grants nothing to `authenticated`
--     on this project (verified 2026-09-07: `education_programs`,
--     `organization_roles` and `work_hour_allocations` all carry only the
--     privileges their own migrations granted), so a new table without GRANT
--     is unreachable by every client. Each GRANT below is the MINIMUM the
--     feature needs, and `anon` is granted NOTHING anywhere in this file.
--   * There is deliberately NO `SECURITY DEFINER` function, NO trigger, NO
--     `using (true)` policy, no `ALTER`/`DROP POLICY`, no data `UPDATE`/
--     `DELETE`, and nothing touching `auth.`. Every guarantee below is a
--     CHECK constraint, a composite foreign key, or the presence/absence of
--     an RLS policy - reviewable by reading, with no runtime body to audit.
--
-- Apply ONLY via Supabase MCP apply_migration. Never `db push`.
-- ============================================================================
--
-- 20260907114500 - ORGANIZATION HISTORICAL EVIDENCE IMPORT v1 (owner P0,
-- 2026-09-07, as corrected the same day: the root actor is the ORGANIZATION,
-- never the company).
--
-- ── THE CAPABILITY THIS UNBLOCKS ───────────────────────────────────────────
-- An organization holds years of real records about what people did for it -
-- timesheets, assignment reports, practice logs, course and assessment
-- results. Today nothing can turn them into attributable history: the only
-- write path is the person's own hash-chained Work Journal, which requires
-- (a) an account and (b) the person to be the author. Both are wrong for
-- organization-supplied history, and faking either would manufacture
-- self-reports nobody wrote - the dishonesty ARCHITECTURE I-3/I-4 and
-- doctrine 7 forbid. Architecture 5.2 recorded this shape on 2026-08-27 and
-- the window-9 checkpoint has carried it as NOT STARTED ever since.
--
-- ── ONE ENGINE, MANY ORGANIZATION KINDS (owner correction 2026-09-07) ──────
-- There is no company table here, no agency table and no university table.
-- The root is `public.organizations`, which already holds MANY capabilities at
-- once (`organization_roles`, ORGANIZATION_ROLE_ORCHESTRATION_V1, invariant
-- I-2). An employer's timesheet, an agency's assignment report, a school's
-- practice log and a training provider's assessment are the SAME chain:
--
--   ORGANIZATION -> PERSON -> ACTIVITY -> CONTEXT (project / object /
--   programme / course / assignment) -> OUTCOME -> EVIDENCE -> ATTESTATION
--   -> (independent) VERIFICATION -> the person's living evidence graph
--
-- `activity_kind` and `outcome_kind` are what differ between them, and both
-- are open slug sets on ONE record table - not eight tables and not eight
-- importers.
--
-- ── THE ROLE-COLLAPSE THIS PREVENTS ────────────────────────────────────────
-- The failure the correction names explicitly: an agency that reports work its
-- worker did on a client's site must never be recorded as the employer or as
-- the client. So the supplying organization must SAY in what capacity it
-- speaks (`supplier_role`), and every other party to the same evidence is its
-- own explicit row in `organization_evidence_parties` with its own role. One
-- organization may hold several roles on one record; each stays separate and
-- readable. A party that is not on the platform is recorded by the name the
-- source writes, never invented as an organization.
--
-- ── WHAT THIS ADDS (all additive; nothing existing is altered) ─────────────
--   organization_people                  a person the organization knows from
--                                        its own records. NOT a platform
--                                        identity: a roster record the real
--                                        human may later CLAIM (they propose,
--                                        a manager confirms). This is why
--                                        history can be imported for people
--                                        who have no account.
--   evidence_import_sessions             one immutable envelope per source.
--   evidence_import_rows                 staging: parsed, matched, deduped -
--                                        and NOT evidence until committed.
--   organization_evidence_records        the committed evidence. Insert only.
--   organization_evidence_parties        who else stands in this evidence, and
--                                        in which role.
--   organization_evidence_events         append-only lifecycle: attestation,
--                                        INDEPENDENT verification, withdrawal
--                                        (the rollback path), dispute,
--                                        correction.
--   evidence_import_events               append-only audit trail of the import
--                                        itself.
--   organization_evidence_competency_signals
--                                        a term in a description that
--                                        corresponds to a canonical skill. A
--                                        SIGNAL, never a claim (I-4).
--
-- ── THE FIVE SEMANTIC GUARANTEES, ENFORCED BY THE SCHEMA ITSELF ───────────
--
--  1. AN IMPORT CAN NEVER PRODUCE ATTESTED OR VERIFIED EVIDENCE.
--     `organization_evidence_records.evidence_state` is CHECK-restricted to
--     the REPORTED states. Attestation and verification exist only as
--     append-only event rows.
--
--  2. SELF-ATTESTATION IS ALLOWED AND PERMANENTLY MARKED. A representative
--     may attest the organization's records including their own work (a sole
--     trader has nobody above them - owner decision 3). The evidence then
--     derives SELF_ATTESTED, never ORGANIZATION_ATTESTED, and
--     `countsAsIndependentlyVerified` is false for it. The hole found in
--     `review_journal_entry` on 2026-09-06 (3 real self-confirmations on
--     production reading as employer confirmation) cannot be reproduced here,
--     because the self relationship survives into the derived state instead of
--     being flattened away.
--
--  3. ATTESTATION IS NOT VERIFICATION. `independently_verified` is writable
--     ONLY by someone who manages an organization recorded as a party in a
--     verifying role AND who does not manage the organization that supplied
--     the evidence AND who is not the subject. The supplier vouching for its
--     own report is refused by the database, not by a code path.
--
--  4. FACT AND DERIVED NEVER MERGE. `source_fact` holds the source line
--     verbatim; `derived` holds every inference with its method and
--     confidence. An inference is never promoted into the fact column.
--
--  5. THE SAME SOURCE IMPORTS ONCE. `(organization_id, source_fingerprint)`
--     is unique on sessions and `(organization_id, record_fingerprint)` is
--     unique on records, so a re-upload finds the existing session and a
--     re-commit writes nothing new.
--
-- CROSS-ORGANIZATION ISOLATION. Every table carries `organization_id` and
-- every policy is anchored on `public.manages_organization(organization_id)`.
-- The denormalized column is an AUTHORIZATION ANCHOR (the same reason
-- work_hour_allocations carries one) and it cannot drift: composite foreign
-- keys `(child_id, organization_id) -> (parent_id, organization_id)` make a
-- row naming a different organization than its parent unrepresentable.
--
-- Reversible: see the ROLLBACK block and
-- supabase/rollbacks/20260907114500_organization_evidence_import_v1.down.sql
-- (guarded - refuses while any evidence row exists).

-- ── 1. organization_people - the person an organization knows ───────────────

create table if not exists public.organization_people (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- As the organization writes it. Not author content: a name is a name in
  -- every locale, so doctrine 2.3 does not apply (nothing here is translated).
  display_name      text not null check (char_length(btrim(display_name)) between 1 and 200),
  -- The matching key: lowercased, diacritics folded, tokens sorted, so
  -- "Petraitis Jonas" and "Jonas Petraitis" are one key. Stored because it is
  -- the join key thousands of import rows resolve against.
  normalized_name   text not null check (char_length(normalized_name) between 1 and 200),
  -- Employee / student / participant number, as the SOURCE carries it.
  external_ref      text check (external_ref is null or char_length(external_ref) between 1 and 120),
  -- HOW this person relates to the organization, in the organization's own
  -- terms. Open set: an employer, an agency, a school and a training provider
  -- all record people, and they are not the same relationship.
  relationship_kind text not null default 'other' check (relationship_kind in (
    'employee','former_employee','agency_worker','subcontractor','contractor',
    'student','graduate','trainee','apprentice','programme_participant',
    'volunteer','other')),
  source_note       text check (source_note is null or char_length(source_note) <= 500),
  -- The claim link. `unlinked` = the organization knows this person, the
  -- platform does not. `link_proposed` = one side has OFFERED the link.
  -- `linked` = both sides agree. Never set by an importer, and never inferred
  -- from a matching name.
  linked_worker_id  uuid references public.workers(id) on delete set null,
  -- Denormalized authorization anchor: the ONE predicate that lets the subject
  -- read their own history without a workers subquery (and a re-entry into
  -- can_view_worker) inside every policy on every row.
  linked_profile_id uuid references public.profiles(id) on delete set null,
  link_state        text not null default 'unlinked'
                      check (link_state in ('unlinked','link_proposed','linked')),
  -- HOW the link came about. `manager_offer` is the organization proposing it;
  -- `worker_confirmed` is the person accepting. `manager_link` remains for the
  -- case where a manager links a profile that already has an active
  -- relationship with them, and `invitation` for a link that arrives with one.
  link_method       text check (link_method is null or link_method in
                      ('manager_link','manager_offer','worker_confirmed','invitation')),
  linked_at         timestamptz,
  linked_by         uuid references public.profiles(id) on delete set null,
  created_by        uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint organization_people_link_pairing check (
    (linked_worker_id is null) = (linked_profile_id is null)
    and (link_state = 'unlinked') = (linked_worker_id is null)
  ),
  constraint organization_people_org_scope unique (id, organization_id)
);

create index if not exists organization_people_org_idx
  on public.organization_people (organization_id);
create index if not exists organization_people_match_idx
  on public.organization_people (organization_id, normalized_name);
create index if not exists organization_people_subject_idx
  on public.organization_people (linked_profile_id) where linked_profile_id is not null;
create unique index if not exists organization_people_external_ref_uidx
  on public.organization_people (organization_id, external_ref) where external_ref is not null;

comment on table public.organization_people is
  'A person an organization knows from its own records - employee, agency worker, subcontractor, student, trainee, programme participant. NOT a platform identity and never a substitute for one: an unlinked row asserts nothing about who the human is. A manager may OFFER the link to a profile that already holds an active relationship with the organization (link_proposed); only the person themselves accepts it (linked) or refuses it, at which point their imported history joins their Living CV without losing provenance. People are NEVER merged on a matching name alone.';

-- ── 2. evidence_import_sessions - one immutable envelope per source ─────────

create table if not exists public.evidence_import_sessions (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  source_kind                 text not null check (source_kind in (
                                'xlsx','csv','pdf','api','agent','erp','payroll','sis','lms',
                                'email','drive','manual')),
  source_filename             text check (source_filename is null or char_length(source_filename) <= 300),
  source_reference            text check (source_reference is null or char_length(source_reference) <= 500),
  -- SHA-256 of the source bytes (a file) or of the canonical JSON (a payload).
  source_fingerprint          text not null check (char_length(source_fingerprint) between 16 and 128),
  -- The language the SOURCE is written in, stated by whoever supplied it
  -- (doctrine 2.3: original_language, never guessed, never a translation).
  source_language             char(2) not null check (source_language in
                                ('lt','en','lv','et','nl','de','da','no','sv','pl','ru')),
  -- WHICH organization supplied this data, and IN WHAT CAPACITY. The capacity
  -- is required: an agency reporting its worker's hours on a client's site is
  -- not the employer and not the client, and this column is where it says so.
  supplied_by_organization_id uuid not null references public.organizations(id),
  supplier_role               text not null check (supplier_role in (
                                'employer','agency','client','end_client','project_owner',
                                'subcontractor','education_provider','training_provider',
                                'assessor','placement_provider','public_body','sector_body','other')),
  actor_kind                  text not null default 'human' check (actor_kind in ('human','agent')),
  -- Which assistant performed it, when actor_kind = 'agent'. METADATA ONLY:
  -- authority came from the human OAuth identity, never from this label.
  agent_label                 text check (agent_label is null or char_length(agent_label) <= 120),
  created_by                  uuid default auth.uid() references public.profiles(id) on delete set null,
  notes                       text check (notes is null or char_length(notes) <= 1000),
  created_at                  timestamptz not null default now(),
  constraint evidence_import_sessions_org_scope unique (id, organization_id),
  constraint evidence_import_sessions_source_once unique (organization_id, source_fingerprint)
);

create index if not exists evidence_import_sessions_org_idx
  on public.evidence_import_sessions (organization_id, created_at desc);

comment on table public.evidence_import_sessions is
  'One import of one source. IMMUTABLE (no UPDATE policy): its status is derived from evidence_import_events, so the record of what happened cannot be rewritten. (organization_id, source_fingerprint) is unique, so re-uploading the same file resolves to this same session instead of importing twice.';

-- ── 3. evidence_import_rows - staging; NOT evidence ────────────────────────

create table if not exists public.evidence_import_rows (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null,
  organization_id          uuid not null,
  row_index                integer not null check (row_index >= 0),
  -- SOURCE FACT, verbatim, exactly as supplied. Never edited by matching.
  source_fact              jsonb not null,
  -- Which canonical fields the SOURCE stated explicitly. Everything else in
  -- this row is an interpretation and must appear in `derived`.
  fact_fields              text[] not null default '{}',
  -- field -> { value, method, confidence, note }. An inference NEVER moves
  -- from here into source_fact.
  derived                  jsonb not null default '{}'::jsonb,
  person_label             text check (person_label is null or char_length(person_label) <= 200),
  context_label            text check (context_label is null or char_length(context_label) <= 200),
  activity_kind            text not null default 'work' check (activity_kind in (
                             'work','assignment','project','training','study','practice',
                             'placement','apprenticeship','assessment','volunteering','other')),
  outcome_kind             text check (outcome_kind is null or outcome_kind in (
                             'hours_worked','task_completed','project_delivered','course_completed',
                             'module_completed','assessment_passed','assessment_failed',
                             'qualification_awarded','placement_completed','participation')),
  activity_date            date,
  period_start             date,
  period_end               date,
  hours                    numeric(6,2) check (hours is null or (hours >= 0 and hours <= 9999)),
  activity_text            text check (activity_text is null or char_length(activity_text) <= 4000),
  person_state             text not null default 'unmatched'
                             check (person_state in ('unmatched','matched','ambiguous','created')),
  organization_person_id   uuid references public.organization_people(id) on delete set null,
  person_match_method      text check (person_match_method is null or char_length(person_match_method) <= 40),
  person_match_confidence  numeric(4,3) check (person_match_confidence is null
                             or (person_match_confidence >= 0 and person_match_confidence <= 1)),
  context_state            text not null default 'absent'
                             check (context_state in ('absent','unmatched','matched','ambiguous','created')),
  work_object_id           uuid references public.work_objects(id) on delete set null,
  education_program_id     uuid references public.education_programs(id) on delete set null,
  education_cohort_id      uuid references public.education_cohorts(id) on delete set null,
  context_match_confidence numeric(4,3) check (context_match_confidence is null
                             or (context_match_confidence >= 0 and context_match_confidence <= 1)),
  duplicate_state          text not null default 'new'
                             check (duplicate_state in ('new','duplicate','probable_duplicate','conflict')),
  duplicate_of_record_id   uuid,
  record_fingerprint       text not null check (char_length(record_fingerprint) between 16 and 128),
  status                   text not null default 'pending'
                             check (status in ('pending','ready','needs_review','committed','skipped','failed')),
  problem                  text check (problem is null or char_length(problem) <= 500),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint evidence_import_rows_period check (
    period_end is null or period_start is null or period_end >= period_start),
  constraint evidence_import_rows_session_fk
    foreign key (session_id, organization_id)
    references public.evidence_import_sessions (id, organization_id) on delete cascade,
  constraint evidence_import_rows_row_once unique (session_id, row_index)
);

create index if not exists evidence_import_rows_session_idx
  on public.evidence_import_rows (session_id, row_index);
create index if not exists evidence_import_rows_status_idx
  on public.evidence_import_rows (session_id, status);

comment on table public.evidence_import_rows is
  'Staging for one import. A row here is an INTERPRETATION awaiting approval - it is not evidence and no surface reads it as such. Deleting a staging row destroys no evidence, which is why this is the only table in the feature carrying UPDATE and DELETE policies.';

-- ── 4. organization_evidence_records - the committed evidence ──────────────

create table if not exists public.organization_evidence_records (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null,
  organization_person_id      uuid not null,
  -- WHAT KIND of activity this is. The one axis on which an employer's
  -- timesheet, an agency assignment, a school placement and a training
  -- assessment differ - and the reason there is one table, not four.
  activity_kind               text not null default 'work' check (activity_kind in (
                                'work','assignment','project','training','study','practice',
                                'placement','apprenticeship','assessment','volunteering','other')),
  -- WHAT CAME OF IT. Null is honest: a timesheet line records hours, not an
  -- outcome, and pretending otherwise would overclaim (I-4).
  outcome_kind                text check (outcome_kind is null or outcome_kind in (
                                'hours_worked','task_completed','project_delivered','course_completed',
                                'module_completed','assessment_passed','assessment_failed',
                                'qualification_awarded','placement_completed','participation')),
  -- WHERE / UNDER WHAT. The label is always kept, as the source wrote it, even
  -- when it also resolved to a canonical row.
  context_label               text check (context_label is null or char_length(context_label) <= 200),
  work_object_id              uuid references public.work_objects(id) on delete set null,
  education_program_id        uuid references public.education_programs(id) on delete set null,
  education_cohort_id         uuid references public.education_cohorts(id) on delete set null,
  activity_date               date,
  period_start                date,
  period_end                  date,
  hours                       numeric(6,2) check (hours is null or (hours >= 0 and hours <= 9999)),
  -- Author content: what was done, as the SOURCE wrote it, in the language the
  -- source was written in (doctrine 2.3). Never a translation.
  original_text               text not null check (char_length(btrim(original_text)) between 1 and 4000),
  original_language           char(2) not null check (original_language in
                                ('lt','en','lv','et','nl','de','da','no','sv','pl','ru')),
  -- THE REPORTED STATES ONLY. There is deliberately no attested value here and
  -- no verified value anywhere on this table: attestation and independent
  -- verification are events (table 6). An import is structurally incapable of
  -- producing either.
  evidence_state              text not null check (evidence_state in
                                ('SELF_REPORTED','ORGANIZATION_REPORTED','LEGACY_IMPORTED',
                                 'UNVERIFIED','NEEDS_REVIEW')),
  -- WHO supplied it and IN WHAT CAPACITY - carried onto the record so the
  -- provenance survives even if the session is later unreadable to a viewer.
  supplied_by_organization_id uuid not null references public.organizations(id),
  supplier_role               text not null check (supplier_role in (
                                'employer','agency','client','end_client','project_owner',
                                'subcontractor','education_provider','training_provider',
                                'assessor','placement_provider','public_body','sector_body','other')),
  supplied_by_profile_id      uuid references public.profiles(id) on delete set null,
  imported_by_profile_id      uuid default auth.uid() references public.profiles(id) on delete set null,
  imported_at                 timestamptz not null default now(),
  session_id                  uuid not null,
  import_row_id               uuid references public.evidence_import_rows(id) on delete set null,
  source_kind                 text not null check (char_length(source_kind) <= 40),
  source_filename             text check (source_filename is null or char_length(source_filename) <= 300),
  source_reference            text check (source_reference is null or char_length(source_reference) <= 500),
  source_fact                 jsonb not null,
  derived                     jsonb not null default '{}'::jsonb,
  confidence                  numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- A formal credential, when (and only when) one was actually awarded. This
  -- is what keeps a person from being reduced to certificate/no-certificate:
  -- a qualification is one outcome among many, never the definition of them.
  credential_reference        text check (credential_reference is null or char_length(credential_reference) <= 200),
  credential_valid_from       date,
  credential_valid_until      date,
  record_fingerprint          text not null check (char_length(record_fingerprint) between 16 and 128),
  -- Tamper-evidence chain per import session, in row order (doctrine 3.3).
  hash_prev                   text,
  hash_self                   text not null,
  -- Non-destructive correction: a correcting record POINTS AT the one it
  -- corrects; the corrected record is never edited and never deleted.
  correction_of               uuid references public.organization_evidence_records(id) on delete set null,
  created_at                  timestamptz not null default now(),
  constraint organization_evidence_records_period check (
    period_end is null or period_start is null or period_end >= period_start),
  constraint organization_evidence_records_dated check (
    activity_date is not null or period_start is not null),
  constraint organization_evidence_records_credential check (
    (credential_reference is null and credential_valid_from is null and credential_valid_until is null)
    or outcome_kind = 'qualification_awarded'),
  constraint organization_evidence_records_credential_period check (
    credential_valid_until is null or credential_valid_from is null
    or credential_valid_until >= credential_valid_from),
  constraint organization_evidence_records_org_scope unique (id, organization_id),
  constraint organization_evidence_records_person_fk
    foreign key (organization_person_id, organization_id)
    references public.organization_people (id, organization_id),
  constraint organization_evidence_records_session_fk
    foreign key (session_id, organization_id)
    references public.evidence_import_sessions (id, organization_id),
  constraint organization_evidence_records_once unique (organization_id, record_fingerprint)
);

create index if not exists organization_evidence_records_person_idx
  on public.organization_evidence_records (organization_person_id, activity_date desc);
create index if not exists organization_evidence_records_org_idx
  on public.organization_evidence_records (organization_id, activity_date desc);
create index if not exists organization_evidence_records_session_idx
  on public.organization_evidence_records (session_id);
create index if not exists organization_evidence_records_object_idx
  on public.organization_evidence_records (work_object_id) where work_object_id is not null;
create index if not exists organization_evidence_records_program_idx
  on public.organization_evidence_records (education_program_id) where education_program_id is not null;

comment on table public.organization_evidence_records is
  'Organization-supplied evidence about what a person did - work, assignment, practice, study, placement or assessment. INSERT-ONLY: no UPDATE and no DELETE policy exists, so the original record is permanent (doctrine 3.1). Everything that happens afterwards - attestation, independent verification, withdrawal, dispute, correction - is an append-only row in organization_evidence_events. An import can never write an attested or verified state.';

alter table public.evidence_import_rows
  add constraint evidence_import_rows_duplicate_fk
  foreign key (duplicate_of_record_id)
  references public.organization_evidence_records(id) on delete set null;

-- ── 5. organization_evidence_parties - who else stands in this evidence ────

create table if not exists public.organization_evidence_parties (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null,
  record_id              uuid not null,
  party_role             text not null check (party_role in (
                           'employer','agency','client','end_client','project_owner',
                           'subcontractor','education_provider','training_provider',
                           'assessor','verifier','placement_provider','public_body',
                           'sector_body','other')),
  -- The party as a platform organization, when it is one...
  party_organization_id  uuid references public.organizations(id) on delete set null,
  -- ...and otherwise exactly the name the source writes. A party that is not
  -- on the platform is recorded, never invented as an organization row.
  party_label            text check (party_label is null or char_length(btrim(party_label)) between 1 and 200),
  created_by             uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  constraint organization_evidence_parties_named check (
    party_organization_id is not null or party_label is not null),
  constraint organization_evidence_parties_record_fk
    foreign key (record_id, organization_id)
    references public.organization_evidence_records (id, organization_id) on delete cascade
);

create unique index if not exists organization_evidence_parties_once
  on public.organization_evidence_parties
     (record_id, party_role, coalesce(party_organization_id::text, lower(btrim(party_label))));
create index if not exists organization_evidence_parties_org_idx
  on public.organization_evidence_parties (party_organization_id)
  where party_organization_id is not null;

comment on table public.organization_evidence_parties is
  'The other organizations standing in one evidence record, each in an EXPLICIT role. This is what stops an agency being recorded as the employer, or a client as the project owner. One organization may hold several roles on one record; every role is its own row. A recorded party in a verifying role is also the ONLY way anyone outside the supplying organization can read or independently verify the record - an explicit grant record, per doctrine 4.3.';

-- ── 6. organization_evidence_events - append-only evidence lifecycle ───────

create table if not exists public.organization_evidence_events (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  record_id             uuid not null,
  event_type            text not null check (event_type in (
                          'attested','attestation_withdrawn',
                          'independently_verified','verification_withdrawn',
                          'withdrawn','reinstated','disputed','corrected')),
  -- WHO stands behind an attestation or a verification, in which role. Present
  -- exactly when the event is one of those two.
  actor_role            text check (actor_role is null or actor_role in (
                          'employer','agency','client','end_client','project_owner',
                          'subcontractor','education_provider','training_provider',
                          'assessor','verifier','placement_provider','public_body',
                          'sector_body','other')),
  -- The organization the actor acted for. For an independent verification this
  -- is the party organization; for an attestation it is the record's own.
  actor_organization_id uuid references public.organizations(id) on delete set null,
  actor_profile_id      uuid default auth.uid() references public.profiles(id) on delete set null,
  note                  text check (note is null or char_length(note) <= 1000),
  replacement_record_id uuid references public.organization_evidence_records(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint organization_evidence_events_actor_role check (
    (event_type in ('attested','independently_verified')) = (actor_role is not null)),
  constraint organization_evidence_events_record_fk
    foreign key (record_id, organization_id)
    references public.organization_evidence_records (id, organization_id) on delete cascade
);

create index if not exists organization_evidence_events_record_idx
  on public.organization_evidence_events (record_id, created_at desc);
create index if not exists organization_evidence_events_org_idx
  on public.organization_evidence_events (organization_id, created_at desc);

comment on table public.organization_evidence_events is
  'Append-only lifecycle of one evidence record. The current standing is DERIVED latest-wins from these rows over the record base state - the same rule journal_entry_confirmations already uses. ATTESTATION AND VERIFICATION ARE DIFFERENT EVENTS ON PURPOSE: the supplying organization can attest what it reported; only a separately recorded party can independently verify it. A withdrawal (the rollback path) hides nothing and deletes nothing.';

-- ── 7. evidence_import_events - append-only audit trail ────────────────────

create table if not exists public.evidence_import_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  session_id       uuid not null,
  event_type       text not null check (event_type in (
                     'created','rows_submitted','previewed','committed',
                     'rolled_back','reinstated','failed')),
  actor_profile_id uuid default auth.uid() references public.profiles(id) on delete set null,
  actor_kind       text not null default 'human' check (actor_kind in ('human','agent')),
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint evidence_import_events_session_fk
    foreign key (session_id, organization_id)
    references public.evidence_import_sessions (id, organization_id) on delete cascade
);

create index if not exists evidence_import_events_session_idx
  on public.evidence_import_events (session_id, created_at);

comment on table public.evidence_import_events is
  'The audit trail doctrine 3.4 requires for an import: who created the session, who submitted rows, who approved, who committed, who rolled back - and whether a human or an authorized agent did it. Append-only and organization-scoped, so an organization can audit its own imports without platform-admin access.';

-- ── 8. organization_evidence_competency_signals ───────────────────────────

create table if not exists public.organization_evidence_competency_signals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  record_id       uuid not null,
  -- The phrase as it appears in the description.
  term            text not null check (char_length(btrim(term)) between 2 and 120),
  -- The canonical skill the term corresponds to, when one does. NULL is a
  -- legitimate outcome: an observed term with no canonical equivalent yet.
  skill_slug      text check (skill_slug is null or char_length(skill_slug) between 1 and 120),
  method          text not null default 'exact_term_match'
                    check (method in ('exact_term_match','synonym_term_match')),
  confidence      numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  created_at      timestamptz not null default now(),
  constraint organization_evidence_competency_signals_record_fk
    foreign key (record_id, organization_id)
    references public.organization_evidence_records (id, organization_id) on delete cascade,
  constraint organization_evidence_competency_signals_once unique (record_id, term)
);

create index if not exists organization_evidence_competency_signals_skill_idx
  on public.organization_evidence_competency_signals (skill_slug) where skill_slug is not null;

comment on table public.organization_evidence_competency_signals is
  'A term in an evidence description that corresponds to a canonical skill. THIS IS EVIDENCE, NOT A CLAIM (ARCHITECTURE I-4: exposure is not competence). Nothing in the product writes worker_skills from these rows; a later system may weigh them, with their confidence, alongside everything else the person has.';

-- ── 9. Privileges ──────────────────────────────────────────────────────────
-- The minimum each table needs. RLS decides every row; these decide only which
-- verbs exist at all. `anon` is granted NOTHING in this file. The absence of
-- UPDATE/DELETE on the evidence tables is doctrine 3.1 enforced one layer
-- below the policies.

grant select, insert, update on public.organization_people to authenticated;
grant select, insert on public.evidence_import_sessions to authenticated;
grant select, insert, update, delete on public.evidence_import_rows to authenticated;
grant select, insert on public.organization_evidence_records to authenticated;
grant select, insert on public.organization_evidence_parties to authenticated;
grant select, insert on public.organization_evidence_events to authenticated;
grant select, insert on public.evidence_import_events to authenticated;
grant select, insert on public.organization_evidence_competency_signals to authenticated;

-- ── 10. Row level security ─────────────────────────────────────────────────

alter table public.organization_people                        enable row level security;
alter table public.evidence_import_sessions                   enable row level security;
alter table public.evidence_import_rows                       enable row level security;
alter table public.organization_evidence_records              enable row level security;
alter table public.organization_evidence_parties              enable row level security;
alter table public.organization_evidence_events               enable row level security;
alter table public.evidence_import_events                     enable row level security;
alter table public.organization_evidence_competency_signals   enable row level security;

-- organization_people ──────────────────────────────────────────────────────
create policy organization_people_select on public.organization_people
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or linked_profile_id = auth.uid()
    or public.is_admin()
  );

create policy organization_people_insert on public.organization_people
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and created_by = auth.uid()
    -- An importer may only create an UNLINKED roster record. Attaching a real
    -- platform identity is a separate, two-sided act (the policies below), so
    -- a matching name can never become a claim about who someone is.
    and link_state = 'unlinked'
    and linked_worker_id is null
    and linked_profile_id is null
  );

-- A manager may link a roster record to a profile that ALREADY has a real,
-- active relationship with this organization. Identity is never invented.
create policy organization_people_manager_update on public.organization_people
  for update to authenticated
  using (public.manages_organization(organization_id))
  with check (
    public.manages_organization(organization_id)
    and (
      linked_profile_id is null
      or exists (
        select 1 from public.engagement_contexts ec
         where ec.profile_id = organization_people.linked_profile_id
           and ec.organization_id = organization_people.organization_id
           and ec.status = 'active'
      )
      or exists (
        select 1 from public.company_memberships m
         where m.profile_id = organization_people.linked_profile_id
           and m.organization_id = organization_people.organization_id
           and m.status = 'active'
      )
    )
  );

-- ── THE PERSON HAS THE FINAL SAY ───────────────────────────────────────────
--
-- The manager policy above may OFFER a link (`link_proposed`) to a profile
-- that already holds a real active relationship with this organization. Only
-- the person themselves turns that offer into `linked`, and they may also
-- refuse it outright — a roster row must never become a claim about someone
-- over their objection.
--
-- WHY THERE IS NO WORKER-INITIATED CLAIM OF AN UNLINKED ROW. Such a policy
-- would need the person to SELECT unlinked roster rows, and the select policy
-- above deliberately does not show them: that would let any authenticated
-- account enumerate an organization's people by name. A policy whose rows are
-- invisible cannot fire, and a capability that only appears to exist is worse
-- than one that honestly does not — so the offer comes from the side that
-- already knows both facts, and the person accepts or refuses it.
--
-- The USING clause pins this policy to rows ALREADY naming the caller, so it
-- can never reach anybody else's record.
create policy organization_people_subject_decides on public.organization_people
  for update to authenticated
  using (linked_profile_id = auth.uid())
  with check (
    -- Accept: the offer becomes a link, still pointing at the same person.
    (
      link_state = 'linked'
      and link_method = 'worker_confirmed'
      and linked_profile_id = auth.uid()
      and exists (
        select 1 from public.workers w
         where w.id = organization_people.linked_worker_id
           and w.profile_id = auth.uid()
      )
    )
    -- Refuse: "that is not me". The row returns to unlinked and the person
    -- stops seeing it. The organization keeps its own record; what it loses is
    -- the false claim about whose it is.
    or (
      link_state = 'unlinked'
      and linked_profile_id is null
      and linked_worker_id is null
    )
  );

-- evidence_import_sessions ─────────────────────────────────────────────────
-- Managers only. A source may name MANY people; someone who happens to appear
-- in a file never gains sight of the rest of it.
create policy evidence_import_sessions_select on public.evidence_import_sessions
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

create policy evidence_import_sessions_insert on public.evidence_import_sessions
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and created_by = auth.uid()
    -- Supplying data on another organization's behalf requires authority over
    -- that organization too.
    and (
      supplied_by_organization_id = organization_id
      or public.manages_organization(supplied_by_organization_id)
    )
  );

-- evidence_import_rows ─────────────────────────────────────────────────────
create policy evidence_import_rows_select on public.evidence_import_rows
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

create policy evidence_import_rows_insert on public.evidence_import_rows
  for insert to authenticated
  with check (public.manages_organization(organization_id));

create policy evidence_import_rows_update on public.evidence_import_rows
  for update to authenticated
  using (public.manages_organization(organization_id))
  with check (public.manages_organization(organization_id));

create policy evidence_import_rows_delete on public.evidence_import_rows
  for delete to authenticated
  using (public.manages_organization(organization_id));

-- organization_evidence_records ────────────────────────────────────────────
-- Read: the supplying organization's managers, the SUBJECT once their roster
-- record is linked to them, and a recorded PARTY organization's managers. NO
-- update policy and NO delete policy exist - the record is permanent
-- (doctrine 3.1) and its lifecycle is the events table.
create policy organization_evidence_records_select on public.organization_evidence_records
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.organization_people op
       where op.id = organization_evidence_records.organization_person_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
    or exists (
      select 1 from public.organization_evidence_parties p
       where p.record_id = organization_evidence_records.id
         and p.party_organization_id is not null
         and public.manages_organization(p.party_organization_id)
    )
    or public.is_admin()
  );

create policy organization_evidence_records_insert on public.organization_evidence_records
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and imported_by_profile_id = auth.uid()
  );

-- organization_evidence_parties ────────────────────────────────────────────
create policy organization_evidence_parties_select on public.organization_evidence_parties
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or (party_organization_id is not null and public.manages_organization(party_organization_id))
    or exists (
      select 1 from public.organization_evidence_records r
       join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_parties.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
    or public.is_admin()
  );

create policy organization_evidence_parties_insert on public.organization_evidence_parties
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and created_by = auth.uid()
  );

-- organization_evidence_events ─────────────────────────────────────────────
create policy organization_evidence_events_select on public.organization_evidence_events
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.organization_evidence_records r
       join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_events.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
    or exists (
      select 1 from public.organization_evidence_parties p
       where p.record_id = organization_evidence_events.record_id
         and p.party_organization_id is not null
         and public.manages_organization(p.party_organization_id)
    )
    or public.is_admin()
  );

-- ATTESTATION - INCLUDING OF ONE'S OWN WORK (owner decision 3, 2026-09-07).
--
-- An authorized representative of the organization may attest the
-- organization's records, INCLUDING their own work. A sole trader legitimately
-- has nobody above them, and refusing them would erase real history - the
-- owner's instruction is explicit that legitimate sole-trader workflows are
-- preserved.
--
-- What that attestation must never do is acquire independent-verification
-- authority. The separation is SEMANTIC, not a block: when the actor is the
-- subject, `deriveEvidenceStanding` (lib/organization-evidence/evidence-state.ts)
-- derives SELF_ATTESTED rather than ORGANIZATION_ATTESTED, and
-- `countsAsIndependentlyVerified` is false for it - permanently, and visibly.
--
--   SELF_REPORTED / SELF_ATTESTED  is NOT  INDEPENDENTLY_VERIFIED
--
-- The independence guard lives on the OTHER event, below, where it belongs.
create policy organization_evidence_events_attest on public.organization_evidence_events
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and actor_profile_id = auth.uid()
    and event_type <> 'independently_verified'
  );

-- THE INDEPENDENCE GUARD.
-- Independent verification is NOT a stronger attestation: it is a different
-- claim, made by someone who is neither the subject nor the supplier. All
-- three conditions are checked here, so the supplying organization vouching
-- for its own report is impossible rather than merely discouraged.
create policy organization_evidence_events_verify on public.organization_evidence_events
  for insert to authenticated
  with check (
    event_type = 'independently_verified'
    and actor_profile_id = auth.uid()
    and not public.manages_organization(organization_id)
    and actor_organization_id is not null
    and public.manages_organization(actor_organization_id)
    and exists (
      select 1 from public.organization_evidence_parties p
       where p.record_id = organization_evidence_events.record_id
         and p.party_organization_id = organization_evidence_events.actor_organization_id
         and p.party_role in ('client','end_client','project_owner','assessor','verifier','public_body')
    )
    and not exists (
      select 1 from public.organization_evidence_records r
       join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_events.record_id
         and op.linked_profile_id = auth.uid()
    )
  );

-- evidence_import_events ───────────────────────────────────────────────────
create policy evidence_import_events_select on public.evidence_import_events
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

create policy evidence_import_events_insert on public.evidence_import_events
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and actor_profile_id = auth.uid()
  );

-- organization_evidence_competency_signals ────────────────────────────────
create policy organization_evidence_competency_signals_select
  on public.organization_evidence_competency_signals
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.organization_evidence_records r
       join public.organization_people op on op.id = r.organization_person_id
       where r.id = organization_evidence_competency_signals.record_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
    or public.is_admin()
  );

create policy organization_evidence_competency_signals_insert
  on public.organization_evidence_competency_signals
  for insert to authenticated
  with check (public.manages_organization(organization_id));

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- See supabase/rollbacks/20260907114500_organization_evidence_import_v1.down.sql
-- It refuses while any evidence, session or roster-person row exists (evidence
-- is never dropped to undo a schema change) and otherwise drops, in dependency
-- order:
--   drop table if exists public.organization_evidence_competency_signals;
--   drop table if exists public.evidence_import_events;
--   drop table if exists public.organization_evidence_events;
--   drop table if exists public.organization_evidence_parties;
--   alter table public.evidence_import_rows drop constraint if exists evidence_import_rows_duplicate_fk;
--   drop table if exists public.organization_evidence_records;
--   drop table if exists public.evidence_import_rows;
--   drop table if exists public.evidence_import_sessions;
--   drop table if exists public.organization_people;
