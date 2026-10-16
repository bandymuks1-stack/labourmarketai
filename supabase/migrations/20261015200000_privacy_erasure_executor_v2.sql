-- @human-gate-approved  (acknowledgement only: PR is DRAFT + needs-human-gate; prod apply waits for the owner)
-- 20261015200000 — GDPR erasure executor v2 (#856). SUPERSEDES draft #2412.
--
-- WHY v2: the 2026-10-15 inventory (docs/legal/gdpr-2026-10-15/audit/01-*.md)
-- showed that #2412 (consent-ledger detach only) unblocks 29 of the 81 profiles
-- whose deletion fails today: 66 NO ACTION/RESTRICT FKs onto profiles, 24
-- append-only tables reached by cascades, and an executor that simply calls
-- DELETE cannot say WHY it failed. Owner 2026-10-15: #2412 NOT applied.
--
-- DESIGN (additive; no existing row, trigger or function body is changed):
--   1. privacy_consent_events gets the #2412 detach columns. A detached row is
--      PSEUDONYMISED (one random erased_subject_id per erasure links that
--      person's rows to each other) and is never described as anonymous.
--   2. privacy_erasure_treatments: the decision registry, one row per
--      (table, column) that references a person: treatment (delete_rows |
--      set_null | detach_ledger | follow_fk | refuse), DECIDED or not, and why.
--      Undecided = refuse. Seeded from the 66-FK classification; only clearly
--      decided classes execute in v2.
--   3. privacy_erasure_receipts: append-only proof that an erasure ran
--      (request id, tombstone, actions with counts, executor). No FK to the
--      erased person; it outlives them (Art. 5(2) accountability).
--   4. erase_user_account_v2(user, request, executed_by, dry_run):
--      - reads EVERY single-column FK onto profiles/workers from pg_catalog at
--        run time, so a table added later is never skipped silently: a
--        non-cascading reference with rows and no decided treatment REFUSES
--        with its table and column;
--      - refuses while storage objects remain (the app deletes them through
--        the Storage API first) or audit payloads still name the person;
--      - executes decided treatments. An append-only guard is bypassed only by
--        DISABLE TRIGGER <named trigger> around the one scoped statement, in
--        the same transaction (ACCESS EXCLUSIVE lock: nobody else writes the
--        table meanwhile; any error rolls the disable back);
--      - deletes auth.users (cascade: profiles, workers, the person's rows);
--      - dry_run (the DEFAULT) runs ALL of it in a subtransaction and rolls it
--        back, so the preview proves the real outcome, cascade failures included.
--      EXECUTE: service_role only (wired behind the human-reviewed queue).
--
-- Rollback: supabase/rollbacks/20261015200000_privacy_erasure_executor_v2.down.sql
-- RED class (SECURITY DEFINER, grants, auth.users delete, DDL inside a function).

begin;

-- 1 · consent ledger detach columns (from #2412) ---------------------------
alter table public.privacy_consent_events
  add column if not exists erased_subject_id uuid,
  add column if not exists erased_at timestamptz;
alter table public.privacy_consent_events alter column user_id drop not null;
alter table public.privacy_consent_events drop constraint if exists pce_subject_attached_or_detached;
alter table public.privacy_consent_events add constraint pce_subject_attached_or_detached check (
  (user_id is not null and erased_subject_id is null and erased_at is null)
  or (user_id is null and erased_subject_id is not null and erased_at is not null)
);
comment on column public.privacy_consent_events.erased_subject_id is
  'Set only by erase_user_account_v2: a random uuid per erased subject. The row keeps proving consent (what, when, which text version) and is PSEUDONYMISED, not anonymous.';

-- 2 · decision registry ------------------------------------------------------
create table if not exists public.privacy_erasure_treatments (
  table_name    text not null,
  column_name   text not null,
  parent        text not null check (parent in ('profiles', 'workers')),
  treatment     text not null check (treatment in ('delete_rows', 'set_null', 'detach_ledger', 'follow_fk', 'refuse')),
  decided       boolean not null default false,
  guard_trigger text,
  refuse_where  text,
  note          text not null,
  updated_at    timestamptz not null default now(),
  primary key (table_name, column_name)
);
comment on table public.privacy_erasure_treatments is
  'GDPR erasure decision per person-referencing column (#856). Undecided rows refuse. A change of treatment is an owner/lawyer decision shipped as a reviewed migration.';
alter table public.privacy_erasure_treatments enable row level security;
revoke all on public.privacy_erasure_treatments from public;
revoke all on public.privacy_erasure_treatments from anon;
revoke all on public.privacy_erasure_treatments from authenticated;

insert into public.privacy_erasure_treatments (table_name, column_name, parent, treatment, decided, guard_trigger, note) values
('agency_worker_invitations', 'inviter_profile_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('agreement_events', 'actor_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('asset_assignments', 'issued_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('assets', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('booking_request_events', 'actor_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('business_trip_events', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('company_worker_invitations', 'inviter_profile_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('competency_recognitions', 'assessed_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('contact_disclosure_request_events', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('conversation_messages', 'author_id', 'profiles', 'refuse', false, null, 'content another party holds: owner and lawyer decision'),
  ('conversation_participants', 'added_by', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('conversation_participants', 'revoked_by', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('conversations', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('defect_corrections', 'reviewer_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('defects', 'reporter_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('document_acknowledgements', 'acknowledged_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('document_acknowledgements', 'assigned_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('document_files', 'uploaded_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('engagement_lifecycle_events', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('follow_up_tasks', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('invitations', 'accepted_by_profile_id', 'profiles', 'refuse', false, null, 'content another party holds: owner and lawyer decision'),
  ('journal_entry_confirmations', 'confirmer_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('journal_entry_review_submissions', 'submitted_by', 'profiles', 'refuse', false, null, 'content another party holds: owner and lawyer decision'),
  ('language_feedback', 'user_id', 'profiles', 'delete_rows', true, null, 'analytics or feedback about the person; no retention need (Art. 17)'),
  ('lmc_accounts', 'profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('lmc_transactions', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('management_decision_events', 'actor_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('market_rate_averages', 'entered_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('offboarding_run_items', 'completed_by', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('offboarding_runs', 'started_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('onboarding_run_items', 'completed_by', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('onboarding_runs', 'started_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('org_document_events', 'actor_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('org_documents', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('org_documents', 'responsible_profile_id', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('organization_evidence_media', 'imported_by_profile_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('performance_review_events', 'actor_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('performance_reviews', 'manager_input_by', 'profiles', 'refuse', false, null, 'PSEUDONYMISE: provenance of another person record; owner decision'),
  ('personal_data_disclosures', 'disclosed_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('pilot_events', 'profile_id', 'profiles', 'delete_rows', true, null, 'analytics or feedback about the person; no retention need (Art. 17)'),
  ('pilot_outcomes', 'noted_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('pilot_outcomes', 'participant_profile_id', 'profiles', 'delete_rows', true, null, 'analytics or feedback about the person; no retention need (Art. 17)'),
  ('pilots', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('procurement_events', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('productivity_units', 'created_by_profile_id', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('project_budgets', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('project_handover_entries', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('project_stages', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('project_worker_operational_statuses', 'updated_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('project_worker_readiness_items', 'updated_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('team_enquiry_events', 'actor_profile_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('timesheet_events', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('training_assignment_events', 'actor_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('work_counterparty_links', 'established_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('work_counterparty_links', 'revoked_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('work_hour_allocations', 'entered_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('work_plan_entries', 'cancelled_by', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('work_plan_entries', 'created_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('worker_absences', 'requested_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('worker_absences', 'reviewed_by', 'profiles', 'set_null', true, null, 'organisation record the person only touched; nullable author column'),
  ('worker_document_events', 'actor_id', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('worker_documents', 'updated_by', 'profiles', 'refuse', false, null, 'REASSIGN on a NOT NULL column: needs the erased-person sentinel decision'),
  ('worker_documents', 'verified_by', 'profiles', 'refuse', false, null, 'PSEUDONYMISE: provenance of another person record; owner decision'),
  ('worker_skills', 'verified_by', 'profiles', 'refuse', false, null, 'PSEUDONYMISE: provenance of another person record; owner decision'),
  ('workflow_instance_approvers', 'decided_by', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('workflow_transitions', 'actor_profile_id', 'profiles', 'refuse', false, null, 'RETAIN-pseudonymised: needs lawyer decision on the retention basis plus sentinel and guard bypass'),
  ('privacy_consent_events', 'user_id', 'profiles', 'detach_ledger', true, 'privacy_consent_events_append_only', 'proof of lawfulness kept, pseudonymised (deletion design E2)'),
  ('personal_data_disclosures', 'worker_user_id', 'profiles', 'refuse', false, null, 'disclosure ledger detach not designed yet (0 rows on prod 2026-10-15)'),
  ('journal_entry_confirmations', 'confirmer_id', 'profiles', 'refuse', false, null, 'another worker evidence: retain-pseudonymised needs a lawyer decision')
on conflict (table_name, column_name) do nothing;
insert into public.privacy_erasure_treatments (table_name, column_name, parent, treatment, decided, refuse_where, note) values
  ('customer_requests', 'profile_id', 'profiles', 'follow_fk', true, 'organization_id is not null',
   'personal and privacy requests cascade away (the receipt keeps accountability); an organisation demand the person authored needs a reassignment decision')
on conflict (table_name, column_name) do nothing;

-- 3 · receipts -------------------------------------------------------------
create table if not exists public.privacy_erasure_receipts (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid,
  erased_subject_id uuid not null,
  requested_at      timestamptz,
  executed_at       timestamptz not null default now(),
  executed_by       uuid references public.profiles(id) on delete set null,
  actions           jsonb not null
);
comment on table public.privacy_erasure_receipts is
  'Append-only proof that an Art. 17 erasure ran: what was deleted, nulled or pseudonymised, when and by whom. Holds no identifier of the erased person.';
alter table public.privacy_erasure_receipts enable row level security;
revoke all on public.privacy_erasure_receipts from public;
revoke all on public.privacy_erasure_receipts from anon;
revoke all on public.privacy_erasure_receipts from authenticated;

create or replace function public.privacy_erasure_receipts_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'erasure receipts are append-only: DELETE is not allowed';
  end if;
  -- the only permitted update is the FK's own ON DELETE SET NULL of executed_by
  if (to_jsonb(new) - 'executed_by') is distinct from (to_jsonb(old) - 'executed_by') or new.executed_by is not null then
    raise exception 'erasure receipts are append-only: UPDATE is not allowed';
  end if;
  return new;
end;
$$;
drop trigger if exists privacy_erasure_receipts_append_only on public.privacy_erasure_receipts;
create trigger privacy_erasure_receipts_append_only
  before update or delete on public.privacy_erasure_receipts
  for each row execute function public.privacy_erasure_receipts_guard();

-- 4 · the executor ------------------------------------------------------------
create or replace function public.erase_user_account_v2(
  p_user_id uuid,
  p_request_id uuid default null,
  p_executed_by uuid default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_subject uuid := gen_random_uuid();
  v_requested_at timestamptz;
  v_refusals jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_n bigint;
  v_key uuid;
  r record;
  t record;
begin
  if p_user_id is null then
    raise exception 'erase_user_account_v2: user id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'erase_user_account_v2: no such user' using errcode = 'P0002';
  end if;
  select id into v_worker_id from public.workers where profile_id = p_user_id limit 1;
  if p_request_id is not null then
    select created_at into v_requested_at from public.customer_requests where id = p_request_id and profile_id = p_user_id;
    if v_requested_at is null then
      raise exception 'erase_user_account_v2: request does not belong to this user' using errcode = '22023';
    end if;
  end if;

  -- PLAN: every single-column FK onto profiles / workers, read live
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col,
           c.confrelid::regclass::text as parent, c.confdeltype::text as rule
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid in ('public.profiles'::regclass, 'public.workers'::regclass)
       and array_length(c.conkey, 1) = 1
     order by 1, 2
  loop
    v_key := case when r.parent = 'workers' then v_worker_id else p_user_id end;
    continue when v_key is null;
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using v_key;
    continue when v_n = 0;
    select * into t from public.privacy_erasure_treatments
     where table_name = r.tbl and column_name = r.col;
    if not found then
      if r.rule in ('a', 'r') then
        v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', v_n,
          'reason', 'unclassified reference (no decided treatment)');
      else
        v_actions := v_actions || jsonb_build_object('table', r.tbl, 'column', r.col, 'parent', r.parent, 'rows', v_n,
          'treatment', case r.rule when 'c' then 'cascade_delete' when 'n' then 'cascade_set_null' else 'fk_' || r.rule end);
      end if;
      continue;
    end if;
    if not t.decided or t.treatment = 'refuse' then
      v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', v_n, 'reason', t.note);
      continue;
    end if;
    if t.refuse_where is not null then
      execute format('select count(*) from %s where %I = $1 and (%s)', r.tbl, r.col, t.refuse_where) into v_n using v_key;
      if v_n > 0 then
        v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', v_n, 'reason', t.note);
        continue;
      end if;
      execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using v_key;
    end if;
    v_actions := v_actions || jsonb_build_object('table', r.tbl, 'column', r.col, 'parent', r.parent, 'rows', v_n,
      'treatment', t.treatment, 'guard', t.guard_trigger);
  end loop;

  -- references the catalog cannot see
  select count(*) into v_n from storage.objects where owner_id = p_user_id::text;
  if v_n > 0 then
    v_refusals := v_refusals || jsonb_build_object('table', 'storage.objects', 'rows', v_n,
      'reason', 'delete the person''s files through the Storage API first',
      'objects', (select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)), '[]'::jsonb)
                    from (select bucket_id, name from storage.objects where owner_id = p_user_id::text order by name limit 1000) o));
  end if;
  select count(*) into v_n from public.audit_logs where payload::text like '%' || p_user_id::text || '%';
  if v_n > 0 then
    v_refusals := v_refusals || jsonb_build_object('table', 'audit_logs', 'column', 'payload', 'rows', v_n,
      'reason', 'audit payload names the person; the scrub rule is an owner/lawyer decision');
  end if;

  if jsonb_array_length(v_refusals) > 0 then
    return jsonb_build_object('executable', false, 'erased', false, 'dry_run', p_dry_run,
      'refusals', v_refusals, 'plan', v_actions);
  end if;

  -- EXECUTE (or rehearse): one subtransaction, all or nothing
  begin
    for r in
      select * from jsonb_to_recordset(v_actions)
        as x("table" text, "column" text, parent text, rows bigint, treatment text, guard text)
    loop
      continue when r.treatment not in ('delete_rows', 'set_null', 'detach_ledger');
      v_key := case when r.parent = 'workers' then v_worker_id else p_user_id end;
      if r.guard is not null then
        execute format('alter table %s disable trigger %I', r."table", r.guard);
      end if;
      if r.treatment = 'delete_rows' then
        execute format('delete from %s where %I = $1', r."table", r."column") using v_key;
      elsif r.treatment = 'set_null' then
        execute format('update %s set %I = null where %I = $1', r."table", r."column", r."column") using v_key;
      else
        execute format('update %s set %I = null, erased_subject_id = $2, erased_at = now() where %I = $1',
          r."table", r."column", r."column") using v_key, v_subject;
      end if;
      if r.guard is not null then
        execute format('alter table %s enable trigger %I', r."table", r.guard);
      end if;
    end loop;

    delete from auth.users where id = p_user_id;

    if p_dry_run then
      raise exception 'dry run complete' using errcode = 'LMD01';
    end if;
  exception
    when sqlstate 'LMD01' then
      return jsonb_build_object('executable', true, 'erased', false, 'dry_run', true,
        'refusals', '[]'::jsonb, 'plan', v_actions);
    when others then
      return jsonb_build_object('executable', false, 'erased', false, 'dry_run', p_dry_run,
        'refusals', jsonb_build_array(jsonb_build_object('reason', 'cascade failed: ' || sqlerrm, 'sqlstate', sqlstate)),
        'plan', v_actions);
  end;

  insert into public.privacy_erasure_receipts (request_id, erased_subject_id, requested_at, executed_by, actions)
  values (p_request_id, v_subject, v_requested_at, p_executed_by, v_actions);

  return jsonb_build_object('executable', true, 'erased', true, 'dry_run', false,
    'erased_subject_id', v_subject, 'plan', v_actions);
end;
$$;

revoke all on function public.erase_user_account_v2(uuid, uuid, uuid, boolean) from public;
revoke all on function public.erase_user_account_v2(uuid, uuid, uuid, boolean) from anon;
revoke all on function public.erase_user_account_v2(uuid, uuid, uuid, boolean) from authenticated;
grant execute on function public.erase_user_account_v2(uuid, uuid, uuid, boolean) to service_role;
comment on function public.erase_user_account_v2(uuid, uuid, uuid, boolean) is
  'GDPR Art. 17 executor v2 (#856). Default is a DRY RUN that rehearses everything and rolls back. Refuses with exact table/column reasons; writes an append-only receipt on success. service_role only.';

commit;
