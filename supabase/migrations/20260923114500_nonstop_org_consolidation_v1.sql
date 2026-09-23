-- @human-gate-approved
-- ============================================================================
-- 20260923114500_nonstop_org_consolidation_v1
-- RED — owner decision 2026-09-23: production DATA consolidation.
-- NOT APPLIED. Applied ONLY by the lead through Supabase MCP `apply_migration`
-- AFTER the rolled-back production dry run (the SAME data-step body, aborted
-- by RAISE) proves the transformation clean. Never `supabase db push`.
-- The marker above is the acknowledgement that this file is RED (data DML +
-- dynamic SQL in a read-only sweep); the PR stays DRAFT + needs-human-gate.
--
-- OWNER DECISION (2026-09-23, in substance):
--   * ONE canonical Nonstop organization: 20b2c802 'UAB NONSTOP GROUP'
--     (organization_type company; company 048aa7e1, company_type
--     construction, verified). No new organization. company_type NOT changed.
--   * Ramunas Sukys (profile 01353767) stays owner / Director of 20b2c802;
--     his stored workspace pointer moves from the legacy duplicate f2315826
--     to 20b2c802.
--   * Donatas Sukys (profile dc3284ea) gets a 'manager' governance membership
--     in 20b2c802 (functional product role: Recruiter). NOT owner. His
--     personal worker identity (worker 894b428e) and all 22 personal journal
--     entries stay his personal context — nothing of his moves into Nonstop.
--     His owner role in 19f47e78 'Labour market ai Sp. z o.o' is untouched.
--     His obsolete employee engagement 2698c6e3 in the test company a3d59458
--     is ENDED (never deleted) so that unnamed company leaves his switcher.
--   * 20b2c802 is granted the 'workforce_provider' capability beside the
--     'employer' it already holds (organization_roles).
--   * ARCHIVED reversibly, NOTHING deleted: f2315826 (legacy 'Nonstop'
--     agency, Ramunas), 2e3a4744 (unnamed agency, Donatas), af6cc3d6
--     (unnamed test agency, bandymuks1) and a3d59458 (unnamed test company,
--     bandymuks1). bandymuks1's stored pointer a3d59458 becomes NULL
--     (personal).
--   * The 158 organization_evidence_records of 19f47e78 are NOT touched.
--   * LEGAL IDENTITY (owner master decision 2026-09-23): the canonical
--     company 048aa7e1 carries the real identity of UAB „Nonstop Group“ —
--     company code 302676973, VAT LT100010790613 (the source of truth is
--     apps/web/lib/legal/entity-identity.ts). The stored code 564231 came from
--     the development setup and stops being the active identity; the old
--     values are kept in audit_logs. Organization id 20b2c802 is unchanged;
--     the companies mirror trigger carries the name and VAT onto it.
--
-- SCHEMA (additive): organizations.archived_at timestamptz NULL and
--   organizations.archived_reason text NULL, plus ONE CHECK (both set or both
--   NULL; reason 1..500 chars). No default, so every existing row stays NULL =
--   not archived. The table-level SELECT grant already covers new columns
--   (organizations has no column ACLs). No table, policy, grant, function,
--   index or trigger is created, changed or dropped.
--
-- DATA (ONE DO block — hard pre-assertions, then the writes, then
--   post-assertions; any difference aborts the whole transaction):
--     i    organization_roles  + (20b2c802, workforce_provider)   if absent
--     ii   company_memberships + (20b2c802, Donatas, manager, active,
--          accepted_at now(), source owner_decision:2026-09-23:...) if absent
--     iii  profiles  Ramunas.active_organization_id  f2315826 -> 20b2c802
--          (validate_active_organization admits it: he owns 20b2c802)
--     iv   profiles  bandymuks1.active_organization_id a3d59458 -> NULL
--     v    engagement_contexts 2698c6e3  active -> ended (ended_reason
--          'other' + an owner-decision note; the end_org_membership_v1 shape)
--     vi   customer_requests 7454f365 (the test need 'stogdengys' in a3d59458)
--          submitted -> closed. customer_requests_status_transition_guard
--          admits it (auth.uid() is NULL in a migration, and submitted ->
--          closed is on its whitelist anyway); demand_org_attribution_guard
--          only protects organization_id, which is not written; no other
--          trigger exists on the table.
--     vii  organizations f2315826, 2e3a4744, af6cc3d6, a3d59458 -> archived
--   Every changed value is written OLD and NEW to the EXISTING `audit_logs`
--   (admin-only RLS; the house pattern of every membership and demand
--   command) under action 'org_consolidation_v1', one run_id per run, so the
--   paired DOWN restores each value exactly. No new log table.
--
-- NOT TOUCHED — asserted byte-identical by md5 before/after: every
--   journal_entries row, every journal_entry_confirmations row, the 158
--   organization_evidence_records of 19f47e78, every workflow_definitions and
--   workflow_definition_versions row, projects, companies, agencies,
--   company_workers, every customer_requests row except 7454f365, and every
--   membership / engagement / role row of the four archived organizations
--   except engagement 2698c6e3 (history: the protect_last_owner trigger
--   forbids revoking a last owner, and those rows record who created what).
--   The companies/agencies mirror triggers are not fired: no companies or
--   agencies row is written.
--
-- FK SWEEP (production, read-only, 2026-09-23). Every single-column FK that
--   references organizations / companies / agencies / engagement_contexts /
--   customer_requests / workflow_definitions, counted for the four archived
--   organizations, their legacy company 39b75887 and agencies 21deb2df /
--   5a35588d / 115b3369, their engagements, their need and their workflow
--   definitions:
--     organizations:company_memberships.organization_id                4
--     organizations:engagement_contexts.organization_id                5
--     organizations:organization_roles.organization_id                 4
--     organizations:customer_requests.organization_id                  1
--     organizations:workflow_definitions.organization_id              16
--     organizations:profiles.active_organization_id                    2
--     companies:organizations.legacy_company_id                        1
--     agencies:organizations.legacy_agency_id                          3
--     engagement_contexts:journal_entries.engagement_context_id        2
--     engagement_contexts:journal_entry_confirmations.
--                        confirmer_engagement_context_id               2
--     workflow_definitions:workflow_definition_versions.definition_id 16
--     every other FK column (about 100)                                0
--   The pre-assertion below RE-RUNS this sweep generically from pg_constraint
--   at apply time (read-only counts, dynamic SQL on catalog identifiers only)
--   and aborts on ANY difference — a row that appeared since the sweep stops
--   the migration instead of being silently archived away.
--
-- DOWN: supabase/rollbacks/20260923114500_nonstop_org_consolidation_v1.down.sql
--   restores every logged value from audit_logs, removes the two inserted
--   rows, then drops the CHECK and the two columns (only when no organization
--   is archived any more). It deletes no audit row.
-- ============================================================================

begin;

-- >>> SCHEMA STEP
alter table public.organizations add column if not exists archived_at timestamptz;
alter table public.organizations add column if not exists archived_reason text;
alter table public.organizations drop constraint if exists organizations_archive_shape_check;
alter table public.organizations add constraint organizations_archive_shape_check check ((archived_at is null) = (archived_reason is null) and (archived_reason is null or char_length(archived_reason) between 1 and 500));
comment on column public.organizations.archived_at is 'Archived organizations are no workspace: every workspace read leaves them out (lib/company/archived-organizations.ts). History stays. NULL = active.';
comment on column public.organizations.archived_reason is 'Why the organization was archived (owner decision). Set together with archived_at.';
-- <<< SCHEMA STEP

-- >>> DATA STEP
do $$
declare
  c_action     constant text := 'org_consolidation_v1';
  c_decision   constant text := 'owner_decision:2026-09-23:nonstop-consolidation';
  c_canon      constant uuid := '20b2c802-c624-43c0-b368-8fa6c1fbeae3';
  c_canon_co   constant uuid := '048aa7e1-0c77-4484-ad7d-00eb1288d7e3';
  c_lmai       constant uuid := '19f47e78-7bd1-4120-9937-603dba769f8a';
  c_legacy     constant uuid := 'f2315826-5501-4bfd-a976-3c674559dedd';
  c_d_agency   constant uuid := '2e3a4744-3eb1-482c-bbae-1bf0646d1802';
  c_t_agency   constant uuid := 'af6cc3d6-5c85-4bb0-8390-2d092047207d';
  c_t_company  constant uuid := 'a3d59458-373e-4939-8897-9f22ae2d35cb';
  c_t_co_row   constant uuid := '39b75887-3bdd-495a-8e47-7c9401086a47';
  c_ramunas    constant uuid := '01353767-1dcd-40b2-a17d-c9d786429a7c';
  c_donatas    constant uuid := 'dc3284ea-026f-4b1a-8d28-4f043973ed34';
  c_bandy      constant uuid := '6fd1bd46-52a5-4058-b478-20b2916a1665';
  c_d_worker   constant uuid := '894b428e-65ca-43f0-97b5-ab8a21b0b3ca';
  c_eng        constant uuid := '2698c6e3-a92e-4337-9742-a77563bd6c5b';
  c_need       constant uuid := '7454f365-337d-4525-9a83-3ab9dbf743c3';
  c_legal_name constant text := 'UAB „Nonstop Group“';
  c_legal_code constant text := '302676973';
  c_legal_vat  constant text := 'LT100010790613';
  c_old_code   constant text := '564231';
  c_legal_note constant text := 'Legal identity set by owner decision 2026-09-23 (company code 302676973, VAT LT100010790613, per the entity-identity source of truth); the previous code 564231 came from the development setup.';
  v_co         record;
  v_archive    uuid[] := array[
    'f2315826-5501-4bfd-a976-3c674559dedd',
    '2e3a4744-3eb1-482c-bbae-1bf0646d1802',
    'af6cc3d6-5c85-4bb0-8390-2d092047207d',
    'a3d59458-373e-4939-8897-9f22ae2d35cb']::uuid[];
  v_agencies   uuid[] := array[
    '21deb2df-0213-4e84-b973-424c7366a85c',
    '5a35588d-ee80-41f3-a901-0f8c7a802f1b',
    '115b3369-ecd2-47d4-ac68-046e569549e1']::uuid[];
  v_run        uuid := gen_random_uuid();
  v_last       text;
  v_expected   jsonb := jsonb_build_object(
    'organizations:company_memberships.organization_id', 4,
    'organizations:engagement_contexts.organization_id', 5,
    'organizations:organization_roles.organization_id', 4,
    'organizations:customer_requests.organization_id', 1,
    'organizations:workflow_definitions.organization_id', 16,
    'organizations:profiles.active_organization_id', 2,
    'companies:organizations.legacy_company_id', 1,
    'agencies:organizations.legacy_agency_id', 3,
    'engagement_contexts:journal_entries.engagement_context_id', 2,
    'engagement_contexts:journal_entry_confirmations.confirmer_engagement_context_id', 2,
    'workflow_definitions:workflow_definition_versions.definition_id', 16);
  v_found      jsonb := '{}'::jsonb;
  v_fk         record;
  v_ids        uuid[];
  v_n          bigint;
  v_counts_pre jsonb;
  v_counts_post jsonb;
  v_hash_pre   jsonb;
  v_hash_post  jsonb;
  v_mem        record;
  v_eng        record;
  v_need       record;
  v_org        record;
  v_role_id    uuid;
  v_mem_id     uuid;
  v_role_added int := 0;
  v_mem_added  int := 0;
  v_logged     bigint;
  v_reason     text;
begin
  -- ── 0. IDEMPOTENCY ─────────────────────────────────────────────────────────
  -- The newest completion/rollback marker decides: applied and not rolled back
  -- = a no-op. A rolled-back run may be applied again (the pre-assertions then
  -- demand the original state, which the DOWN restored).
  select a.payload->>'step' into v_last
    from public.audit_logs a
   where a.action = c_action
     and a.payload->>'step' in ('complete', 'rolled_back')
   order by a.created_at desc
   limit 1;
  if v_last = 'complete' then
    raise notice 'org_consolidation_v1: already applied (latest marker = complete); no-op';
    return;
  end if;

  -- ── 1. PRE-ASSERTIONS — the measured state of 2026-09-23 ──────────────────
  if not exists (
    select 1 from public.organizations o
     where o.id = c_canon and o.organization_type = 'company'
       and o.owner_profile_id = c_ramunas and o.legacy_company_id = c_canon_co
       and o.archived_at is null) then
    raise exception 'PRECONDITION: canonical organization 20b2c802 differs from the measured state';
  end if;
  if not exists (
    select 1 from public.companies c
     where c.id = c_canon_co and c.company_type = 'construction' and c.profile_id = c_ramunas) then
    raise exception 'PRECONDITION: canonical company 048aa7e1 differs (company_type must stay construction)';
  end if;
  select c.* into v_co from public.companies c where c.id = c_canon_co for update;
  if v_co.registration_code is distinct from c_old_code
     or v_co.vat_number is not null
     or v_co.verification_status is distinct from 'verified' then
    raise exception 'PRECONDITION: company 048aa7e1 legal identity differs from the measured state (code %, vat %, status %)',
      v_co.registration_code, v_co.vat_number, v_co.verification_status;
  end if;
  if not exists (
    select 1 from public.organization_roles r
     where r.organization_id = c_canon and r.role_slug = 'employer') then
    raise exception 'PRECONDITION: canonical organization lacks the employer capability';
  end if;
  if not exists (select 1 from public.organization_role_types t where t.slug = 'workforce_provider') then
    raise exception 'PRECONDITION: capability vocabulary lacks workforce_provider';
  end if;

  select count(*) into v_n
    from (values
      ('f2315826-5501-4bfd-a976-3c674559dedd'::uuid, c_ramunas, 'agency',  null::uuid, '21deb2df-0213-4e84-b973-424c7366a85c'::uuid),
      ('2e3a4744-3eb1-482c-bbae-1bf0646d1802'::uuid, c_donatas, 'agency',  null::uuid, '5a35588d-ee80-41f3-a901-0f8c7a802f1b'::uuid),
      ('af6cc3d6-5c85-4bb0-8390-2d092047207d'::uuid, c_bandy,   'agency',  null::uuid, '115b3369-ecd2-47d4-ac68-046e569549e1'::uuid),
      ('a3d59458-373e-4939-8897-9f22ae2d35cb'::uuid, c_bandy,   'company', c_t_co_row, null::uuid)
    ) e(id, owner_id, otype, co, ag)
    join public.organizations o
      on o.id = e.id and o.owner_profile_id = e.owner_id and o.organization_type = e.otype
     and o.legacy_company_id is not distinct from e.co
     and o.legacy_agency_id is not distinct from e.ag
     and o.archived_at is null;
  if v_n <> 4 then
    raise exception 'PRECONDITION: expected the 4 measured duplicate/test organizations unarchived, found %', v_n;
  end if;

  if not exists (select 1 from public.profiles p where p.id = c_ramunas and p.active_organization_id = c_legacy) then
    raise exception 'PRECONDITION: Ramunas pointer is no longer f2315826';
  end if;
  if not exists (select 1 from public.profiles p where p.id = c_bandy and p.active_organization_id = c_t_company) then
    raise exception 'PRECONDITION: bandymuks1 pointer is no longer a3d59458';
  end if;

  if not exists (
    select 1 from public.organizations o
     where o.id = c_lmai and o.owner_profile_id = c_donatas and o.archived_at is null) then
    raise exception 'PRECONDITION: 19f47e78 is no longer owned by Donatas';
  end if;
  if not exists (
    select 1 from public.company_memberships m
     where m.organization_id = c_lmai and m.profile_id = c_donatas
       and m.role = 'owner' and m.status = 'active') then
    raise exception 'PRECONDITION: Donatas has no active owner membership in 19f47e78';
  end if;
  if not exists (select 1 from public.workers w where w.id = c_d_worker and w.profile_id = c_donatas) then
    raise exception 'PRECONDITION: worker 894b428e is not Donatas';
  end if;
  select count(*) into v_n from public.journal_entries j where j.worker_id = c_d_worker;
  if v_n <> 22 then
    raise exception 'PRECONDITION: Donatas personal journal entries = %, measured 22', v_n;
  end if;

  select m.id, m.role, m.status into v_mem
    from public.company_memberships m
   where m.organization_id = c_canon and m.profile_id = c_donatas
     and m.status in ('invited', 'active')
   limit 1;
  if found and not (v_mem.role = 'manager' and v_mem.status = 'active') then
    raise exception 'PRECONDITION: Donatas already holds a live % / % membership in 20b2c802; a human decides', v_mem.role, v_mem.status;
  end if;

  select e.* into v_eng from public.engagement_contexts e where e.id = c_eng for update;
  if not found or v_eng.profile_id <> c_donatas or v_eng.organization_id <> c_t_company
     or v_eng.relationship_slug <> 'employee' or v_eng.status <> 'active' then
    raise exception 'PRECONDITION: engagement 2698c6e3 is not Donatas active employee engagement in a3d59458';
  end if;

  select r.* into v_need from public.customer_requests r where r.id = c_need for update;
  if not found or v_need.organization_id <> c_t_company or v_need.profile_id <> c_bandy
     or v_need.status <> 'submitted' then
    raise exception 'PRECONDITION: need 7454f365 is not the submitted test need of a3d59458';
  end if;

  select count(*) into v_n from public.organization_evidence_records r where r.organization_id = c_lmai;
  if v_n <> 158 then
    raise exception 'PRECONDITION: 19f47e78 evidence records = %, measured 158', v_n;
  end if;

  -- The FK sweep, re-run generically at apply time. Read-only counts; the
  -- dynamic statement is built from catalog identifiers (format %I) only.
  for v_fk in
    select ft.relname as ref, n.nspname as nsp, c.relname as tbl, a.attname as col
      from pg_constraint x
      join pg_class c      on c.oid = x.conrelid
      join pg_namespace n  on n.oid = c.relnamespace
      join pg_class ft     on ft.oid = x.confrelid
      join pg_attribute a  on a.attrelid = x.conrelid and a.attnum = x.conkey[1]
     where x.contype = 'f'
       and ft.relnamespace = 'public'::regnamespace
       and ft.relname in ('organizations', 'companies', 'agencies',
                          'engagement_contexts', 'customer_requests', 'workflow_definitions')
       and array_length(x.conkey, 1) = 1
     order by 1, 3, 4
  loop
    v_ids := case v_fk.ref
      when 'organizations' then v_archive
      when 'companies' then array[c_t_co_row]
      when 'agencies' then v_agencies
      when 'engagement_contexts' then (
        select coalesce(array_agg(e.id), '{}') from public.engagement_contexts e
         where e.organization_id = any(v_archive))
      when 'customer_requests' then (
        select coalesce(array_agg(r.id), '{}') from public.customer_requests r
         where r.organization_id = any(v_archive))
      when 'workflow_definitions' then (
        select coalesce(array_agg(d.id), '{}') from public.workflow_definitions d
         where d.organization_id = any(v_archive))
    end;
    execute format('select count(*) from %I.%I where %I = any($1)', v_fk.nsp, v_fk.tbl, v_fk.col)
       into v_n using v_ids;
    if v_n > 0 then
      v_found := v_found || jsonb_build_object(v_fk.ref || ':' || v_fk.tbl || '.' || v_fk.col, v_n);
    end if;
  end loop;
  if v_found <> v_expected then
    raise exception 'PRECONDITION: FK sweep differs from the measured sweep. found=% expected=%', v_found, v_expected;
  end if;

  -- Integrity baselines: whole-table counts and md5 over every protected row.
  v_counts_pre := jsonb_build_object(
    'journal_entries',               (select count(*) from public.journal_entries),
    'journal_entry_confirmations',   (select count(*) from public.journal_entry_confirmations),
    'organization_evidence_records', (select count(*) from public.organization_evidence_records),
    'workflow_definitions',          (select count(*) from public.workflow_definitions),
    'workflow_definition_versions',  (select count(*) from public.workflow_definition_versions),
    'customer_requests',             (select count(*) from public.customer_requests),
    'company_memberships',           (select count(*) from public.company_memberships),
    'engagement_contexts',           (select count(*) from public.engagement_contexts),
    'organization_roles',            (select count(*) from public.organization_roles),
    'organizations',                 (select count(*) from public.organizations),
    'projects',                      (select count(*) from public.projects),
    'companies',                     (select count(*) from public.companies),
    'agencies',                      (select count(*) from public.agencies),
    'company_workers',               (select count(*) from public.company_workers),
    'profiles',                      (select count(*) from public.profiles),
    'workers',                       (select count(*) from public.workers));
  v_hash_pre := jsonb_build_object(
    'journal_entries',             (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.journal_entries t),
    'journal_entry_confirmations', (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.journal_entry_confirmations t),
    'evidence_19f47e78',           (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.organization_evidence_records t where t.organization_id = c_lmai),
    'workflow_definitions',        (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.workflow_definitions t),
    'workflow_definition_versions',(select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.workflow_definition_versions t),
    'projects',                    (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.projects t),
    'companies_but_canonical',     (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.companies t where t.id <> c_canon_co),
    'agencies',                    (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.agencies t),
    'company_workers',             (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.company_id, t.worker_id), '')) from public.company_workers t),
    'customer_requests_but_need',  (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.customer_requests t where t.id <> c_need),
    'archived_org_memberships',    (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.company_memberships t where t.organization_id = any(v_archive)),
    'archived_org_engagements_but_2698c6e3', (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.engagement_contexts t where t.organization_id = any(v_archive) and t.id <> c_eng),
    'archived_org_roles',          (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.organization_roles t where t.organization_id = any(v_archive)),
    'lmai_memberships',            (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.company_memberships t where t.organization_id = c_lmai),
    'lmai_engagements',            (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.engagement_contexts t where t.organization_id = c_lmai));

  -- ── 2. WRITES ──────────────────────────────────────────────────────────────
  -- i. capability: 20b2c802 holds employer AND workforce_provider.
  if not exists (
    select 1 from public.organization_roles r
     where r.organization_id = c_canon and r.role_slug = 'workforce_provider') then
    insert into public.organization_roles (organization_id, role_slug)
    values (c_canon, 'workforce_provider')
    returning id into v_role_id;
    v_role_added := 1;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (null, c_action, 'organization_roles', v_role_id, jsonb_build_object(
      'run_id', v_run, 'step', 'grant_capability', 'op', 'insert', 'decision', c_decision,
      'new', jsonb_build_object('organization_id', c_canon, 'role_slug', 'workforce_provider')));
  end if;

  -- ii. Donatas: manager governance membership (functional role Recruiter).
  if v_mem.id is null then
    insert into public.company_memberships
      (organization_id, profile_id, role, status, invited_by, accepted_at, source)
    values (c_canon, c_donatas, 'manager', 'active', null, now(), c_decision)
    returning id into v_mem_id;
    v_mem_added := 1;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (null, c_action, 'company_memberships', v_mem_id, jsonb_build_object(
      'run_id', v_run, 'step', 'add_manager_membership', 'op', 'insert', 'decision', c_decision,
      'functional_role', 'recruiter',
      'new', jsonb_build_object('organization_id', c_canon, 'profile_id', c_donatas,
                                'role', 'manager', 'status', 'active', 'source', c_decision)));
  end if;

  -- iii. Ramunas: stored workspace pointer -> the canonical organization.
  update public.profiles set active_organization_id = c_canon
   where id = c_ramunas and active_organization_id = c_legacy;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'WRITE: Ramunas pointer update touched % rows', v_n; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, c_action, 'profiles', c_ramunas, jsonb_build_object(
    'run_id', v_run, 'step', 'repoint_active_organization', 'op', 'update', 'decision', c_decision,
    'old', jsonb_build_object('active_organization_id', c_legacy),
    'new', jsonb_build_object('active_organization_id', c_canon)));

  -- iv. bandymuks1: pointer off the archived test company -> personal.
  update public.profiles set active_organization_id = null
   where id = c_bandy and active_organization_id = c_t_company;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'WRITE: bandymuks1 pointer update touched % rows', v_n; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, c_action, 'profiles', c_bandy, jsonb_build_object(
    'run_id', v_run, 'step', 'repoint_active_organization', 'op', 'update', 'decision', c_decision,
    'old', jsonb_build_object('active_organization_id', c_t_company),
    'new', jsonb_build_object('active_organization_id', null)));

  -- v. Donatas: the obsolete employee engagement in a3d59458 ENDS (history kept).
  update public.engagement_contexts
     set status                 = 'ended',
         ended_at               = coalesce(ended_at, current_date),
         ended_reason           = 'other',
         ended_note             = 'Owner decision 2026-09-23: obsolete employee engagement in a development/test organization (a3d59458), which is archived. Ended, not deleted; its journal entries and confirmations remain as history.',
         lifecycle_stage        = 'ended',
         journal_review_enabled = false,
         is_primary             = false,
         updated_at             = now()
   where id = c_eng and status = 'active';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'WRITE: engagement 2698c6e3 update touched % rows', v_n; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  select null::uuid, c_action, 'engagement_contexts', c_eng, jsonb_build_object(
    'run_id', v_run, 'step', 'end_obsolete_engagement', 'op', 'update', 'decision', c_decision,
    'old', jsonb_build_object(
      'status', v_eng.status, 'ended_at', v_eng.ended_at, 'ended_reason', v_eng.ended_reason,
      'ended_note', v_eng.ended_note, 'lifecycle_stage', v_eng.lifecycle_stage,
      'journal_review_enabled', v_eng.journal_review_enabled, 'is_primary', v_eng.is_primary,
      'updated_at', v_eng.updated_at),
    'new', jsonb_build_object(
      'status', e.status, 'ended_at', e.ended_at, 'ended_reason', e.ended_reason,
      'ended_note', e.ended_note, 'lifecycle_stage', e.lifecycle_stage,
      'journal_review_enabled', e.journal_review_enabled, 'is_primary', e.is_primary,
      'updated_at', e.updated_at))
    from public.engagement_contexts e where e.id = c_eng;

  -- vi. The test need of a3d59458 stops being an open need (closed, not deleted).
  update public.customer_requests set status = 'closed', updated_at = now()
   where id = c_need and status = 'submitted';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'WRITE: need 7454f365 update touched % rows', v_n; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, c_action, 'customer_requests', c_need, jsonb_build_object(
    'run_id', v_run, 'step', 'close_test_need', 'op', 'update', 'decision', c_decision,
    'old', jsonb_build_object('status', v_need.status, 'updated_at', v_need.updated_at),
    'new', jsonb_build_object('status', 'closed')));

  -- vi-b. Legal identity of the canonical company (owner master decision).
  --  enforce_company_verification_guard only blocks a transition INTO
  --  'verified'; the row is already verified and stays so. The mirror trigger
  --  copies legal_name / display_name / vat_number onto organization 20b2c802.
  update public.companies
     set legal_name        = c_legal_name,
         display_name      = c_legal_name,
         registration_code = c_legal_code,
         vat_number        = c_legal_vat,
         verification_note = coalesce(verification_note, c_legal_note)
   where id = c_canon_co and registration_code = c_old_code;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'WRITE: legal identity update of 048aa7e1 touched % rows', v_n; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, c_action, 'companies', c_canon_co, jsonb_build_object(
    'run_id', v_run, 'step', 'correct_legal_identity', 'op', 'update', 'decision', c_decision,
    'old', jsonb_build_object(
      'legal_name', v_co.legal_name, 'display_name', v_co.display_name,
      'registration_code', v_co.registration_code, 'vat_number', v_co.vat_number,
      'verification_note', v_co.verification_note, 'updated_at', v_co.updated_at),
    'new', jsonb_build_object(
      'legal_name', c_legal_name, 'display_name', c_legal_name,
      'registration_code', c_legal_code, 'vat_number', c_legal_vat,
      'verification_note', coalesce(v_co.verification_note, c_legal_note))));

  -- vii. Archive the four duplicate/test organizations (reversible).
  for v_org in
    select o.id from public.organizations o where o.id = any(v_archive) order by o.created_at
  loop
    v_reason := case v_org.id
      when c_legacy then
        'Owner decision 2026-09-23: legacy duplicate of UAB NONSTOP GROUP; canonical organization is 20b2c802. Archived, not deleted; memberships, engagements and capability rows kept as history.'
      when c_d_agency then
        'Owner decision 2026-09-23: unnamed agency shell with no business history; Nonstop work continues in the canonical organization 20b2c802. Archived, not deleted.'
      when c_t_agency then
        'Owner decision 2026-09-23: development/test agency shell with no business history. Archived, not deleted; workflow definitions kept as history.'
      else
        'Owner decision 2026-09-23: development/test company shell with no business history. Archived, not deleted; engagements, journal history and workflow definitions kept.'
    end;
    update public.organizations
       set archived_at = now(), archived_reason = v_reason
     where id = v_org.id and archived_at is null;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'WRITE: archive of % touched % rows', v_org.id, v_n; end if;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (null, c_action, 'organizations', v_org.id, jsonb_build_object(
      'run_id', v_run, 'step', 'archive_organization', 'op', 'update', 'decision', c_decision,
      'canonical_organization_id', c_canon,
      'old', jsonb_build_object('archived_at', null, 'archived_reason', null),
      'new', jsonb_build_object('archived_at', now(), 'archived_reason', v_reason)));
  end loop;

  -- ── 3. POST-ASSERTIONS ─────────────────────────────────────────────────────
  if not (array['employer', 'workforce_provider'] <@ (
      select coalesce(array_agg(r.role_slug), '{}') from public.organization_roles r
       where r.organization_id = c_canon)) then
    raise exception 'POSTCONDITION: 20b2c802 does not hold employer + workforce_provider';
  end if;
  if not exists (select 1 from public.profiles p where p.id = c_ramunas and p.active_organization_id = c_canon) then
    raise exception 'POSTCONDITION: Ramunas pointer is not 20b2c802';
  end if;
  if not exists (select 1 from public.profiles p where p.id = c_bandy and p.active_organization_id is null) then
    raise exception 'POSTCONDITION: bandymuks1 pointer is not personal';
  end if;
  if not exists (
    select 1 from public.company_memberships m
     where m.organization_id = c_canon and m.profile_id = c_donatas
       and m.role = 'manager' and m.status = 'active') then
    raise exception 'POSTCONDITION: Donatas has no active manager membership in 20b2c802';
  end if;
  if exists (
    select 1 from public.company_memberships m
     where m.organization_id = c_canon and m.profile_id = c_donatas and m.role = 'owner') then
    raise exception 'POSTCONDITION: Donatas must not be an owner of 20b2c802';
  end if;
  if not exists (
    select 1 from public.company_memberships m
     where m.organization_id = c_lmai and m.profile_id = c_donatas
       and m.role = 'owner' and m.status = 'active')
     or not exists (
    select 1 from public.organizations o where o.id = c_lmai and o.owner_profile_id = c_donatas and o.archived_at is null) then
    raise exception 'POSTCONDITION: Donatas lost his owner role in 19f47e78';
  end if;
  if not exists (select 1 from public.engagement_contexts e where e.id = c_eng and e.status = 'ended') then
    raise exception 'POSTCONDITION: engagement 2698c6e3 is not ended';
  end if;
  if not exists (select 1 from public.customer_requests r where r.id = c_need and r.status = 'closed') then
    raise exception 'POSTCONDITION: need 7454f365 is not closed';
  end if;
  if not exists (
    select 1 from public.companies c
     where c.id = c_canon_co and c.legal_name = c_legal_name and c.display_name = c_legal_name
       and c.registration_code = c_legal_code and c.vat_number = c_legal_vat
       and c.verification_status = 'verified' and c.company_type = 'construction'
       and c.profile_id = c_ramunas) then
    raise exception 'POSTCONDITION: company 048aa7e1 does not carry the owner-given legal identity (or its status/type/owner moved)';
  end if;
  if not exists (
    select 1 from public.organizations o
     where o.id = c_canon and o.legal_name = c_legal_name and o.display_name = c_legal_name
       and o.vat_number = c_legal_vat and o.owner_profile_id = c_ramunas
       and o.legacy_company_id = c_canon_co and o.archived_at is null) then
    raise exception 'POSTCONDITION: organization 20b2c802 did not receive the mirrored legal identity';
  end if;
  select count(*) into v_n from public.organizations o where o.archived_at is not null;
  if v_n <> 4 or exists (
      select 1 from public.organizations o
       where o.id = any(v_archive) and (o.archived_at is null or o.archived_reason is null)) then
    raise exception 'POSTCONDITION: expected exactly the 4 organizations archived, found %', v_n;
  end if;
  if exists (select 1 from public.organizations o where o.id in (c_canon, c_lmai) and o.archived_at is not null) then
    raise exception 'POSTCONDITION: a live organization was archived';
  end if;
  select count(*) into v_n from public.journal_entries j where j.worker_id = c_d_worker;
  if v_n <> 22 then
    raise exception 'POSTCONDITION: Donatas personal journal entries = %', v_n;
  end if;

  v_counts_post := jsonb_build_object(
    'journal_entries',               (select count(*) from public.journal_entries),
    'journal_entry_confirmations',   (select count(*) from public.journal_entry_confirmations),
    'organization_evidence_records', (select count(*) from public.organization_evidence_records),
    'workflow_definitions',          (select count(*) from public.workflow_definitions),
    'workflow_definition_versions',  (select count(*) from public.workflow_definition_versions),
    'customer_requests',             (select count(*) from public.customer_requests),
    'company_memberships',           (select count(*) from public.company_memberships),
    'engagement_contexts',           (select count(*) from public.engagement_contexts),
    'organization_roles',            (select count(*) from public.organization_roles),
    'organizations',                 (select count(*) from public.organizations),
    'projects',                      (select count(*) from public.projects),
    'companies',                     (select count(*) from public.companies),
    'agencies',                      (select count(*) from public.agencies),
    'company_workers',               (select count(*) from public.company_workers),
    'profiles',                      (select count(*) from public.profiles),
    'workers',                       (select count(*) from public.workers));
  if v_counts_post <> (v_counts_pre
      || jsonb_build_object(
           'company_memberships', (v_counts_pre->>'company_memberships')::bigint + v_mem_added,
           'organization_roles',  (v_counts_pre->>'organization_roles')::bigint + v_role_added)) then
    raise exception 'POSTCONDITION: row counts moved beyond the two listed inserts. pre=% post=%', v_counts_pre, v_counts_post;
  end if;

  v_hash_post := jsonb_build_object(
    'journal_entries',             (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.journal_entries t),
    'journal_entry_confirmations', (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.journal_entry_confirmations t),
    'evidence_19f47e78',           (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.organization_evidence_records t where t.organization_id = c_lmai),
    'workflow_definitions',        (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.workflow_definitions t),
    'workflow_definition_versions',(select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.workflow_definition_versions t),
    'projects',                    (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.projects t),
    'companies_but_canonical',     (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.companies t where t.id <> c_canon_co),
    'agencies',                    (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.agencies t),
    'company_workers',             (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.company_id, t.worker_id), '')) from public.company_workers t),
    'customer_requests_but_need',  (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.customer_requests t where t.id <> c_need),
    'archived_org_memberships',    (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.company_memberships t where t.organization_id = any(v_archive)),
    'archived_org_engagements_but_2698c6e3', (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.engagement_contexts t where t.organization_id = any(v_archive) and t.id <> c_eng),
    'archived_org_roles',          (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.organization_roles t where t.organization_id = any(v_archive)),
    'lmai_memberships',            (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.company_memberships t where t.organization_id = c_lmai),
    'lmai_engagements',            (select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by t.id), '')) from public.engagement_contexts t where t.organization_id = c_lmai));
  if v_hash_post <> v_hash_pre then
    raise exception 'POSTCONDITION: a protected row changed. pre=% post=%', v_hash_pre, v_hash_post;
  end if;

  select count(*) into v_logged
    from public.audit_logs a
   where a.action = c_action and a.payload->>'run_id' = v_run::text;
  if v_logged <> 9 + v_role_added + v_mem_added then
    raise exception 'POSTCONDITION: % audit rows logged, expected %', v_logged, 9 + v_role_added + v_mem_added;
  end if;

  -- ── 4. COMPLETION MARKER (the DOWN restores from this run_id) ─────────────
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (null, c_action, 'organizations', c_canon, jsonb_build_object(
    'run_id', v_run, 'step', 'complete', 'op', 'marker', 'decision', c_decision,
    'fk_sweep', v_found, 'counts_pre', v_counts_pre, 'counts_post', v_counts_post,
    'protected_row_md5', v_hash_post, 'logged_changes', v_logged));

  raise notice 'org_consolidation_v1 applied: run % , % logged changes', v_run, v_logged;
end $$;
-- <<< DATA STEP

commit;
