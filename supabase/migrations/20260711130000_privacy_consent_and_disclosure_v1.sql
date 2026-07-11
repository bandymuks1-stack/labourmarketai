-- @human-gate-approved
-- Owner authorization: consent-and-disclosure goal command (2026-07-11) —
-- "sukurti vieną ar kelias siaurai apribotas additive DB migracijas; sukurti
-- sutikimų ir duomenų perdavimo auditinius įrašus; pridėti tik šiai funkcijai
-- būtinas RLS politikas ir SECURITY DEFINER RPC; pakeisti darbuotojų paieškos
-- ... užklausas taip, kad jos veiktų fail-closed".
--
-- privacy_consent_and_disclosure_v1
-- =================================
-- GDPR consent + disclosure foundation (Art. 4(11), 6(1)(a), 7, 25):
--
--  1. privacy_consent_purposes  — pinned CURRENT consent-text version + hash
--     per purpose (registry source: apps/web/lib/privacy/consent-definitions.ts).
--  2. privacy_consent_events    — APPEND-ONLY consent ledger (granted/withdrawn;
--     no update, no delete, for anyone — trigger-enforced).
--  3. personal_data_disclosures — APPEND-ONLY disclosure ledger (who received
--     what, when, why, under which consent event).
--  4. worker_profile_discoverable(uuid) / can_view_worker(uuid) — fail-closed
--     visibility predicates.
--  5. FAIL-CLOSED RLS swap: workers / worker_skills / worker_professions
--     SELECT policies stop exposing every worker to every employer
--     (is_employer() now additionally requires a current, granted
--     profile_discoverability consent). Active work relationships (accepted
--     company/agency link, active engagement context, active managed-project
--     assignment) keep their existing visibility — different legal basis
--     (contract / legitimate interest), see docs/legal/legal-basis-matrix-v1.md.
--  6. Narrow SECURITY DEFINER RPCs for grant / withdraw / current state /
--     history / disclosure guard / admin aggregate counts.
--
-- NO consent backfill: ships with ZERO consent rows. Every existing profile
-- stays NOT granted until the real user acts. No profiles/workers columns
-- are modified. The legacy `consents` table and profiles.consent_* booleans
-- are left untouched (deprecated in code).
--
-- Rollback: supabase/rollbacks/20260711130000_privacy_consent_and_disclosure_v1.down.sql

-- ---------------------------------------------------------------------------
-- 1. Consent text version pinning
-- ---------------------------------------------------------------------------

create table if not exists public.privacy_consent_purposes (
  purpose text primary key,
  current_version text not null,
  current_text_hash text not null,
  updated_at timestamptz not null default now()
);

comment on table public.privacy_consent_purposes is
  'Pinned CURRENT consent-text version+hash per processing purpose. Source of truth for texts: apps/web/lib/privacy/consent-definitions.ts (versioned, hashed). Grant RPCs reject stale/unknown versions (fail closed). No marketing purpose is seeded: the product sends no marketing messages.';

alter table public.privacy_consent_purposes enable row level security;

drop policy if exists privacy_consent_purposes_select on public.privacy_consent_purposes;
create policy privacy_consent_purposes_select
  on public.privacy_consent_purposes for select
  using (auth.uid() is not null);

revoke all on public.privacy_consent_purposes from public;
revoke all on public.privacy_consent_purposes from anon;
grant select on public.privacy_consent_purposes to authenticated;

insert into public.privacy_consent_purposes (purpose, current_version, current_text_hash) values
  ('profile_discoverability', '2026-07-11.v1', '8ef7c1b10511f01904045621ef56f167838f27409ceb209311e7ee0dc1d8acd9'),
  ('employer_data_disclosure', '2026-07-11.v1', 'ba18a01f1d90f774a4119aefe01e7bc3c0e807047d30054d85d7f2c7150e85f7')
on conflict (purpose) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Append-only consent ledger
-- ---------------------------------------------------------------------------

create table if not exists public.privacy_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null references public.privacy_consent_purposes(purpose),
  action text not null check (action in ('granted', 'withdrawn')),
  consent_text_version text not null,
  consent_text_hash text not null,
  locale text not null check (char_length(locale) between 2 and 5),
  source text not null check (char_length(btrim(source)) between 1 and 60),
  recipient_organization_id uuid references public.organizations(id),
  context_type text check (context_type in ('company_need', 'booking', 'service_request')),
  context_id uuid,
  selected_fields jsonb,
  created_at timestamptz not null default now(),
  request_id uuid,
  metadata jsonb,
  constraint pce_disclosure_shape check (
    (purpose = 'employer_data_disclosure'
      and recipient_organization_id is not null
      and context_type is not null
      and context_id is not null)
    or (purpose <> 'employer_data_disclosure'
      and recipient_organization_id is null
      and context_type is null
      and context_id is null
      and selected_fields is null)
  ),
  constraint pce_disclosure_grant_fields check (
    purpose <> 'employer_data_disclosure'
    or action <> 'granted'
    or jsonb_typeof(selected_fields) = 'array'
  )
);

comment on table public.privacy_consent_events is
  'APPEND-ONLY consent ledger. Each grant and each withdrawal is a separate immutable row (no update-in-place, trigger-enforced for every role incl. service role). Current state = newest row per (user, purpose[, recipient+context]). Workers read ONLY their own history; employers read nothing; operators get aggregate/current state via narrow RPCs only.';

create index if not exists privacy_consent_events_user_purpose_idx
  on public.privacy_consent_events (user_id, purpose, created_at desc);
create index if not exists privacy_consent_events_disclosure_idx
  on public.privacy_consent_events (user_id, recipient_organization_id, context_type, context_id, created_at desc)
  where purpose = 'employer_data_disclosure';

alter table public.privacy_consent_events enable row level security;

drop policy if exists privacy_consent_events_select_own on public.privacy_consent_events;
create policy privacy_consent_events_select_own
  on public.privacy_consent_events for select
  using (user_id = auth.uid());
-- Deliberately NO insert/update/delete policies and NO admin select policy:
-- writes happen only through the SECURITY DEFINER RPCs below; operators see
-- only aggregated/current state via admin RPCs; history is worker-only.

revoke all on public.privacy_consent_events from public;
revoke all on public.privacy_consent_events from anon;
revoke all on public.privacy_consent_events from authenticated;
grant select on public.privacy_consent_events to authenticated;

create or replace function public.privacy_ledger_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'privacy ledger is append-only: % on % is not allowed', tg_op, tg_table_name
    using errcode = 'raise_exception';
end;
$$;

drop trigger if exists privacy_consent_events_append_only on public.privacy_consent_events;
create trigger privacy_consent_events_append_only
  before update or delete on public.privacy_consent_events
  for each row execute function public.privacy_ledger_block_mutation();

-- ---------------------------------------------------------------------------
-- 3. Append-only disclosure ledger
-- ---------------------------------------------------------------------------

create table if not exists public.personal_data_disclosures (
  id uuid primary key default gen_random_uuid(),
  worker_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_organization_id uuid not null references public.organizations(id),
  context_type text not null check (context_type in ('company_need', 'booking', 'service_request')),
  context_id uuid not null,
  consent_event_id uuid not null references public.privacy_consent_events(id),
  data_categories text[] not null check (cardinality(data_categories) between 1 and 7),
  document_ids uuid[],
  disclosed_at timestamptz not null default now(),
  disclosed_by uuid not null references public.profiles(id),
  delivery_method text not null check (char_length(btrim(delivery_method)) between 1 and 60),
  revoked_access_at timestamptz,
  metadata jsonb
);

comment on table public.personal_data_disclosures is
  'APPEND-ONLY disclosure ledger: who received which worker data categories, when, why (context), under which consent event, initiated by whom. Never stores CV/document copies — only category names and reference ids. Only revoked_access_at may be set later (one-way, via RPC).';

create index if not exists personal_data_disclosures_worker_idx
  on public.personal_data_disclosures (worker_user_id, disclosed_at desc);

alter table public.personal_data_disclosures enable row level security;

drop policy if exists personal_data_disclosures_select on public.personal_data_disclosures;
create policy personal_data_disclosures_select
  on public.personal_data_disclosures for select
  using (worker_user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: writes only via SECURITY DEFINER RPCs.

revoke all on public.personal_data_disclosures from public;
revoke all on public.personal_data_disclosures from anon;
revoke all on public.personal_data_disclosures from authenticated;
grant select on public.personal_data_disclosures to authenticated;

create or replace function public.personal_data_disclosures_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'disclosure ledger is append-only: DELETE is not allowed';
  end if;
  -- The ONLY permitted mutation: one-way stamp of revoked_access_at.
  if new.id is distinct from old.id
    or new.worker_user_id is distinct from old.worker_user_id
    or new.recipient_organization_id is distinct from old.recipient_organization_id
    or new.context_type is distinct from old.context_type
    or new.context_id is distinct from old.context_id
    or new.consent_event_id is distinct from old.consent_event_id
    or new.data_categories is distinct from old.data_categories
    or new.document_ids is distinct from old.document_ids
    or new.disclosed_at is distinct from old.disclosed_at
    or new.disclosed_by is distinct from old.disclosed_by
    or new.delivery_method is distinct from old.delivery_method
    or new.metadata is distinct from old.metadata
    or old.revoked_access_at is not null
    or new.revoked_access_at is null
  then
    raise exception 'disclosure ledger rows are immutable except a one-way revoked_access_at stamp';
  end if;
  return new;
end;
$$;

drop trigger if exists personal_data_disclosures_append_only on public.personal_data_disclosures;
create trigger personal_data_disclosures_append_only
  before update or delete on public.personal_data_disclosures
  for each row execute function public.personal_data_disclosures_guard();

-- ---------------------------------------------------------------------------
-- 4. Fail-closed visibility predicates
-- ---------------------------------------------------------------------------

create or replace function public.worker_profile_discoverable(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- TRUE only when the newest profile_discoverability event is 'granted' AND
  -- was given for the CURRENT consent-text version (stale version => false;
  -- a version bump never silently extends an old consent to a wider purpose).
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_profile
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.id desc
    limit 1
  ), false)
$$;

create or replace function public.can_view_worker(w uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.owns_worker(w)
    or public.is_admin()
    -- Employer/agency DISCOVERY: only with a current granted
    -- profile_discoverability consent (GDPR consent basis, fail closed).
    or (
      public.is_employer()
      and exists (
        select 1 from public.workers x
        where x.id = w
          and x.profile_id is not null
          and public.worker_profile_discoverable(x.profile_id)
      )
    )
    -- Active work relationships keep visibility (contract / legitimate
    -- interest basis, NOT the discovery consent):
    or exists (
      select 1
      from public.company_workers cw
      join public.companies c on c.id = cw.company_id
      where cw.worker_id = w and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
      where aw.worker_id = w and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.engagement_contexts ec
      join public.workers x on x.id = w and x.profile_id = ec.profile_id
      where ec.status = 'active'
        and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1
      from public.project_worker_assignments pwa
      where pwa.worker_id = w
        and pwa.status = 'active'
        and pwa.ended_at is null
        and public.can_manage_project(pwa.project_id)
    )
$$;

revoke all on function public.worker_profile_discoverable(uuid) from public;
revoke all on function public.worker_profile_discoverable(uuid) from anon;
grant execute on function public.worker_profile_discoverable(uuid) to authenticated;

revoke all on function public.can_view_worker(uuid) from public;
revoke all on function public.can_view_worker(uuid) from anon;
grant execute on function public.can_view_worker(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. FAIL-CLOSED RLS swap (the emergency fix from the Phase 0 audit)
-- ---------------------------------------------------------------------------
-- BEFORE: is_employer() alone exposed EVERY worker row / skill / profession
-- to EVERY authenticated company or agency account.
-- AFTER: employers see a worker only with current granted discoverability
-- consent OR an active work relationship. Self/admin unchanged.

drop policy if exists workers_select on public.workers;
create policy workers_select
  on public.workers for select
  using (public.can_view_worker(id));

drop policy if exists worker_skills_select on public.worker_skills;
create policy worker_skills_select
  on public.worker_skills for select
  using (public.can_view_worker(worker_id));

drop policy if exists worker_professions_select on public.worker_professions;
create policy worker_professions_select
  on public.worker_professions for select
  using (public.can_view_worker(worker_id));

-- ---------------------------------------------------------------------------
-- 6. Narrow RPCs
-- ---------------------------------------------------------------------------

create or replace function public.grant_profile_discoverability_consent(
  p_version text,
  p_hash text,
  p_locale text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'profile_discoverability';
  if v_cur is null
    or v_cur.current_version is distinct from p_version
    or v_cur.current_text_hash is distinct from p_hash
  then
    return jsonb_build_object('ok', false, 'error', 'stale_consent_version');
  end if;
  if p_locale not in ('lt', 'en', 'ru', 'nl', 'de') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_locale');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'profile_discoverability', 'granted', p_version, p_hash, p_locale, p_source);
  return jsonb_build_object('ok', true, 'status', 'granted');
end;
$$;

create or replace function public.withdraw_profile_discoverability_consent(
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  -- Withdrawal is ALWAYS accepted, whatever version the grant used.
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'profile_discoverability';
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'profile_discoverability', 'withdrawn',
     coalesce(v_cur.current_version, 'unknown'),
     coalesce(v_cur.current_text_hash, 'unknown'),
     'lt', p_source);
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

create or replace function public.grant_employer_data_disclosure(
  p_version text,
  p_hash text,
  p_locale text,
  p_source text,
  p_recipient_organization_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_selected_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
  v_field text;
  v_count int;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  -- Only a worker account can authorize disclosure of worker data.
  if not exists (select 1 from public.workers where profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_a_worker');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'employer_data_disclosure';
  if v_cur is null
    or v_cur.current_version is distinct from p_version
    or v_cur.current_text_hash is distinct from p_hash
  then
    return jsonb_build_object('ok', false, 'error', 'stale_consent_version');
  end if;
  if p_locale not in ('lt', 'en', 'ru', 'nl', 'de') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_locale');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  if p_recipient_organization_id is null
    or not exists (select 1 from public.organizations o where o.id = p_recipient_organization_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_recipient_organization');
  end if;
  if p_context_type not in ('company_need', 'booking', 'service_request')
    or p_context_id is null
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_context');
  end if;
  -- Context must exist in its canonical table (no dangling permissions).
  if p_context_type = 'company_need'
    and not exists (select 1 from public.customer_requests r where r.id = p_context_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_context');
  end if;
  if p_context_type = 'booking'
    and not exists (select 1 from public.booking_requests b where b.id = p_context_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_context');
  end if;
  if p_context_type = 'service_request'
    and not exists (select 1 from public.service_offering_requests s where s.id = p_context_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_context');
  end if;
  -- Closed field whitelist; non-empty; deduplicated; capped.
  if p_selected_fields is null or jsonb_typeof(p_selected_fields) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_selected_fields');
  end if;
  select count(*) into v_count from jsonb_array_elements_text(p_selected_fields);
  if v_count < 1 or v_count > 7
    or v_count <> (select count(distinct t) from jsonb_array_elements_text(p_selected_fields) t)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_selected_fields');
  end if;
  for v_field in select t from jsonb_array_elements_text(p_selected_fields) t loop
    if v_field not in ('full_name', 'phone', 'email', 'cv_document',
                       'preferred_locations', 'availability_details', 'salary_expectation')
    then
      return jsonb_build_object('ok', false, 'error', 'field_not_allowed', 'field', v_field);
    end if;
  end loop;
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source,
     recipient_organization_id, context_type, context_id, selected_fields)
  values
    (v_uid, 'employer_data_disclosure', 'granted', p_version, p_hash, p_locale, p_source,
     p_recipient_organization_id, p_context_type, p_context_id, p_selected_fields)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'status', 'granted', 'consent_event_id', v_id);
end;
$$;

create or replace function public.withdraw_employer_data_disclosure(
  p_recipient_organization_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  if p_recipient_organization_id is null or p_context_id is null
    or p_context_type not in ('company_need', 'booking', 'service_request')
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_context');
  end if;
  -- Withdrawal targets the caller's own permission only (user_id = auth.uid()).
  if not exists (
    select 1 from public.privacy_consent_events e
    where e.user_id = v_uid
      and e.purpose = 'employer_data_disclosure'
      and e.recipient_organization_id = p_recipient_organization_id
      and e.context_type = p_context_type
      and e.context_id = p_context_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_matching_permission');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'employer_data_disclosure';
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source,
     recipient_organization_id, context_type, context_id)
  values
    (v_uid, 'employer_data_disclosure', 'withdrawn',
     coalesce(v_cur.current_version, 'unknown'),
     coalesce(v_cur.current_text_hash, 'unknown'),
     'lt', p_source,
     p_recipient_organization_id, p_context_type, p_context_id);
  -- Best-effort: stamp access revocation on prior disclosures for this exact
  -- permission (one-way; trigger permits only this mutation).
  update public.personal_data_disclosures d
     set revoked_access_at = now()
   where d.worker_user_id = v_uid
     and d.recipient_organization_id = p_recipient_organization_id
     and d.context_type = p_context_type
     and d.context_id = p_context_id
     and d.revoked_access_at is null;
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

create or replace function public.current_profile_discoverability_consent()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', case
        when e.action = 'granted' and e.consent_text_version = p.current_version then 'granted'
        when e.action = 'granted' then 'granted_stale_version'
        else 'withdrawn'
      end,
      'decidedAt', e.created_at,
      'version', e.consent_text_version,
      'locale', e.locale,
      'currentVersion', p.current_version
    )
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = auth.uid()
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.id desc
    limit 1
  ), jsonb_build_object('status', 'not_set'))
$$;

create or replace function public.my_privacy_consent_history()
returns setof public.privacy_consent_events
language sql
stable
security invoker
set search_path = public
as $$
  -- SECURITY INVOKER on purpose: RLS (user_id = auth.uid()) does the scoping.
  select * from public.privacy_consent_events
  where user_id = auth.uid()
  order by created_at desc, id desc
$$;

create or replace function public.has_employer_data_disclosure(
  p_worker_profile uuid,
  p_recipient_organization_id uuid,
  p_context_type text,
  p_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- TRUE only when the newest matching event is a grant on the CURRENT text
  -- version. Any withdrawal after the grant flips this to false immediately.
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_worker_profile
      and e.purpose = 'employer_data_disclosure'
      and e.recipient_organization_id = p_recipient_organization_id
      and e.context_type = p_context_type
      and e.context_id = p_context_id
    order by e.created_at desc, e.id desc
    limit 1
  ), false)
$$;

create or replace function public.record_personal_data_disclosure(
  p_worker_profile uuid,
  p_recipient_organization_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_data_categories text[],
  p_document_ids uuid[],
  p_delivery_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_grant public.privacy_consent_events;
  v_cat text;
  v_id uuid;
begin
  -- Operator-only: every real disclosure is executed by the operator and
  -- MUST land here BEFORE data leaves the platform. Fail closed on any gap.
  if v_uid is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if not public.has_employer_data_disclosure(
    p_worker_profile, p_recipient_organization_id, p_context_type, p_context_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'DISCLOSURE_AUTHORIZATION_REQUIRED');
  end if;
  select e.* into v_grant
  from public.privacy_consent_events e
  where e.user_id = p_worker_profile
    and e.purpose = 'employer_data_disclosure'
    and e.action = 'granted'
    and e.recipient_organization_id = p_recipient_organization_id
    and e.context_type = p_context_type
    and e.context_id = p_context_id
  order by e.created_at desc, e.id desc
  limit 1;
  if v_grant is null then
    return jsonb_build_object('ok', false, 'error', 'DISCLOSURE_AUTHORIZATION_REQUIRED');
  end if;
  if p_data_categories is null or cardinality(p_data_categories) < 1 then
    return jsonb_build_object('ok', false, 'error', 'empty_payload');
  end if;
  -- The actual payload may never be WIDER than what the worker approved.
  foreach v_cat in array p_data_categories loop
    if not exists (
      select 1 from jsonb_array_elements_text(v_grant.selected_fields) f where f = v_cat
    ) then
      return jsonb_build_object('ok', false, 'error', 'PAYLOAD_WIDER_THAN_CONSENT', 'category', v_cat);
    end if;
  end loop;
  insert into public.personal_data_disclosures
    (worker_user_id, recipient_organization_id, context_type, context_id,
     consent_event_id, data_categories, document_ids, disclosed_by, delivery_method)
  values
    (p_worker_profile, p_recipient_organization_id, p_context_type, p_context_id,
     v_grant.id, p_data_categories, p_document_ids, v_uid, p_delivery_method)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'disclosure_id', v_id);
end;
$$;

create or replace function public.admin_privacy_readiness_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total int;
  v_discoverable int;
  v_withdrawn int;
  v_stale int;
  v_awaiting int;
  v_active_disclosure_permissions int;
  v_completed_disclosures int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  select count(*) into v_total from public.workers w where w.profile_id is not null;
  select count(*) into v_discoverable
    from public.workers w
    where w.profile_id is not null and public.worker_profile_discoverable(w.profile_id);
  select count(*) into v_withdrawn
    from public.workers w
    where w.profile_id is not null and exists (
      select 1 from (
        select e.action
        from public.privacy_consent_events e
        where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
        order by e.created_at desc, e.id desc
        limit 1
      ) latest where latest.action = 'withdrawn'
    );
  select count(*) into v_stale
    from public.workers w
    where w.profile_id is not null
      and not public.worker_profile_discoverable(w.profile_id)
      and exists (
        select 1 from (
          select e.action, e.consent_text_version
          from public.privacy_consent_events e
          where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
          order by e.created_at desc, e.id desc
          limit 1
        ) latest
        join public.privacy_consent_purposes p on p.purpose = 'profile_discoverability'
        where latest.action = 'granted' and latest.consent_text_version <> p.current_version
      );
  v_awaiting := v_total - v_discoverable - v_withdrawn - v_stale;
  select count(*) into v_active_disclosure_permissions
    from (
      select distinct on (e.user_id, e.recipient_organization_id, e.context_type, e.context_id)
        e.action, e.consent_text_version
      from public.privacy_consent_events e
      where e.purpose = 'employer_data_disclosure'
      order by e.user_id, e.recipient_organization_id, e.context_type, e.context_id,
        e.created_at desc, e.id desc
    ) latest
    join public.privacy_consent_purposes p on p.purpose = 'employer_data_disclosure'
    where latest.action = 'granted' and latest.consent_text_version = p.current_version;
  select count(*) into v_completed_disclosures from public.personal_data_disclosures;
  return jsonb_build_object(
    'ok', true,
    'workersTotal', v_total,
    'discoverable', v_discoverable,
    'withdrawn', v_withdrawn,
    'staleVersion', v_stale,
    'awaitingChoice', v_awaiting,
    'activeDisclosurePermissions', v_active_disclosure_permissions,
    'completedDisclosures', v_completed_disclosures
  );
end;
$$;

create or replace function public.admin_list_worker_privacy_states()
returns table (profile_id uuid, discoverability text)
language sql
stable
security definer
set search_path = public
as $$
  -- Operator work view: CURRENT state only (never the history ledger).
  select w.profile_id,
    case
      when public.worker_profile_discoverable(w.profile_id) then 'granted'
      when exists (
        select 1 from (
          select e.action from public.privacy_consent_events e
          where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
          order by e.created_at desc, e.id desc limit 1
        ) latest where latest.action = 'withdrawn'
      ) then 'withdrawn'
      when exists (
        select 1 from public.privacy_consent_events e
        where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
      ) then 'granted_stale_version'
      else 'not_set'
    end
  from public.workers w
  where w.profile_id is not null
    and public.is_admin()
$$;

-- Grants: authenticated only, never anon/public.
revoke all on function public.grant_profile_discoverability_consent(text, text, text, text) from public;
revoke all on function public.grant_profile_discoverability_consent(text, text, text, text) from anon;
grant execute on function public.grant_profile_discoverability_consent(text, text, text, text) to authenticated;

revoke all on function public.withdraw_profile_discoverability_consent(text) from public;
revoke all on function public.withdraw_profile_discoverability_consent(text) from anon;
grant execute on function public.withdraw_profile_discoverability_consent(text) to authenticated;

revoke all on function public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb) from public;
revoke all on function public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb) from anon;
grant execute on function public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb) to authenticated;

revoke all on function public.withdraw_employer_data_disclosure(uuid, text, uuid, text) from public;
revoke all on function public.withdraw_employer_data_disclosure(uuid, text, uuid, text) from anon;
grant execute on function public.withdraw_employer_data_disclosure(uuid, text, uuid, text) to authenticated;

revoke all on function public.current_profile_discoverability_consent() from public;
revoke all on function public.current_profile_discoverability_consent() from anon;
grant execute on function public.current_profile_discoverability_consent() to authenticated;

revoke all on function public.my_privacy_consent_history() from public;
revoke all on function public.my_privacy_consent_history() from anon;
grant execute on function public.my_privacy_consent_history() to authenticated;

revoke all on function public.has_employer_data_disclosure(uuid, uuid, text, uuid) from public;
revoke all on function public.has_employer_data_disclosure(uuid, uuid, text, uuid) from anon;
grant execute on function public.has_employer_data_disclosure(uuid, uuid, text, uuid) to authenticated;

revoke all on function public.record_personal_data_disclosure(uuid, uuid, text, uuid, text[], uuid[], text) from public;
revoke all on function public.record_personal_data_disclosure(uuid, uuid, text, uuid, text[], uuid[], text) from anon;
grant execute on function public.record_personal_data_disclosure(uuid, uuid, text, uuid, text[], uuid[], text) to authenticated;

revoke all on function public.admin_privacy_readiness_counts() from public;
revoke all on function public.admin_privacy_readiness_counts() from anon;
grant execute on function public.admin_privacy_readiness_counts() to authenticated;

revoke all on function public.admin_list_worker_privacy_states() from public;
revoke all on function public.admin_list_worker_privacy_states() from anon;
grant execute on function public.admin_list_worker_privacy_states() to authenticated;

revoke all on function public.privacy_ledger_block_mutation() from public;
revoke all on function public.privacy_ledger_block_mutation() from anon;
revoke all on function public.privacy_ledger_block_mutation() from authenticated;

revoke all on function public.personal_data_disclosures_guard() from public;
revoke all on function public.personal_data_disclosures_guard() from anon;
revoke all on function public.personal_data_disclosures_guard() from authenticated;
