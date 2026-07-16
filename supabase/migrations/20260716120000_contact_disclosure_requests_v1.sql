-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER + grants + policies + trigger are the
-- intentional canonical pattern for RPC-only, RLS-default-closed request tables; reviewed in Train PR A;
-- the DRAFT header above stays authoritative — apply only via the owner process).
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- 20260716120000 — contact disclosure requests v1 (Wagon 1: worker discovery
-- and consent; SHARED CONTACT/CONSENT CONTRACT, integration addendum
-- 2026-07-16).
--
-- PROBLEM: the APPLIED consent spine (20260711130000) ships
-- grant_employer_data_disclosure / has_employer_data_disclosure, but no
-- surface ever ASKS the worker for a disclosure, so the RPC has zero callers
-- and no worker ever sees anything to grant. The applied `invitations` model
-- (20260712200000) does not fit: all 7 invitation types are email-keyed
-- join/collaboration invitations that terminate in a membership — not a
-- per-need contact-detail disclosure ask addressed to an existing worker.
--
-- SOLUTION: one narrow request row + an append-only event log, on the SHARED
-- CONTRACT status vocabulary:
--
--   created → accepted   (SUBJECT WORKER only)
--   created → declined   (subject worker only)
--   created → withdrawn  (requesting company only)
--   created → expired    (admin-only sweep RPC, or lazily on respond after
--                         expires_at; display logic treats past-expires_at
--                         rows as expired regardless)
--
-- `delivered` / `viewed` are NOT statuses — the events table's event_type
-- vocabulary carries the full 7-step lifecycle (created, delivered, viewed,
-- accepted, declined, withdrawn, expired) as append-only rows.
--
-- PII DISCLOSURE BOUNDARY (critical): ACCEPTING a request NEVER discloses
-- contact details by itself. Contact disclosure is a SEPARATE auditable
-- grant through the APPLIED grant_employer_data_disclosure RPC (append-only
-- privacy_consent_events ledger), presented to the worker as a distinct
-- second decision. This table carries field NAMES only, never contact
-- values; nothing here writes or reads the consent ledger.
--
-- Shared-contract mechanics:
--   * idempotency — unique partial index on (owner_id, request_id,
--     worker_id) WHERE status = 'created'; a duplicate create returns the
--     EXISTING request id, never a second row;
--   * expiry — expires_at = created_at + 14 days; expiry executed by the
--     admin-only sweep RPC below (no scheduler — owner-gated);
--   * rate limits — max 10 open + 30 per rolling 24h per requesting owner,
--     enforced INSIDE the create RPC (the app layer enforces the same);
--   * audit — every state change appends a *_events row (actor_profile_id,
--     event_type, from_status, to_status) AND an audit_logs row (canonical
--     invitations pattern);
--   * authorisation — SECURITY DEFINER RPCs only, RLS default-closed
--     (SELECT for requester / subject worker / admin; NO write policies);
--     only the target worker accepts/declines; only the requester withdraws.
--
-- FKs reference ONLY applied tables: profiles, organizations,
-- customer_requests, workers. Additive only. Rollback:
--   supabase/rollbacks/20260716120000_contact_disclosure_requests_v1.down.sql

-- ── 1. Request table ─────────────────────────────────────────────────
create table if not exists public.contact_disclosure_requests (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  request_id       uuid not null references public.customer_requests(id) on delete cascade,
  worker_id        uuid not null references public.workers(id) on delete cascade,
  status           text not null default 'created' check (status in
                     ('created','accepted','declined','withdrawn','expired')),
  requested_fields jsonb not null,
  note             text check (note is null or char_length(note) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  responded_at     timestamptz,
  expires_at       timestamptz not null default now() + interval '14 days'
);

comment on table public.contact_disclosure_requests is
  'Employer → worker ask for contact-detail disclosure, scoped to ONE demand (customer_requests) and ONE recipient organization. Carries field NAMES only, never contact values. Accepting NEVER discloses anything by itself — the disclosure grant is a separate act through the applied grant_employer_data_disclosure RPC (append-only privacy ledger).';

-- Idempotency (shared contract): ONE live 'created' ask per
-- (requester, demand, worker); history rows (declined/withdrawn/expired/
-- accepted) may accumulate.
create unique index if not exists contact_disclosure_requests_live_uniq
  on public.contact_disclosure_requests (owner_id, request_id, worker_id)
  where status = 'created';

create index if not exists contact_disclosure_requests_owner_idx
  on public.contact_disclosure_requests (owner_id, status, created_at desc);
create index if not exists contact_disclosure_requests_worker_idx
  on public.contact_disclosure_requests (worker_id, status, created_at desc);

-- ── 2. Append-only event log (full 7-step lifecycle vocabulary) ──────
create table if not exists public.contact_disclosure_request_events (
  id                            uuid primary key default gen_random_uuid(),
  contact_disclosure_request_id uuid not null
    references public.contact_disclosure_requests(id) on delete cascade,
  actor_profile_id              uuid not null references public.profiles(id),
  event_type                    text not null check (event_type in
                                  ('created','delivered','viewed','accepted',
                                   'declined','withdrawn','expired')),
  from_status                   text,
  to_status                     text not null,
  created_at                    timestamptz not null default now()
);

create index if not exists contact_disclosure_request_events_idx
  on public.contact_disclosure_request_events (contact_disclosure_request_id, created_at);

-- ── 3. RLS: requester-or-subject-or-admin read; RPC-only writes ──────
alter table public.contact_disclosure_requests enable row level security;
alter table public.contact_disclosure_request_events enable row level security;

drop policy if exists contact_disclosure_requests_select on public.contact_disclosure_requests;
create policy contact_disclosure_requests_select
  on public.contact_disclosure_requests for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.workers w
                where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists contact_disclosure_request_events_select on public.contact_disclosure_request_events;
create policy contact_disclosure_request_events_select
  on public.contact_disclosure_request_events for select to authenticated
  using (
    exists (select 1 from public.contact_disclosure_requests r
             where r.id = contact_disclosure_request_id
               and (r.owner_id = auth.uid()
                    or exists (select 1 from public.workers w
                                where w.id = r.worker_id and w.profile_id = auth.uid())))
    or public.is_admin()
  );
-- No INSERT/UPDATE/DELETE policies on either table: every write goes through
-- the SECURITY DEFINER RPCs below.

revoke all on public.contact_disclosure_requests from public;
revoke all on public.contact_disclosure_requests from anon;
grant select on public.contact_disclosure_requests to authenticated;

revoke all on public.contact_disclosure_request_events from public;
revoke all on public.contact_disclosure_request_events from anon;
grant select on public.contact_disclosure_request_events to authenticated;

-- Events are append-only for every role (same trigger pattern as the
-- privacy ledger).
create or replace function public.contact_disclosure_events_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'contact disclosure event log is append-only: % on % is not allowed',
    tg_op, tg_table_name;
end;
$$;

drop trigger if exists contact_disclosure_request_events_append_only
  on public.contact_disclosure_request_events;
create trigger contact_disclosure_request_events_append_only
  before update or delete on public.contact_disclosure_request_events
  for each row execute function public.contact_disclosure_events_block_mutation();

revoke all on function public.contact_disclosure_events_block_mutation() from public;
revoke all on function public.contact_disclosure_events_block_mutation() from anon;
revoke all on function public.contact_disclosure_events_block_mutation() from authenticated;

-- Shared helper: one event row + one audit_logs row per state change.
create or replace function public.contact_disclosure_log_change(
  p_request_id uuid,
  p_actor uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_action text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.contact_disclosure_request_events
      (contact_disclosure_request_id, actor_profile_id, event_type, from_status, to_status)
    values (p_request_id, p_actor, p_event_type, p_from_status, p_to_status);
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (p_actor, p_action, 'contact_disclosure_requests', p_request_id,
      jsonb_build_object('event_type', p_event_type,
        'from_status', p_from_status, 'to_status', p_to_status));
end;
$$;

revoke all on function public.contact_disclosure_log_change(uuid, uuid, text, text, text, text) from public;
revoke all on function public.contact_disclosure_log_change(uuid, uuid, text, text, text, text) from anon;
revoke all on function public.contact_disclosure_log_change(uuid, uuid, text, text, text, text) from authenticated;

-- ── 4. propose_contact_disclosure_request_v1 (company) ───────────────
create or replace function public.propose_contact_disclosure_request_v1(
  p_request_id       uuid,
  p_worker_id        uuid,
  p_organization_id  uuid,
  p_requested_fields jsonb,
  p_note             text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_field      text;
  v_count      int;
  v_open       int;
  v_day        int;
  v_live       public.contact_disclosure_requests%rowtype;
  v_id         uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Caller must OWN the demand this ask is scoped to.
  if not exists (select 1 from public.customer_requests cr
                  where cr.id = p_request_id and cr.profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_your_demand');
  end if;

  -- Caller must own or manage the recipient organization it asks AS.
  if p_organization_id is null or not exists (
    select 1 from public.organizations o
     where o.id = p_organization_id
       and (o.owner_profile_id = v_uid or public.manages_organization(o.id))
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_your_organization');
  end if;

  -- The worker must exist AND be currently visible to the caller (fail
  -- closed — a hidden worker can never be probed through this ask).
  if not exists (select 1 from public.workers w where w.id = p_worker_id)
     or not public.can_view_worker(p_worker_id) then
    return jsonb_build_object('ok', false, 'error', 'worker_not_visible');
  end if;

  -- Closed field whitelist (exactly the applied disclosure whitelist);
  -- non-empty, deduplicated, capped at 7.
  if p_requested_fields is null or jsonb_typeof(p_requested_fields) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_requested_fields');
  end if;
  select count(*) into v_count from jsonb_array_elements_text(p_requested_fields);
  if v_count < 1 or v_count > 7
    or v_count <> (select count(distinct t) from jsonb_array_elements_text(p_requested_fields) t)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_requested_fields');
  end if;
  for v_field in select t from jsonb_array_elements_text(p_requested_fields) t loop
    if v_field not in ('full_name', 'phone', 'email', 'cv_document',
                       'preferred_locations', 'availability_details', 'salary_expectation')
    then
      return jsonb_build_object('ok', false, 'error', 'field_not_allowed', 'field', v_field);
    end if;
  end loop;

  -- Free-text message bounded (shared contract: <= 500 chars).
  if p_note is not null and char_length(p_note) > 500 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long');
  end if;

  -- IDEMPOTENCY (shared contract): a live 'created' ask for this exact
  -- (requester, demand, worker) returns the EXISTING row — never a second.
  select * into v_live from public.contact_disclosure_requests
   where owner_id = v_uid and request_id = p_request_id
     and worker_id = p_worker_id and status = 'created'
   for update;
  if v_live.id is not null then
    if v_live.expires_at > now() then
      return jsonb_build_object('ok', true, 'status', 'created',
        'request_id', v_live.id, 'deduplicated', true);
    end if;
    -- Lazily expire the stale live row so a fresh ask can be created.
    update public.contact_disclosure_requests
       set status = 'expired', updated_at = now()
     where id = v_live.id;
    perform public.contact_disclosure_log_change(
      v_live.id, v_uid, 'expired', 'created', 'expired',
      'expire_contact_disclosure_request_lazy_v1');
  end if;

  -- A previously ACCEPTED ask stays the answer — no re-ask spam.
  if exists (select 1 from public.contact_disclosure_requests
              where owner_id = v_uid and request_id = p_request_id
                and worker_id = p_worker_id and status = 'accepted') then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  -- Abuse caps (shared contract; the app layer enforces the same numbers):
  -- 10 open 'created' asks, 30 created in the rolling last 24 hours.
  select count(*) into v_open from public.contact_disclosure_requests
   where owner_id = v_uid and status = 'created' and expires_at > now();
  if v_open >= 10 then
    return jsonb_build_object('ok', false, 'error', 'limit_reached');
  end if;
  select count(*) into v_day from public.contact_disclosure_requests
   where owner_id = v_uid and created_at > now() - interval '24 hours';
  if v_day >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.contact_disclosure_requests
      (owner_id, organization_id, request_id, worker_id, requested_fields, note)
    values (v_uid, p_organization_id, p_request_id, p_worker_id,
            p_requested_fields, nullif(trim(coalesce(p_note, '')), ''))
    returning id into v_id;

  perform public.contact_disclosure_log_change(
    v_id, v_uid, 'created', null, 'created',
    'propose_contact_disclosure_request_v1');

  return jsonb_build_object('ok', true, 'status', 'created', 'request_id', v_id);
end;
$$;

revoke all on function public.propose_contact_disclosure_request_v1(uuid, uuid, uuid, jsonb, text) from public;
revoke all on function public.propose_contact_disclosure_request_v1(uuid, uuid, uuid, jsonb, text) from anon;
grant execute on function public.propose_contact_disclosure_request_v1(uuid, uuid, uuid, jsonb, text) to authenticated;

-- ── 5. respond_contact_disclosure_request_v1 (subject worker) ────────
-- Accept / decline the ASK only. Accepting discloses NOTHING: the contact
-- disclosure itself is a SEPARATE act via the applied
-- grant_employer_data_disclosure RPC (a distinct worker decision).
create or replace function public.respond_contact_disclosure_request_v1(
  p_id       uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.contact_disclosure_requests%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_decision not in ('accepted', 'declined') then
    return jsonb_build_object('ok', false, 'error', 'invalid_decision');
  end if;

  select * into v_row from public.contact_disclosure_requests
   where id = p_id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Only the SUBJECT worker may answer.
  if not exists (select 1 from public.workers w
                  where w.id = v_row.worker_id and w.profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_the_subject_worker');
  end if;

  if v_row.status <> 'created' then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'status', v_row.status);
  end if;

  if v_row.expires_at <= now() then
    update public.contact_disclosure_requests
       set status = 'expired', updated_at = now()
     where id = v_row.id;
    perform public.contact_disclosure_log_change(
      v_row.id, v_uid, 'expired', 'created', 'expired',
      'expire_contact_disclosure_request_lazy_v1');
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update public.contact_disclosure_requests
     set status = p_decision, responded_at = now(), updated_at = now()
   where id = v_row.id;

  perform public.contact_disclosure_log_change(
    v_row.id, v_uid, p_decision, 'created', p_decision,
    'respond_contact_disclosure_request_v1');

  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

revoke all on function public.respond_contact_disclosure_request_v1(uuid, text) from public;
revoke all on function public.respond_contact_disclosure_request_v1(uuid, text) from anon;
grant execute on function public.respond_contact_disclosure_request_v1(uuid, text) to authenticated;

-- ── 6. withdraw_contact_disclosure_request_v1 (company) ──────────────
create or replace function public.withdraw_contact_disclosure_request_v1(
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.contact_disclosure_requests%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_row from public.contact_disclosure_requests
   where id = p_id for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_row.owner_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if v_row.status <> 'created' then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'status', v_row.status);
  end if;

  update public.contact_disclosure_requests
     set status = 'withdrawn', responded_at = now(), updated_at = now()
   where id = v_row.id;
  perform public.contact_disclosure_log_change(
    v_row.id, v_uid, 'withdrawn', 'created', 'withdrawn',
    'withdraw_contact_disclosure_request_v1');
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

revoke all on function public.withdraw_contact_disclosure_request_v1(uuid) from public;
revoke all on function public.withdraw_contact_disclosure_request_v1(uuid) from anon;
grant execute on function public.withdraw_contact_disclosure_request_v1(uuid) to authenticated;

-- ── 7. expire_contact_disclosure_requests_v1 (admin-only sweep) ──────
-- Shared contract: expiry is executed by an admin-only sweep (no scheduler —
-- owner-gated). Display logic already treats past-expires_at rows honestly
-- as expired, so a delayed sweep never fakes an open ask.
create or replace function public.expire_contact_disclosure_requests_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_n   int := 0;
begin
  if v_uid is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  for v_row in
    select id from public.contact_disclosure_requests
     where status = 'created' and expires_at <= now()
     for update
  loop
    update public.contact_disclosure_requests
       set status = 'expired', updated_at = now()
     where id = v_row.id;
    perform public.contact_disclosure_log_change(
      v_row.id, v_uid, 'expired', 'created', 'expired',
      'expire_contact_disclosure_requests_v1');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'expired_count', v_n);
end;
$$;

revoke all on function public.expire_contact_disclosure_requests_v1() from public;
revoke all on function public.expire_contact_disclosure_requests_v1() from anon;
grant execute on function public.expire_contact_disclosure_requests_v1() to authenticated;

-- ── 8. list_my_contact_disclosure_requests_v1 (subject worker inbox) ──
-- SECURITY DEFINER so the worker sees the requesting organization's NAME and
-- the demand TITLE (both tables are otherwise owner-scoped) — names only,
-- never the requester's contact data. Also reports whether the SEPARATE
-- disclosure grant already exists in the applied consent ledger (read-only
-- via has_employer_data_disclosure). Bounded to 50 rows.
create or replace function public.list_my_contact_disclosure_requests_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_items
    from (
      select jsonb_build_object(
        'id', r.id,
        'status', case when r.status = 'created' and r.expires_at <= now()
                       then 'expired' else r.status end,
        'requested_fields', r.requested_fields,
        'note', r.note,
        'created_at', r.created_at,
        'responded_at', r.responded_at,
        'organization_id', r.organization_id,
        'request_id', r.request_id,
        'organization_name', (select coalesce(o.display_name, o.legal_name)
                                from public.organizations o
                               where o.id = r.organization_id),
        'need_title', (select cr.title from public.customer_requests cr
                        where cr.id = r.request_id),
        'disclosure_granted', public.has_employer_data_disclosure(
          v_uid, r.organization_id, 'company_need', r.request_id)
      ) as item
      from public.contact_disclosure_requests r
      join public.workers w on w.id = r.worker_id
      where w.profile_id = v_uid
      order by r.created_at desc
      limit 50
    ) sub;
  return jsonb_build_object('ok', true, 'items', v_items);
end;
$$;

revoke all on function public.list_my_contact_disclosure_requests_v1() from public;
revoke all on function public.list_my_contact_disclosure_requests_v1() from anon;
grant execute on function public.list_my_contact_disclosure_requests_v1() to authenticated;

-- ROLLBACK: supabase/rollbacks/20260716120000_contact_disclosure_requests_v1.down.sql
