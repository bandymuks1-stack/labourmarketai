-- ============================================================================
-- 20260924100000_historical_timesheet_m1
-- Historical timesheet import PR-3 = migration M1 of
-- docs/design/historical-timesheet-import-v3.md: §8 (policies P1–P9, P7 split
-- into i/u/d, NO select restriction on project_clients), §14 (M1a–M1i) and
-- §15 row PR-3. Owner rules 2026-09-23 (§1): timesheets only, no finance;
-- an order relationship is not an order document.
--
-- CLASS: GREEN under .github/scripts/migration-safety.mjs. What that means
-- here, item by item:
--   • additive only — ADD COLUMN IF NOT EXISTS (all nullable, no default),
--     new UNIQUE / FOREIGN KEY / CHECK constraints, partial unique indexes,
--     one plain index. Nothing is dropped, loosened or rewritten; the 158
--     existing organization_evidence_records rows and their events are not
--     touched (INSERT policies judge new rows only).
--   • the two CHECK widenings (M1g `decided`, M1h `source_preserved`) are the
--     drop + re-add idiom the gate classifies GREEN: the new CHECK carries the
--     FULL old list plus the one new value, in the same file.
--   • every policy is CREATE POLICY … AS RESTRICTIVE: it can only NARROW what
--     the existing permissive policies admit. No `(true)` predicate anywhere.
--   • no GRANT / REVOKE, no SECURITY DEFINER, no trigger, no ALTER / DROP
--     POLICY, no SET ROLE, no SET / DROP NOT NULL, no UPDATE / DELETE of data,
--     no dynamic SQL, no `to anon`, no service-role path.
--   • idempotent: a re-run is a no-op. Columns and indexes use IF NOT EXISTS;
--     constraints and policies are created only when pg_constraint /
--     pg_policies does not already hold them; the CHECK widenings run only
--     while the new value is absent from the live definition.
--
-- CHECKS (the §14 pre-merge list, all read-only on production 2026-09-24,
-- results in the PR body "DB proof"):
--   1. organization_roles of every org with an evidence session satisfies P2
--      for its sessions' supplier_role (1 session: employer / csv / human; the
--      org holds `employer`) — PASS.
--   2. 0 sessions with supplier_role in ('public_body','sector_body') — PASS.
--   3. 0 projects rows violating B (organization_id bound to
--      organizations.legacy_company_id = company_id) — PASS (9 rows, 0 violate).
--   4. attestRecord from PR-2 (#1857) is on production — the lead confirms
--      the deploy BEFORE applying this file.
--   5. the commit writes the staging row's final state in ONE update
--      (PR-2 pin, historical-timesheet-acceptance.test.ts).
--   6. the rolled-back DO block docs/design/historical-timesheet-m1-dryrun.sql
--      (it embeds the M1 body below byte-for-byte) — executed by the lead.
--
-- APPLY ORDER: after PR-2 (#1857) is deployed, via Supabase MCP
-- apply_migration (never db push), then verify the ledger. PR-5 merges only
-- after this file is in the ledger.
--
-- Verbatim predicates (design §8). Written out in every policy, no helper
-- function is added:
--   G(org)  = active company_memberships role in ('owner','admin','manager')
--             OR active engagement_contexts relationship_slug in ('owner','manager')
--             — i.e. manages_organization minus external_manager.
--   OA(org) = the same with memberships ('owner','admin') and engagements ('owner').
--   K       = customer_key is null OR the caller owns the project's company.
--   B       = organization_id is null OR organizations.legacy_company_id =
--             company_id for that organization OR is_admin().
--
-- ROLLBACK: supabase/rollbacks/20260924100000_historical_timesheet_m1.down.sql
-- drops the policies, indexes, constraints and new columns and restores the
-- two original CHECKs; it REFUSES while any new column holds a value.
-- ============================================================================

begin;

-- M1 BODY BEGIN
-- ── M1a ── projects: the ordered work IS the historical project ────────────
-- historical_key IS NOT NULL is the discriminator (historical) and the
-- idempotency key; created_session_id binds it to one of its own org's
-- sessions (composite FK). unique (id, organization_id) is the tenant-safe
-- target for the composite FKs from records (M1d) and, later, steps (M2).
alter table public.projects add column if not exists historical_key text;
alter table public.projects add column if not exists created_session_id uuid;

do $hist_m_one_a$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.projects'::regclass
                    and conname = 'projects_org_scope') then
    alter table public.projects
      add constraint projects_org_scope unique (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.projects'::regclass
                    and conname = 'projects_created_session_fk') then
    alter table public.projects
      add constraint projects_created_session_fk
      foreign key (created_session_id, organization_id)
      references public.evidence_import_sessions (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.projects'::regclass
                    and conname = 'projects_historical_requires_session') then
    alter table public.projects
      add constraint projects_historical_requires_session
      check (historical_key is null
             or (created_session_id is not null and organization_id is not null));
  end if;
end $hist_m_one_a$;

create unique index if not exists projects_historical_key_uidx
  on public.projects (organization_id, historical_key)
  where historical_key is not null;

comment on column public.projects.historical_key is
  'hp:v1:<customer_key>|<work_object_id> or hp:v1:<customer_key>|p:<fold(project label)>. NOT NULL marks a HISTORICAL project (never in live planning); NULL is a live project. Idempotency key per organization. Never updated by any code path (G-HIST-2).';
comment on column public.projects.created_session_id is
  'The evidence_import_sessions row whose signed plan created this historical project (composite FK with organization_id). Required whenever historical_key is set.';

-- ── M1b ── work_objects: tenant-safe composite FK target ───────────────────
do $hist_m_one_b$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.work_objects'::regclass
                    and conname = 'work_objects_org_scope') then
    alter table public.work_objects
      add constraint work_objects_org_scope unique (id, organization_id);
  end if;
end $hist_m_one_b$;

-- ── M1c ── project_clients: the CUSTOMER, identified, without a new register ─
alter table public.project_clients add column if not exists customer_key text;
alter table public.project_clients add column if not exists customer_code text;
alter table public.project_clients add column if not exists customer_kind text;
alter table public.project_clients add column if not exists created_session_id uuid;

do $hist_m_one_c$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.project_clients'::regclass
                    and conname = 'project_clients_customer_kind_chk') then
    alter table public.project_clients
      add constraint project_clients_customer_kind_chk
      check (customer_kind is null
             or customer_kind in ('organization','private_person','unknown'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.project_clients'::regclass
                    and conname = 'project_clients_created_session_fk') then
    alter table public.project_clients
      add constraint project_clients_created_session_fk
      foreign key (created_session_id)
      references public.evidence_import_sessions (id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.project_clients'::regclass
                    and conname = 'project_clients_project_scope') then
    alter table public.project_clients
      add constraint project_clients_project_scope unique (id, project_id);
  end if;
end $hist_m_one_c$;

create unique index if not exists project_clients_customer_key_uidx
  on public.project_clients (project_id, customer_key)
  where customer_key is not null;

comment on column public.project_clients.customer_key is
  'code:<country code, or a two-dash placeholder>:<normalised code> when the source states a customer code, otherwise name:<customer-fold:v1>. NULL on the legacy name-only rows, which this design never reads. One identity = the keyed rows on one org''s historical projects that share a key.';
comment on column public.project_clients.customer_code is
  'The customer code in the source''s normalised form. NULL = the source did not state one.';
comment on column public.project_clients.customer_kind is
  'organization (a code or a legal-form token), private_person (only when a source column says so) or unknown (the writer''s default). NULL = not written by the historical writer.';
comment on column public.project_clients.created_session_id is
  'The evidence_import_sessions row whose signed plan created this customer row.';

-- ── M1d ── organization_evidence_records: performed work → its ordered work ─
alter table public.organization_evidence_records add column if not exists project_id uuid;
alter table public.organization_evidence_records add column if not exists source_row_index integer;
alter table public.organization_evidence_records add column if not exists row_origin text;

do $hist_m_one_d$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.organization_evidence_records'::regclass
                    and conname = 'organization_evidence_records_project_fk') then
    alter table public.organization_evidence_records
      add constraint organization_evidence_records_project_fk
      foreign key (project_id, organization_id)
      references public.projects (id, organization_id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.organization_evidence_records'::regclass
                    and conname = 'organization_evidence_records_row_origin_chk') then
    alter table public.organization_evidence_records
      add constraint organization_evidence_records_row_origin_chk
      check (row_origin is null or row_origin in ('parsed_file','agent_rows','typed'));
  end if;
end $hist_m_one_d$;

create index if not exists organization_evidence_records_project_idx
  on public.organization_evidence_records (organization_id, project_id);

comment on column public.organization_evidence_records.project_id is
  'The historical project (customer × object) this performed work belongs to. Composite FK with organization_id (NO ACTION): a record can only point at its own org''s project. NULL = customer not identified in the timesheet.';
comment on column public.organization_evidence_records.source_row_index is
  'The row''s position in the SOURCE file. Row-level provenance; required (with row_origin = parsed_file) for HISTORICAL_WORK_VERIFIED eligibility.';
comment on column public.organization_evidence_records.row_origin is
  'parsed_file = the server parsed the uploaded file, agent_rows = MCP submit_rows, typed = typed by a person. Only parsed_file rows in a human CSV/XLSX session with a preserved source can verify (P1). NULL on rows written before this column existed.';

-- ── M1e ── evidence_import_sessions: bind the file bytes to preservation ────
alter table public.evidence_import_sessions add column if not exists source_bytes_sha256 text;

do $hist_m_one_e$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.evidence_import_sessions'::regclass
                    and conname = 'evidence_import_sessions_source_bytes_sha256_chk') then
    alter table public.evidence_import_sessions
      add constraint evidence_import_sessions_source_bytes_sha256_chk
      check (source_bytes_sha256 is null
             or (char_length(source_bytes_sha256) = 64
                 and source_bytes_sha256 !~ '[^0-9a-f]'));
  end if;
end $hist_m_one_e$;

comment on column public.evidence_import_sessions.source_bytes_sha256 is
  'sha256 of the uploaded bytes, plain lower-case hex (the same form as document_files.content_sha256). Lets P5 bind a preserved org_import_source document to this session. source_fingerprint is unchanged.';

-- ── M1f ── evidence_import_rows: resolution state in staging ───────────────
alter table public.evidence_import_rows add column if not exists row_origin text;
alter table public.evidence_import_rows add column if not exists customer_label text;
alter table public.evidence_import_rows add column if not exists customer_code text;
alter table public.evidence_import_rows add column if not exists customer_key text;
alter table public.evidence_import_rows add column if not exists project_id uuid;

do $hist_m_one_f$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.evidence_import_rows'::regclass
                    and conname = 'evidence_import_rows_row_origin_chk') then
    alter table public.evidence_import_rows
      add constraint evidence_import_rows_row_origin_chk
      check (row_origin is null or row_origin in ('parsed_file','agent_rows','typed'));
  end if;
end $hist_m_one_f$;

-- ── M1g ── evidence_import_events.event_type gains 'decided' ───────────────
-- Drop + re-add with the FULL old list plus the new value (GREEN idiom).
-- The live constraint is the CREATE TABLE auto-name *_event_type_check; the
-- widened one is *_event_type_chk. Runs only while 'decided' is absent.
do $hist_m_one_g$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.evidence_import_events'::regclass
                    and conname = 'evidence_import_events_event_type_chk'
                    and pg_get_constraintdef(oid) like '%decided%') then
    alter table public.evidence_import_events
      drop constraint if exists evidence_import_events_event_type_check;
    alter table public.evidence_import_events
      drop constraint if exists evidence_import_events_event_type_chk;
    alter table public.evidence_import_events
      add constraint evidence_import_events_event_type_chk
      check (event_type in (
        'created','rows_submitted','previewed','committed',
        'rolled_back','reinstated','failed',
        'decided')) not valid;
    alter table public.evidence_import_events
      validate constraint evidence_import_events_event_type_chk;
  end if;
end $hist_m_one_g$;

-- ── M1h ── organization_evidence_events.event_type gains 'source_preserved' ─
do $hist_m_one_h$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.organization_evidence_events'::regclass
                    and conname = 'organization_evidence_events_event_type_chk'
                    and pg_get_constraintdef(oid) like '%source_preserved%') then
    alter table public.organization_evidence_events
      drop constraint if exists organization_evidence_events_event_type_check;
    alter table public.organization_evidence_events
      drop constraint if exists organization_evidence_events_event_type_chk;
    alter table public.organization_evidence_events
      add constraint organization_evidence_events_event_type_chk
      check (event_type in (
        'attested','attestation_withdrawn',
        'independently_verified','verification_withdrawn',
        'withdrawn','reinstated','disputed','corrected',
        'source_preserved')) not valid;
    alter table public.organization_evidence_events
      validate constraint organization_evidence_events_event_type_chk;
  end if;
end $hist_m_one_h$;

-- ── M1i ── RESTRICTIVE policies P1–P9 (design §8) ──────────────────────────
-- Each one narrows the existing permissive policy on the same command. The
-- governance predicate G / OA is written out inline (memberships and
-- engagements admit the caller's own rows), so no definer function is added.

-- P1 ── records INSERT: bound to the session; objects and staging rows of
--       the same tenant; parsed_file only from a human CSV/XLSX session with
--       a source hash. Closes N5, N6, N7, R1-8.
do $hist_m_one_i_p_one$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'organization_evidence_records'
                    and policyname = 'hist_p1_records_insert') then
    create policy hist_p1_records_insert on public.organization_evidence_records
      as restrictive for insert to authenticated
      with check (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = organization_evidence_records.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = organization_evidence_records.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and exists (
          select 1 from public.evidence_import_sessions s
           where s.id = organization_evidence_records.session_id
             and s.organization_id = organization_evidence_records.organization_id
             and s.supplied_by_organization_id = organization_evidence_records.supplied_by_organization_id
             and s.supplier_role = organization_evidence_records.supplier_role
             and s.source_kind = organization_evidence_records.source_kind
             and ( organization_evidence_records.row_origin is distinct from 'parsed_file'
                   or ( s.actor_kind = 'human'
                        and s.source_kind in ('csv','xlsx')
                        and s.source_bytes_sha256 is not null ) ) )
        and ( organization_evidence_records.work_object_id is null
              or exists (select 1 from public.work_objects o
                          where o.id = organization_evidence_records.work_object_id
                            and o.organization_id = organization_evidence_records.organization_id) )
        and ( organization_evidence_records.import_row_id is null
              or exists (select 1 from public.evidence_import_rows ir
                          where ir.id = organization_evidence_records.import_row_id
                            and ir.session_id = organization_evidence_records.session_id) ) );
  end if;
end $hist_m_one_i_p_one$;

-- P2 ── sessions INSERT: G on both organizations; a supplier_role may claim
--       only a capability the supplying org holds; `other` always admitted.
--       Closes N7 and R1-1 (self-minted capacities).
do $hist_m_one_i_p_two$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'evidence_import_sessions'
                    and policyname = 'hist_p2_sessions_insert') then
    create policy hist_p2_sessions_insert on public.evidence_import_sessions
      as restrictive for insert to authenticated
      with check (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_sessions.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_sessions.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_sessions.supplied_by_organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_sessions.supplied_by_organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and ( evidence_import_sessions.supplier_role = 'other'
              or exists (
                select 1 from public.organization_roles r
                 where r.organization_id = evidence_import_sessions.supplied_by_organization_id
                   and r.role_slug = any (case evidence_import_sessions.supplier_role
                     when 'employer'           then array['employer','project_operator']
                     when 'agency'             then array['workforce_provider','recruitment_partner','talent_provider']
                     when 'subcontractor'      then array['workforce_provider','project_operator']
                     when 'training_provider'  then array['training_provider']
                     when 'education_provider' then array['training_provider']
                     when 'placement_provider' then array['training_provider']
                     when 'assessor'           then array['training_provider','verification_provider']
                     when 'client'             then array['client']
                     when 'end_client'         then array['client']
                     when 'project_owner'      then array['project_operator','client']
                     else array[]::text[] end) ) ) );
  end if;
end $hist_m_one_i_p_two$;

-- P3 ── staging rows: G for INSERT; a committed row is immutable (UPDATE) and
--       cannot vanish (DELETE). Closes N7 and the rewrite-then-delete hole.
do $hist_m_one_i_p_three$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'evidence_import_rows'
                    and policyname = 'hist_p3_rows_insert') then
    create policy hist_p3_rows_insert on public.evidence_import_rows
      as restrictive for insert to authenticated
      with check (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_rows.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_rows.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) ) );
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'evidence_import_rows'
                    and policyname = 'hist_p3_rows_update') then
    create policy hist_p3_rows_update on public.evidence_import_rows
      as restrictive for update to authenticated
      using (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_rows.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_rows.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and evidence_import_rows.status <> 'committed' )
      with check (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_rows.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_rows.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) ) );
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'evidence_import_rows'
                    and policyname = 'hist_p3_rows_delete') then
    create policy hist_p3_rows_delete on public.evidence_import_rows
      as restrictive for delete to authenticated
      using (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_rows.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_rows.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and evidence_import_rows.status <> 'committed' );
  end if;
end $hist_m_one_i_p_three$;

-- P4 ── evidence events INSERT. Branch 1 leaves the subject-dispute and the
--       party-verify paths exactly as they are (non-managers only). Branch 2
--       is the supplier: its own org only; `attested` bound to the record's
--       supplier_role; `source_preserved` only from an owner/admin (OA) and
--       only when an ACTIVE, CLASSIFIED org_import_source document holds the
--       session's bytes (P5). Closes R1-1 and N7.
do $hist_m_one_i_p_four$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'organization_evidence_events'
                    and policyname = 'hist_p4_events_insert') then
    create policy hist_p4_events_insert on public.organization_evidence_events
      as restrictive for insert to authenticated
      with check (
        ( organization_evidence_events.event_type in ('disputed','independently_verified','verification_withdrawn')
          and not public.manages_organization(organization_evidence_events.organization_id) )
        or
        ( ( exists (select 1 from public.company_memberships m
                     where m.profile_id = auth.uid()
                       and m.organization_id = organization_evidence_events.organization_id
                       and m.status = 'active' and m.role in ('owner','admin','manager'))
            or exists (select 1 from public.engagement_contexts ec
                     where ec.profile_id = auth.uid()
                       and ec.organization_id = organization_evidence_events.organization_id
                       and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
          and ( organization_evidence_events.actor_organization_id is null
                or organization_evidence_events.actor_organization_id = organization_evidence_events.organization_id )
          and organization_evidence_events.event_type in
                ('attested','attestation_withdrawn','withdrawn','reinstated','corrected','source_preserved')
          and ( organization_evidence_events.event_type <> 'attested'
                or ( organization_evidence_events.actor_organization_id = organization_evidence_events.organization_id
                     and exists (select 1 from public.organization_evidence_records r
                                  where r.id = organization_evidence_events.record_id
                                    and r.organization_id = organization_evidence_events.organization_id
                                    and r.supplier_role = organization_evidence_events.actor_role) ) )
          and ( organization_evidence_events.event_type <> 'source_preserved'
                or ( ( exists (select 1 from public.company_memberships m
                                where m.profile_id = auth.uid()
                                  and m.organization_id = organization_evidence_events.organization_id
                                  and m.status = 'active' and m.role in ('owner','admin'))
                       or exists (select 1 from public.engagement_contexts ec
                                where ec.profile_id = auth.uid()
                                  and ec.organization_id = organization_evidence_events.organization_id
                                  and ec.status = 'active' and ec.relationship_slug in ('owner')) )
                     and exists (
                       select 1
                         from public.org_documents od
                         join public.document_files df on df.org_document_id = od.id
                         join public.evidence_import_sessions s
                           on s.source_bytes_sha256 = df.content_sha256
                          and s.organization_id = od.organization_id
                         join public.organization_evidence_records r on r.session_id = s.id
                        where r.id = organization_evidence_events.record_id
                          and od.organization_id = organization_evidence_events.organization_id
                          and od.document_type_slug = 'org_import_source'
                          and od.status = 'active'
                          and od.classification = 'classified'
                          and df.superseded_at is null ) ) ) ) );
  end if;
end $hist_m_one_i_p_four$;

-- P6 ── parties INSERT: G; on a record inside a historical customer-ordered
--       work no party ORGANIZATION may be named (label only), so no customer
--       org gains read or verify access by accident. Every other record keeps
--       the independent-verification party path unchanged. Closes N7.
do $hist_m_one_i_p_six$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'organization_evidence_parties'
                    and policyname = 'hist_p6_parties_insert') then
    create policy hist_p6_parties_insert on public.organization_evidence_parties
      as restrictive for insert to authenticated
      with check (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = organization_evidence_parties.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = organization_evidence_parties.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and ( organization_evidence_parties.party_organization_id is null
              or not exists (
                select 1 from public.organization_evidence_records r
                  join public.project_clients pc on pc.project_id = r.project_id
                 where r.id = organization_evidence_parties.record_id
                   and pc.customer_key is not null ) ) );
  end if;
end $hist_m_one_i_p_six$;

-- P7 ── project_clients INSERT / UPDATE / DELETE: a KEYED (historical)
--       customer row is written only by the owner/admin of the project's
--       company (K). Deliberately NO restrictive SELECT policy: managers keep
--       reading keyed rows through can_manage_project (design §4 rule 5).
do $hist_m_one_i_p_seven$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_clients'
                    and policyname = 'hist_p7_clients_insert') then
    create policy hist_p7_clients_insert on public.project_clients
      as restrictive for insert to authenticated
      with check (
        project_clients.customer_key is null
        or exists (select 1 from public.projects p
                    where p.id = project_clients.project_id
                      and public.owns_company(p.company_id)) );
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_clients'
                    and policyname = 'hist_p7_clients_update') then
    create policy hist_p7_clients_update on public.project_clients
      as restrictive for update to authenticated
      using (
        project_clients.customer_key is null
        or exists (select 1 from public.projects p
                    where p.id = project_clients.project_id
                      and public.owns_company(p.company_id)) )
      with check (
        project_clients.customer_key is null
        or exists (select 1 from public.projects p
                    where p.id = project_clients.project_id
                      and public.owns_company(p.company_id)) );
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_clients'
                    and policyname = 'hist_p7_clients_delete') then
    create policy hist_p7_clients_delete on public.project_clients
      as restrictive for delete to authenticated
      using (
        project_clients.customer_key is null
        or exists (select 1 from public.projects p
                    where p.id = project_clients.project_id
                      and public.owns_company(p.company_id)) );
  end if;
end $hist_m_one_i_p_seven$;

-- P8 ── import audit events INSERT: G (an external manager cannot write the
--       trail). Closes N7.
do $hist_m_one_i_p_eight$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'evidence_import_events'
                    and policyname = 'hist_p8_import_events_insert') then
    create policy hist_p8_import_events_insert on public.evidence_import_events
      as restrictive for insert to authenticated
      with check (
        ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid()
                     and m.organization_id = evidence_import_events.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
          or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid()
                     and ec.organization_id = evidence_import_events.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) ) );
  end if;
end $hist_m_one_i_p_eight$;

-- P9 ── projects INSERT / UPDATE: organization_id is bound to the owning
--       company (B). A foreign company owner can neither create a project
--       inside another org nor re-point one, so a historical_key cannot be
--       squatted. Every create the ONE core performs today passes (it derives
--       organization_id from legacy_company_id under the same RLS). Closes N8.
do $hist_m_one_i_p_nine$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'projects'
                    and policyname = 'hist_p9_projects_insert') then
    create policy hist_p9_projects_insert on public.projects
      as restrictive for insert to authenticated
      with check (
        projects.organization_id is null
        or exists (select 1 from public.organizations o
                    where o.id = projects.organization_id
                      and o.legacy_company_id = projects.company_id)
        or public.is_admin() );
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'projects'
                    and policyname = 'hist_p9_projects_update') then
    create policy hist_p9_projects_update on public.projects
      as restrictive for update to authenticated
      using (
        projects.organization_id is null
        or exists (select 1 from public.organizations o
                    where o.id = projects.organization_id
                      and o.legacy_company_id = projects.company_id)
        or public.is_admin() )
      with check (
        projects.organization_id is null
        or exists (select 1 from public.organizations o
                    where o.id = projects.organization_id
                      and o.legacy_company_id = projects.company_id)
        or public.is_admin() );
  end if;
end $hist_m_one_i_p_nine$;
-- M1 BODY END

commit;

-- ROLLBACK (down): supabase/rollbacks/20260924100000_historical_timesheet_m1.down.sql
-- Refuses while any new column holds a value; otherwise drops the 13 policies,
-- the 3 indexes, the constraints and the 13 new columns, and restores the two
-- original CHECKs under their CREATE TABLE names.
