-- ============================================================================
-- docs/design/historical-timesheet-m1-dryrun.sql
-- Historical timesheet import PR-3 — the ROLLED-BACK production dry run of
-- migration M1 (design §14 check 6, §8 "Recursion check", fixture T14).
--
-- ONE DO block. It NEVER commits: the last statement on every path is
--   raise exception 'DRYRUN_RESULT:…'
-- so the transaction aborts and every DDL, seed and attempt made inside it
-- is rolled back. The LEAD runs it through Supabase MCP execute_sql (this
-- whole file is the query). The answer is the error text: a JSON document
-- after 'DRYRUN_RESULT:'. A pre-merge assertion failure names itself
-- ('PREMERGE_CHECK_n_FAILED …'); a discovery failure names itself
-- ('DRYRUN_ABORT …'). Nothing else is written by this file, ever.
--
-- What it does, in order:
--   0. §14 pre-merge checks 1–3 as ASSERTIONS.
--   1. applies the M1 body of
--      supabase/migrations/20260924100000_historical_timesheet_m1.sql,
--      embedded BYTE-FOR-BYTE between the two markers below
--      (apps/web/lib/guards/historical-timesheet-m1-migration.test.ts pins
--      the identity). M1 is idempotent, so after the real apply this file is
--      also the post-apply verification.
--   2. discovers REAL actors BY STRUCTURE — no identifier is written here:
--        A = an organization holding `employer`, with an active owner and an
--            active manager (distinct, neither an admin) and a legacy company
--            (the FX role of the fixture; the supplying org's shape);
--        B = another organization with a legacy company and an active owner
--            who has no relationship with A (the FY role);
--        N = an organization with NO declared roles and an active owner (FN);
--        X = a profile with a workers row and no relationship with A or B
--            (the subject, P-Alpha); E = a second such profile (E-Eve);
--        S = the organization that already holds evidence sessions (reads only).
--   3. seeds, as the session user, ONLY what the fixture needs and production
--      lacks (all rolled back): E's external_manager membership in A, one B
--      object and one B project when B has none, one LINKED roster person for
--      X in A.
--   4. per actor: SET LOCAL ROLE authenticated + request.jwt.claims, one
--      SELECT on every touched table (policy reachability — the 42P17 class),
--      the legitimate insert paths (+1 … +7) and every T14 negative control
--      that M1 can answer. A18 / A20 (the M2 table) and A27 / A28 / A29 plus
--      the `source_preserved` positive control (the M3 document type) are
--      outside M1 and are reported as `not_in_m1`, not as passes.
--   5. raise exception 'DRYRUN_RESULT:' || json {ok, failed, premerge,
--      actors (roles + 8-char id prefixes only), checks:[{id, actor, expect,
--      got, ok}], reads:[{actor, counts, errors}]}.
--
-- Expected: "failed": 0. Every check's `got` equals its `expect`:
--   42501 = refused by RLS (insufficient_privilege), 23503 = FK violation,
--   '0 rows' = filtered by USING, 'admitted' = the write passed.
-- ============================================================================

do $dry$
declare
  -- results
  v_checks   jsonb := '[]'::jsonb;
  v_reads    jsonb := '[]'::jsonb;
  v_premerge jsonb;
  v_counts   jsonb;
  v_errors   jsonb;
  v_got      text;
  v_n        bigint;
  v_count    bigint;
  v_failed   bigint;
  v_actor    text;
  v_t        text;
  v_tables   text[] := array[
    'projects','work_objects','project_clients','organization_people',
    'evidence_import_sessions','evidence_import_rows','evidence_import_events',
    'organization_evidence_records','organization_evidence_parties',
    'organization_evidence_events','organization_roles','organizations',
    'company_memberships','engagement_contexts','org_documents','document_files'];
  -- actors (discovered)
  a_org uuid; a_company uuid; a_owner uuid; a_manager uuid;
  b_org uuid; b_company uuid; b_owner uuid; b_object uuid; b_project uuid;
  n_org uuid; n_owner uuid;
  x_user uuid; x_worker uuid; e_user uuid;
  s_org uuid; s_owner uuid;
  v_unheld_role text;
  -- entities the owner / manager create in-block (rolled back)
  a_session uuid; a_session2 uuid; a_agent_session uuid;
  a_person uuid; a_person_linked uuid;
  a_row uuid; a_row2 uuid; a_row3 uuid;
  a_live_project uuid; a_project uuid;
  a_client_keyed uuid; a_client_plain uuid;
  a_record uuid; a_record_np uuid; m_record uuid;
begin
  -- ── 0. §14 pre-merge checks 1–3 (assertions) ─────────────────────────────
  select count(*) into v_n
    from public.evidence_import_sessions s
   where not ( s.supplier_role = 'other'
               or exists (
                 select 1 from public.organization_roles r
                  where r.organization_id = s.supplied_by_organization_id
                    and r.role_slug = any (case s.supplier_role
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
                      else array[]::text[] end) ) );
  if v_n > 0 then
    raise exception 'PREMERGE_CHECK_1_FAILED: % session(s) claim a supplier_role capability the supplying organization does not hold (P2 would refuse the shape)', v_n;
  end if;
  v_premerge := jsonb_build_object('check1_sessions_violating_p2', v_n);

  select count(*) into v_n from public.evidence_import_sessions
   where supplier_role in ('public_body','sector_body');
  if v_n > 0 then
    raise exception 'PREMERGE_CHECK_2_FAILED: % session(s) with supplier_role public_body / sector_body (owner Q7)', v_n;
  end if;
  v_premerge := v_premerge || jsonb_build_object('check2_public_sector_sessions', v_n);

  select count(*) into v_n from public.projects p
   where p.organization_id is not null
     and not exists (select 1 from public.organizations o
                      where o.id = p.organization_id and o.legacy_company_id = p.company_id);
  if v_n > 0 then
    raise exception 'PREMERGE_CHECK_3_FAILED: % projects row(s) violate B (organization_id not bound to company_id) — owner data decision first', v_n;
  end if;
  v_premerge := v_premerge || jsonb_build_object('check3_projects_violating_b', v_n);

  select count(*) into v_n from public.organization_evidence_records;
  v_premerge := v_premerge || jsonb_build_object('existing_records', v_n);

  -- ── 1. apply M1 (idempotent; a no-op when already applied) ───────────────
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

  -- ── 2. discover actors by structure ──────────────────────────────────────
  select o.id, o.legacy_company_id into a_org, a_company
    from public.organizations o
   where o.legacy_company_id is not null
     and exists (select 1 from public.companies c where c.id = o.legacy_company_id)
     and exists (select 1 from public.organization_roles r
                  where r.organization_id = o.id and r.role_slug = 'employer')
     and exists (select 1 from public.company_memberships m
                  where m.organization_id = o.id and m.status = 'active' and m.role = 'owner')
     and exists (select 1 from public.company_memberships m
                  where m.organization_id = o.id and m.status = 'active' and m.role = 'manager'
                    and not exists (select 1 from public.company_memberships x
                                     where x.organization_id = o.id and x.profile_id = m.profile_id
                                       and x.status = 'active' and x.role in ('owner','admin'))
                    and not exists (select 1 from public.companies c
                                     where c.id = o.legacy_company_id and c.profile_id = m.profile_id)
                    and not exists (select 1 from public.profiles p
                                     where p.id = m.profile_id and p.active_role = 'admin')
                    and not exists (select 1 from public.profile_roles pr
                                     where pr.profile_id = m.profile_id and pr.role = 'admin'))
   order by (exists (select 1 from public.evidence_import_sessions s where s.organization_id = o.id)) desc,
            o.created_at
   limit 1;
  if a_org is null then
    raise exception 'DRYRUN_ABORT: no organization with employer role + active owner + active manager (non-admin, non-owner) + legacy company';
  end if;

  select m.profile_id into a_owner
    from public.company_memberships m
   where m.organization_id = a_org and m.status = 'active' and m.role = 'owner'
   order by m.created_at limit 1;

  select m.profile_id into a_manager
    from public.company_memberships m
   where m.organization_id = a_org and m.status = 'active' and m.role = 'manager'
     and not exists (select 1 from public.company_memberships x
                      where x.organization_id = a_org and x.profile_id = m.profile_id
                        and x.status = 'active' and x.role in ('owner','admin'))
     and not exists (select 1 from public.companies c
                      where c.id = a_company and c.profile_id = m.profile_id)
     and not exists (select 1 from public.profiles p
                      where p.id = m.profile_id and p.active_role = 'admin')
     and not exists (select 1 from public.profile_roles pr
                      where pr.profile_id = m.profile_id and pr.role = 'admin')
   order by m.created_at limit 1;

  select o.id, o.legacy_company_id, m.profile_id into b_org, b_company, b_owner
    from public.organizations o
    join public.company_memberships m
      on m.organization_id = o.id and m.status = 'active' and m.role = 'owner'
   where o.id <> a_org
     and o.legacy_company_id is not null
     and exists (select 1 from public.companies c where c.id = o.legacy_company_id)
     and m.profile_id not in (a_owner, a_manager)
     and not exists (select 1 from public.company_memberships x
                      where x.organization_id = a_org and x.profile_id = m.profile_id and x.status = 'active')
     and not exists (select 1 from public.engagement_contexts x
                      where x.organization_id = a_org and x.profile_id = m.profile_id and x.status = 'active')
     and not exists (select 1 from public.companies c
                      where c.id = a_company and c.profile_id = m.profile_id)
     and not exists (select 1 from public.profiles p
                      where p.id = m.profile_id and p.active_role = 'admin')
     and not exists (select 1 from public.profile_roles pr
                      where pr.profile_id = m.profile_id and pr.role = 'admin')
   order by o.created_at limit 1;
  if b_org is null then
    raise exception 'DRYRUN_ABORT: no second organization with a legacy company and an owner unrelated to A';
  end if;

  select o.id, m.profile_id into n_org, n_owner
    from public.organizations o
    join public.company_memberships m
      on m.organization_id = o.id and m.status = 'active' and m.role = 'owner'
   where o.id not in (a_org, b_org)
     and not exists (select 1 from public.organization_roles r where r.organization_id = o.id)
     and not exists (select 1 from public.profiles p
                      where p.id = m.profile_id and p.active_role = 'admin')
     and not exists (select 1 from public.profile_roles pr
                      where pr.profile_id = m.profile_id and pr.role = 'admin')
   order by o.created_at limit 1;

  select p.id, w.id into x_user, x_worker
    from public.profiles p
    join public.workers w on w.profile_id = p.id
   where p.id not in (a_owner, a_manager, b_owner)
     and (n_owner is null or p.id <> n_owner)
     and coalesce(p.active_role, '') <> 'admin'
     and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id and pr.role = 'admin')
     and not exists (select 1 from public.company_memberships x
                      where x.profile_id = p.id and x.organization_id in (a_org, b_org) and x.status <> 'revoked')
     and not exists (select 1 from public.engagement_contexts x
                      where x.profile_id = p.id and x.organization_id in (a_org, b_org) and x.status = 'active')
     and not exists (select 1 from public.companies c
                      where c.id in (a_company, b_company) and c.profile_id = p.id)
     and not exists (select 1 from public.organization_people op
                      where op.organization_id in (a_org, b_org)
                        and (op.linked_profile_id = p.id or op.linked_worker_id = w.id))
   order by p.created_at limit 1;
  if x_user is null then
    raise exception 'DRYRUN_ABORT: no profile with a workers row and no relationship with A or B (the subject)';
  end if;

  select p.id into e_user
    from public.profiles p
   where p.id not in (a_owner, a_manager, b_owner, x_user)
     and (n_owner is null or p.id <> n_owner)
     and coalesce(p.active_role, '') <> 'admin'
     and not exists (select 1 from public.profile_roles pr where pr.profile_id = p.id and pr.role = 'admin')
     and not exists (select 1 from public.company_memberships x
                      where x.profile_id = p.id and x.organization_id in (a_org, b_org) and x.status <> 'revoked')
     and not exists (select 1 from public.engagement_contexts x
                      where x.profile_id = p.id and x.organization_id in (a_org, b_org) and x.status = 'active')
     and not exists (select 1 from public.companies c
                      where c.id in (a_company, b_company) and c.profile_id = p.id)
     and not exists (select 1 from public.organization_people op
                      where op.organization_id in (a_org, b_org) and op.linked_profile_id = p.id)
   order by p.created_at limit 1;
  if e_user is null then
    raise exception 'DRYRUN_ABORT: no second unrelated profile (the external manager)';
  end if;

  select s.organization_id into s_org
    from public.evidence_import_sessions s
   order by s.created_at limit 1;
  if s_org is not null then
    select m.profile_id into s_owner
      from public.company_memberships m
     where m.organization_id = s_org and m.status = 'active' and m.role = 'owner'
     order by m.created_at limit 1;
  end if;

  -- a supplier_role whose capability A does NOT hold (for A14)
  select r.role into v_unheld_role
    from (values ('client', array['client']),
                 ('assessor', array['training_provider','verification_provider']),
                 ('agency', array['workforce_provider','recruitment_partner','talent_provider']),
                 ('project_owner', array['project_operator','client'])) as r(role, slugs)
   where not exists (select 1 from public.organization_roles x
                      where x.organization_id = a_org and x.role_slug = any (r.slugs))
   limit 1;

  -- ── 3. seeds (session user; rolled back with everything else) ────────────
  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at, source)
  values (a_org, e_user, 'external_manager', 'active', now(), 'dryrun-rolled-back');

  select w.id into b_object from public.work_objects w where w.organization_id = b_org order by w.created_at limit 1;
  if b_object is null then
    insert into public.work_objects (organization_id, name, created_by)
    values (b_org, 'Fixtura Other Site', b_owner) returning id into b_object;
  end if;

  select p.id into b_project from public.projects p
   where p.organization_id = b_org and p.company_id = b_company order by p.created_at limit 1;
  if b_project is null then
    insert into public.projects (company_id, organization_id, title, status)
    values (b_company, b_org, 'Fixtura Other Project', 'draft') returning id into b_project;
  end if;

  insert into public.organization_people
    (organization_id, display_name, normalized_name, external_ref,
     linked_worker_id, linked_profile_id, link_state, link_method, linked_at, created_by)
  values (a_org, 'Person Alpha', 'alpha person', 'FX-DRYRUN-ALPHA',
          x_worker, x_user, 'linked', 'worker_confirmed', now(), a_owner)
  returning id into a_person_linked;

  -- ── 4. per actor ─────────────────────────────────────────────────────────

  -- ═══ O — the owner of A ═══════════════════════════════════════════════════
  v_actor := 'O';
  reset role;
  perform set_config('request.jwt.claim.sub', a_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a_owner, 'role', 'authenticated', 'email', 'o-oscar@fixture.invalid')::text, true);
  set local role authenticated;

  v_counts := '{}'::jsonb; v_errors := '[]'::jsonb;
  foreach v_t in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_t) into v_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_count);
    exception when others then
      v_errors := v_errors || jsonb_build_object('table', v_t, 'sqlstate', SQLSTATE);
    end;
  end loop;
  v_reads := v_reads || jsonb_build_object('actor', v_actor, 'counts', v_counts, 'errors', v_errors);

  begin
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_filename, source_fingerprint, source_language,
       supplied_by_organization_id, supplier_role, actor_kind, source_bytes_sha256)
    values (a_org, 'csv', 'fx-timesheet-2023.csv', 'dryrun:' || md5('s1' || clock_timestamp()::text), 'lt',
            a_org, 'employer', 'human', encode(sha256(convert_to('fx-timesheet-2023', 'UTF8')), 'hex'))
    returning id into a_session;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1a session employer/csv/human (P2)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_filename, source_fingerprint, source_language,
       supplied_by_organization_id, supplier_role, actor_kind, source_bytes_sha256)
    values (a_org, 'csv', 'fx-daily-report-2023-03.csv', 'dryrun:' || md5('s2' || clock_timestamp()::text), 'lt',
            a_org, 'employer', 'human', encode(sha256(convert_to('fx-daily-report-2023-03', 'UTF8')), 'hex'))
    returning id into a_session2;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1b second human session (P2)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_fingerprint, source_language,
       supplied_by_organization_id, supplier_role, actor_kind, agent_label)
    values (a_org, 'agent', 'dryrun:' || md5('s4' || clock_timestamp()::text), 'lt',
            a_org, 'employer', 'agent', 'fixture-assistant')
    returning id into a_agent_session;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1c agent session (P2; S4 shape)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_people (organization_id, display_name, normalized_name, external_ref)
    values (a_org, 'Person Bravo', 'bravo person', 'FX-DRYRUN-BRAVO')
    returning id into a_person;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1d roster person (existing policy)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.evidence_import_rows
      (session_id, organization_id, row_index, source_fact, record_fingerprint, status,
       activity_date, hours, organization_person_id, person_state, row_origin)
    values (a_session, a_org, 0, '{"person":"Person Bravo","date":"2023-03-06","hours":"8"}',
            'dryrun-row:' || md5('r0' || clock_timestamp()::text), 'ready', date '2023-03-06', 8, a_person, 'matched', 'parsed_file')
    returning id into a_row;
    insert into public.evidence_import_rows
      (session_id, organization_id, row_index, source_fact, record_fingerprint, status,
       activity_date, hours, organization_person_id, person_state, row_origin)
    values (a_session, a_org, 1, '{"person":"Person Alpha","date":"2023-03-07","hours":"8"}',
            'dryrun-row:' || md5('r1' || clock_timestamp()::text), 'ready', date '2023-03-07', 8, a_person_linked, 'matched', 'parsed_file')
    returning id into a_row2;
    insert into public.evidence_import_rows
      (session_id, organization_id, row_index, source_fact, record_fingerprint, status,
       activity_date, hours, organization_person_id, person_state, row_origin)
    values (a_session, a_org, 2, '{"person":"Person Bravo","date":"2023-03-08","hours":"?"}',
            'dryrun-row:' || md5('r2' || clock_timestamp()::text), 'ready', date '2023-03-08', null, a_person, 'matched', 'parsed_file')
    returning id into a_row3;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1e three staged rows at source positions (P3i)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.projects (company_id, organization_id, title, status)
    values (a_company, a_org, 'Fixture Live Project', 'draft')
    returning id into a_live_project;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+6 live project through the ONE create core shape (P9i)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.projects (company_id, organization_id, title, status, historical_key, created_session_id)
    values (a_company, a_org, 'UAB Fixtura Alfa · Fixturos g. 3, Vilnius', null,
            'hp:v1:code:--:999000001|' || md5('o1'), a_session)
    returning id into a_project;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1f historical project: status NULL, historical_key, own session (P9i, M1a CHECK+FK)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.projects (company_id, organization_id, title, historical_key)
    values (a_company, a_org, 'Fixture squat', 'hp:v1:code:--:999000009|' || md5('o9'));
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'M1a CHECK: historical_key without created_session_id', 'actor', v_actor, 'expect', '23514', 'got', v_got, 'ok', v_got = '23514');

  begin
    insert into public.project_clients (project_id, name, customer_key, customer_code, customer_kind, created_session_id)
    values (a_project, 'UAB Fixtura Alfa', 'code:--:999000001', '999000001', 'organization', a_session)
    returning id into a_client_keyed;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1g keyed customer row on the historical project (P7i)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.project_clients (project_id, name)
    values (a_live_project, 'Fixture Legacy Client')
    returning id into a_client_plain;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1h legacy name-only customer row on the live project (P7i, K: key null)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_filename, source_fact, record_fingerprint, hash_self,
       project_id, source_row_index, row_origin)
    values (a_org, a_person, date '2023-03-06', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session, a_row,
            'csv', 'fx-timesheet-2023.csv', '{"person":"Person Bravo","date":"2023-03-06","hours":"8"}',
            'dryrun-rec:' || md5('rec0' || clock_timestamp()::text), md5('dryrun-rec0'),
            a_project, 0, 'parsed_file')
    returning id into a_record;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1i parsed_file record bound to its session, staging row and historical project (P1, M1d FK)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_filename, source_fact, record_fingerprint, hash_self,
       project_id, source_row_index, row_origin)
    values (a_org, a_person_linked, date '2023-03-07', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session, a_row2,
            'csv', 'fx-timesheet-2023.csv', '{"person":"Person Alpha","date":"2023-03-07","hours":"8"}',
            'dryrun-rec:' || md5('rec1' || clock_timestamp()::text), md5('dryrun-rec1'),
            null, 1, 'parsed_file')
    returning id into a_record_np;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1j record with NO project (customer not identified) for the linked subject (P1)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record, 'attested', 'employer', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+7 attested/employer, actor_organization_id = organization_id (the 158-record shape; P4)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_parties (organization_id, record_id, party_role, party_label)
    values (a_org, a_record, 'client', 'UAB Fixtura Alfa');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1k party label-only on the historical record (P6)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_parties (organization_id, record_id, party_role, party_organization_id)
    values (a_org, a_record, 'client', b_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A25 party ORGANIZATION named on a historical record (P6)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_parties (organization_id, record_id, party_role, party_organization_id)
    values (a_org, a_record_np, 'client', b_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+5a party organization on a NON-historical record (P6 unchanged outside the historical path)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.evidence_import_events (organization_id, session_id, event_type, payload)
    values (a_org, a_session, 'decided', '{"kind":"ordered_work_split_uncertain","choice":"same_order"}');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1l decided import event (M1g CHECK, P8)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A13 source_preserved with no preserved document (P5)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');
  v_checks := v_checks || jsonb_build_object('id', '+1 source_preserved with a matching ACTIVE CLASSIFIED org_import_source document', 'actor', v_actor, 'expect', 'not_in_m1', 'got', 'not_in_m1 (document type ships in M3)', 'ok', true);
  v_checks := v_checks || jsonb_build_object('id', 'A27 / A28 / A29 (register_document_file_v1, standard / revoked document, responsible person)', 'actor', v_actor, 'expect', 'not_in_m1', 'got', 'not_in_m1 (M3)', 'ok', true);
  v_checks := v_checks || jsonb_build_object('id', 'A18 / A20 (project_ordered_work)', 'actor', v_actor, 'expect', 'not_in_m1', 'got', 'not_in_m1 (M2)', 'ok', true);

  begin
    update public.evidence_import_rows set status = 'committed' where id = a_row;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'commit: the ONE update that sets committed (P3u USING status<>committed)', 'actor', v_actor, 'expect', '1 rows', 'got', v_got, 'ok', v_got = '1 rows');

  begin
    update public.evidence_import_rows set status = 'pending', hours = 99 where id = a_row;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A15 owner rewrites a committed staging row (P3u)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    delete from public.evidence_import_rows where id = a_row;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A15 owner deletes a committed staging row (P3d)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    update public.organization_evidence_records set hours = 1 where id = a_record;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A19 owner updates a record (no UPDATE grant)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    delete from public.organization_evidence_events where record_id = a_record;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A19 owner deletes an event (no DELETE grant)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    delete from public.projects where id = a_project;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A21 owner deletes the historical project (no DELETE grant on projects)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select count(*) into v_n from public.projects where company_id = a_company and historical_key is null;
    select count(*) into v_count from public.projects where company_id = a_company and historical_key is not null;
    v_got := 'live=' || v_n::text || ' historical=' || v_count::text;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'T17 discriminator read: live projects exclude the historical one', 'actor', v_actor, 'expect', 'historical=1', 'got', v_got, 'ok', v_got like '%historical=1');

  -- ═══ M — the manager of A ═════════════════════════════════════════════════
  v_actor := 'M';
  reset role;
  perform set_config('request.jwt.claim.sub', a_manager::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a_manager, 'role', 'authenticated', 'email', 'm-mike@fixture.invalid')::text, true);
  set local role authenticated;

  v_counts := '{}'::jsonb; v_errors := '[]'::jsonb;
  foreach v_t in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_t) into v_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_count);
    exception when others then
      v_errors := v_errors || jsonb_build_object('table', v_t, 'sqlstate', SQLSTATE);
    end;
  end loop;
  v_reads := v_reads || jsonb_build_object('actor', v_actor, 'counts', v_counts, 'errors', v_errors);

  begin
    select count(*) into v_n from public.project_clients where id = a_client_keyed;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+2 manager SELECTs the keyed customer row (no P7 SELECT restriction)', 'actor', v_actor, 'expect', '1 rows', 'got', v_got, 'ok', v_got = '1 rows');

  begin
    select count(*) into v_n from public.projects where id = a_project;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'manager cannot read projects (existing projects_select; design §13)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_filename, source_fact, record_fingerprint, hash_self,
       project_id, source_row_index, row_origin)
    values (a_org, a_person, date '2023-03-08', null, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session, a_row3,
            'csv', 'fx-timesheet-2023.csv', '{"person":"Person Bravo","date":"2023-03-08","hours":"?"}',
            'dryrun-rec:' || md5('rec2' || clock_timestamp()::text), md5('dryrun-rec2'),
            a_project, 2, 'parsed_file')
    returning id into m_record;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+3a manager inserts a record into the existing historical project (P1; hours NULL = unknown)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, m_record, 'attested', 'employer', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+3b manager attests employer on an employer record (P4)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', b_org, 'employer', a_session, null,
            'csv', '{}', 'dryrun-rec:' || md5('a3' || clock_timestamp()::text), md5('a3'));
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A3 record with supplied_by_organization_id = B (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'agency', a_session, null,
            'csv', '{}', 'dryrun-rec:' || md5('a4' || clock_timestamp()::text), md5('a4'));
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A4 record with supplier_role agency in an employer session (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self, work_object_id)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session, null,
            'csv', '{}', 'dryrun-rec:' || md5('a5' || clock_timestamp()::text), md5('a5'), b_object);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A5 record with another org''s work_object_id (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self, project_id)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session, null,
            'csv', '{}', 'dryrun-rec:' || md5('a6' || clock_timestamp()::text), md5('a6'), b_project);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A6 record with another org''s project_id (M1d composite FK)', 'actor', v_actor, 'expect', '23503', 'got', v_got, 'ok', v_got = '23503');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session2, a_row,
            'csv', '{}', 'dryrun-rec:' || md5('a7' || clock_timestamp()::text), md5('a7'));
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A7 record in session 2 pointing at a session-1 staging row (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self, row_origin, source_row_index)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_agent_session, null,
            'agent', '{}', 'dryrun-rec:' || md5('a24' || clock_timestamp()::text), md5('a24'), 'parsed_file', 0);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A24 parsed_file record in an AGENT session (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_fact, record_fingerprint, hash_self, row_origin)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_agent_session, null,
            'agent', '{}', 'dryrun-rec:' || md5('a24b' || clock_timestamp()::text), md5('a24b'), 'agent_rows');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'agent_rows record in the agent session is admitted (P1; never verifies)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record, 'attested', 'client', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A8 attested as client on an employer record (P4)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record, 'attested', 'employer', b_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A9 attested naming another organization (P4)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type)
    values (a_org, a_record, 'verification_withdrawn');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A10 supplier writes verification_withdrawn (P4)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type)
    values (a_org, a_record, 'disputed');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A11 supplier writes disputed (P4)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A12 manager writes source_preserved (P5: OA)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  if v_unheld_role is null then
    v_checks := v_checks || jsonb_build_object('id', 'A14 session claiming a capability A does not hold (P2)', 'actor', v_actor, 'expect', '42501', 'got', 'skipped: A holds every mapped capability', 'ok', true);
  else
    begin
      insert into public.evidence_import_sessions
        (organization_id, source_kind, source_fingerprint, source_language, supplied_by_organization_id, supplier_role)
      values (a_org, 'csv', 'dryrun:' || md5('a14' || clock_timestamp()::text), 'lt', a_org, v_unheld_role);
      v_got := 'admitted';
    exception when others then v_got := SQLSTATE; end;
    v_checks := v_checks || jsonb_build_object('id', 'A14 session claiming capability ' || v_unheld_role || ' that A does not hold (P2)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');
  end if;

  begin
    update public.evidence_import_rows set status = 'pending', hours = 99 where id = a_row;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A15 manager rewrites a committed staging row (P3u)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    delete from public.evidence_import_rows where id = a_row;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A15 manager deletes a committed staging row (P3d)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    update public.evidence_import_rows set status = 'needs_review' where id = a_row3;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'manager updates a NOT-committed staging row (P3u positive)', 'actor', v_actor, 'expect', '1 rows', 'got', v_got, 'ok', v_got = '1 rows');

  begin
    insert into public.project_clients (project_id, name, customer_key)
    values (a_project, 'UAB Fixtura Beta', 'code:--:999000002');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A16a manager inserts a KEYED customer row (P7i)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    update public.project_clients set name = 'Fixtura Alfa, UAB' where id = a_client_keyed;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A16b manager updates the keyed row''s name (P7u USING)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    update public.project_clients set customer_key = 'name:fixture legacy client' where id = a_client_plain;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A16c manager re-keys the legacy name-only row (P7u WITH CHECK)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    delete from public.project_clients where id = a_client_keyed;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A16d manager deletes the keyed row (P7d)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    insert into public.organization_evidence_parties (organization_id, record_id, party_role, party_organization_id)
    values (a_org, a_record, 'client', b_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A25 manager names a party organization on a historical record (P6)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  -- ═══ E — an external manager of A (seeded membership) ═════════════════════
  v_actor := 'E';
  reset role;
  perform set_config('request.jwt.claim.sub', e_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', e_user, 'role', 'authenticated', 'email', 'e-eve@fixture.invalid')::text, true);
  set local role authenticated;

  v_counts := '{}'::jsonb; v_errors := '[]'::jsonb;
  foreach v_t in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_t) into v_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_count);
    exception when others then
      v_errors := v_errors || jsonb_build_object('table', v_t, 'sqlstate', SQLSTATE);
    end;
  end loop;
  v_reads := v_reads || jsonb_build_object('actor', v_actor, 'counts', v_counts, 'errors', v_errors);

  begin
    select public.manages_organization(a_org) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'E passes manages_organization (the pre-M1 authority)', 'actor', v_actor, 'expect', 'true', 'got', v_got, 'ok', v_got = 'true');

  begin
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_fingerprint, source_language, supplied_by_organization_id, supplier_role)
    values (a_org, 'csv', 'dryrun:' || md5('a1' || clock_timestamp()::text), 'lt', a_org, 'employer');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A1 external manager opens a session (P2)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id,
       source_kind, source_fact, record_fingerprint, hash_self)
    values (a_org, a_person, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session,
            'csv', '{}', 'dryrun-rec:' || md5('a2' || clock_timestamp()::text), md5('a2'));
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A2 external manager inserts a record (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_parties (organization_id, record_id, party_role, party_label)
    values (a_org, a_record, 'end_client', 'Fixtura Wonen B.V.');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A17 external manager inserts a party (P6)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.evidence_import_events (organization_id, session_id, event_type)
    values (a_org, a_session, 'previewed');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A30 external manager writes the import trail (P8)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record, 'attested', 'employer', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'external manager attests (P4: G excludes external_manager)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  -- ═══ X — the unrelated authenticated user, and the linked subject ═════════
  v_actor := 'X';
  reset role;
  perform set_config('request.jwt.claim.sub', x_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', x_user, 'role', 'authenticated', 'email', 'p-alpha@fixture.invalid')::text, true);
  set local role authenticated;

  v_counts := '{}'::jsonb; v_errors := '[]'::jsonb;
  foreach v_t in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_t) into v_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_count);
    exception when others then
      v_errors := v_errors || jsonb_build_object('table', v_t, 'sqlstate', SQLSTATE);
    end;
  end loop;
  v_reads := v_reads || jsonb_build_object('actor', v_actor, 'counts', v_counts, 'errors', v_errors);

  begin
    select count(*) into v_n from public.evidence_import_sessions where organization_id = a_org;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'unrelated user reads A''s sessions', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    select count(*) into v_n from public.organization_evidence_records where organization_id = a_org;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'subject reads only the record about themself', 'actor', v_actor, 'expect', '1 rows', 'got', v_got, 'ok', v_got = '1 rows');

  begin
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_fingerprint, source_language, supplied_by_organization_id, supplier_role)
    values (a_org, 'csv', 'dryrun:' || md5('x1' || clock_timestamp()::text), 'lt', a_org, 'other');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'unrelated user opens a session in A (existing policy + P2)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id,
       source_kind, source_fact, record_fingerprint, hash_self)
    values (a_org, a_person_linked, date '2023-03-09', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session,
            'csv', '{}', 'dryrun-rec:' || md5('x2' || clock_timestamp()::text), md5('x2'));
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'unrelated user inserts a record in A (P1)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record_np, 'attested', 'employer', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'subject attests their own record (existing _attest + P4)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type)
    values (a_org, a_record_np, 'disputed');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+4 subject disputes their own record (subject_dispute unchanged; P4 branch 1)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  -- ═══ Y — the owner of B ═══════════════════════════════════════════════════
  v_actor := 'Y';
  reset role;
  perform set_config('request.jwt.claim.sub', b_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b_owner, 'role', 'authenticated', 'email', 'y-yankee@fixture.invalid')::text, true);
  set local role authenticated;

  v_counts := '{}'::jsonb; v_errors := '[]'::jsonb;
  foreach v_t in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_t) into v_count;
      v_counts := v_counts || jsonb_build_object(v_t, v_count);
    exception when others then
      v_errors := v_errors || jsonb_build_object('table', v_t, 'sqlstate', SQLSTATE);
    end;
  end loop;
  v_reads := v_reads || jsonb_build_object('actor', v_actor, 'counts', v_counts, 'errors', v_errors);

  begin
    insert into public.projects (company_id, organization_id, title, status)
    values (b_company, a_org, 'Fixture squat', 'draft');
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A22 foreign company owner creates a project inside A (P9i)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    update public.projects set organization_id = a_org where id = b_project;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A22 foreign company owner re-points a project into A (P9u)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    update public.projects set title = 'Fixtura Other Project (renamed)' where id = b_project;
    get diagnostics v_n = row_count;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'owner updates their own project (P9u refuses nothing that works today)', 'actor', v_actor, 'expect', '1 rows', 'got', v_got, 'ok', v_got = '1 rows');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record_np, 'independently_verified', 'client', b_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+5b recorded party org independently verifies the NON-historical record (verify policy unchanged; P4 branch 1)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_organization_id)
    values (a_org, a_record, 'attested', 'employer', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'foreign owner attests an A record (P4)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  -- ═══ N — the owner of an organization with NO declared roles ══════════════
  if n_org is null then
    v_checks := v_checks || jsonb_build_object('id', 'A26 no-roles org: other admitted / employer refused (P2)', 'actor', 'N', 'expect', 'admitted / 42501', 'got', 'skipped: no organization without declared roles', 'ok', true);
  else
    v_actor := 'N';
    reset role;
    perform set_config('request.jwt.claim.sub', n_owner::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', n_owner, 'role', 'authenticated', 'email', 'n-november@fixture.invalid')::text, true);
    set local role authenticated;

    begin
      insert into public.evidence_import_sessions
        (organization_id, source_kind, source_fingerprint, source_language, supplied_by_organization_id, supplier_role)
      values (n_org, 'csv', 'dryrun:' || md5('n1' || clock_timestamp()::text), 'lt', n_org, 'other');
      v_got := 'admitted';
    exception when others then v_got := SQLSTATE; end;
    v_checks := v_checks || jsonb_build_object('id', 'A26a no-roles org opens a session as other (P2: other always admitted)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

    begin
      insert into public.evidence_import_sessions
        (organization_id, source_kind, source_fingerprint, source_language, supplied_by_organization_id, supplier_role)
      values (n_org, 'csv', 'dryrun:' || md5('n2' || clock_timestamp()::text), 'lt', n_org, 'employer');
      v_got := 'admitted';
    exception when others then v_got := SQLSTATE; end;
    v_checks := v_checks || jsonb_build_object('id', 'A26b no-roles org opens a session as employer (P2)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');
  end if;

  -- ═══ S — the owner of the organization that already holds sessions (reads) ═
  if s_owner is not null and s_org <> a_org then
    v_actor := 'S';
    reset role;
    perform set_config('request.jwt.claim.sub', s_owner::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', s_owner, 'role', 'authenticated', 'email', 's-owner@fixture.invalid')::text, true);
    set local role authenticated;

    v_counts := '{}'::jsonb; v_errors := '[]'::jsonb;
    foreach v_t in array v_tables loop
      begin
        execute format('select count(*) from public.%I', v_t) into v_count;
        v_counts := v_counts || jsonb_build_object(v_t, v_count);
      exception when others then
        v_errors := v_errors || jsonb_build_object('table', v_t, 'sqlstate', SQLSTATE);
      end;
    end loop;
    v_reads := v_reads || jsonb_build_object('actor', v_actor, 'counts', v_counts, 'errors', v_errors);

    begin
      select count(*) into v_n from public.organization_evidence_records where organization_id = s_org;
      v_got := v_n::text || ' rows';
    exception when others then v_got := SQLSTATE; end;
    v_checks := v_checks || jsonb_build_object('id', 'existing evidence stays readable to its owner through the unchanged SELECT policy', 'actor', v_actor, 'expect', '> 0 rows', 'got', v_got, 'ok', v_n > 0);
  end if;

  -- ── 5. verdict: ALWAYS abort ─────────────────────────────────────────────
  reset role;
  select count(*) into v_failed from jsonb_array_elements(v_checks) e where not (e->>'ok')::boolean;
  select v_failed + count(*) into v_failed
    from jsonb_array_elements(v_reads) r
   where jsonb_array_length(r->'errors') > 0;

  raise exception 'DRYRUN_RESULT:%', jsonb_build_object(
    'ok', v_failed = 0,
    'failed', v_failed,
    'premerge', v_premerge,
    'actors', jsonb_build_object(
      'A', left(a_org::text, 8), 'A_owner', left(a_owner::text, 8), 'A_manager', left(a_manager::text, 8),
      'B', left(b_org::text, 8), 'B_owner', left(b_owner::text, 8),
      'N', left(coalesce(n_org::text, 'none'), 8),
      'X', left(x_user::text, 8), 'E', left(e_user::text, 8),
      'S', left(coalesce(s_org::text, 'none'), 8)),
    'checks', v_checks,
    'reads', v_reads)::text;
end $dry$;
