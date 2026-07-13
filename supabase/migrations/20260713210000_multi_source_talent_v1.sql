-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260713210000 — multi-source talent v1 (Labour Market OS programme,
-- P5 multi-source talent provenance + P6 worker external profiles +
-- P7 identity-resolution audit).
--
-- ██ HUMAN GATE — DO NOT APPLY WITHOUT EXPLICIT OWNER OK ██
-- Status: DRAFT / DEFERRED. Committed for review only. The consumer UI
-- (worker profile "External profiles" section) detects the missing
-- table/RPCs (42P01 / PGRST205 / 42883 / PGRST202) and shows an honest
-- "prepared, owner activation pending" state until this is applied.
--
-- WHY THE EXISTING SCHEMA IS INSUFFICIENT (investigated 2026-07-13):
--   * NO provenance store exists anywhere: nothing records WHERE a talent
--     profile's data came from (direct registration vs CV import vs agency
--     vs partner …), under what consent, or when it was last confirmed.
--     `profiles` / `workers` carry zero source columns; `worker_skills.source`
--     is a per-skill claim origin, not a person-level source ledger.
--   * The `workers` table has NO external-profile fields (no URL columns,
--     no platform enum, no import state) and widening the canonical worker
--     row with N repeating link fields would be a denormalized dead end —
--     a worker can hold several external profiles.
--   * Merge/unmerge decisions need an APPEND-ONLY audit trail; no existing
--     audit surface models duplicate detection / merge / unmerge events
--     between two profiles (audit_logs is free-form and mutable-by-policy
--     design, not a typed identity-resolution ledger).
--
-- WHAT THIS IS NOT (Living CV canon, docs/product/living-cv-contract-v1.md):
--   an external profile is NEVER a second truth model. Canonical skill
--   stores stay profile_skill_claims + worker_skills ONLY. An imported
--   snapshot is a REVIEWABLE artefact for the worker; v1 does NOT auto-create
--   any claim from it. No scraping, no live fetching of external sites —
--   the only import path is a worker-uploaded exported file (v2 UI wiring).
--
-- MODEL (all ADDITIVE — three new tables, zero changes to existing objects):
--   1. worker_external_profiles — worker-owned external profile links
--      (linkedin/github/behance/portfolio/certification_registry/other),
--      https-only bounded URL, visibility 'private' (default) | 'employers'.
--      NOTE v1 honesty: the visibility column SHIPS NOW but the employer
--      read path does NOT — RLS below is owner-or-admin only. Turning on any
--      employer read is a separate v2 migration + consent review.
--      disconnect sets disconnected_at (provenance preserved — NEVER a hard
--      delete; no delete path exists anywhere in this migration).
--   2. talent_source_records — person-level provenance ledger: 8 closed
--      source types, consent lifecycle (not_required/pending/granted/revoked),
--      first_seen/last_confirmed, bounded provenance jsonb, optional
--      canonical_person_link (self-reference to profiles — the canonical
--      person after a human-confirmed merge). v1 write path: the SUBJECT
--      (or admin) records their own sources. Agency/partner/service-path
--      source recording is a documented v2 (admin/service) follow-up — no
--      company may write arbitrary provenance about another person in v1.
--   3. identity_resolution_events — APPEND-ONLY merge/unmerge audit:
--      duplicate_detected / merge_confirmed / merge_rejected / unmerge,
--      matched_on strong_deterministic_id/email_exact/phone_exact/
--      human_decision, decided_by REQUIRED for merge_confirmed (human
--      confirms every merge — v1 policy AUTO_MERGE_ENABLED=false in
--      apps/web/lib/identity/identity-resolution.ts). No UPDATE/DELETE
--      policy, no mutating RPC, plus a trigger blocking UPDATE/DELETE for
--      every role. Merges are EVENT RECORDS, never data rewrites — original
--      source rows are never deleted or overwritten.
--
-- SECURITY (fail-closed):
--   RLS SELECT: worker_external_profiles owner-or-admin; talent_source_records
--   subject-or-admin; identity_resolution_events admin-only. No write
--   policies on any table — writes go through the SECURITY DEFINER RPCs
--   below only (auth.uid()-bound, pinned search_path, closed-set
--   re-validation, row caps). Table grants to authenticated: SELECT only.
--   No anon access of any kind. No outbound action of any kind.
--
-- ROLLBACK: supabase/rollbacks/20260713210000_multi_source_talent_v1.down.sql
-- (drops the six functions, the trigger and the three tables only — no
-- existing object is touched because none was modified).
--
-- POST-APPLY VERIFICATION:
--   select save_worker_external_profile_v1('github','https://github.com/x');
--   select * from worker_external_profiles;              -- owner: 1 row
--   select * from worker_external_profiles;              -- other user: 0 rows
--   select disconnect_external_profile_v1('<id>');       -- row kept, disconnected_at set
--   select record_talent_source_v1('direct_registration', null, null, null);
--   insert into identity_resolution_events ... ;          -- RLS-denied
--   + APPLIED_LEDGER.md row (repo file | ledger version | applied UTC | approver | summary).
--
-- @human-gate-approved — TIER: owner-gated (new tables + SECURITY DEFINER
-- functions + trigger + grants = RED-class by the migration-safety
-- classifier; this annotation only downgrades the CI finding to a notice —
-- the OWNER still applies manually).
-- ============================================================================

begin;

-- ── 1. worker_external_profiles (P6) ─────────────────────────────────────

create table if not exists public.worker_external_profiles (
  id                   uuid primary key default gen_random_uuid(),
  worker_id            uuid not null references public.workers(id) on delete cascade,
  platform             text not null check (platform in
                         ('linkedin','github','behance','portfolio',
                          'certification_registry','other')),
  url                  text not null check (
                         char_length(url) between 12 and 500
                         and url like 'https://%'),
  visibility           text not null default 'private'
                         check (visibility in ('private','employers')),
  import_status        text not null default 'none'
                         check (import_status in ('none','file_imported','pending_review')),
  -- Reviewable extracted content from a worker-UPLOADED exported file only
  -- (never fetched from the platform). Bounded so a snapshot can never be
  -- an unbounded shadow profile.
  imported_snapshot    jsonb check (imported_snapshot is null
                         or pg_column_size(imported_snapshot) <= 65536),
  snapshot_reviewed_at timestamptz,
  connected_at         timestamptz not null default now(),
  -- Disconnect is a SOFT state: provenance preserved, row never deleted.
  disconnected_at      timestamptz,
  updated_at           timestamptz not null default now()
);

create index if not exists worker_external_profiles_worker_idx
  on public.worker_external_profiles (worker_id);

alter table public.worker_external_profiles enable row level security;

-- v1 read surface is the OWNER (and admin) ONLY. The 'employers' visibility
-- value is stored as the worker's saved preference; no employer read policy
-- exists yet — that is an explicit, documented v2 gate.
drop policy if exists worker_external_profiles_select on public.worker_external_profiles;
create policy worker_external_profiles_select
  on public.worker_external_profiles for select
  using (public.owns_worker(worker_id) or public.is_admin());

-- No insert/update/delete policies — writes are RPC-only.

-- ── 2. talent_source_records (P5) ────────────────────────────────────────

create table if not exists public.talent_source_records (
  id                    uuid primary key default gen_random_uuid(),
  subject_profile_id    uuid not null references public.profiles(id) on delete cascade,
  source_type           text not null check (source_type in
                          ('direct_registration','cv_import','external_profile',
                           'agency','partner','referral','company_added_contact',
                           'official_integration')),
  source_name           text check (source_name is null or char_length(source_name) <= 160),
  source_reference      text check (source_reference is null or char_length(source_reference) <= 300),
  consent_status        text not null default 'not_required'
                          check (consent_status in ('not_required','pending','granted','revoked')),
  first_seen_at         timestamptz not null default now(),
  last_confirmed_at     timestamptz,
  import_method         text check (import_method is null or char_length(import_method) <= 80),
  provenance            jsonb check (provenance is null
                          or pg_column_size(provenance) <= 16384),
  -- The canonical person this record resolves to AFTER a human-confirmed
  -- merge. Nullable self-reference to profiles; never auto-populated.
  canonical_person_link uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index if not exists talent_source_records_subject_idx
  on public.talent_source_records (subject_profile_id);

alter table public.talent_source_records enable row level security;

-- "Where does my data come from" is a SELF-view: subject or admin only.
drop policy if exists talent_source_records_select on public.talent_source_records;
create policy talent_source_records_select
  on public.talent_source_records for select
  using (subject_profile_id = auth.uid() or public.is_admin());

-- No insert/update/delete policies — writes are RPC-only.

-- ── 3. identity_resolution_events (P7, append-only audit) ────────────────

create table if not exists public.identity_resolution_events (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in
                         ('duplicate_detected','merge_confirmed',
                          'merge_rejected','unmerge')),
  primary_profile_id   uuid not null references public.profiles(id) on delete cascade,
  duplicate_profile_id uuid not null references public.profiles(id) on delete cascade,
  matched_on           text not null check (matched_on in
                         ('strong_deterministic_id','email_exact',
                          'phone_exact','human_decision')),
  legal_basis          text check (legal_basis is null or char_length(legal_basis) <= 300),
  -- The HUMAN decider. Table-level CHECK: a confirmed merge without a named
  -- human decider cannot exist even if a future RPC forgets the check.
  decided_by           uuid references public.profiles(id) on delete set null,
  notes                text check (notes is null or char_length(notes) <= 1000),
  created_at           timestamptz not null default now(),
  constraint identity_resolution_merge_needs_decider
    check (kind <> 'merge_confirmed' or decided_by is not null)
);

create index if not exists identity_resolution_events_primary_idx
  on public.identity_resolution_events (primary_profile_id);

alter table public.identity_resolution_events enable row level security;

-- Audit surface is admin-only.
drop policy if exists identity_resolution_events_select on public.identity_resolution_events;
create policy identity_resolution_events_select
  on public.identity_resolution_events for select
  using (public.is_admin());

-- No insert/update/delete policies. INSERT goes through the RPC below only.
-- Immutability is defense-in-depth trigger-enforced for EVERY role:
create or replace function public.identity_resolution_events_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'identity_resolution_events is append-only'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_identity_resolution_events_immutable
  on public.identity_resolution_events;
create trigger trg_identity_resolution_events_immutable
  before update or delete on public.identity_resolution_events
  for each row execute function public.identity_resolution_events_block_mutation();

-- ── 4. worker_external_profiles write RPCs ────────────────────────────────

-- Add or edit one of the CALLER's own external profile links. Optional
-- p_snapshot carries reviewable content extracted from a worker-UPLOADED
-- exported file (v1 UI does not call it yet — file import ships later; the
-- parameter exists so the contract is complete and the review RPC below is
-- reachable). Never fetches anything. Cap: 20 rows per worker (total,
-- including disconnected rows — disconnects preserve provenance and count
-- against the cap so the table stays bounded).
create or replace function public.save_worker_external_profile_v1(
  p_platform   text,
  p_url        text,
  p_profile_id uuid default null,
  p_snapshot   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  w_id   uuid;
  v_url  text := nullif(btrim(coalesce(p_url, '')), '');
  v_count int;
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in
       ('linkedin','github','behance','portfolio','certification_registry','other') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  if v_url is null or char_length(v_url) < 12 or char_length(v_url) > 500
     or v_url not like 'https://%' then
    raise exception 'Invalid url (https:// required)' using errcode = '22023';
  end if;
  if p_snapshot is not null and pg_column_size(p_snapshot) > 65536 then
    raise exception 'Snapshot too large' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  if p_profile_id is not null then
    update public.worker_external_profiles set
      platform        = p_platform,
      url             = v_url,
      imported_snapshot = coalesce(p_snapshot, imported_snapshot),
      import_status   = case when p_snapshot is not null then 'pending_review'
                             else import_status end,
      updated_at      = now()
    where id = p_profile_id
      and worker_id = w_id
      and disconnected_at is null
    returning id into row_id;
    if row_id is null then
      raise exception 'External profile not found' using errcode = 'P0002';
    end if;
    return row_id;
  end if;

  select count(*) into v_count
  from public.worker_external_profiles
  where worker_id = w_id;
  if v_count >= 20 then
    raise exception 'External profile cap reached' using errcode = 'P0001';
  end if;

  insert into public.worker_external_profiles
    (worker_id, platform, url, imported_snapshot, import_status)
  values
    (w_id, p_platform, v_url, p_snapshot,
     case when p_snapshot is not null then 'pending_review' else 'none' end)
  returning id into row_id;
  return row_id;
end;
$$;

-- Set the CALLER's own saved visibility preference. HONESTY NOTE: while the
-- v1 RLS above has no employer read path, 'employers' only STORES the
-- preference — the UI must say so (and does).
create or replace function public.set_external_profile_visibility_v1(
  p_profile_id uuid,
  p_visibility text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('private','employers') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;

  update public.worker_external_profiles ep
     set visibility = p_visibility,
         updated_at = now()
   from public.workers w
   where ep.id = p_profile_id
     and ep.worker_id = w.id
     and w.profile_id = uid
     and ep.disconnected_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'External profile not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

-- Disconnect NEVER hard-deletes: it stamps disconnected_at (provenance
-- preserved) and forces visibility back to 'private'. Idempotent.
create or replace function public.disconnect_external_profile_v1(
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.worker_external_profiles ep
     set disconnected_at = coalesce(ep.disconnected_at, now()),
         visibility      = 'private',
         updated_at      = now()
   from public.workers w
   where ep.id = p_profile_id
     and ep.worker_id = w.id
     and w.profile_id = uid;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

-- Worker reviews an imported snapshot: accept keeps it (import_status
-- 'file_imported'), reject clears the UNACCEPTED imported content (this is
-- the worker's own consent decision about content that never became truth —
-- the profile row and its provenance stay). Neither path creates any skill
-- claim: the Living CV claim flow stays the only truth path.
create or replace function public.review_external_profile_snapshot_v1(
  p_profile_id uuid,
  p_decision   text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('accept','reject') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  update public.worker_external_profiles ep
     set import_status        = case when p_decision = 'accept'
                                     then 'file_imported' else 'none' end,
         imported_snapshot    = case when p_decision = 'accept'
                                     then ep.imported_snapshot else null end,
         snapshot_reviewed_at = now(),
         updated_at           = now()
   from public.workers w
   where ep.id = p_profile_id
     and ep.worker_id = w.id
     and w.profile_id = uid
     and ep.import_status = 'pending_review';
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'No snapshot pending review' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

-- ── 5. talent_source_records write RPC ────────────────────────────────────

-- v1: the SUBJECT records their own provenance (or an admin records it for
-- them). No company/agency caller can write provenance about another person
-- — the agency/partner/service recording path is a documented v2 follow-up.
-- Cap: 100 records per subject.
create or replace function public.record_talent_source_v1(
  p_source_type        text,
  p_source_name        text default null,
  p_source_reference   text default null,
  p_import_method      text default null,
  p_provenance         jsonb default null,
  p_consent_status     text default 'not_required',
  p_subject_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_subject uuid := coalesce(p_subject_profile_id, auth.uid());
  v_count   int;
  row_id    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_subject <> uid and not public.is_admin() then
    raise exception 'Not authorized to record provenance for another person'
      using errcode = '42501';
  end if;
  if p_source_type is null or p_source_type not in
       ('direct_registration','cv_import','external_profile','agency','partner',
        'referral','company_added_contact','official_integration') then
    raise exception 'Invalid source type' using errcode = '22023';
  end if;
  if p_consent_status is null or p_consent_status not in
       ('not_required','pending','granted','revoked') then
    raise exception 'Invalid consent status' using errcode = '22023';
  end if;
  if p_source_name is not null and char_length(p_source_name) > 160 then
    raise exception 'Invalid source name' using errcode = '22023';
  end if;
  if p_source_reference is not null and char_length(p_source_reference) > 300 then
    raise exception 'Invalid source reference' using errcode = '22023';
  end if;
  if p_import_method is not null and char_length(p_import_method) > 80 then
    raise exception 'Invalid import method' using errcode = '22023';
  end if;
  if p_provenance is not null and pg_column_size(p_provenance) > 16384 then
    raise exception 'Provenance too large' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.talent_source_records
  where subject_profile_id = v_subject;
  if v_count >= 100 then
    raise exception 'Source record cap reached' using errcode = 'P0001';
  end if;

  insert into public.talent_source_records
    (subject_profile_id, source_type, source_name, source_reference,
     import_method, provenance, consent_status)
  values
    (v_subject, p_source_type, nullif(btrim(coalesce(p_source_name, '')), ''),
     nullif(btrim(coalesce(p_source_reference, '')), ''),
     nullif(btrim(coalesce(p_import_method, '')), ''),
     p_provenance, p_consent_status)
  returning id into row_id;
  return row_id;
end;
$$;

-- ── 6. identity_resolution_events write RPC (admin-only, append-only) ─────

create or replace function public.record_identity_resolution_event_v1(
  p_kind                 text,
  p_primary_profile_id   uuid,
  p_duplicate_profile_id uuid,
  p_matched_on           text,
  p_legal_basis          text default null,
  p_notes                text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in
       ('duplicate_detected','merge_confirmed','merge_rejected','unmerge') then
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  if p_matched_on is null or p_matched_on not in
       ('strong_deterministic_id','email_exact','phone_exact','human_decision') then
    raise exception 'Invalid matched_on' using errcode = '22023';
  end if;
  if p_legal_basis is not null and char_length(p_legal_basis) > 300 then
    raise exception 'Invalid legal basis' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'Invalid notes' using errcode = '22023';
  end if;
  if p_primary_profile_id is null or p_duplicate_profile_id is null
     or p_primary_profile_id = p_duplicate_profile_id then
    raise exception 'Invalid profile pair' using errcode = '22023';
  end if;

  -- decided_by = the calling admin (a HUMAN decision recorded under their
  -- id). merge_confirmed additionally requires it via the table CHECK.
  insert into public.identity_resolution_events
    (kind, primary_profile_id, duplicate_profile_id, matched_on,
     legal_basis, decided_by, notes)
  values
    (p_kind, p_primary_profile_id, p_duplicate_profile_id, p_matched_on,
     nullif(btrim(coalesce(p_legal_basis, '')), ''), uid,
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into row_id;
  return row_id;
end;
$$;

-- ── 7. Grants (reads via RLS SELECT; writes ONLY via the RPCs) ────────────

grant select on public.worker_external_profiles to authenticated;
revoke insert, update, delete on public.worker_external_profiles from authenticated;

grant select on public.talent_source_records to authenticated;
revoke insert, update, delete on public.talent_source_records from authenticated;

grant select on public.identity_resolution_events to authenticated;
revoke insert, update, delete on public.identity_resolution_events from authenticated;

revoke all on function public.save_worker_external_profile_v1(text, text, uuid, jsonb) from public;
revoke all on function public.save_worker_external_profile_v1(text, text, uuid, jsonb) from anon;
grant execute on function public.save_worker_external_profile_v1(text, text, uuid, jsonb) to authenticated;

revoke all on function public.set_external_profile_visibility_v1(uuid, text) from public;
revoke all on function public.set_external_profile_visibility_v1(uuid, text) from anon;
grant execute on function public.set_external_profile_visibility_v1(uuid, text) to authenticated;

revoke all on function public.disconnect_external_profile_v1(uuid) from public;
revoke all on function public.disconnect_external_profile_v1(uuid) from anon;
grant execute on function public.disconnect_external_profile_v1(uuid) to authenticated;

revoke all on function public.review_external_profile_snapshot_v1(uuid, text) from public;
revoke all on function public.review_external_profile_snapshot_v1(uuid, text) from anon;
grant execute on function public.review_external_profile_snapshot_v1(uuid, text) to authenticated;

revoke all on function public.record_talent_source_v1(text, text, text, text, jsonb, text, uuid) from public;
revoke all on function public.record_talent_source_v1(text, text, text, text, jsonb, text, uuid) from anon;
grant execute on function public.record_talent_source_v1(text, text, text, text, jsonb, text, uuid) to authenticated;

revoke all on function public.record_identity_resolution_event_v1(text, uuid, uuid, text, text, text) from public;
revoke all on function public.record_identity_resolution_event_v1(text, uuid, uuid, text, text, text) from anon;
grant execute on function public.record_identity_resolution_event_v1(text, uuid, uuid, text, text, text) to authenticated;

commit;
