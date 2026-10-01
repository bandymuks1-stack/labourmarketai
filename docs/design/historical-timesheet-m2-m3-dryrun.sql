-- ============================================================================
-- docs/design/historical-timesheet-m2-m3-dryrun.sql
-- Historical timesheet import PR-4 — the ROLLED-BACK production dry run of
-- migrations M2 (project_ordered_work) and M3 (source preservation): design
-- §5.3, §9.3, §14 rows M2 / M3, fixture T14 (the controls the M1 dry run
-- reported as not_in_m1: A18 / A20 for M2, A27 / A28 / A29 and the
-- source_preserved positive control for M3), plus the M2 read and insert
-- paths per actor.
--
-- ONE DO block. It NEVER commits: the last statement on every path is
--   raise exception 'DRYRUN_RESULT:…'
-- so the transaction aborts and every DDL, seed, document, file row and
-- attempt made inside it is rolled back — including the CREATE OR REPLACE of
-- register_document_file_v1 and the storage.buckets UPDATE. The LEAD runs it
-- through Supabase MCP execute_sql (this whole file is the query), AFTER the
-- owner has approved the RED packet and BEFORE apply_migration. The answer is
-- the error text: a JSON document after 'DRYRUN_RESULT:'. A pre-merge
-- assertion failure names itself ('PREMERGE_CHECK_… _FAILED'); a discovery
-- failure names itself ('DRYRUN_ABORT …'); an M3 post-apply assertion names
-- itself ('M3_POST_APPLY_FAILED …'). Nothing else is written by this file.
--
-- What it does, in order:
--   0. pre-merge ASSERTIONS: M1 is applied (13 hist_* policies, the
--      source_bytes_sha256 column, the widened event CHECK); the live
--      register_document_file_v1 body is the one M3 and its rollback
--      reproduce (md5(prosrc) = 23ee05137f9e6529fdf989cdbf2ca717 before
--      apply, e4954bc052bffb031d511d5c599649f6 after); pre-apply facts are
--      recorded (table absent, 0 documents / type rows / CSV-XLSX files, the
--      bucket, the CHECK and the function without text/csv).
--   1. applies the M2 body of
--      supabase/migrations/20260930150000_historical_timesheet_m2_ordered_work.sql
--      and the M3 body of
--      supabase/migrations/20260930160000_historical_timesheet_m3_source_preservation.sql,
--      each embedded BYTE-FOR-BYTE between its two markers below
--      (apps/web/lib/guards/historical-timesheet-m2-m3-migration.test.ts pins
--      the identity). Both are idempotent, so after the real apply this file
--      is also the post-apply verification.
--   2. structure after apply (as the migration role): the two policies and
--      nothing else on project_ordered_work; authenticated holds SELECT +
--      INSERT only; anon, public and service_role hold nothing; RLS enabled;
--      NO order-detail or money column; the indexes; the type row; the CHECK,
--      the bucket and the definer body (md5, ACL, SECURITY DEFINER,
--      search_path) all carry both new types.
--   3. discovers REAL actors BY STRUCTURE — no identifier is written here:
--        A = an organization holding `employer`, with an active owner and an
--            active manager (distinct, neither an admin) and a legacy company
--            (the FX role of the fixture; the supplying org's shape);
--        B = another organization with a legacy company and an active owner
--            who has no relationship with A (the FY role);
--        X = a profile with a workers row and no relationship with A or B
--            (the subject, P-Alpha); E = a second such profile (E-Eve).
--   4. seeds, as the session user, ONLY what the fixture needs and production
--      lacks (all rolled back): E's external_manager membership in A, one B
--      project when B has none, one LINKED roster person for X in A, and —
--      for A29 — the manager as the responsible person of the classified
--      source document the owner created in-block.
--   5. per actor: SET LOCAL ROLE authenticated + request.jwt.claims (anon for
--      A20), one SELECT on every touched table (policy reachability — the
--      42P17 class), the legitimate paths and every T14 control M2 / M3
--      answer:
--        O (owner of A): sessions (csv H1, csv H2, xlsx H3), rows, a
--          historical project, a keyed customer, records; the INITIAL step
--          (+M2a), every M2 CHECK / unique refusal, a CORRECTION (+M2c),
--          created_by / unkeyed-customer refusals, A19 on steps; A13 before
--          any document, then create_org_document_v2 + A27 (text/csv), xlsx,
--          text/plain stays unsupported_type, +1 source_preserved with the
--          matching ACTIVE CLASSIFIED document, A28a (standard) and A28b
--          (classified then revoked);
--        M (manager of A): reads steps, inserts an ADDITIONAL step (+M2b),
--          A12, A29 (responsible person of the classified document), cannot
--          create a classified document;
--        E (external manager of A): reads steps (manages_organization admits
--          external_manager, as designed), cannot insert one;
--        X (unrelated / the subject): A18 (0 rows, 42501), reads no document;
--        Y (owner of B): 0 rows, 42501;
--        anon: A20 (42501), cannot call register_document_file_v1.
--   6. raise exception 'DRYRUN_RESULT:' || json {ok, failed, premerge,
--      structure, actors (roles + 8-char id prefixes only),
--      checks:[{id, actor, expect, got, ok}], reads:[{actor, counts, errors}]}.
--
-- Expected: "failed": 0. Every check's `got` equals its `expect`:
--   42501 = refused by RLS / no grant (insufficient_privilege), 23503 = FK
--   violation, 23505 = unique violation, 23514 = CHECK violation, '0 rows' =
--   filtered by USING, 'admitted' / 'registered' / 'created' = the write passed.
-- ============================================================================

do $dry$
declare
  -- results
  v_checks    jsonb := '[]'::jsonb;
  v_reads     jsonb := '[]'::jsonb;
  v_premerge  jsonb := '{}'::jsonb;
  v_structure jsonb := '{}'::jsonb;
  v_counts    jsonb;
  v_errors    jsonb;
  v_got       text;
  v_n         bigint;
  v_count     bigint;
  v_failed    bigint;
  v_actor     text;
  v_t         text;
  v_md5       text;
  v_tables    text[] := array[
    'projects','work_objects','project_clients','organization_people',
    'evidence_import_sessions','evidence_import_rows','evidence_import_events',
    'organization_evidence_records','organization_evidence_parties',
    'organization_evidence_events','organization_roles','organizations',
    'company_memberships','engagement_contexts','org_documents','document_files',
    'document_types','project_ordered_work'];
  -- the bytes the fixture files would hash to (synthetic; sha256 of a label)
  h1 text := encode(sha256(convert_to('fx-timesheet-2023', 'UTF8')), 'hex');
  h2 text := encode(sha256(convert_to('fx-daily-report-2023-03', 'UTF8')), 'hex');
  h3 text := encode(sha256(convert_to('fx-timesheet-2024', 'UTF8')), 'hex');
  h4 text := encode(sha256(convert_to('fx-notes', 'UTF8')), 'hex');
  -- actors (discovered)
  a_org uuid; a_company uuid; a_owner uuid; a_manager uuid;
  b_org uuid; b_company uuid; b_owner uuid; b_project uuid;
  x_user uuid; x_worker uuid; e_user uuid;
  -- entities the owner / manager create in-block (rolled back)
  a_session uuid; a_session2 uuid; a_session3 uuid;
  a_person uuid; a_person_linked uuid;
  a_row uuid; a_row2 uuid;
  a_live_project uuid; a_project uuid;
  a_client_keyed uuid; a_client_plain uuid;
  a_record uuid; a_record_s2 uuid; a_record_s3 uuid; m_record uuid;
  a_step uuid; a_step_fix uuid; m_step uuid;
  d1 uuid; d2 uuid; d2b uuid; d3 uuid; d4 uuid;
begin
  -- ── 0. pre-merge assertions and pre-apply facts ─────────────────────────
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and policyname like 'hist_p%';
  if v_n <> 13 then
    raise exception 'PREMERGE_CHECK_M1_APPLIED_FAILED: % hist_* policies (expected 13) — M1 is not applied', v_n;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'evidence_import_sessions'
                    and column_name = 'source_bytes_sha256') then
    raise exception 'PREMERGE_CHECK_M1_APPLIED_FAILED: evidence_import_sessions.source_bytes_sha256 is missing — M1 is not applied';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.organization_evidence_events'::regclass
                    and pg_get_constraintdef(oid) like '%source_preserved%') then
    raise exception 'PREMERGE_CHECK_M1_APPLIED_FAILED: organization_evidence_events.event_type CHECK lacks source_preserved — M1 is not applied';
  end if;
  v_premerge := jsonb_build_object('m1_hist_policies', v_n);

  select md5(p.prosrc) into v_md5
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_document_file_v1';
  if v_md5 is distinct from '23ee05137f9e6529fdf989cdbf2ca717'
     and v_md5 is distinct from 'e4954bc052bffb031d511d5c599649f6' then
    raise exception 'PREMERGE_CHECK_M3_BODY_FAILED: live register_document_file_v1 body md5 % is neither the production body M3 reproduces (23ee05137f9e6529fdf989cdbf2ca717) nor the M3 body (e4954bc052bffb031d511d5c599649f6) — re-read production before apply', v_md5;
  end if;
  v_premerge := v_premerge || jsonb_build_object('register_document_file_v1_md5_before', v_md5);

  v_premerge := v_premerge || jsonb_build_object(
    'project_ordered_work_exists_before', to_regclass('public.project_ordered_work') is not null,
    'org_import_source_documents_before', (select count(*) from public.org_documents where document_type_slug = 'org_import_source'),
    'org_import_source_type_rows_before', (select count(*) from public.document_types where slug = 'org_import_source'),
    'csv_xlsx_document_files_before', (select count(*) from public.document_files
                                         where mime_type in ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
    'bucket_allowed_mime_types_before', (select to_jsonb(allowed_mime_types) from storage.buckets where id = 'document-files'),
    'bucket_file_size_limit', (select file_size_limit from storage.buckets where id = 'document-files'),
    'check_has_csv_before', exists (select 1 from pg_constraint
                                     where conrelid = 'public.document_files'::regclass
                                       and conname = 'document_files_mime_type_check'
                                       and pg_get_constraintdef(oid) like '%text/csv%'),
    'function_has_csv_before', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                        where n.nspname = 'public' and p.proname = 'register_document_file_v1'
                                          and p.prosrc like '%''text/csv''%'),
    'default_acl_rows_public', (select count(*) from pg_default_acl where defaclnamespace = 'public'::regnamespace),
    'existing_records', (select count(*) from public.organization_evidence_records));

  -- ── 1. apply M2 + M3 (idempotent; a no-op when already applied) ──────────
-- M2 BODY BEGIN
-- ── M2a ── the ONE additive relation for ordered-work steps ────────────────
create table if not exists public.project_ordered_work (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  project_client_id uuid not null,
  work_object_id uuid,
  step_kind text not null check (step_kind in ('initial','additional')),
  -- the work kinds (scope keys, scope-key:v1) whose first evidence defines this step
  scope_keys text[] not null check (cardinality(scope_keys) between 1 and 50),
  scope_labels text[] not null check (cardinality(scope_labels) = cardinality(scope_keys)),
  first_evidenced_on date not null,
  first_evidenced_until date not null,
  first_evidenced_precision text not null check (first_evidenced_precision in ('day','week','month')),
  first_evidence_record_id uuid not null,
  evidence_basis text not null default 'organization_timesheet'
    check (evidence_basis = 'organization_timesheet'),
  detection jsonb not null,           -- {method:'ordered-work:v1', gapDays, lateStartDays, repeatGapDays, rule, decidedEventId?}
  review_state text not null check (review_state in ('auto','human_confirmed')),
  supersedes_step_id uuid references public.project_ordered_work(id) on delete restrict,
  step_fingerprint text not null check (char_length(step_fingerprint) between 16 and 128),
  created_session_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pow_window check (first_evidenced_until >= first_evidenced_on),
  constraint pow_project_fk foreign key (project_id, organization_id)
    references public.projects (id, organization_id),
  constraint pow_client_fk foreign key (project_client_id, project_id)
    references public.project_clients (id, project_id),
  constraint pow_object_fk foreign key (work_object_id, organization_id)
    references public.work_objects (id, organization_id) on delete set null (work_object_id),
  constraint pow_first_record_fk foreign key (first_evidence_record_id, organization_id)
    references public.organization_evidence_records (id, organization_id),
  constraint pow_session_fk foreign key (created_session_id, organization_id)
    references public.evidence_import_sessions (id, organization_id),
  constraint pow_once unique (organization_id, step_fingerprint)
);
create unique index if not exists pow_one_live_initial on public.project_ordered_work (project_id)
  where step_kind = 'initial' and supersedes_step_id is null;
create index if not exists pow_project_idx on public.project_ordered_work (organization_id, project_id, first_evidenced_on);

comment on table public.project_ordered_work is
  'Ordered-work STEPS of a historical project (design §5.3): the initial ordered work and each additional ordered work, with the first-evidenced window at its own precision. No order-detail and no money column — unknown order details are named by the projector as "not on record" (§5.4). Insert-only; a correction is a new row with supersedes_step_id.';
comment on column public.project_ordered_work.scope_keys is
  'The work kinds (scope-key:v1) whose first evidence defines this step; scope_labels holds the source spellings at the same positions.';
comment on column public.project_ordered_work.detection is
  'The deterministic rule trace (ordered-work:v1): method, the three thresholds, the rule that fired and, for a human decision, the decided import event id.';
comment on column public.project_ordered_work.step_fingerprint is
  'sha256(''ordered-work-step:v1|'' || org || ''|'' || project || ''|'' || kind || ''|'' || sorted scope keys || ''|'' || first_evidenced_on || ''|'' || precision); the idempotency key per organization (pow_once).';
comment on column public.project_ordered_work.supersedes_step_id is
  'A correction points at the step it replaces; the old row stays and is hidden in the views. Only a non-superseded initial step counts for pow_one_live_initial.';

-- ── M2b ── RLS and grants (the RED part: public has no default privileges) ─
alter table public.project_ordered_work enable row level security;
revoke all on public.project_ordered_work from public, anon;
grant select, insert on public.project_ordered_work to authenticated;   -- no update, no delete, no truncate

-- ── M2c ── policies (design §5.3, written out; no helper function is added) ─
do $hist_m_two_select$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_ordered_work'
                    and policyname = 'pow_select') then
    create policy pow_select on public.project_ordered_work for select to authenticated
      using (public.manages_organization(organization_id) or public.is_admin());
  end if;
end $hist_m_two_select$;

do $hist_m_two_insert$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_ordered_work'
                    and policyname = 'pow_insert') then
    create policy pow_insert on public.project_ordered_work for insert to authenticated
      with check (
        created_by = auth.uid()
        and ( exists (select 1 from public.company_memberships m
                       where m.profile_id = auth.uid() and m.organization_id = project_ordered_work.organization_id
                         and m.status = 'active' and m.role in ('owner','admin','manager'))
           or exists (select 1 from public.engagement_contexts ec
                       where ec.profile_id = auth.uid() and ec.organization_id = project_ordered_work.organization_id
                         and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and exists (select 1 from public.evidence_import_sessions s
                     where s.id = project_ordered_work.created_session_id
                       and s.organization_id = project_ordered_work.organization_id
                       and s.supplied_by_organization_id = project_ordered_work.organization_id)
        and exists (select 1 from public.project_clients pc
                     where pc.id = project_ordered_work.project_client_id
                       and pc.project_id = project_ordered_work.project_id
                       and pc.customer_key is not null)
      );
  end if;
end $hist_m_two_insert$;
-- M2 BODY END

-- M3 BODY BEGIN
-- ── M3a ── the ONE type slug for a preserved timesheet source ──────────────
insert into public.document_types (slug, category) values ('org_import_source','organization')
  on conflict (slug) do nothing;

-- ── M3b ── document_files.mime_type CHECK: the FULL old list + xlsx + csv ──
-- Drop + re-add under the SAME name (the CREATE TABLE auto-name), the idiom
-- the gate classifies GREEN. Runs only while text/csv is absent from the live
-- definition, so a re-run is a no-op.
do $hist_m_three_chk$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.document_files'::regclass
                    and conname = 'document_files_mime_type_check'
                    and pg_get_constraintdef(oid) like '%text/csv%') then
    alter table public.document_files drop constraint if exists document_files_mime_type_check;
    alter table public.document_files add constraint document_files_mime_type_check check (mime_type in (
      'application/pdf','image/jpeg','image/png','image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv')) not valid;
    alter table public.document_files validate constraint document_files_mime_type_check;
  end if;
end $hist_m_three_chk$;

-- ── M3c ── the bucket admits the same list (ONE row; size limit untouched) ──
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
 where id = 'document-files';

-- ── M3d ── P5 joins sessions to files on the hash ──────────────────────────
create index if not exists document_files_sha256_idx on public.document_files (content_sha256);

-- ── M3e ── the ONE existing definer body that changes: only the MIME list ──
-- Body reproduced from PRODUCTION (md5 23ee05137f9e6529fdf989cdbf2ca717 before
-- this change); the widened list is the only difference. The rollback
-- restores that exact body.
create or replace function public.register_document_file_v1(
  p_scope text,
  p_parent_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_content_sha256 text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  cleaned_path    text := nullif(trim(coalesce(p_storage_path, '')), '');
  cleaned_name    text := nullif(trim(coalesce(p_original_filename, '')), '');
  cleaned_mime    text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_sha     text := lower(nullif(trim(coalesce(p_content_sha256, '')), ''));
  wd              public.worker_documents%rowtype;
  od              public.org_documents%rowtype;
  v_worker_id     uuid;
  next_version    int;
  expected_prefix text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_scope not in ('worker','organization') or p_parent_id is null then
    return 'invalid';
  end if;
  if cleaned_name is null or char_length(cleaned_name) > 255 then
    return 'invalid';
  end if;
  if cleaned_mime is null or cleaned_mime not in
       ('application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv') then
    return 'unsupported_type';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 5242880 then
    return 'file_too_large';
  end if;
  if cleaned_sha is null or cleaned_sha !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  if cleaned_path is null or char_length(cleaned_path) > 1024 then
    return 'invalid';
  end if;

  if p_scope = 'worker' then
    select * into wd from public.worker_documents w
     where w.id = p_parent_id
     for update;
    if wd.id is null or not public.owns_worker_document_v1(wd.id) then
      return 'not_found';
    end if;
    v_worker_id := wd.worker_id;
    select coalesce(max(df.version), 0) + 1 into next_version
      from public.document_files df
     where df.worker_document_id = wd.id;
    expected_prefix := 'worker/' || v_worker_id::text || '/doc/' || wd.id::text
                       || '/v' || next_version::text || '/';
  else
    select * into od from public.org_documents o
     where o.id = p_parent_id
     for update;
    if od.id is null or not public.manages_org_document_v1(od.id) then
      return 'not_found';
    end if;
    if od.status = 'revoked' then
      return 'invalid_state';
    end if;
    select coalesce(max(df.version), 0) + 1 into next_version
      from public.document_files df
     where df.org_document_id = od.id;
    expected_prefix := 'org/' || od.organization_id::text || '/doc/' || od.id::text
                       || '/v' || next_version::text || '/';
  end if;

  if next_version > 50 then
    return 'version_limit_reached';
  end if;
  if position(expected_prefix in cleaned_path) <> 1
     or char_length(cleaned_path) <= char_length(expected_prefix) then
    return 'path_mismatch';
  end if;

  if p_scope = 'worker' then
    update public.document_files
       set superseded_at = now()
     where worker_document_id = wd.id and superseded_at is null;
    insert into public.document_files
        (scope, worker_document_id, version, storage_path, original_filename,
         mime_type, byte_size, content_sha256, uploaded_by)
      values ('worker', wd.id, next_version, cleaned_path, cleaned_name,
              cleaned_mime, p_byte_size, cleaned_sha, uid);
    insert into public.worker_document_events
        (worker_document_id, actor_id, event_type, after_state)
      values (wd.id, uid, 'file_uploaded',
              jsonb_build_object('version', next_version,
                'original_filename', cleaned_name, 'byte_size', p_byte_size));
  else
    update public.document_files
       set superseded_at = now()
     where org_document_id = od.id and superseded_at is null;
    insert into public.document_files
        (scope, org_document_id, version, storage_path, original_filename,
         mime_type, byte_size, content_sha256, uploaded_by)
      values ('organization', od.id, next_version, cleaned_path, cleaned_name,
              cleaned_mime, p_byte_size, cleaned_sha, uid);
    insert into public.org_document_events
        (org_document_id, actor_id, event_type, after_state)
      values (od.id, uid, 'file_uploaded',
              jsonb_build_object('version', next_version,
                'original_filename', cleaned_name, 'byte_size', p_byte_size));
  end if;
  return 'registered';
end $$;
-- Privileges re-asserted unchanged (CREATE OR REPLACE keeps them; restated for determinism).
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from public;
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from anon;
grant execute on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) to authenticated;

-- ── M3f ── post-apply assertions: every M3 object carries both new types ───
do $hist_m_three_verify$
begin
  if not exists (select 1 from public.document_types
                  where slug = 'org_import_source' and category = 'organization' and is_active) then
    raise exception 'M3_POST_APPLY_FAILED: document_types lacks an active organization slug org_import_source';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.document_files'::regclass
                    and conname = 'document_files_mime_type_check'
                    and pg_get_constraintdef(oid) like '%text/csv%'
                    and pg_get_constraintdef(oid) like '%spreadsheetml.sheet%') then
    raise exception 'M3_POST_APPLY_FAILED: document_files_mime_type_check lacks text/csv or the xlsx type';
  end if;
  if not exists (select 1 from storage.buckets
                  where id = 'document-files'
                    and allowed_mime_types @> array['text/csv',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) then
    raise exception 'M3_POST_APPLY_FAILED: bucket document-files lacks text/csv or the xlsx type';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'register_document_file_v1'
                    and p.prosecdef
                    and p.prosrc like '%''text/csv''%'
                    and p.prosrc like '%spreadsheetml.sheet%') then
    raise exception 'M3_POST_APPLY_FAILED: register_document_file_v1 body lacks text/csv or the xlsx type';
  end if;
end $hist_m_three_verify$;
-- M3 BODY END

  -- ── 2. structure after apply (migration role) ────────────────────────────
  select coalesce(string_agg(policyname || ':' || cmd || ':' || permissive, ',' order by policyname), '') into v_got
    from pg_policies where schemaname = 'public' and tablename = 'project_ordered_work';
  v_structure := v_structure || jsonb_build_object('pow_policies', v_got);
  v_checks := v_checks || jsonb_build_object('id', 'M2 policies: exactly pow_insert (INSERT) and pow_select (SELECT), both permissive', 'actor', 'db', 'expect', 'pow_insert:INSERT:PERMISSIVE,pow_select:SELECT:PERMISSIVE', 'got', v_got, 'ok', v_got = 'pow_insert:INSERT:PERMISSIVE,pow_select:SELECT:PERMISSIVE');

  select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') into v_got
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'project_ordered_work' and grantee = 'authenticated';
  v_checks := v_checks || jsonb_build_object('id', 'M2 grants: authenticated holds SELECT and INSERT only (no UPDATE, DELETE, TRUNCATE)', 'actor', 'db', 'expect', 'INSERT,SELECT', 'got', v_got, 'ok', v_got = 'INSERT,SELECT');

  v_got := (has_table_privilege('anon', 'public.project_ordered_work', 'select')
            or has_table_privilege('anon', 'public.project_ordered_work', 'insert')
            or has_table_privilege('service_role', 'public.project_ordered_work', 'select')
            or has_table_privilege('service_role', 'public.project_ordered_work', 'insert')
            or has_table_privilege('service_role', 'public.project_ordered_work', 'update')
            or has_table_privilege('service_role', 'public.project_ordered_work', 'delete'))::text;
  v_checks := v_checks || jsonb_build_object('id', 'M2 grants: anon and service_role hold nothing on project_ordered_work', 'actor', 'db', 'expect', 'false', 'got', v_got, 'ok', v_got = 'false');

  select relrowsecurity::text into v_got from pg_class where oid = 'public.project_ordered_work'::regclass;
  v_checks := v_checks || jsonb_build_object('id', 'M2 RLS enabled on project_ordered_work', 'actor', 'db', 'expect', 'true', 'got', v_got, 'ok', v_got = 'true');

  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'project_ordered_work'
     and (column_name in ('order_date','order_reference','contract_number','price','initial_quantity',
                          'change_order_reference','amount','currency','quantity','unit_price','total',
                          'invoice_id','payment_id','payroll_id','settlement_id')
          or column_name like '%amount%' or column_name like '%price%' or column_name like '%invoice%'
          or column_name like '%payment%' or column_name like '%order_%');
  v_got := v_n::text || ' columns';
  v_checks := v_checks || jsonb_build_object('id', 'T3 project_ordered_work has NO order-detail or money column (decision A / B, §5.4)', 'actor', 'db', 'expect', '0 columns', 'got', v_got, 'ok', v_got = '0 columns');

  select count(*) into v_n from pg_indexes
   where schemaname = 'public' and indexname in ('pow_one_live_initial','pow_project_idx','document_files_sha256_idx');
  v_got := v_n::text || ' indexes';
  v_checks := v_checks || jsonb_build_object('id', 'M2 / M3 indexes: pow_one_live_initial, pow_project_idx, document_files_sha256_idx', 'actor', 'db', 'expect', '3 indexes', 'got', v_got, 'ok', v_got = '3 indexes');

  select md5(p.prosrc) || ' ' || p.proacl::text || ' ' || p.prosecdef::text || ' ' || coalesce(array_to_string(p.proconfig, ','), '') into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_document_file_v1';
  v_checks := v_checks || jsonb_build_object('id', 'M3 register_document_file_v1: the M3 body (md5), ACL authenticated=EXECUTE only, SECURITY DEFINER, search_path=public', 'actor', 'db', 'expect', 'e4954bc052bffb031d511d5c599649f6 {postgres=X/postgres,authenticated=X/postgres} true search_path=public', 'got', v_got, 'ok', v_got = 'e4954bc052bffb031d511d5c599649f6 {postgres=X/postgres,authenticated=X/postgres} true search_path=public');

  select (select to_jsonb(allowed_mime_types) from storage.buckets where id = 'document-files')::text into v_got;
  v_structure := v_structure || jsonb_build_object('bucket_allowed_mime_types_after', v_got::jsonb);
  v_checks := v_checks || jsonb_build_object('id', 'M3 bucket document-files admits the seven types (five + xlsx + csv), size limit unchanged', 'actor', 'db', 'expect', 'true', 'got', (exists (select 1 from storage.buckets where id = 'document-files' and cardinality(allowed_mime_types) = 7 and allowed_mime_types @> array['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] and file_size_limit = (v_premerge->>'bucket_file_size_limit')::bigint))::text, 'ok', exists (select 1 from storage.buckets where id = 'document-files' and cardinality(allowed_mime_types) = 7 and allowed_mime_types @> array['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] and file_size_limit = (v_premerge->>'bucket_file_size_limit')::bigint));

  select pg_get_constraintdef(oid) into v_got from pg_constraint
   where conrelid = 'public.document_files'::regclass and conname = 'document_files_mime_type_check';
  v_structure := v_structure || jsonb_build_object('document_files_mime_type_check_after', v_got);
  v_checks := v_checks || jsonb_build_object('id', 'M3 document_files_mime_type_check carries the full old list plus xlsx and csv', 'actor', 'db', 'expect', 'true', 'got', (v_got like '%application/pdf%' and v_got like '%image/jpeg%' and v_got like '%image/png%' and v_got like '%image/webp%' and v_got like '%wordprocessingml.document%' and v_got like '%spreadsheetml.sheet%' and v_got like '%text/csv%')::text, 'ok', (v_got like '%application/pdf%' and v_got like '%image/jpeg%' and v_got like '%image/png%' and v_got like '%image/webp%' and v_got like '%wordprocessingml.document%' and v_got like '%spreadsheetml.sheet%' and v_got like '%text/csv%'));

  select coalesce(category || ':' || is_active::text, 'missing') into v_got from public.document_types where slug = 'org_import_source';
  v_checks := v_checks || jsonb_build_object('id', 'M3 document_types org_import_source: category organization, active', 'actor', 'db', 'expect', 'organization:true', 'got', v_got, 'ok', v_got = 'organization:true');

  -- ── 3. discover actors by structure ──────────────────────────────────────
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

  select p.id, w.id into x_user, x_worker
    from public.profiles p
    join public.workers w on w.profile_id = p.id
   where p.id not in (a_owner, a_manager, b_owner)
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

  -- ── 4. seeds (session user; rolled back with everything else) ────────────
  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at, source)
  values (a_org, e_user, 'external_manager', 'active', now(), 'dryrun-rolled-back');

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

  -- ── 5. per actor ─────────────────────────────────────────────────────────

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

  -- the M1-era legitimate paths this run needs as its floor
  begin
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_filename, source_fingerprint, source_language,
       supplied_by_organization_id, supplier_role, actor_kind, source_bytes_sha256)
    values (a_org, 'csv', 'fx-timesheet-2023.csv', 'dryrun:' || md5('s1' || clock_timestamp()::text), 'lt',
            a_org, 'employer', 'human', h1)
    returning id into a_session;
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_filename, source_fingerprint, source_language,
       supplied_by_organization_id, supplier_role, actor_kind, source_bytes_sha256)
    values (a_org, 'csv', 'fx-daily-report-2023-03.csv', 'dryrun:' || md5('s2' || clock_timestamp()::text), 'lt',
            a_org, 'employer', 'human', h2)
    returning id into a_session2;
    insert into public.evidence_import_sessions
      (organization_id, source_kind, source_filename, source_fingerprint, source_language,
       supplied_by_organization_id, supplier_role, actor_kind, source_bytes_sha256)
    values (a_org, 'xlsx', 'fx-timesheet-2024.xlsx', 'dryrun:' || md5('s3' || clock_timestamp()::text), 'lt',
            a_org, 'employer', 'human', h3)
    returning id into a_session3;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1a three human sessions: csv H1, csv H2, xlsx H3 (P2)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_people (organization_id, display_name, normalized_name, external_ref)
    values (a_org, 'Person Bravo', 'bravo person', 'FX-DRYRUN-BRAVO')
    returning id into a_person;
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
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1d/+1e roster person and two staged rows (existing policy, P3i)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.projects (company_id, organization_id, title, status)
    values (a_company, a_org, 'Fixture Live Project', 'draft')
    returning id into a_live_project;
    insert into public.projects (company_id, organization_id, title, status, historical_key, created_session_id)
    values (a_company, a_org, 'UAB Fixtura Alfa · Fixturos g. 3, Vilnius', null,
            'hp:v1:code:--:999000001|' || md5('o1'), a_session)
    returning id into a_project;
    insert into public.project_clients (project_id, name, customer_key, customer_code, customer_kind, created_session_id)
    values (a_project, 'UAB Fixtura Alfa', 'code:--:999000001', '999000001', 'organization', a_session)
    returning id into a_client_keyed;
    insert into public.project_clients (project_id, name)
    values (a_live_project, 'Fixture Legacy Client')
    returning id into a_client_plain;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1f/+1g/+1h a live project, the historical project, its keyed customer and a legacy name-only customer (P9i, P7i)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

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
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_filename, source_fact, record_fingerprint, hash_self,
       project_id, source_row_index, row_origin)
    values (a_org, a_person, date '2023-03-13', 8, 'Fasado darbai', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session2, null,
            'csv', 'fx-daily-report-2023-03.csv', '{"person":"Person Bravo","date":"2023-03-13","hours":"8"}',
            'dryrun-rec:' || md5('rec1' || clock_timestamp()::text), md5('dryrun-rec1'),
            a_project, 0, 'parsed_file')
    returning id into a_record_s2;
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_filename, source_fact, record_fingerprint, hash_self,
       project_id, source_row_index, row_origin)
    values (a_org, a_person_linked, date '2024-02-05', 8, 'Balkonu plokstes', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session3, null,
            'xlsx', 'fx-timesheet-2024.xlsx', '{"person":"Person Alpha","date":"2024-02-05","hours":"8"}',
            'dryrun-rec:' || md5('rec2' || clock_timestamp()::text), md5('dryrun-rec2'),
            a_project, 0, 'parsed_file')
    returning id into a_record_s3;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1i three parsed_file records bound to their sessions and the historical project (P1, M1d FK)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  -- ── M2 as the owner ──
  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, work_object_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, null, 'initial', array['darbai fasado'], array['Fasado darbai'],
            date '2023-03-06', date '2023-03-06', 'day', a_record,
            '{"method":"ordered-work:v1","gapDays":21,"lateStartDays":28,"repeatGapDays":90,"rule":"initial"}', 'auto',
            'dryrun-step:' || md5('st1' || a_project::text), a_session, auth.uid())
    returning id into a_step;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+M2a owner inserts the INITIAL step (pow_insert: created_by = uid, G, own session supplied by the org, KEYED customer)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'other', array['x'], array['x'],
            date '2023-03-06', date '2023-03-06', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('bad-kind'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'M2 CHECK: step_kind outside (initial, additional)', 'actor', v_actor, 'expect', '23514', 'got', v_got, 'ok', v_got = '23514');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x','y'], array['x'],
            date '2023-03-06', date '2023-03-06', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('bad-labels'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'M2 CHECK: scope_labels cardinality differs from scope_keys', 'actor', v_actor, 'expect', '23514', 'got', v_got, 'ok', v_got = '23514');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x'], array['x'],
            date '2023-03-06', date '2023-03-05', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('bad-window'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'M2 CHECK: first_evidenced_until before first_evidenced_on (pow_window)', 'actor', v_actor, 'expect', '23514', 'got', v_got, 'ok', v_got = '23514');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       evidence_basis, detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x'], array['x'],
            date '2023-03-06', date '2023-03-06', 'day', a_record, 'customer_confirmation', '{}', 'auto',
            'dryrun-step:' || md5('bad-basis'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'M2 CHECK: evidence_basis other than organization_timesheet (decision E)', 'actor', v_actor, 'expect', '23514', 'got', v_got, 'ok', v_got = '23514');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'initial', array['x'], array['x'],
            date '2023-03-06', date '2023-03-06', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('second-initial'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'pow_one_live_initial: a second non-superseded INITIAL step on the same project', 'actor', v_actor, 'expect', '23505', 'got', v_got, 'ok', v_got = '23505');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, supersedes_step_id, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'initial', array['darbai fasado'], array['Fasado darbai'],
            date '2023-03-06', date '2023-03-12', 'week', a_record,
            '{"method":"ordered-work:v1","gapDays":21,"lateStartDays":28,"repeatGapDays":90,"rule":"initial","decidedEventId":null}', 'human_confirmed',
            'dryrun-step:' || md5('st1-fix' || a_project::text), a_step, a_session, auth.uid())
    returning id into a_step_fix;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+M2c owner records a CORRECTION: an initial step that supersedes the initial step (the old row stays; §5.3)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['darbai fasado'], array['Fasado darbai'],
            date '2023-03-06', date '2023-03-06', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('st1' || a_project::text), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'pow_once: the same step_fingerprint again (the writer''s ON CONFLICT DO NOTHING rests on this)', 'actor', v_actor, 'expect', '23505', 'got', v_got, 'ok', v_got = '23505');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x'], array['x'],
            date '2023-05-15', date '2023-05-15', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('wrong-author'), a_session, a_manager);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'pow_insert: created_by names another profile', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_live_project, a_client_plain, 'initial', array['x'], array['x'],
            date '2023-05-15', date '2023-05-15', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('unkeyed-customer'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'pow_insert: the customer row is NOT keyed (a legacy name-only client on a live project)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (b_org, b_project, a_client_keyed, 'initial', array['x'], array['x'],
            date '2023-05-15', date '2023-05-15', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('foreign-org'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'pow_insert: a step inside another organization (G fails)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    update public.project_ordered_work set review_state = 'human_confirmed' where id = a_step;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A19 owner updates a step (no UPDATE grant)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    delete from public.project_ordered_work where id = a_step;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A19 owner deletes a step (no DELETE grant)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select count(*) into v_n from public.project_ordered_work where project_id = a_project;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'owner reads the project''s steps (pow_select): the initial step and its correction', 'actor', v_actor, 'expect', '2 rows', 'got', v_got, 'ok', v_got = '2 rows');

  -- ── M3 as the owner ──
  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A13 source_preserved with no preserved document (P5)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select public.create_org_document_v2(a_org, 'org_import_source', 'fx-timesheet-2023.csv', null, 'classified',
             null, null, null, null, 'sha256:' || h1, null, null, null, null, null, null, null) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+M3a create_org_document_v2: org_import_source, classified, external_ref sha256:<H1> (the slug M3 seeds)', 'actor', v_actor, 'expect', 'created', 'got', v_got, 'ok', v_got = 'created');

  begin
    select od.id into d1 from public.org_documents od
     where od.organization_id = a_org and od.document_type_slug = 'org_import_source'
       and od.external_ref = 'sha256:' || h1 and od.status = 'active' and od.classification = 'classified';
    v_got := case when d1 is null then 'not found' else 'found' end;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+M3a the owner finds the document by (org, slug, external_ref, active, classified) — the §9.1 look-up', 'actor', v_actor, 'expect', 'found', 'got', v_got, 'ok', v_got = 'found');

  begin
    select public.register_document_file_v1('organization', d1,
             'org/' || a_org::text || '/doc/' || d1::text || '/v1/fx-timesheet-2023.csv',
             'fx-timesheet-2023.csv', 'text/csv', 1234, h1) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A27 register_document_file_v1 text/csv on the classified source document (M3e)', 'actor', v_actor, 'expect', 'registered', 'got', v_got, 'ok', v_got = 'registered');

  begin
    select public.create_org_document_v2(a_org, 'org_import_source', 'fx-timesheet-2024.xlsx', null, 'classified',
             null, null, null, null, 'sha256:' || h3, null, null, null, null, null, null, null) into v_got;
    select od.id into d3 from public.org_documents od
     where od.organization_id = a_org and od.document_type_slug = 'org_import_source'
       and od.external_ref = 'sha256:' || h3 and od.status = 'active' and od.classification = 'classified';
    select public.register_document_file_v1('organization', d3,
             'org/' || a_org::text || '/doc/' || d3::text || '/v1/fx-timesheet-2024.xlsx',
             'fx-timesheet-2024.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 2345, h3) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+M3b register_document_file_v1 xlsx on a second classified source document (M3e)', 'actor', v_actor, 'expect', 'registered', 'got', v_got, 'ok', v_got = 'registered');

  begin
    select public.create_org_document_v2(a_org, 'org_import_source', 'fx-notes.txt', null, 'classified',
             null, null, null, null, 'sha256:' || h4, null, null, null, null, null, null, null) into v_got;
    select od.id into d4 from public.org_documents od
     where od.organization_id = a_org and od.document_type_slug = 'org_import_source'
       and od.external_ref = 'sha256:' || h4 and od.status = 'active';
    select public.register_document_file_v1('organization', d4,
             'org/' || a_org::text || '/doc/' || d4::text || '/v1/fx-notes.txt',
             'fx-notes.txt', 'text/plain', 100, h4) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'M3e the list is widened by exactly two: text/plain stays unsupported_type', 'actor', v_actor, 'expect', 'unsupported_type', 'got', v_got, 'ok', v_got = 'unsupported_type');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1 source_preserved with a matching ACTIVE CLASSIFIED org_import_source document (P5 positive control; csv)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record_s3, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+1 source_preserved on the xlsx session''s record (P5 positive control; xlsx)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    select public.create_org_document_v2(a_org, 'org_import_source', 'fx-daily-report-2023-03.csv', null, 'standard',
             null, null, null, null, 'sha256:' || h2, null, null, null, null, null, null, null) into v_got;
    select od.id into d2 from public.org_documents od
     where od.organization_id = a_org and od.document_type_slug = 'org_import_source'
       and od.external_ref = 'sha256:' || h2 and od.status = 'active' and od.classification = 'standard';
    select public.register_document_file_v1('organization', d2,
             'org/' || a_org::text || '/doc/' || d2::text || '/v1/fx-daily-report-2023-03.csv',
             'fx-daily-report-2023-03.csv', 'text/csv', 999, h2) into v_got;
    if v_got = 'registered' then
      insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
      values (a_org, a_record_s2, 'source_preserved', a_org);
      v_got := 'admitted';
    end if;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A28a source_preserved where the only matching org_import_source document is STANDARD (P5)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select public.create_org_document_v2(a_org, 'org_import_source', 'fx-daily-report-2023-03 (copy).csv', null, 'classified',
             null, null, null, null, 'sha256:' || h2, null, null, null, null, null, null, null) into v_got;
    select od.id into d2b from public.org_documents od
     where od.organization_id = a_org and od.document_type_slug = 'org_import_source'
       and od.external_ref = 'sha256:' || h2 and od.status = 'active' and od.classification = 'classified';
    select public.register_document_file_v1('organization', d2b,
             'org/' || a_org::text || '/doc/' || d2b::text || '/v1/fx-daily-report-2023-03.csv',
             'fx-daily-report-2023-03.csv', 'text/csv', 999, h2) into v_got;
    if v_got = 'registered' then
      select public.revoke_org_document_v1(d2b) into v_got;
    end if;
    if v_got = 'revoked' then
      insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
      values (a_org, a_record_s2, 'source_preserved', a_org);
      v_got := 'admitted';
    end if;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A28b source_preserved where the classified document holding the bytes is REVOKED (P5)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select count(*) into v_n from public.document_files df
     where df.content_sha256 in (h1, h2, h3) and df.superseded_at is null;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'the owner reads the four registered file rows (document_files_select; the M3d index column)', 'actor', v_actor, 'expect', '4 rows', 'got', v_got, 'ok', v_got = '4 rows');

  -- seed for A29 (migration role; rolled back): the manager becomes the
  -- RESPONSIBLE person of the classified source document
  reset role;
  update public.org_documents set responsible_profile_id = a_manager where id = d1;

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
    insert into public.organization_evidence_records
      (organization_id, organization_person_id, activity_date, hours, original_text, original_language,
       evidence_state, supplied_by_organization_id, supplier_role, session_id, import_row_id,
       source_kind, source_filename, source_fact, record_fingerprint, hash_self,
       project_id, source_row_index, row_origin)
    values (a_org, a_person, date '2023-05-15', 8, 'Balkonu plokstes', 'lt',
            'ORGANIZATION_REPORTED', a_org, 'employer', a_session2, null,
            'csv', 'fx-daily-report-2023-03.csv', '{"person":"Person Bravo","date":"2023-05-15","hours":"8"}',
            'dryrun-rec:' || md5('rec3' || clock_timestamp()::text), md5('dryrun-rec3'),
            a_project, 1, 'parsed_file')
    returning id into m_record;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+3a manager inserts a record into the existing historical project (P1)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    select count(*) into v_n from public.project_ordered_work where project_id = a_project;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'manager reads the project''s steps (pow_select: manages_organization) without reading projects', 'actor', v_actor, 'expect', '2 rows', 'got', v_got, 'ok', v_got = '2 rows');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['balkonu plokstes'], array['Balkonu plokstes'],
            date '2023-05-15', date '2023-05-15', 'day', m_record,
            '{"method":"ordered-work:v1","gapDays":21,"lateStartDays":28,"repeatGapDays":90,"rule":"new_kind_in_later_cluster"}', 'auto',
            'dryrun-step:' || md5('st2' || a_project::text), a_session2, auth.uid())
    returning id into m_step;
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', '+M2b manager inserts an ADDITIONAL step (pow_insert: G includes manager; the policy reads sessions and project_clients, never projects)', 'actor', v_actor, 'expect', 'admitted', 'got', v_got, 'ok', v_got = 'admitted');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A12 manager writes source_preserved on a record whose source IS preserved (P5: OA)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select public.manages_org_document_v1(d1)::text into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A29 precondition: the manager, as the responsible person, MANAGES the classified source document', 'actor', v_actor, 'expect', 'true', 'got', v_got, 'ok', v_got = 'true');

  begin
    insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_organization_id)
    values (a_org, a_record, 'source_preserved', a_org);
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A29 manager, as the responsible person of the classified source document, writes source_preserved (P5: OA, not document authority)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select public.create_org_document_v2(a_org, 'org_import_source', 'fx-manager-upload.csv', null, 'classified',
             null, null, null, null, 'sha256:' || md5('m1') || md5('m2'), null, null, null, null, null, null, null) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'manager creates a classified org_import_source document (create_org_document_v2: owner/admin only; §9.2)', 'actor', v_actor, 'expect', 'not_allowed', 'got', v_got, 'ok', v_got = 'not_allowed');

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
    select count(*) into v_n from public.project_ordered_work where project_id = a_project;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'external manager reads steps (pow_select = manages_organization admits external_manager, as designed §5.3)', 'actor', v_actor, 'expect', '3 rows', 'got', v_got, 'ok', v_got = '3 rows');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x'], array['x'],
            date '2023-06-01', date '2023-06-01', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('ext-mgr'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'external manager inserts a step (pow_insert: G excludes external_manager)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

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
    select count(*) into v_n from public.project_ordered_work where organization_id = a_org;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A18 unrelated user reads FX steps (pow_select)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x'], array['x'],
            date '2023-06-01', date '2023-06-01', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('unrelated'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A18 unrelated user inserts an FX step (pow_insert)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select count(*) into v_n from public.org_documents where organization_id = a_org;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'the subject reads none of the supplying org''s source documents (org_documents_select unchanged)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    select count(*) into v_n from public.organization_evidence_events e
     where e.event_type = 'source_preserved' and e.record_id = a_record_s3;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'the subject reads the source_preserved marker on their own record (the §3 "visible to the subject" marker)', 'actor', v_actor, 'expect', '1 rows', 'got', v_got, 'ok', v_got = '1 rows');

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
    select count(*) into v_n from public.project_ordered_work where organization_id = a_org;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'foreign owner reads A''s steps (pow_select)', 'actor', v_actor, 'expect', '0 rows', 'got', v_got, 'ok', v_got = '0 rows');

  begin
    insert into public.project_ordered_work
      (organization_id, project_id, project_client_id, step_kind, scope_keys, scope_labels,
       first_evidenced_on, first_evidenced_until, first_evidenced_precision, first_evidence_record_id,
       detection, review_state, step_fingerprint, created_session_id, created_by)
    values (a_org, a_project, a_client_keyed, 'additional', array['x'], array['x'],
            date '2023-06-01', date '2023-06-01', 'day', a_record, '{}', 'auto',
            'dryrun-step:' || md5('foreign-owner'), a_session, auth.uid());
    v_got := 'admitted';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'foreign owner inserts a step into A (pow_insert)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  -- ═══ anon — no grant at all ═══════════════════════════════════════════════
  v_actor := 'anon';
  reset role;
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  set local role anon;

  begin
    select count(*) into v_n from public.project_ordered_work;
    v_got := v_n::text || ' rows';
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'A20 anon selects project_ordered_work (no grant)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  begin
    select public.register_document_file_v1('organization', d1,
             'org/' || a_org::text || '/doc/' || d1::text || '/v2/x.csv', 'x.csv', 'text/csv', 1, h1) into v_got;
  exception when others then v_got := SQLSTATE; end;
  v_checks := v_checks || jsonb_build_object('id', 'anon calls register_document_file_v1 (EXECUTE revoked from anon, re-asserted by M3)', 'actor', v_actor, 'expect', '42501', 'got', v_got, 'ok', v_got = '42501');

  -- ── 6. verdict: ALWAYS abort ─────────────────────────────────────────────
  reset role;
  select count(*) into v_failed from jsonb_array_elements(v_checks) e where not (e->>'ok')::boolean;
  select v_failed + count(*) into v_failed
    from jsonb_array_elements(v_reads) r
   where jsonb_array_length(r->'errors') > 0;

  raise exception 'DRYRUN_RESULT:%', jsonb_build_object(
    'ok', v_failed = 0,
    'failed', v_failed,
    'premerge', v_premerge,
    'structure', v_structure,
    'actors', jsonb_build_object(
      'A', left(a_org::text, 8), 'A_owner', left(a_owner::text, 8), 'A_manager', left(a_manager::text, 8),
      'B', left(b_org::text, 8), 'B_owner', left(b_owner::text, 8),
      'X', left(x_user::text, 8), 'E', left(e_user::text, 8)),
    'checks', v_checks,
    'reads', v_reads)::text;
end $dry$;
