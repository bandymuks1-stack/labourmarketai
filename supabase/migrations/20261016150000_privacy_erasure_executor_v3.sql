-- @human-gate-approved (acknowledgement only: RED, NOT applied; owner/legal approval required)
--
-- 20261016150000 — GDPR Art. 17 erasure executor v3 (#856).
-- SUPERSEDES the approach of PR #2426 (erasure v2) after the 2026-10-16 audit
-- review. v2 stays blocked; this file is a DRAFT for the human gate and is
-- NOT applied anywhere. Design: docs/legal/gdpr-2026-10-15/internal/erasure-v3-design.md
--
-- WHAT THE AUDIT FOUND IN v2 AND HOW v3 ANSWERS IT
--   (1) v2 let ON DELETE CASCADE run without a registry decision: the whole
--       journal + confirmations and the Stripe mapping vanished with the
--       account. v3: EVERY foreign key onto profiles/workers — cascades
--       included — must carry an explicit registry decision. A cascade that is
--       not decided refuses BY NAME, rows or no rows. Rows that must outlive the
--       person (working-time records, organisation records, billing, ledgers)
--       are SEVERED to a sentinel "erased person" BEFORE the account delete,
--       so the cascade finds nothing.
--   (2) v2 saw only single-column FKs. v3 adds a VALUE-RULE registry for e-mail
--       / phone / free-text / jsonb columns (invitations.invited_email,
--       waitlist.email, intake contacts, audit payloads, message bodies, …)
--       and a static guard test that fails CI when a migration adds a person
--       reference without a registry row.
--   (3) usage_cost_events.profile_id ON DELETE SET NULL is blocked by the
--       table's own BEFORE UPDATE trigger, so v2 failed for every account with
--       AI usage. v3 severs that column explicitly (RETAIN + sever; the named
--       guard is disabled around that one statement in the EXECUTE path only).
--   (4) v2's confirmation was the static word "ERASE" and its dry run took DDL
--       locks on a page render. v3: an admin REQUESTS an authorization token
--       (random 256-bit, stored only as sha256, 15-minute expiry, bound to the
--       request id, to the request's state fingerprint and to the digest of the
--       plan the admin saw); EXECUTE consumes it atomically (single use, like
--       confirmation_spends 20261013120000). The dry run (plan) is a pure READ:
--       SELECT counts only, no DDL, no subtransaction, no exclusive lock.
--   (5) auth.audit_log_entries is counted and reported (retained security
--       evidence); storage is scanned by owner_id AND by path prefix per bucket
--       (server-side uploads have NULL owner); Stripe / e-mail provider steps
--       are explicit external decisions the executor demands before it runs.
--
-- RED class: SECURITY DEFINER, GRANT/REVOKE, auth.users insert + delete,
-- DROP NOT NULL, DML in function bodies, dynamic SQL, DISABLE TRIGGER in the
-- execute path. The annotation is an acknowledgement, not an approval.
-- Rollback: supabase/rollbacks/20261016150000_privacy_erasure_executor_v3.down.sql

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 0 · sentinel "erased person" — one profile + one worker, no login, ever
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.privacy_erasure_sentinel_profile_id()
returns uuid language sql immutable parallel safe as $$
  select '00000000-0000-4000-a000-00000000e5a0'::uuid
$$;
create or replace function public.privacy_erasure_sentinel_worker_id()
returns uuid language sql immutable parallel safe as $$
  select '00000000-0000-4000-a000-00000000e5a1'::uuid
$$;
comment on function public.privacy_erasure_sentinel_profile_id() is
  'The one "erased person" profile. NOT NULL person columns on retained rows point here after erasure. It has no credentials, is banned, holds no consent, and grants nothing (every RLS predicate compares to auth.uid(), which is never this id).';

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, banned_until, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', public.privacy_erasure_sentinel_profile_id(),
        'authenticated', 'authenticated', 'erased-person@sentinel.labourmarket.invalid',
        '{"provider":"none","providers":[]}'::jsonb, '{"sentinel":"erased_person"}'::jsonb,
        now(), now(), 'infinity'::timestamptz, false)
on conflict (id) do nothing;

do $$
begin
  -- GoTrue reads these token columns as strings; NULL breaks admin listings.
  -- Columns differ between GoTrue versions, so an absent one is tolerated.
  begin
    update auth.users
       set confirmation_token = '', recovery_token = '', email_change = '',
           email_change_token_new = '', email_change_token_current = '',
           phone_change = '', phone_change_token = '', reauthentication_token = ''
     where id = public.privacy_erasure_sentinel_profile_id();
  exception when undefined_column then null;
  end;
end $$;

insert into public.profiles (id, role, locale, full_name, email, phone, onboarded)
values (public.privacy_erasure_sentinel_profile_id(), null, 'en', 'Erased person', null, null, false)
on conflict (id) do update
  set role = null, full_name = 'Erased person', email = null, phone = null;

insert into public.workers (id, profile_id, display_name, headline, bio, availability_status)
values (public.privacy_erasure_sentinel_worker_id(), public.privacy_erasure_sentinel_profile_id(),
        'Erased person', null, null, 'unavailable')
on conflict (id) do nothing;

create or replace function public.privacy_erasure_is_sentinel(p_id uuid)
returns boolean language sql immutable parallel safe as $$
  select p_id in (public.privacy_erasure_sentinel_profile_id(), public.privacy_erasure_sentinel_worker_id())
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1 · ledgers get detach columns (pseudonymised, never anonymous)
-- ─────────────────────────────────────────────────────────────────────────
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
  'Set only by erase_user_account_v3: one random uuid per erasure links that person''s ledger rows to each other. PSEUDONYMISED (Recital 26), not anonymous.';

alter table public.personal_data_disclosures
  add column if not exists erased_subject_id uuid,
  add column if not exists erased_at timestamptz;
alter table public.personal_data_disclosures alter column worker_user_id drop not null;
alter table public.personal_data_disclosures drop constraint if exists pdd_subject_attached_or_detached;
alter table public.personal_data_disclosures add constraint pdd_subject_attached_or_detached check (
  (worker_user_id is not null and erased_subject_id is null and erased_at is null)
  or (worker_user_id is null and erased_subject_id is not null and erased_at is not null)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2 · decision registry — one row per person-referencing FK column
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.privacy_erasure_registry_v3 (
  schema_name       text not null default 'public',
  table_name        text not null,
  column_name       text not null,
  parent            text not null check (parent in ('profiles', 'workers')),
  fk_rule_expected  text check (fk_rule_expected in ('cascade', 'set null', 'no action', 'restrict')),
  treatment         text not null check (treatment in
                      ('delete_rows', 'set_null', 'sever_sentinel', 'allow_cascade', 'pseudonymise_ledger', 'refuse')),
  decided_by        text check (decided_by in ('engineering', 'owner', 'legal')),
  legal_review      boolean not null default false,
  legal_basis       text,
  guard_triggers    text[],
  refuse_where      text,
  scrub_columns     text[],
  requires_external text,
  note              text not null,
  updated_at        timestamptz not null default now(),
  primary key (schema_name, table_name, column_name)
);
comment on table public.privacy_erasure_registry_v3 is
  'GDPR erasure decision per person-referencing FK column (#856, v3). An FK without a row REFUSES by name. allow_cascade = the cascade is the decision. sever_sentinel = row retained, person column re-pointed to the sentinel (legal_basis names the Art. 17(3) ground; legal_review marks rows awaiting the lawyer). guard_triggers are disabled around the ONE statement in the EXECUTE path only. A change of treatment ships as a reviewed migration.';
alter table public.privacy_erasure_registry_v3 enable row level security;
revoke all on public.privacy_erasure_registry_v3 from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3 · value rules — e-mail / phone / free-text / jsonb columns (not FKs)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.privacy_erasure_value_rules_v3 (
  schema_name   text not null default 'public',
  table_name    text not null,
  column_name   text not null,
  match         text not null check (match in ('email_exact', 'phone_exact', 'mention')),
  treatment     text not null check (treatment in
                  ('pseudonymise_value', 'delete_rows', 'pseudonymise_mentions', 'report_only', 'refuse')),
  decided_by    text check (decided_by in ('engineering', 'owner', 'legal')),
  legal_review  boolean not null default false,
  scrub_columns text[],
  note          text not null,
  primary key (schema_name, table_name, column_name)
);
comment on table public.privacy_erasure_value_rules_v3 is
  'Person references the FK catalog cannot see. email_exact/phone_exact match the subject''s own identifiers; mention scans text/jsonb for the subject''s e-mail(s) or id. report_only = counted in the receipt, never printed. Undecided or refuse with rows > 0 refuses.';
alter table public.privacy_erasure_value_rules_v3 enable row level security;
revoke all on public.privacy_erasure_value_rules_v3 from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4 · single-use, expiring, state-bound authorization tokens
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.privacy_erasure_authorizations_v3 (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null,
  token_digest      text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  state_fingerprint text not null,
  plan_digest       text not null,
  external          jsonb not null default '{}'::jsonb check (jsonb_typeof(external) = 'object'),
  issued_by         uuid references public.profiles(id) on delete set null,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  outcome           text,
  receipt_id        uuid
);
comment on table public.privacy_erasure_authorizations_v3 is
  'One row per issued erasure authorization. Holds sha256(token) only, the request id, the request-state fingerprint and the plan digest the admin saw. consumed_at is set atomically by the executor: a token is spent once, even under concurrent calls. Expired, forged, reused or drifted tokens are refused with one message.';
alter table public.privacy_erasure_authorizations_v3 enable row level security;
revoke all on public.privacy_erasure_authorizations_v3 from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5 · receipts — append-only, no identifier of the erased person
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.privacy_erasure_receipts_v3 (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid,
  authorization_id   uuid,
  erased_subject_id  uuid not null,
  requested_at       timestamptz,
  executed_at        timestamptz not null default now(),
  executed_by        uuid references public.profiles(id) on delete set null,
  external           jsonb not null default '{}'::jsonb,
  actions            jsonb not null,
  retained           jsonb not null default '[]'::jsonb
);
comment on table public.privacy_erasure_receipts_v3 is
  'Append-only proof that an Art. 17 erasure ran: table/column/treatment/row counts, what was retained and why, the tombstone, when, by whom. Holds NO identifier of the erased person (no e-mail, no name, no profile id).';
alter table public.privacy_erasure_receipts_v3 enable row level security;
revoke all on public.privacy_erasure_receipts_v3 from public, anon, authenticated;

create or replace function public.privacy_erasure_receipts_v3_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'erasure receipts are append-only: DELETE is not allowed';
  end if;
  if (to_jsonb(new) - 'executed_by') is distinct from (to_jsonb(old) - 'executed_by') or new.executed_by is not null then
    raise exception 'erasure receipts are append-only: UPDATE is not allowed';
  end if;
  return new;
end;
$$;
drop trigger if exists privacy_erasure_receipts_v3_append_only on public.privacy_erasure_receipts_v3;
create trigger privacy_erasure_receipts_v3_append_only
  before update or delete on public.privacy_erasure_receipts_v3
  for each row execute function public.privacy_erasure_receipts_v3_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 6 · storage scan — owner_id OR path prefix per bucket (server uploads have NULL owner)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.privacy_erasure_storage_scan_v3(p_profile_id uuid, p_worker_id uuid)
returns table (bucket_id text, name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.bucket_id::text, o.name::text
    from storage.objects o
   where o.owner_id = p_profile_id::text
      or (o.bucket_id in ('profile-avatars', 'journal-entry-photos', 'customer-request-attachments')
          and o.name like p_profile_id::text || '/%')
      or (o.bucket_id = 'conversation-attachments' and o.name like '%/' || p_profile_id::text || '/%')
      or (p_worker_id is not null and o.bucket_id = 'document-files'
          and o.name like 'worker/' || p_worker_id::text || '/%')
   order by 1, 2
$$;
comment on function public.privacy_erasure_storage_scan_v3(uuid, uuid) is
  'Objects the app must delete through the Storage API before erasure. evidence-media (org/<org>/…) is organisation evidence and is NOT scanned: the organisation is the controller.';

-- ─────────────────────────────────────────────────────────────────────────
-- 7 · PLAN (dry run) — pure read: SELECT counts only, no DDL, no lock, no write
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.privacy_erasure_plan_v3(p_request_id uuid, p_external jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_worker uuid;
  v_status text;
  v_created timestamptz;
  v_emails text[];
  v_phone text;
  v_refusals jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_retained jsonb := '[]'::jsonb;
  v_storage jsonb := '[]'::jsonb;
  v_n bigint;
  v_m bigint;
  v_key uuid;
  v_sql text;
  r record;
  t record;
begin
  if p_request_id is null then
    raise exception 'privacy_erasure_plan_v3: request id is required' using errcode = '22023';
  end if;
  select cr.profile_id, cr.status, cr.created_at into v_user, v_status, v_created
    from public.customer_requests cr
   where cr.id = p_request_id and cr.payload->>'privacy_request_type' = 'account_deletion';
  if v_user is null then
    return jsonb_build_object('executable', false, 'dry_run', true,
      'refusals', jsonb_build_array(jsonb_build_object('reason', 'no account-deletion request with this id')));
  end if;
  if public.privacy_erasure_is_sentinel(v_user) then
    return jsonb_build_object('executable', false, 'dry_run', true,
      'refusals', jsonb_build_array(jsonb_build_object('reason', 'the sentinel cannot be erased')));
  end if;
  if v_status <> 'approved' then
    v_refusals := v_refusals || jsonb_build_object('reason', 'request is not Approved (status: ' || v_status || ')');
  end if;
  if not exists (select 1 from auth.users u where u.id = v_user) then
    v_refusals := v_refusals || jsonb_build_object('reason', 'no auth user behind this request (already erased?)');
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = v_user limit 1;
  select coalesce(array_agg(distinct lower(e)), '{}') into v_emails
    from (select u.email::text as e from auth.users u where u.id = v_user and u.email is not null
          union select p.email from public.profiles p where p.id = v_user and p.email is not null) s;
  select nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), '') into v_phone from public.profiles p where p.id = v_user;

  -- 7.1 every FK onto profiles / workers, read from the live catalog
  for r in
    select n.nspname::text as sch, format('%I.%I', n.nspname, cl.relname) as tbl, cl.relname::text as rel,
           a.attname::text as col, a.attnotnull as notnull,
           case c.confrelid when 'public.profiles'::regclass then 'profiles' else 'workers' end as parent,
           case c.confdeltype::text when 'c' then 'cascade' when 'n' then 'set null'
                                    when 'r' then 'restrict' else 'no action' end as rule,
           array_length(c.conkey, 1) as ncols
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid in ('public.profiles'::regclass, 'public.workers'::regclass)
     order by 1, 2, 4
  loop
    select * into t from public.privacy_erasure_registry_v3 g
     where g.schema_name = r.sch and g.table_name = r.rel and g.column_name = r.col;
    if not found then
      v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'on_delete', r.rule,
        'reason', 'undecided reference: no registry row (add one in a reviewed migration)');
      continue;
    end if;
    if r.ncols > 1 and t.treatment <> 'allow_cascade' then
      v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col,
        'reason', 'multi-column FK needs a manual decision');
      continue;
    end if;
    v_key := case when r.parent = 'workers' then v_worker else v_user end;
    v_n := 0;
    if v_key is not null then
      execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using v_key;
    end if;
    if t.decided_by is null or t.treatment = 'refuse' then
      if v_n > 0 then
        v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', v_n, 'reason', t.note);
      end if;
      continue;
    end if;
    if t.treatment = 'allow_cascade' and r.rule <> 'cascade' then
      v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'on_delete', r.rule,
        'reason', 'registry expects ON DELETE CASCADE but the live rule differs (schema drift)');
      continue;
    end if;
    if t.treatment = 'set_null' and r.notnull then
      v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col,
        'reason', 'registry says set_null but the column is NOT NULL (schema drift)');
      continue;
    end if;
    continue when v_n = 0;
    if t.requires_external is not null and not (coalesce(p_external, '{}'::jsonb) ? t.requires_external) then
      v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', v_n,
        'reason', 'external decision required first: external.' || t.requires_external || ' (' || t.note || ')');
      continue;
    end if;
    if t.refuse_where is not null then
      execute format('select count(*) from %s where %I = $1 and (%s)', r.tbl, r.col, t.refuse_where) into v_m using v_key;
      if v_m > 0 then
        v_refusals := v_refusals || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', v_m, 'reason', t.note);
        continue;
      end if;
    end if;
    v_actions := v_actions || jsonb_build_object('table', r.tbl, 'column', r.col, 'parent', r.parent, 'rows', v_n,
      'treatment', t.treatment, 'guards', to_jsonb(coalesce(t.guard_triggers, '{}'::text[])),
      'scrub', to_jsonb(coalesce(t.scrub_columns, '{}'::text[])), 'legal_basis', t.legal_basis,
      'legal_review', t.legal_review);
  end loop;

  -- 7.2 value rules: identifiers and mentions outside the FK catalog
  for t in select * from public.privacy_erasure_value_rules_v3 order by schema_name, table_name, column_name loop
    if to_regclass(format('%I.%I', t.schema_name, t.table_name)) is null then
      continue;
    end if;
    if not exists (select 1 from pg_attribute where attrelid = to_regclass(format('%I.%I', t.schema_name, t.table_name))
                    and attname = t.column_name and not attisdropped) then
      continue;
    end if;
    v_n := 0;
    if t.match = 'email_exact' then
      if cardinality(v_emails) > 0 then
        execute format('select count(*) from %I.%I where lower(%I::text) = any($1)', t.schema_name, t.table_name, t.column_name)
          into v_n using v_emails;
      end if;
    elsif t.match = 'phone_exact' then
      if v_phone is not null then
        execute format('select count(*) from %I.%I where regexp_replace(coalesce(%I::text, ''''), ''\D'', '''', ''g'') = $1',
          t.schema_name, t.table_name, t.column_name) into v_n using v_phone;
      end if;
    else
      v_sql := format('select count(*) from %I.%I where %I::text ilike $1', t.schema_name, t.table_name, t.column_name);
      execute v_sql into v_n using '%' || v_user::text || '%';
      if cardinality(v_emails) > 0 then
        execute format('select count(*) from %I.%I where %I::text ilike any($1)', t.schema_name, t.table_name, t.column_name)
          into v_m using (select array_agg('%' || e || '%') from unnest(v_emails) e);
        v_n := greatest(v_n, v_m);
      end if;
    end if;
    continue when v_n = 0;
    if t.decided_by is null or t.treatment = 'refuse' then
      v_refusals := v_refusals || jsonb_build_object('table', t.schema_name || '.' || t.table_name, 'column', t.column_name,
        'rows', v_n, 'reason', t.note);
    elsif t.treatment = 'report_only' then
      v_retained := v_retained || jsonb_build_object('table', t.schema_name || '.' || t.table_name, 'column', t.column_name,
        'rows', v_n, 'why', t.note);
    else
      v_actions := v_actions || jsonb_build_object('table', t.schema_name || '.' || t.table_name, 'column', t.column_name,
        'rows', v_n, 'treatment', t.treatment, 'match', t.match, 'scrub', to_jsonb(coalesce(t.scrub_columns, '{}'::text[])),
        'legal_review', t.legal_review);
    end if;
  end loop;

  -- 7.3 ai_runs is a registry row (set_null); the executor first calls the existing
  --     ai_runs_delink_subject RPC, which also clears output_excerpt.
  -- 7.4 auth.audit_log_entries is a value rule (report_only): counted, retained.

  -- 7.5 storage objects — the app deletes them through the Storage API first
  select coalesce(jsonb_agg(jsonb_build_object('bucket', s.bucket_id, 'name', s.name)), '[]'::jsonb), count(*)
    into v_storage, v_n
    from (select * from public.privacy_erasure_storage_scan_v3(v_user, v_worker) limit 1000) s;
  if v_n > 0 then
    v_refusals := v_refusals || jsonb_build_object('table', 'storage.objects', 'rows', v_n,
      'reason', 'delete the person''s files through the Storage API first (owner_id and path-prefix scan)');
  end if;

  return jsonb_build_object(
    'executable', jsonb_array_length(v_refusals) = 0,
    'dry_run', true,
    'request', jsonb_build_object('status', v_status, 'created_at', v_created),
    'refusals', v_refusals,
    'actions', v_actions,
    'retained', v_retained,
    'storage', v_storage,
    'plan_digest', encode(sha256(convert_to(v_actions::text || v_retained::text, 'UTF8')), 'hex')
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 8 · AUTHORIZE — issue one single-use token bound to request, state and plan
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.privacy_erasure_state_fingerprint_v3(p_request_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select md5(coalesce(cr.status, '') || '|' || cr.updated_at::text || '|' || cr.profile_id::text || '|'
             || coalesce(cr.payload->'privacy_review_log', '[]'::jsonb)::text)
    from public.customer_requests cr where cr.id = p_request_id
$$;

create or replace function public.privacy_erasure_authorize_v3(
  p_request_id uuid,
  p_issued_by uuid,
  p_external jsonb default '{}'::jsonb,
  p_ttl interval default interval '15 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan jsonb;
  v_token text;
  v_fp text;
  v_id uuid;
  v_expires timestamptz;
begin
  if coalesce(p_external->>'notice', '') <> 'sent' then
    return jsonb_build_object('authorized', false,
      'refusals', jsonb_build_array(jsonb_build_object('reason',
        'completion notice to the person must be recorded as sent before authorization (external.notice = "sent"); the account e-mail no longer exists afterwards')));
  end if;
  v_plan := public.privacy_erasure_plan_v3(p_request_id, p_external);
  if not (v_plan->>'executable')::boolean then
    return jsonb_build_object('authorized', false) || v_plan;
  end if;
  v_fp := public.privacy_erasure_state_fingerprint_v3(p_request_id);
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + coalesce(p_ttl, interval '15 minutes');
  insert into public.privacy_erasure_authorizations_v3 (request_id, token_digest, state_fingerprint, plan_digest, external, issued_by, expires_at)
  values (p_request_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_fp, v_plan->>'plan_digest',
          coalesce(p_external, '{}'::jsonb), p_issued_by, v_expires)
  returning id into v_id;
  -- the raw token is returned ONCE and never stored
  return jsonb_build_object('authorized', true, 'authorization_id', v_id, 'token', v_token,
    'expires_at', v_expires, 'plan_digest', v_plan->>'plan_digest') || (v_plan - 'plan_digest');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 9 · EXECUTE — consume the token atomically, re-plan, act, delete auth.users, receipt
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.erase_user_account_v3(
  p_request_id uuid,
  p_token text,
  p_executed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth public.privacy_erasure_authorizations_v3%rowtype;
  v_plan jsonb;
  v_user uuid;
  v_worker uuid;
  v_requested_at timestamptz;
  v_subject uuid := gen_random_uuid();
  v_emails text[];
  v_sentinel_email text;
  v_key uuid;
  v_target uuid;
  v_n bigint;
  v_receipt uuid;
  v_fail text;
  v_sqlstate text;
  r record;
  g text;
  e text;
  c text;
  v_sets text;
begin
  if p_request_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'authorization invalid, expired or already used')));
  end if;

  -- 9.1 atomic single use: exactly one of any number of concurrent calls gets the row
  update public.privacy_erasure_authorizations_v3 a
     set consumed_at = now()
   where a.token_digest = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and a.request_id = p_request_id
     and a.consumed_at is null
     and a.expires_at > now()
  returning a.* into v_auth;
  if v_auth.id is null then
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'authorization invalid, expired or already used')));
  end if;

  -- 9.2 state and plan must be exactly what the admin authorized
  if public.privacy_erasure_state_fingerprint_v3(p_request_id) is distinct from v_auth.state_fingerprint then
    update public.privacy_erasure_authorizations_v3 set outcome = 'refused: request state changed since authorization' where id = v_auth.id;
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'request state changed since authorization; request a new token')));
  end if;
  v_plan := public.privacy_erasure_plan_v3(p_request_id, v_auth.external);
  if not (v_plan->>'executable')::boolean then
    update public.privacy_erasure_authorizations_v3 set outcome = 'refused: plan no longer executable' where id = v_auth.id;
    return jsonb_build_object('erased', false) || v_plan;
  end if;
  if v_plan->>'plan_digest' is distinct from v_auth.plan_digest then
    update public.privacy_erasure_authorizations_v3 set outcome = 'refused: plan changed since authorization' where id = v_auth.id;
    return jsonb_build_object('erased', false, 'refusals', jsonb_build_array(jsonb_build_object('reason', 'the plan changed since authorization; review and request a new token')));
  end if;

  select cr.profile_id, cr.created_at into v_user, v_requested_at from public.customer_requests cr where cr.id = p_request_id;
  select w.id into v_worker from public.workers w where w.profile_id = v_user limit 1;
  select coalesce(array_agg(distinct lower(x)), '{}') into v_emails
    from (select u.email::text as x from auth.users u where u.id = v_user and u.email is not null
          union select p.email from public.profiles p where p.id = v_user and p.email is not null) s;
  v_sentinel_email := 'erased-' || replace(v_subject::text, '-', '') || '@erased.invalid';

  -- 9.3 all or nothing: any failure rolls this block back and is recorded as a refusal
  begin
    -- (a) ai_runs: existing RPC (sever subject, clear AI content)
    if to_regprocedure('public.ai_runs_delink_subject(uuid)') is not null then
      perform public.ai_runs_delink_subject(v_user);
    end if;

    -- (b) value rules
    for r in select * from jsonb_to_recordset(v_plan->'actions')
               as x("table" text, "column" text, rows bigint, treatment text, match text, scrub jsonb)
             where treatment in ('pseudonymise_value', 'delete_rows', 'pseudonymise_mentions') and match is not null
    loop
      if r.treatment = 'delete_rows' then
        if r.match = 'email_exact' then
          execute format('delete from %s where lower(%I::text) = any($1)', r."table", r."column") using v_emails;
        end if;
      elsif r.treatment = 'pseudonymise_value' then
        v_sets := format('%I = $2', r."column");
        for c in select jsonb_array_elements_text(coalesce(r.scrub, '[]'::jsonb)) loop
          v_sets := v_sets || format(', %I = null', c);
        end loop;
        if r.match = 'email_exact' then
          execute format('update %s set %s where lower(%I::text) = any($1)', r."table", v_sets, r."column") using v_emails, v_sentinel_email;
        elsif r.match = 'phone_exact' then
          execute format('update %s set %s where regexp_replace(coalesce(%I::text, ''''), ''\D'', '''', ''g'') = $1', r."table", v_sets, r."column")
            using (select nullif(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), '') from public.profiles p where p.id = v_user), null;
        end if;
      else -- pseudonymise_mentions (text or jsonb): id -> tombstone, e-mail -> sentinel e-mail
        v_sets := format('%I::text', r."column");
        v_sets := format('replace(%s, $1, $2)', v_sets);
        foreach e in array v_emails loop
          v_sets := format('replace(%s, %L, %L)', v_sets, e, v_sentinel_email);
        end loop;
        execute format('update %s set %I = (%s)::%s where %I::text ilike $3 or lower(%I::text) ilike any($4)',
          r."table", r."column", v_sets,
          (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = r."table"::regclass and a.attname = r."column"),
          r."column", r."column")
          using v_user::text, v_subject::text, '%' || v_user::text || '%',
                coalesce((select array_agg('%' || x || '%') from unnest(v_emails) x), array['%' || v_user::text || '%']);
      end if;
    end loop;

    -- (c) FK treatments, in a deterministic order: delete, set null, sever, ledger
    for r in select * from jsonb_to_recordset(v_plan->'actions')
               as x("table" text, "column" text, parent text, rows bigint, treatment text, guards jsonb, scrub jsonb, match text)
             where match is null and treatment in ('delete_rows', 'set_null', 'sever_sentinel', 'pseudonymise_ledger')
             order by case treatment when 'delete_rows' then 1 when 'set_null' then 2 when 'sever_sentinel' then 3 else 4 end, "table", "column"
    loop
      v_key := case when r.parent = 'workers' then v_worker else v_user end;
      v_target := case when r.parent = 'workers' then public.privacy_erasure_sentinel_worker_id() else public.privacy_erasure_sentinel_profile_id() end;
      for g in select jsonb_array_elements_text(coalesce(r.guards, '[]'::jsonb)) loop
        execute format('alter table %s disable trigger %I', r."table", g);
      end loop;
      v_sets := '';
      for c in select jsonb_array_elements_text(coalesce(r.scrub, '[]'::jsonb)) loop
        v_sets := v_sets || format(', %I = null', c);
      end loop;
      if r.treatment = 'delete_rows' then
        execute format('delete from %s where %I = $1', r."table", r."column") using v_key;
      elsif r.treatment = 'set_null' then
        execute format('update %s set %I = null%s where %I = $1', r."table", r."column", v_sets, r."column") using v_key;
      elsif r.treatment = 'sever_sentinel' then
        execute format('update %s set %I = $2%s where %I = $1', r."table", r."column", v_sets, r."column") using v_key, v_target;
      else
        execute format('update %s set %I = null, erased_subject_id = $2, erased_at = now() where %I = $1', r."table", r."column", r."column") using v_key, v_subject;
      end if;
      for g in select jsonb_array_elements_text(coalesce(r.guards, '[]'::jsonb)) loop
        execute format('alter table %s enable trigger %I', r."table", g);
      end loop;
    end loop;

    -- (d) the privacy request row survives, severed and closed (Art. 5(2); E4: 3 y)
    update public.customer_requests
       set status = 'closed',
           payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('privacy_erasure', 'executed', 'erased_subject_id', v_subject)
     where id = p_request_id;

    -- (e) the account: cascades now meet only rows the registry decided as allow_cascade
    delete from auth.users where id = v_user;

    -- (f) nothing may still point at the person
    for r in
      select c.conrelid::regclass::text as tbl, a.attname::text as col,
             case c.confrelid when 'public.profiles'::regclass then 'profiles' else 'workers' end as parent
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'public.workers'::regclass)
    loop
      v_key := case when r.parent = 'workers' then v_worker else v_user end;
      continue when v_key is null;
      execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using v_key;
      if v_n > 0 then
        raise exception 'post-check: % rows in %.% still reference the person', v_n, r.tbl, r.col using errcode = 'LME03';
      end if;
    end loop;
  exception when others then
    v_fail := sqlerrm; v_sqlstate := sqlstate;
    update public.privacy_erasure_authorizations_v3 set outcome = 'failed: ' || v_sqlstate || ' ' || left(v_fail, 200) where id = v_auth.id;
    return jsonb_build_object('erased', false,
      'refusals', jsonb_build_array(jsonb_build_object('reason', 'execution failed and was rolled back: ' || v_fail, 'sqlstate', v_sqlstate)),
      'actions', v_plan->'actions');
  end;

  -- 9.4 receipt (no identifier of the person) + authorization outcome
  insert into public.privacy_erasure_receipts_v3 (request_id, authorization_id, erased_subject_id, requested_at, executed_by, external, actions, retained)
  values (p_request_id, v_auth.id, v_subject, v_requested_at, p_executed_by, v_auth.external, v_plan->'actions', v_plan->'retained')
  returning id into v_receipt;
  update public.privacy_erasure_authorizations_v3 set outcome = 'erased', receipt_id = v_receipt where id = v_auth.id;

  return jsonb_build_object('erased', true, 'receipt_id', v_receipt, 'erased_subject_id', v_subject,
    'actions', v_plan->'actions', 'retained', v_plan->'retained');
end;
$$;

revoke all on function public.privacy_erasure_storage_scan_v3(uuid, uuid) from public, anon, authenticated;
revoke all on function public.privacy_erasure_plan_v3(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.privacy_erasure_state_fingerprint_v3(uuid) from public, anon, authenticated;
revoke all on function public.privacy_erasure_authorize_v3(uuid, uuid, jsonb, interval) from public, anon, authenticated;
revoke all on function public.erase_user_account_v3(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.privacy_erasure_plan_v3(uuid, jsonb) to service_role;
grant execute on function public.privacy_erasure_authorize_v3(uuid, uuid, jsonb, interval) to service_role;
grant execute on function public.erase_user_account_v3(uuid, text, uuid) to service_role;
comment on function public.privacy_erasure_plan_v3(uuid, jsonb) is
  'Erasure DRY RUN v3: a pure read (counts only; no DDL, no lock, no write). Lists every action, refusal and retained class with table/column/rows; returns the plan digest a token is bound to. service_role only.';
comment on function public.privacy_erasure_authorize_v3(uuid, uuid, jsonb, interval) is
  'Issues ONE single-use erasure token (returned once, stored as sha256) bound to the request id, its state fingerprint, the plan digest and the external decisions (stripe, notice). 15-minute TTL. service_role only.';
comment on function public.erase_user_account_v3(uuid, text, uuid) is
  'GDPR Art. 17 executor v3 (#856). Consumes the token atomically, re-plans, refuses on any drift, executes everything in one transaction (guards disabled only around the one statement each), deletes auth.users last, writes an append-only receipt without identifiers. service_role only.';

-- ─────────────────────────────────────────────────────────────────────────
-- 10 · registry seed — every FK onto profiles / workers derived from the
--      migrations on 2026-10-16 (apps/web/lib/guards/privacy-erasure-registry-coverage.test.ts
--      fails when a migration adds one without a row here)
-- ─────────────────────────────────────────────────────────────────────────
insert into public.privacy_erasure_registry_v3
  (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, guard_triggers, refuse_where, scrub_columns, requires_external, note) values
-- REGISTRY-SEED-BEGIN
('public', 'account_classifications', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'account_classifications', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'agency_candidate_offers', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_candidate_offers', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_candidate_offers', 'withdrawn_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_candidate_offers', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'agency_client_connections', 'accepted_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_client_connections', 'invited_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_client_connections', 'revoked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_client_request_shares', 'revoked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_client_request_shares', 'shared_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_clients', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agency_worker_invitations', 'inviter_profile_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'agency_workers', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'agencies', 'profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agreement_amendments', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['agreement_amendments_append_only']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'agreement_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['agreement_events_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'agreements', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'agreements', 'responsible_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'agreements', 'worker_id', 'workers', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'ai_runs', 'profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'asset_assignments', 'issued_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'asset_assignments', 'worker_id', 'workers', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'assets', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'assistant_conversations', 'owner_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'audit_logs', 'actor_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'billing_checkout_operations', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): accounting records (10 y LT) - LEGAL TO CONFIRM', null, null, null, 'stripe', 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'billing_customers', 'owner_id', 'profiles', 'cascade', 'delete_rows', 'engineering', true, 'Art. 17(1)(a) for the mapping; invoices stay at the processor/accounting (10 y, Art. 17(3)(b))', null, null, null, 'stripe', 'processor key mapping only; deleted AFTER the Stripe customer is deleted/anonymised (external.stripe required)'),
  ('public', 'billing_subscriptions', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): accounting records (10 y LT) - LEGAL TO CONFIRM', null, null, null, 'stripe', 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'booking_request_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'booking_requests', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'booking_requests', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'booking_requests_seen', 'user_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'business_trip_events', 'actor_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['business_trip_events_append_only']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'business_trips', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'business_trips', 'profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'candidate_drafts', 'linked_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'candidate_drafts', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'candidate_skills', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'commercial_handoffs', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'commitment_override_receipts', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['commitment_override_receipts_immutable']::text[], null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete (the FK action itself would be blocked by the table''s guard trigger)'),
  ('public', 'commitment_override_receipts', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['commitment_override_receipts_immutable']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'company_demand_locations', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'company_locations', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'company_memberships', 'invited_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'company_memberships', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, 'role = ''owner'' and status = ''active'' and not exists (select 1 from public.company_memberships m2 where m2.organization_id = company_memberships.organization_id and m2.role = ''owner'' and m2.status = ''active'' and m2.id <> company_memberships.id)', null, null, 'cascade confirmed as the decision (the person''s own data); protect_last_owner would abort the cascade: sole active owner must transfer ownership first (refuse_where)'),
  ('public', 'company_worker_engagements', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'company_worker_engagements', 'ended_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'company_worker_engagements', 'worker_id', 'workers', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'company_worker_invitations', 'inviter_profile_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'company_workers', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'companies', 'profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'competency_recognitions', 'assessed_by', 'profiles', 'restrict', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'competency_recognitions', 'subject_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'confirmation_spends', 'spent_by', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'consented_login_location_signals', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'consents', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'contact_disclosure_request_events', 'actor_profile_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['contact_disclosure_request_events_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'contact_disclosure_requests', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'contact_disclosure_requests', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'contracts', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'conversation_message_attachments', 'uploader_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'conversation_messages', 'author_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'message rows stay for the counterparty (E6: 36 mo after close); author severed - LEGAL: body scrub vs retain (free text may name the person)'),
  ('public', 'conversation_participants', 'added_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'conversation_participants', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'conversation_participants', 'revoked_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'conversations', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'customer_request_attachments', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'customer_requests', 'drafted_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'customer_requests', 'profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, array['need_summary','notes','manual_review_note']::text[], null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'customers', 'profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'dashboard_preferences', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'decision_document_links', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'decision_task_links', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'defect_corrections', 'reviewer_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'defects', 'assignee_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'defects', 'reporter_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'demand_interest_seen', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'demand_interest_signals', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'demand_shortlist', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'demand_shortlist', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'document_acknowledgements', 'acknowledged_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'document_acknowledgements', 'assigned_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'document_acknowledgements', 'assignee_profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'document_files', 'uploaded_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'education_cohort_members', 'added_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'education_cohort_members', 'profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'education_cohorts', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'education_programs', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'email_verification_requests_v1', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'email_verifications_v1', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'employee_requests', 'requester_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'engagement_contexts', 'profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', null, null, array['title','description']::text[], null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'engagement_lifecycle_events', 'actor_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['engagement_lifecycle_events_append_only']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'evidence_import_events', 'actor_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'evidence_import_sessions', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'experience_records', 'author_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'experience_records', 'moderated_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'experience_records', 'subject_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'experience_responses', 'author_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'experience_responses', 'moderated_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'finance_records', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'first_party_supply_declarations', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'follow_up_tasks', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'follow_up_tasks', 'subject_profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'historical_consolidation_decisions', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'historical_consolidation_decisions', 'reverted_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'identity_resolution_events', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['trg_identity_resolution_events_immutable']::text[], null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete (the FK action itself would be blocked by the table''s guard trigger)'),
  ('public', 'identity_resolution_events', 'duplicate_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['trg_identity_resolution_events_immutable']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'identity_resolution_events', 'primary_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['trg_identity_resolution_events_immutable']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'invitation_acceptances', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'invitations', 'accepted_by_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'invitations', 'inviter_profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'journal_entry_confirmations', 'confirmer_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'the OTHER worker''s evidence keeps its confirmation; confirmer identity severed - OWNER/LEGAL: must a confirmation by an erased confirmer still read as confirmed?'),
  ('public', 'journal_entry_photos', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'journal_entry_review_submissions', 'submitted_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['journal_entry_review_submissions_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'journal_entry_review_submissions', 'worker_id', 'workers', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['journal_entry_review_submissions_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'journal_entry_skills', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'journal_entry_tasks', 'linked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'journal_entry_tasks', 'unlinked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'journal_entry_work_items', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'journal_entries', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'language_feedback', 'user_id', 'profiles', 'no action', 'delete_rows', 'engineering', false, 'Art. 17(1)(a): telemetry/feedback no longer necessary', null, null, null, null, 'analytics/feedback about the person; nothing to retain'),
  ('public', 'leads', 'assigned_to', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'learning_policy_settings', 'disabled_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'learning_policy_settings', 'enabled_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'learning_review_queue', 'reviewed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['learning_review_queue_guard_stale_trg']::text[], null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete (the FK action itself would be blocked by the table''s guard trigger)'),
  ('public', 'learning_review_queue', 'subject_worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', array['learning_review_queue_guard_stale_trg']::text[], null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'learning_signals', 'actor_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'learning_signals', 'subject_worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'leave_balance_policies', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'lmc_accounts', 'profile_id', 'profiles', 'restrict', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'lmc_settings', 'updated_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'lmc_transactions', 'actor_profile_id', 'profiles', 'restrict', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'management_decision_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['management_decision_events_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'management_decisions', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'management_decisions', 'responsible_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'market_intelligence_insight_queries', 'profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'market_rate_averages', 'entered_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'marketplace_listings', 'owner_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'match_actions', 'actor_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'matches', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'notification_events', 'recipient_profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'notification_preferences', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'offboarding_run_items', 'completed_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'offboarding_runs', 'started_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'onboarding_run_items', 'completed_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'onboarding_run_items', 'responsible_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'onboarding_runs', 'started_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'onboarding_templates', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'org_document_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'org_documents', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'org_documents', 'responsible_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'org_documents', 'worker_id', 'workers', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'organization_claims', 'claimant_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'organization_claims', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_evidence_events', 'actor_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_evidence_media', 'imported_by_profile_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'organization_evidence_parties', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_evidence_records', 'imported_by_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_evidence_records', 'supplied_by_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_facts', 'recorded_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['organization_facts_append_only']::text[], null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete (the FK action itself would be blocked by the table''s guard trigger)'),
  ('public', 'organization_history_periods', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_identifiers', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_people', 'created_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_people', 'linked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_people', 'linked_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organization_people', 'linked_worker_id', 'workers', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'organizations', 'owner_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'performance_review_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['performance_review_events_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'performance_reviews', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['performance_reviews_immutable_when_closed']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'performance_reviews', 'manager_input_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['performance_reviews_immutable_when_closed']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'performance_reviews', 'reviewer_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['performance_reviews_immutable_when_closed']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'performance_reviews', 'subject_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['performance_reviews_immutable_when_closed']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'personal_data_disclosures', 'disclosed_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['personal_data_disclosures_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'personal_data_disclosures', 'worker_user_id', 'profiles', 'cascade', 'pseudonymise_ledger', 'engineering', true, 'Art. 17(3)(b)/(e) + Art. 7(1): proof of lawfulness; append-only ledger kept, subject detached to a per-erasure tombstone (pseudonymised, never anonymous)', array['personal_data_disclosures_append_only']::text[], null, null, null, 'ledger row stays; user column -> NULL, erased_subject_id/erased_at set (E2)'),
  ('public', 'pilot_drafts', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'pilot_events', 'profile_id', 'profiles', 'no action', 'delete_rows', 'engineering', false, 'Art. 17(1)(a): telemetry/feedback no longer necessary', null, null, null, null, 'analytics/feedback about the person; nothing to retain'),
  ('public', 'pilot_outcomes', 'noted_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'pilot_outcomes', 'participant_profile_id', 'profiles', 'no action', 'delete_rows', 'engineering', false, 'Art. 17(1)(a): telemetry/feedback no longer necessary', null, null, null, null, 'analytics/feedback about the person; nothing to retain'),
  ('public', 'pilot_participants', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'pilots', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'platform_capability_grants', 'granted_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'platform_capability_grants', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'platform_capability_grants', 'revoked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'preferred_locations', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'privacy_consent_events', 'user_id', 'profiles', 'cascade', 'pseudonymise_ledger', 'engineering', true, 'Art. 17(3)(b)/(e) + Art. 7(1): proof of lawfulness; append-only ledger kept, subject detached to a per-erasure tombstone (pseudonymised, never anonymous)', array['privacy_consent_events_append_only']::text[], null, null, null, 'ledger row stays; user column -> NULL, erased_subject_id/erased_at set (E2)'),
  ('public', 'privacy_erasure_authorizations_v3', 'issued_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'privacy_erasure_receipts_v3', 'executed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'procurement_events', 'actor_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['procurement_events_append_only']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'procurement_inquiries', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'procurement_inquiries', 'requester_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'procurement_offers', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'productivity_units', 'created_by_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'profile_roles', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'profile_skill_claims', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'project_budgets', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'project_handover_entries', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'project_members', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'project_stages', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'project_worker_assignments', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'project_worker_operational_statuses', 'updated_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'project_worker_operational_statuses', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'project_worker_readiness_items', 'updated_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'project_worker_readiness_items', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'projects', 'responsible_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'proposals', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'review_cycles', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'review_evidence_links', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'service_offering_requests', 'buyer_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'service_offering_requests', 'provider_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'service_offering_requests_seen', 'user_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'service_offerings', 'provider_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'skill_candidate_clarifications', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'subscriptions', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'talent_source_records', 'canonical_person_link', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'talent_source_records', 'subject_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'task_dependencies', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'team_assignments', 'assigned_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'team_assignments', 'ended_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'team_demand_offer_terms', 'decided_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'team_demand_offer_terms', 'proposed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'team_demand_offers', 'offered_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'team_demand_offers', 'responded_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'team_enquiry_events', 'actor_profile_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'team_enquiries', 'owner_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'timesheet_events', 'actor_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['timesheet_events_append_only']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'timesheets', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', array['timesheets_frozen']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'timesheets', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', array['timesheets_frozen']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'training_assignment_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['training_assignment_events_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'training_assignments', 'assigned_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['training_assignments_fill_once']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'training_assignments', 'assignee_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['training_assignments_fill_once']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'training_programs', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'training_skill_links', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'usage_cost_events', 'profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['usage_cost_events_no_mutation']::text[], null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete (the FK action itself would be blocked by the table''s guard trigger)'),
  ('public', 'work_counterparty_links', 'established_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['work_counterparty_links_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'work_counterparty_links', 'revoked_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['work_counterparty_links_append_only']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'work_counterparty_links', 'worker_id', 'workers', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', array['work_counterparty_links_append_only']::text[], null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'work_hour_allocations', 'entered_by', 'profiles', 'restrict', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time record; employer statutory retention - LEGAL TO CONFIRM', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'work_hour_allocations', 'worker_id', 'workers', 'restrict', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time record; employer statutory retention - LEGAL TO CONFIRM', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'work_objects', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'work_objects', 'responsible_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'work_plan_entries', 'cancelled_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'work_plan_entries', 'created_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time record; employer statutory retention - LEGAL TO CONFIRM', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'work_plan_entries', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b): working-time / work record; employer statutory retention (LT DK, NO arbeidsmiljoloven) - LEGAL TO CONFIRM', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'work_task_events', 'actor_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'work_tasks', 'assignee_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete'),
  ('public', 'work_tasks', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'worker_absences', 'requested_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'worker_absences', 'reviewed_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'worker_absences', 'worker_id', 'workers', 'cascade', 'sever_sentinel', 'engineering', true, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'worker_achievements', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_document_events', 'actor_id', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'worker_documents', 'updated_by', 'profiles', 'no action', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation / counterparty / evidence record; author identity severed to the sentinel', null, null, null, null, 'NOT NULL author/actor column on a retained record'),
  ('public', 'worker_documents', 'verified_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'worker_documents', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_education', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_external_profiles', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_languages', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_opportunity_seen', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_professions', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_saved_opportunities', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_saved_searches', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'worker_skills', 'verified_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', null, null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'worker_skills', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'workers', 'profile_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the person''s own rows; deleted with the account', null, null, null, null, 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'workflow_definition_versions', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'workflow_definitions', 'created_by', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'workflow_instance_approvers', 'approver_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', array['workflow_approvers_fill_once']::text[], null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'workflow_instance_approvers', 'decided_by', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['workflow_approvers_fill_once']::text[], null, null, null, 'nullable author/actor column on a retained record'),
  ('public', 'workflow_instance_approvers', 'delegated_to_profile_id', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['workflow_approvers_fill_once']::text[], null, null, null, 'FK already SET NULL; v3 runs it explicitly before the account delete (the FK action itself would be blocked by the table''s guard trigger)'),
  ('public', 'workflow_instances', 'requester_profile_id', 'profiles', 'cascade', 'sever_sentinel', 'engineering', false, 'Art. 17(3)(b)/(e): organisation or counterparty record the person only authored/participated in; the organisation is controller', null, null, null, null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)'),
  ('public', 'workflow_transitions', 'actor_profile_id', 'profiles', 'no action', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', array['workflow_transitions_append_only']::text[], null, null, null, 'nullable author/actor column on a retained record')
on conflict (schema_name, table_name, column_name) do nothing;
-- REGISTRY-SEED-END
-- the executor's own tables
insert into public.privacy_erasure_registry_v3
  (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'privacy_erasure_authorizations_v3', 'issued_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'accountability record; admin identity nulled when the admin is erased', 'executor table'),
  ('public', 'privacy_erasure_receipts_v3', 'executed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'accountability record; admin identity nulled when the admin is erased', 'executor table')
on conflict (schema_name, table_name, column_name) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 11 · value-rule seed — person references the FK catalog cannot see
-- ─────────────────────────────────────────────────────────────────────────
insert into public.privacy_erasure_value_rules_v3
  (schema_name, table_name, column_name, match, treatment, decided_by, legal_review, scrub_columns, note) values
  ('public', 'invitations', 'invited_email', 'email_exact', 'pseudonymise_value', 'engineering', false, array['invited_name', 'personal_message'], 'invitation addressed to the person: address replaced by the sentinel address, name and message removed; the inviter keeps the fact that an invitation existed'),
  ('public', 'agency_worker_invitations', 'invited_email', 'email_exact', 'pseudonymise_value', 'engineering', false, null, 'legacy invitation addressed to the person'),
  ('public', 'company_worker_invitations', 'invited_email', 'email_exact', 'pseudonymise_value', 'engineering', false, null, 'legacy invitation addressed to the person'),
  ('public', 'agency_client_connections', 'invited_email', 'email_exact', 'pseudonymise_value', 'engineering', false, null, 'B2B connection invite addressed to the person'),
  ('public', 'company_need_public_intakes', 'contact_email', 'email_exact', 'pseudonymise_value', 'engineering', true, array['contact_name', 'contact_phone'], 'public demand intake where the person was the contact: contact fields removed, the demand record stays with the organisation - LEGAL: retention of the intake itself (matrix: 24 mo after closed)'),
  ('public', 'agency_clients', 'contact_email', 'email_exact', 'pseudonymise_value', 'engineering', false, array['contact_name'], 'agency client contact person'),
  ('public', 'project_clients', 'contact_email', 'email_exact', 'pseudonymise_value', 'engineering', false, array['contact_name'], 'project client contact person'),
  ('public', 'companies', 'contact_email', 'email_exact', 'pseudonymise_value', 'engineering', false, array['contact_phone'], 'company contact person (the company record stays)'),
  ('public', 'leads', 'email', 'email_exact', 'pseudonymise_value', 'engineering', true, array['full_name'], 'CRM lead: Art. 6(1)(f) interest ends with the objection/erasure; the lead row stays as a pseudonymised count - LEGAL: delete instead?'),
  ('public', 'lmc_transactions', 'recipient_email_at_grant', 'email_exact', 'pseudonymise_value', 'engineering', true, null, 'credit ledger (ON DELETE RESTRICT elsewhere): grant recipient address replaced; amounts and timestamps kept - LEGAL: ledger immutability vs identifier removal'),
  ('public', 'waitlist', 'email', 'email_exact', 'delete_rows', 'engineering', false, null, 'landing-page waitlist signup: the person''s own request, no retention need'),
  ('public', 'email_verification_requests_v1', 'email', 'email_exact', 'delete_rows', 'engineering', false, null, 'verification scaffolding (also cascades via profile_id)'),
  ('public', 'email_verifications_v1', 'email', 'email_exact', 'delete_rows', 'engineering', false, null, 'verification scaffolding (also cascades via profile_id)'),
  ('public', 'audit_logs', 'payload', 'mention', 'pseudonymise_mentions', 'engineering', true, null, 'audit evidence retained (Art. 17(3)(e)); the person''s id and e-mail inside payloads are replaced by the tombstone / sentinel address, structure untouched - LEGAL: confirm scrub-in-place is acceptable for audit evidence'),
  ('public', 'payment_webhook_events', 'payload', 'mention', 'pseudonymise_mentions', 'engineering', true, null, 'Stripe webhook payloads name the customer e-mail; retained as billing evidence (10 y) with the address replaced - LEGAL: confirm'),
  ('public', 'conversation_messages', 'body', 'mention', 'report_only', 'engineering', true, null, 'free text written by other people that names the person: retained for the counterparty (E6), counted in the receipt, never printed - LEGAL: scrub rule'),
  ('public', 'journal_entries', 'original_text', 'mention', 'report_only', 'engineering', true, null, 'the person''s own work-record text retained as employer evidence under the sentinel - LEGAL: keep text vs remove free text (see design doc)'),
  ('public', 'customer_requests', 'need_summary', 'mention', 'report_only', 'engineering', false, null, 'organisation demand text; the person''s own requests are scrubbed by the registry row (scrub_columns)'),
  ('public', 'evidence_import_rows', 'person_label', 'mention', 'report_only', 'engineering', true, null, 'organisation-supplied history (the organisation is controller, D9): counted, not changed - LEGAL: Art. 14/17 path for org-supplied people'),
  ('public', 'organization_people', 'display_name', 'mention', 'report_only', 'engineering', true, null, 'organisation-supplied person card (D9): counted, not changed'),
  ('auth', 'audit_log_entries', 'payload', 'mention', 'report_only', 'engineering', true, null, 'GoTrue security log; retained security evidence - LEGAL: retention window')
on conflict (schema_name, table_name, column_name) do nothing;

commit;
