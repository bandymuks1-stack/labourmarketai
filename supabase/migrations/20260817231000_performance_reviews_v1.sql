-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/performance-reviews-gate.md
-- Rollback:  supabase/rollbacks/20260817231000_performance_reviews_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + triggers are RED-class; there is no
-- non-RED way to add a row-level-secured register). Annotation pre-approved
-- by owner mandate 2026-08-17 (autonomous functional completion train V2,
-- §4 migration authority). SAFETY CLASS: RED — 4 new tables, 1 visibility
-- helper + 7 new SECURITY DEFINER commands, 2 append-only / fill-once
-- trigger guards, EXECUTE grants. ZERO existing table, column, constraint,
-- policy, grant, trigger or function is modified or recreated. ZERO DML at
-- apply time. Prod apply stays manual by the LEAD session.
--
-- 20260817231000 — Development & Performance Reviews v1.
--
-- PROBLEM (full reality audit 2026-08-17, OPERATIONS): `performance` is
-- MISSING, and the audit records WHY — the product's doctrine is "record
-- count, never a competence score". That doctrine rules out the usual
-- performance module; it does not rule out the honest half of it: an
-- organization still needs a recorded, evidence-linked development
-- conversation with a follow-up plan.
--
-- BINDING DOCTRINE — what this module may never become:
--   * NO star ratings. NO 1-5 scales. NO universal worker score. NO AI
--     ranking. NO competence score. NO numeric assessment column of ANY
--     name exists in this schema, and a guard test
--     (apps/web/lib/guards/development-reviews.test.ts) parses this file
--     and FAILS if a rating/score/grade/rank/stars column ever appears.
--   * The three information classes are kept apart and labelled as such:
--       FACT       — recorded events: who opened the cycle, when the review
--                    was created, when each input was saved, when it closed.
--                    Server-stamped, append-only, never editable prose.
--       EVIDENCE   — review_evidence_links: pointers to REAL rows that
--                    already exist elsewhere (a journal entry, a skill, a
--                    project, a training assignment). Existence and
--                    relevance are re-checked server-side; nothing is
--                    summarised, scored or inferred.
--       SUBJECTIVE — worker_input / manager_input / development_plan: free
--         OBSERVATION  text, each written by ONE named person, stored with
--                    that person's id and the time they wrote it, and
--                    rendered in the UI under an explicit "subjective
--                    observation by <name>" label. The schema never
--                    promotes this text into a fact or a measure.
--   * NO AI anywhere: no model call, no generated text, no suggestion.
--
-- SOLUTION (smallest honest slice):
--   * review_cycles — an org owner/admin opens a named period.
--   * performance_reviews — one subject, one reviewer, one cycle; the two
--     inputs and the development plan, each with its own author + timestamp.
--   * review_evidence_links — the EVIDENCE class, four closed kinds.
--   * performance_review_events — append-only audit ledger (trigger-enforced).
--
-- WHY THE TABLE IS STILL CALLED performance_reviews: it is the term an
-- employer searches for, and renaming it would not change what it holds.
-- What it holds is constrained by the schema above, not by its name.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO score/rating/grade/rank column, in any spelling (guard-enforced).
--   - NO calibration, NO ranking, NO distribution, NO comparison across
--     people, NO org-wide leaderboard.
--   - NO approval fork: if an organization wants a review closed under an
--     approval chain, that is the EXISTING workflow engine's job.
--   - NO notification constraint change (no new event type invented).
--   - NO AI, NO external sending.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     review_cycles: any ACTIVE member of the org, or platform admin (a
--       cycle carries no personal content — only a name and a period).
--     performance_reviews / _evidence_links / _events: the SUBJECT (their
--       own review), the REVIEWER, the org's governance owner/admin
--       (org_owner_admin_v1), or platform admin — ONE definer predicate,
--       review_can_view_v1, shared by three tables. A plain member with no
--       relationship to the review sees NOTHING; a manager who is not the
--       reviewer sees NOTHING unless they are owner/admin. This is
--       deliberately NARROWER than has_org_demand_access: a development
--       conversation is not org-wide reading material.
--     Writes: NO insert/update/delete policy on ANY table and an explicit
--       REVOKE — the 7 gated commands are the only write paths.
--   service_role:   untouched default.
--
-- ROLLBACK: supabase/rollbacks/20260817231000_performance_reviews_v1.down.sql
-- refuses while real rows exist (0-row guard), then drops the 2 triggers,
-- 8 new functions and 4 new tables.
-- ============================================================================

begin;

-- ── 0. Safety assertions ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'organizations missing — this environment predates the org spine';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'org_owner_admin_v1'
  ) then
    raise exception 'org_owner_admin_v1 missing — apply 20260817140000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
end $$;

-- ── 1. Tables ──────────────────────────────────────────────────────────────

-- 1a. A named period. Carries NO personal content by construction.
create table if not exists public.review_cycles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(trim(name)) >= 3 and char_length(name) <= 120),
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'draft' check (status in ('draft','open','closed')),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint review_cycles_org_name_uq unique (organization_id, name),
  constraint review_cycles_period_order check (period_end >= period_start)
);
create index if not exists review_cycles_org_idx
  on public.review_cycles (organization_id, period_start desc);

-- 1b. ONE recorded development conversation.
--
-- NOTE FOR ANY FUTURE EDITOR: this table must never gain a numeric
-- assessment column. `apps/web/lib/guards/development-reviews.test.ts`
-- parses this file and fails on rating/score/grade/rank/stars/points.
create table if not exists public.performance_reviews (
  id                   uuid primary key default gen_random_uuid(),
  cycle_id             uuid not null references public.review_cycles(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  subject_profile_id   uuid not null references public.profiles(id) on delete cascade,
  reviewer_profile_id  uuid not null references public.profiles(id) on delete cascade,
  status               text not null default 'draft'
                         check (status in ('draft','open','closed')),

  -- SUBJECTIVE OBSERVATION — written by the SUBJECT about their own work.
  worker_input         text check (worker_input is null or char_length(worker_input) <= 4000),
  worker_input_at      timestamptz,

  -- SUBJECTIVE OBSERVATION — written by the REVIEWER, a named person.
  manager_input        text check (manager_input is null or char_length(manager_input) <= 4000),
  manager_input_at     timestamptz,
  manager_input_by     uuid references public.profiles(id),

  -- The agreed plan. Also authored prose, not a measurement.
  development_plan     text check (development_plan is null or char_length(development_plan) <= 4000),
  follow_up_date       date,

  closed_at            timestamptz,
  created_by           uuid not null references public.profiles(id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint performance_reviews_once unique (cycle_id, subject_profile_id),
  -- A person does not review themselves: an honest record names two people.
  constraint performance_reviews_distinct_parties
    check (subject_profile_id <> reviewer_profile_id),
  constraint performance_reviews_closed_shape check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed' and closed_at is null)
  ),
  constraint performance_reviews_worker_input_stamp
    check ((worker_input is null) = (worker_input_at is null)),
  constraint performance_reviews_manager_input_stamp
    check ((manager_input is null) = (manager_input_at is null)
           and (manager_input is null) = (manager_input_by is null))
);
create index if not exists performance_reviews_subject_idx
  on public.performance_reviews (subject_profile_id, created_at desc);
create index if not exists performance_reviews_reviewer_idx
  on public.performance_reviews (reviewer_profile_id, created_at desc);
create index if not exists performance_reviews_cycle_idx
  on public.performance_reviews (cycle_id, status);

comment on column public.performance_reviews.worker_input is
  'SUBJECTIVE OBSERVATION written by the subject. Free text by one named person at one recorded time — never a measurement, never scored, never compared.';
comment on column public.performance_reviews.manager_input is
  'SUBJECTIVE OBSERVATION written by the reviewer (author id + time stored beside it). Never a measurement, never scored, never compared.';
comment on table public.performance_reviews is
  'Recorded development conversation. FACT (stamps) / EVIDENCE (review_evidence_links) / SUBJECTIVE OBSERVATION (the two inputs + plan) are separate by construction. NO rating, score, grade, rank or competence measure exists in this schema, by doctrine.';

-- 1c. EVIDENCE — pointers to rows that already exist elsewhere.
create table if not exists public.review_evidence_links (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.performance_reviews(id) on delete cascade,
  kind       text not null check (kind in
               ('journal_entry','skill','project','training_assignment')),
  ref_id     uuid not null,
  note       text check (note is null or char_length(note) <= 500),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint review_evidence_links_once unique (review_id, kind, ref_id)
);
create index if not exists review_evidence_links_review_idx
  on public.review_evidence_links (review_id, created_at);

comment on table public.review_evidence_links is
  'EVIDENCE class: pointers only. Deliberately polymorphic (four different owning tables), so existence and same-subject relevance are re-checked server-side inside add_review_evidence_link_v1 instead of by a foreign key.';

-- 1d. Append-only audit ledger.
create table if not exists public.performance_review_events (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.performance_reviews(id) on delete cascade,
  actor_id   uuid not null references public.profiles(id),
  event_type text not null check (event_type in
               ('created','opened','worker_input_saved','manager_input_saved',
                'evidence_linked','closed')),
  metadata   jsonb not null default '{}'::jsonb
               check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now()
);
create index if not exists performance_review_events_review_idx
  on public.performance_review_events (review_id, created_at);

comment on table public.performance_review_events is
  'APPEND-ONLY review audit ledger (the FACT class). Rows are immutable, trigger-enforced for every role incl. service_role. It records THAT something happened and by whom — never a judgement.';

-- ── 2. Trigger guards ──────────────────────────────────────────────────────

-- 2a. The event ledger is append-only forever.
create or replace function public.performance_review_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'performance_review_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists performance_review_events_append_only on public.performance_review_events;
create trigger performance_review_events_append_only
  before update or delete on public.performance_review_events
  for each row execute function public.performance_review_events_guard();

-- 2b. Identity is immutable and a CLOSED review is frozen — a recorded
-- conversation cannot be quietly rewritten after the fact.
create or replace function public.performance_review_immutability_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.cycle_id is distinct from old.cycle_id
    or new.organization_id is distinct from old.organization_id
    or new.subject_profile_id is distinct from old.subject_profile_id
  then
    raise exception 'performance review identity is immutable';
  end if;
  if old.closed_at is not null then
    raise exception 'a closed performance review is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists performance_reviews_immutable_when_closed on public.performance_reviews;
create trigger performance_reviews_immutable_when_closed
  before update on public.performance_reviews
  for each row execute function public.performance_review_immutability_guard();

-- ── 3. Visibility helper ───────────────────────────────────────────────────
-- Subject, reviewer, org governance owner/admin, platform admin. NOTHING
-- else — deliberately narrower than has_org_demand_access.
create or replace function public.review_can_view_v1(p_review_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.performance_reviews r
     where r.id = p_review_id
       and (
         r.subject_profile_id = auth.uid()
         or r.reviewer_profile_id = auth.uid()
         or public.org_owner_admin_v1(r.organization_id)
         or public.is_admin()
       )
  )
$$;
revoke all on function public.review_can_view_v1(uuid) from public;
revoke all on function public.review_can_view_v1(uuid) from anon;
grant execute on function public.review_can_view_v1(uuid) to authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────

alter table public.review_cycles enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.review_evidence_links enable row level security;
alter table public.performance_review_events enable row level security;

revoke all on public.review_cycles,
              public.performance_reviews,
              public.review_evidence_links,
              public.performance_review_events
  from public;
revoke all on public.review_cycles,
              public.performance_reviews,
              public.review_evidence_links,
              public.performance_review_events
  from anon;
revoke all on public.review_cycles,
              public.performance_reviews,
              public.review_evidence_links,
              public.performance_review_events
  from authenticated;
grant select on public.review_cycles,
                public.performance_reviews,
                public.review_evidence_links,
                public.performance_review_events
  to authenticated;

drop policy if exists review_cycles_select on public.review_cycles;
create policy review_cycles_select on public.review_cycles
  for select to authenticated
  using (public.belongs_to_organization(organization_id) or public.is_admin());

drop policy if exists performance_reviews_select on public.performance_reviews;
create policy performance_reviews_select on public.performance_reviews
  for select to authenticated
  using (public.review_can_view_v1(id));

drop policy if exists review_evidence_links_select on public.review_evidence_links;
create policy review_evidence_links_select on public.review_evidence_links
  for select to authenticated
  using (public.review_can_view_v1(review_id));

drop policy if exists performance_review_events_select on public.performance_review_events;
create policy performance_review_events_select on public.performance_review_events
  for select to authenticated
  using (public.review_can_view_v1(review_id));

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_review_cycle_v1 — org owner/admin opens a named period.
create or replace function public.create_review_cycle_v1(
  p_organization_id text,
  p_name            text,
  p_period_start    text,
  p_period_end      text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_org  uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_from date;
  v_to   date;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;
  if not public.org_owner_admin_v1(v_org) and not public.is_admin() then
    return 'not_authorized';
  end if;
  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 120 then
    return 'invalid';
  end if;
  begin
    v_from := nullif(trim(coalesce(p_period_start, '')), '')::date;
    v_to   := nullif(trim(coalesce(p_period_end, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;
  if v_from is null or v_to is null or v_to < v_from then return 'invalid'; end if;

  if (select count(*) from public.review_cycles c
       where c.organization_id = v_org) >= 100 then
    return 'limit_reached';
  end if;

  begin
    insert into public.review_cycles
      (organization_id, name, period_start, period_end, created_by)
    values (v_org, v_name, v_from, v_to, uid);
  exception when unique_violation then
    return 'already_exists';
  end;

  return 'created';
end $$;
revoke all on function public.create_review_cycle_v1(text, text, text, text) from public;
revoke all on function public.create_review_cycle_v1(text, text, text, text) from anon;
grant execute on function public.create_review_cycle_v1(text, text, text, text) to authenticated;

-- 5b. set_review_cycle_status_v1 — draft → open → closed, forward only.
create or replace function public.set_review_cycle_status_v1(
  p_cycle_id text,
  p_status   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_next text := nullif(trim(lower(coalesce(p_status, ''))), '');
  c      public.review_cycles%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_cycle_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_next is null or v_next not in ('open','closed') then return 'invalid'; end if;

  select * into c from public.review_cycles rc where rc.id = v_id for update;
  if c.id is null
     or (not public.org_owner_admin_v1(c.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  if c.status = v_next then return 'unchanged'; end if;
  -- Forward only: a closed period is not reopened.
  if c.status = 'closed' then return 'invalid_state'; end if;
  if v_next = 'closed' and c.status <> 'open' then return 'invalid_state'; end if;

  update public.review_cycles
     set status = v_next, updated_at = now()
   where id = c.id;

  return 'updated';
end $$;
revoke all on function public.set_review_cycle_status_v1(text, text) from public;
revoke all on function public.set_review_cycle_status_v1(text, text) from anon;
grant execute on function public.set_review_cycle_status_v1(text, text) to authenticated;

-- 5c. create_performance_review_v1 — org owner/admin opens ONE review for a
-- named subject inside an OPEN cycle. The reviewer is a named person from
-- the same organization; the subject is addressed by email (no oracle).
create or replace function public.create_performance_review_v1(
  p_cycle_id       text,
  p_subject_email  text,
  p_reviewer_email text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid;
  v_subject  uuid;
  v_reviewer uuid;
  c          public.review_cycles%rowtype;
  v_new      uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_cycle_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if nullif(trim(coalesce(p_subject_email, '')), '') is null then return 'invalid'; end if;

  select * into c from public.review_cycles rc where rc.id = v_id;
  if c.id is null
     or (not public.org_owner_admin_v1(c.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  if c.status <> 'open' then return 'invalid_state'; end if;

  select p.id into v_subject from public.profiles p
   where lower(p.email) = lower(trim(p_subject_email)) limit 1;
  if v_subject is null or not exists (
    select 1 from public.company_memberships m
     where m.profile_id = v_subject
       and m.organization_id = c.organization_id
       and m.status = 'active'
  ) then
    return 'invalid_subject';
  end if;

  if nullif(trim(coalesce(p_reviewer_email, '')), '') is null then
    v_reviewer := uid;
  else
    select p.id into v_reviewer from public.profiles p
     where lower(p.email) = lower(trim(p_reviewer_email)) limit 1;
  end if;
  if v_reviewer is null or not exists (
    select 1 from public.company_memberships m
     where m.profile_id = v_reviewer
       and m.organization_id = c.organization_id
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  ) then
    return 'invalid_reviewer';
  end if;
  -- An honest record names two people.
  if v_reviewer = v_subject then return 'invalid_reviewer'; end if;

  begin
    insert into public.performance_reviews
      (cycle_id, organization_id, subject_profile_id, reviewer_profile_id,
       status, created_by)
    values (c.id, c.organization_id, v_subject, v_reviewer, 'open', uid)
    returning id into v_new;
  exception when unique_violation then
    return 'already_exists';
  end;

  insert into public.performance_review_events (review_id, actor_id, event_type)
  values (v_new, uid, 'created'), (v_new, uid, 'opened');

  return 'created';
end $$;
revoke all on function public.create_performance_review_v1(text, text, text) from public;
revoke all on function public.create_performance_review_v1(text, text, text) from anon;
grant execute on function public.create_performance_review_v1(text, text, text) to authenticated;

-- 5d. save_review_worker_input_v1 — the SUBJECT writes their own subjective
-- observation. Self-only: nobody writes this text on somebody else's behalf.
create or replace function public.save_review_worker_input_v1(
  p_review_id text,
  p_text      text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_text text := nullif(left(trim(coalesce(p_text, '')), 4000), '');
  r      public.performance_reviews%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_review_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_text is null then return 'invalid'; end if;

  select * into r from public.performance_reviews pr where pr.id = v_id for update;
  -- Merged: missing row and somebody else's review answer the same.
  if r.id is null or r.subject_profile_id <> uid then return 'not_found'; end if;
  if r.closed_at is not null then return 'invalid_state'; end if;

  update public.performance_reviews
     set worker_input = v_text, worker_input_at = now(), updated_at = now()
   where id = r.id;

  insert into public.performance_review_events (review_id, actor_id, event_type)
  values (r.id, uid, 'worker_input_saved');

  return 'saved';
end $$;
revoke all on function public.save_review_worker_input_v1(text, text) from public;
revoke all on function public.save_review_worker_input_v1(text, text) from anon;
grant execute on function public.save_review_worker_input_v1(text, text) to authenticated;

-- 5e. save_review_manager_input_v1 — the REVIEWER (or org owner/admin)
-- writes their subjective observation and the development plan. The author
-- id is server-stamped so the UI can always name who wrote it.
create or replace function public.save_review_manager_input_v1(
  p_review_id        text,
  p_manager_input    text default null,
  p_development_plan text default null,
  p_follow_up_date   text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid;
  v_input  text := nullif(left(trim(coalesce(p_manager_input, '')), 4000), '');
  v_plan   text := nullif(left(trim(coalesce(p_development_plan, '')), 4000), '');
  v_follow date;
  r        public.performance_reviews%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_review_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_input is null and v_plan is null
     and nullif(trim(coalesce(p_follow_up_date, '')), '') is null then
    return 'invalid';
  end if;
  begin
    v_follow := nullif(trim(coalesce(p_follow_up_date, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;

  select * into r from public.performance_reviews pr where pr.id = v_id for update;
  if r.id is null
     or (r.reviewer_profile_id <> uid
         and not public.org_owner_admin_v1(r.organization_id)
         and not public.is_admin()) then
    return 'not_found';
  end if;
  if r.closed_at is not null then return 'invalid_state'; end if;

  update public.performance_reviews
     set manager_input    = coalesce(v_input, manager_input),
         manager_input_at = case when v_input is null then manager_input_at else now() end,
         manager_input_by = case when v_input is null then manager_input_by else uid end,
         development_plan = coalesce(v_plan, development_plan),
         follow_up_date   = coalesce(v_follow, follow_up_date),
         updated_at       = now()
   where id = r.id;

  insert into public.performance_review_events (review_id, actor_id, event_type)
  values (r.id, uid, 'manager_input_saved');

  return 'saved';
end $$;
revoke all on function public.save_review_manager_input_v1(text, text, text, text) from public;
revoke all on function public.save_review_manager_input_v1(text, text, text, text) from anon;
grant execute on function public.save_review_manager_input_v1(text, text, text, text) to authenticated;

-- 5f. add_review_evidence_link_v1 — the EVIDENCE class. Every reference is
-- re-checked server-side: the row must EXIST and must genuinely belong to
-- the review's subject / organization. An arbitrary uuid is refused, so the
-- link list can never become a decoration.
create or replace function public.add_review_evidence_link_v1(
  p_review_id text,
  p_kind      text,
  p_ref_id    text,
  p_note      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_ref  uuid;
  v_kind text := nullif(trim(lower(coalesce(p_kind, ''))), '');
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  r      public.performance_reviews%rowtype;
  v_ok   boolean := false;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id  := nullif(trim(coalesce(p_review_id, '')), '')::uuid;
    v_ref := nullif(trim(coalesce(p_ref_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_ref is null then return 'invalid'; end if;
  if v_kind is null or v_kind not in
     ('journal_entry','skill','project','training_assignment') then
    return 'invalid';
  end if;

  select * into r from public.performance_reviews pr where pr.id = v_id;
  if r.id is null
     or (r.reviewer_profile_id <> uid
         and r.subject_profile_id <> uid
         and not public.org_owner_admin_v1(r.organization_id)
         and not public.is_admin()) then
    return 'not_found';
  end if;
  if r.closed_at is not null then return 'invalid_state'; end if;

  -- Existence + relevance, per kind.
  if v_kind = 'journal_entry' then
    select exists (
      select 1
        from public.journal_entries je
        join public.workers w on w.id = je.worker_id
       where je.id = v_ref and w.profile_id = r.subject_profile_id
    ) into v_ok;
  elsif v_kind = 'skill' then
    select exists (select 1 from public.skills s where s.id = v_ref) into v_ok;
  elsif v_kind = 'project' then
    select exists (
      select 1
        from public.projects pj
        join public.organizations o on o.legacy_company_id = pj.company_id
       where pj.id = v_ref and o.id = r.organization_id
    ) into v_ok;
  elsif v_kind = 'training_assignment' then
    if to_regclass('public.training_assignments') is null then
      return 'invalid_reference';
    end if;
    select exists (
      select 1 from public.training_assignments ta
       where ta.id = v_ref
         and ta.assignee_profile_id = r.subject_profile_id
         and ta.organization_id = r.organization_id
    ) into v_ok;
  end if;
  if not v_ok then return 'invalid_reference'; end if;

  if (select count(*) from public.review_evidence_links l
       where l.review_id = r.id) >= 100 then
    return 'limit_reached';
  end if;

  begin
    insert into public.review_evidence_links (review_id, kind, ref_id, note, created_by)
    values (r.id, v_kind, v_ref, v_note, uid);
  exception when unique_violation then
    return 'already_linked';
  end;

  insert into public.performance_review_events (review_id, actor_id, event_type, metadata)
  values (r.id, uid, 'evidence_linked',
          jsonb_build_object('kind', v_kind, 'ref_id', v_ref::text));

  return 'linked';
end $$;
revoke all on function public.add_review_evidence_link_v1(text, text, text, text) from public;
revoke all on function public.add_review_evidence_link_v1(text, text, text, text) from anon;
grant execute on function public.add_review_evidence_link_v1(text, text, text, text) to authenticated;

-- 5g. close_performance_review_v1 — the reviewer (or org owner/admin)
-- freezes the record. After this the trigger guard refuses every update.
create or replace function public.close_performance_review_v1(
  p_review_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_id uuid;
  r    public.performance_reviews%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_review_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select * into r from public.performance_reviews pr where pr.id = v_id for update;
  if r.id is null
     or (r.reviewer_profile_id <> uid
         and not public.org_owner_admin_v1(r.organization_id)
         and not public.is_admin()) then
    return 'not_found';
  end if;
  if r.closed_at is not null then return 'already_closed'; end if;
  -- Both voices must be on the record before it is frozen: a "development
  -- conversation" with only the manager's text is not a conversation.
  if r.worker_input is null or r.manager_input is null then
    return 'inputs_missing';
  end if;

  update public.performance_reviews
     set status = 'closed', closed_at = now(), updated_at = now()
   where id = r.id and closed_at is null;

  insert into public.performance_review_events (review_id, actor_id, event_type)
  values (r.id, uid, 'closed');

  return 'closed';
end $$;
revoke all on function public.close_performance_review_v1(text) from public;
revoke all on function public.close_performance_review_v1(text) from anon;
grant execute on function public.close_performance_review_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817231000_performance_reviews_v1.down.sql
-- refuses while real rows exist (0-row guard), then drops the 2 triggers,
-- 8 new functions and 4 new tables. No existing object was touched.
