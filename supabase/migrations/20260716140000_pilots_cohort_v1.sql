-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER + grants + admin-only policies are the
-- intentional canonical pattern for RPC-only admin cohort tables; reviewed in Train PR D; the DRAFT
-- header above stays authoritative — apply only via the owner process).
-- Prepared under WAGON 5 "Pilot Onboarding and Measurement v1" (2026-07-16):
-- migration prepared FULLY but NOT applied — production apply happens ONLY
-- via Supabase MCP apply_migration after the owner reviews the PR gate
-- report. Never `db push`.
--
-- 20260716140000 — pilots cohort v1.
--
-- PROBLEM: pilot measurement today is anonymous event counts in
-- `pilot_events` (0020). There is no way to define a pilot cohort ("the 6
-- construction companies we onboarded in July"), track who participates, or
-- record what the pilot actually produced (a contact, an enquiry, a booking,
-- a reported hire) in a reviewable, append-only ledger.
--
-- SOLUTION: three small admin-only tables + SECURITY DEFINER RPCs:
--   * pilots             — the cohort entity (name, organisation kind
--                          reusing the companies.company_type vocabulary
--                          + 'mixed', status draft|active|closed, window).
--   * pilot_participants — who is in the pilot (existing profiles only;
--                          joined via invitation or manual add; left_at
--                          marks departure — rows are never deleted).
--   * pilot_outcomes     — APPEND-ONLY outcome ledger. Every row is an
--                          OWNER-RECORDED observation (contact_made /
--                          enquiry_made / booking_accepted / hire_reported /
--                          no_outcome) — honest manager-set data, NOT a
--                          platform verification (same honesty stance as
--                          20260609180000 pilot_ops_v2 status ladder).
--
-- Privacy: no contact data, no free text beyond the bounded 500-char note
-- on an outcome. Participants reference existing profiles by id only.
--
-- Security model:
--   * RLS enabled on all three tables; SELECT is admin-only via
--     public.is_admin(); no INSERT / UPDATE / DELETE policies — every
--     write goes through the SECURITY DEFINER RPCs below, each of which
--     re-checks public.is_admin() and appends an audit_logs row;
--   * grants: select to authenticated only (RLS still hides every row
--     from non-admins); never anon, never public;
--   * pilot_outcomes is append-only: no RPC updates or deletes it.
--
-- Audit pattern (mirrors canonical invitations, 20260712200000): every
-- state change appends an audit_logs row carrying the actor and a
-- from_status/to_status payload; pilot_outcomes corrections are NEW rows,
-- never updates.
--
-- Independence: this migration applies against current main alone — it
-- references ONLY existing applied tables (profiles, audit_logs) and the
-- objects it creates itself. No dependency on any other unmerged wagon.
--
-- Forward-fix policy: if a defect is found AFTER the owner applies this,
-- ship a NEW forward migration — never edit this file. The paired rollback
-- exists for pre-apply review and emergency reversal only.
--
-- Additive only. Rollback:
--   supabase/rollbacks/20260716140000_pilots_cohort_v1.down.sql
-- ============================================================================

-- ── 1. pilots ────────────────────────────────────────────────────────
create table if not exists public.pilots (
  id                uuid primary key default gen_random_uuid(),
  name              text not null
                      check (char_length(name) between 2 and 120),
  -- Reuses the companies.company_type vocabulary (20260612090000) plus
  -- 'mixed' for cohorts that span organisation kinds.
  organisation_kind text not null default 'mixed'
                      check (organisation_kind in (
                        'construction','staffing_agency','subcontractor',
                        'manufacturing','services','client_customer',
                        'other','mixed')),
  status            text not null default 'draft'
                      check (status in ('draft','active','closed')),
  starts_on         date,
  ends_on           date,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pilots_window_chk check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  )
);

create index if not exists pilots_status_created_idx
  on public.pilots (status, created_at desc);

-- ── 2. pilot_participants ────────────────────────────────────────────
create table if not exists public.pilot_participants (
  id         uuid primary key default gen_random_uuid(),
  pilot_id   uuid not null references public.pilots(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_via text not null default 'manual'
               check (joined_via in ('invitation','manual')),
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  unique (pilot_id, profile_id)
);

create index if not exists pilot_participants_pilot_idx
  on public.pilot_participants (pilot_id, joined_at desc);

-- ── 3. pilot_outcomes — append-only owner-recorded ledger ────────────
create table if not exists public.pilot_outcomes (
  id                     uuid primary key default gen_random_uuid(),
  pilot_id               uuid not null references public.pilots(id) on delete cascade,
  -- Optional: the participant the outcome concerns; NULL = the pilot as
  -- a whole. Profile reference only — never contact data.
  participant_profile_id uuid references public.profiles(id),
  outcome                text not null
                           check (outcome in (
                             'contact_made','enquiry_made','booking_accepted',
                             'hire_reported','no_outcome')),
  noted_by               uuid not null references public.profiles(id),
  -- The ONLY free text in the model, bounded at 500 chars. The recording
  -- RPC rejects longer notes; admins are instructed in the UI to keep
  -- contact data OUT of the note.
  note                   text check (note is null or char_length(note) <= 500),
  created_at             timestamptz not null default now()
);

create index if not exists pilot_outcomes_pilot_created_idx
  on public.pilot_outcomes (pilot_id, created_at desc);

-- ── 4. RLS: admin-only reads; RPC-only writes ────────────────────────
alter table public.pilots enable row level security;
alter table public.pilot_participants enable row level security;
alter table public.pilot_outcomes enable row level security;

create policy pilots_select on public.pilots for select
  using (public.is_admin());
create policy pilot_participants_select on public.pilot_participants for select
  using (public.is_admin());
create policy pilot_outcomes_select on public.pilot_outcomes for select
  using (public.is_admin());
-- No INSERT/UPDATE/DELETE policies: every write goes through the
-- SECURITY DEFINER RPCs below. pilot_outcomes has no updating RPC at all
-- — the ledger is append-only.

grant select on public.pilots to authenticated;
grant select on public.pilot_participants to authenticated;
grant select on public.pilot_outcomes to authenticated;

-- ── 5. create_pilot_v1 ───────────────────────────────────────────────
create or replace function public.create_pilot_v1(
  p_name              text,
  p_organisation_kind text default 'mixed',
  p_starts_on         date default null,
  p_ends_on           date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_new  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    return jsonb_build_object('outcome', 'invalid_name');
  end if;
  if p_organisation_kind not in (
    'construction','staffing_agency','subcontractor','manufacturing',
    'services','client_customer','other','mixed') then
    return jsonb_build_object('outcome', 'invalid_kind');
  end if;
  if p_starts_on is not null and p_ends_on is not null
     and p_ends_on < p_starts_on then
    return jsonb_build_object('outcome', 'invalid_window');
  end if;

  insert into public.pilots (name, organisation_kind, starts_on, ends_on, created_by)
  values (v_name, p_organisation_kind, p_starts_on, p_ends_on, uid)
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_pilot_v1', 'pilots', v_new,
    jsonb_build_object('organisation_kind', p_organisation_kind,
      'starts_on', p_starts_on, 'ends_on', p_ends_on));

  return jsonb_build_object('outcome', 'created', 'pilot_id', v_new);
end $$;

revoke all on function public.create_pilot_v1(text, text, date, date) from public;
grant execute on function public.create_pilot_v1(text, text, date, date) to authenticated;

-- ── 6. set_pilot_status_v1 ───────────────────────────────────────────
create or replace function public.set_pilot_status_v1(
  p_pilot_id uuid,
  p_status   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_from text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then return 'not_authorized'; end if;
  if p_status not in ('draft','active','closed') then
    return 'invalid_status';
  end if;
  select status into v_from from public.pilots where id = p_pilot_id for update;
  if not found then return 'not_found'; end if;
  update public.pilots
     set status = p_status, updated_at = now()
   where id = p_pilot_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_pilot_status_v1', 'pilots', p_pilot_id,
    jsonb_build_object('from_status', v_from, 'to_status', p_status));
  return 'ok';
end $$;

revoke all on function public.set_pilot_status_v1(uuid, text) from public;
grant execute on function public.set_pilot_status_v1(uuid, text) to authenticated;

-- ── 7. add_pilot_participant_v1 ──────────────────────────────────────
create or replace function public.add_pilot_participant_v1(
  p_pilot_id   uuid,
  p_profile_id uuid,
  p_joined_via text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_existing public.pilot_participants%rowtype;
  v_new      uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if p_joined_via not in ('invitation','manual') then
    return jsonb_build_object('outcome', 'invalid_joined_via');
  end if;
  if not exists (select 1 from public.pilots where id = p_pilot_id) then
    return jsonb_build_object('outcome', 'pilot_not_found');
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    return jsonb_build_object('outcome', 'profile_not_found');
  end if;

  select * into v_existing from public.pilot_participants
   where pilot_id = p_pilot_id and profile_id = p_profile_id;
  if found then
    if v_existing.left_at is null then
      return jsonb_build_object('outcome', 'already_participant');
    end if;
    -- Re-join: clear left_at on the existing row (history stays in
    -- audit_logs; the unique(pilot_id, profile_id) row is reused).
    update public.pilot_participants
       set left_at = null, joined_via = p_joined_via, joined_at = now()
     where id = v_existing.id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'add_pilot_participant_v1', 'pilot_participants', v_existing.id,
      jsonb_build_object('pilot_id', p_pilot_id,
        'from_status', 'left', 'to_status', 'active',
        'joined_via', p_joined_via));
    return jsonb_build_object('outcome', 'rejoined', 'participant_id', v_existing.id);
  end if;

  insert into public.pilot_participants (pilot_id, profile_id, joined_via)
  values (p_pilot_id, p_profile_id, p_joined_via)
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'add_pilot_participant_v1', 'pilot_participants', v_new,
    jsonb_build_object('pilot_id', p_pilot_id,
      'from_status', 'none', 'to_status', 'active',
      'joined_via', p_joined_via));
  return jsonb_build_object('outcome', 'added', 'participant_id', v_new);
end $$;

revoke all on function public.add_pilot_participant_v1(uuid, uuid, text) from public;
grant execute on function public.add_pilot_participant_v1(uuid, uuid, text) to authenticated;

-- ── 8. remove_pilot_participant_v1 — marks left_at, never deletes ────
create or replace function public.remove_pilot_participant_v1(
  p_pilot_id   uuid,
  p_profile_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then return 'not_authorized'; end if;

  select id into v_id from public.pilot_participants
   where pilot_id = p_pilot_id and profile_id = p_profile_id
     and left_at is null;
  if not found then return 'not_found'; end if;

  update public.pilot_participants
     set left_at = now()
   where id = v_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'remove_pilot_participant_v1', 'pilot_participants', v_id,
    jsonb_build_object('pilot_id', p_pilot_id,
      'from_status', 'active', 'to_status', 'left'));
  return 'ok';
end $$;

revoke all on function public.remove_pilot_participant_v1(uuid, uuid) from public;
grant execute on function public.remove_pilot_participant_v1(uuid, uuid) to authenticated;

-- ── 9. record_pilot_outcome_v1 — append-only, bounded note ───────────
-- Corrections are NEW ledger rows (e.g. a later 'no_outcome' or corrected
-- outcome with an explanatory note) — no RPC updates or deletes this table.
create or replace function public.record_pilot_outcome_v1(
  p_pilot_id               uuid,
  p_outcome                text,
  p_participant_profile_id uuid default null,
  p_note                   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_new  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if p_outcome not in ('contact_made','enquiry_made','booking_accepted',
                       'hire_reported','no_outcome') then
    return jsonb_build_object('outcome', 'invalid_outcome');
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    return jsonb_build_object('outcome', 'note_too_long');
  end if;
  if not exists (select 1 from public.pilots where id = p_pilot_id) then
    return jsonb_build_object('outcome', 'pilot_not_found');
  end if;
  if p_participant_profile_id is not null and not exists (
    select 1 from public.pilot_participants
     where pilot_id = p_pilot_id and profile_id = p_participant_profile_id
  ) then
    return jsonb_build_object('outcome', 'participant_not_in_pilot');
  end if;

  insert into public.pilot_outcomes
    (pilot_id, participant_profile_id, outcome, noted_by, note)
  values
    (p_pilot_id, p_participant_profile_id, p_outcome, uid, v_note)
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'record_pilot_outcome_v1', 'pilot_outcomes', v_new,
    jsonb_build_object('pilot_id', p_pilot_id, 'recorded_outcome', p_outcome,
      'participant_profile_id', p_participant_profile_id));

  return jsonb_build_object('outcome', 'recorded', 'outcome_id', v_new);
end $$;

revoke all on function public.record_pilot_outcome_v1(uuid, text, uuid, text) from public;
grant execute on function public.record_pilot_outcome_v1(uuid, text, uuid, text) to authenticated;

-- ROLLBACK: supabase/rollbacks/20260716140000_pilots_cohort_v1.down.sql
