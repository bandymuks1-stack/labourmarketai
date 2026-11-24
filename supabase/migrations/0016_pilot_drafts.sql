-- ════════════════════════════════════════════════════════════════════════
-- 0016_pilot_drafts.sql — owner-only private pilot drafts for the three
-- non-worker controlled-pilot roles (company / agency / buyer).
--
-- One row per (profile_id, draft_type) — i.e. each user can hold ONE
-- draft of each type at a time. Pilot simplification: the goal is to
-- give pilot testers a clear first useful action ("save your need /
-- offer / request"), not a full drafts inbox. The UNIQUE constraint
-- makes the upsert path trivial server-side.
--
-- Payload is JSONB so adding/removing a field for one draft type is a
-- non-migration change. Server-side action validates the shape per
-- draft_type. Today's shape:
--
--   company_request  { title, capabilities, location, timing,
--                      accommodation, languages, notes }
--   agency_offer     { candidateRoles, skillAreas, countries,
--                      languages, availability, documentation, notes }
--   buyer_request    { serviceType, location, timing, budget, notes }
--
-- ADDITIVE / non-destructive. Forward-only; manual rollback at the
-- bottom. Explicit GRANTs to `authenticated` (this project does not
-- rely on Supabase default privileges — see 0004 header).
--
-- This file is COMMITTED in this PR. Production apply is owner-driven
-- (CLAUDE.md: "Running migrations on production — NEVER automatic.").
-- See PR description for the exact SQL Editor / MCP apply command.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Table ────────────────────────────────────────────────────────────
create table if not exists public.pilot_drafts (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  -- Locked to the three pilot types. Adding a future draft kind is a
  -- CHECK-constraint extension via a follow-up migration, NOT a
  -- payload-mutation here.
  draft_type   text not null
               check (draft_type in ('company_request','agency_offer','buyer_request')),
  -- Free-shape per-type. Server actions validate the keys allowed per
  -- type before any insert/update. Never read directly by RLS.
  payload      jsonb not null default '{}'::jsonb,
  -- Closed by default — the pilot doctrine forbids public-by-default
  -- personal/company data. Owner can later opt in via a separate
  -- "share with X" flow (out of scope here); the CHECK constraint
  -- will be widened at THAT point, not now.
  visibility   text not null default 'closed'
               check (visibility in ('closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One draft per type per user. The UI shows the existing draft
  -- pre-filled and the save action upserts on this constraint.
  unique (profile_id, draft_type)
);

comment on table public.pilot_drafts is
  'Owner-only private pilot drafts (company_request / agency_offer / buyer_request). NOT public by default. NOT verified. Reads scoped to profile_id = auth.uid() or is_admin(); writes scoped to profile_id = auth.uid().';

create index if not exists idx_pilot_drafts_profile on public.pilot_drafts (profile_id);
create index if not exists idx_pilot_drafts_type    on public.pilot_drafts (draft_type);

-- ── 2. updated_at trigger ─────────────────────────────────────────────
create or replace function public.pilot_drafts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pilot_drafts_updated_at on public.pilot_drafts;
create trigger trg_pilot_drafts_updated_at
  before update on public.pilot_drafts
  for each row execute function public.pilot_drafts_set_updated_at();

-- ── 3. RLS — owner-only writes; owner OR admin read ───────────────────
alter table public.pilot_drafts enable row level security;

drop policy if exists pilot_drafts_select on public.pilot_drafts;
create policy pilot_drafts_select on public.pilot_drafts
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists pilot_drafts_insert on public.pilot_drafts;
create policy pilot_drafts_insert on public.pilot_drafts
  for insert with check (profile_id = auth.uid());

drop policy if exists pilot_drafts_update on public.pilot_drafts;
create policy pilot_drafts_update on public.pilot_drafts
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists pilot_drafts_delete on public.pilot_drafts;
create policy pilot_drafts_delete on public.pilot_drafts
  for delete using (profile_id = auth.uid());

-- Explicit deny: no `is_employer()` reader path on this table. The
-- whole point of the pilot drafts is that they stay private to the
-- owner until they explicitly share.

-- ── 4. GRANTs (this project uses explicit grants; see 0004/0010 headers) ─
grant select, insert, update, delete on public.pilot_drafts to authenticated;

-- ── DOWN (manual rollback) ────────────────────────────────────────────
-- drop table if exists public.pilot_drafts;
-- drop function if exists public.pilot_drafts_set_updated_at();
