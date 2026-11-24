-- ════════════════════════════════════════════════════════════════════════
-- 0015_profile_skill_claims.sql — owner-only self-declared skill claims
-- derived from the text-first profile composer (profiles.profile_text, 0014).
--
-- Why a NEW table and not worker_skills:
--   worker_skills is employer-readable (workers_select RLS in 0001 uses
--   `is_employer()`), and is constrained to a real skill_id FK. The text-
--   first composer needs to capture FREE-TEXT claims like "Moku programuoti
--   ir statyti namus" — arbitrary labels the user wrote, owner-only by
--   default, and NEVER asserted as verified facts. Putting those into
--   worker_skills would leak the raw narrative-derived claims to every
--   employer/agency/company account.
--
--   profiles is already owner-only at every layer (profiles_select RLS uses
--   `id = auth.uid()`), so anchoring a child table on profile_id and
--   mirroring the same `id = auth.uid()` policy keeps the data closed.
--
-- ADDITIVE / non-destructive. Forward-only; manual rollback at the bottom.
-- Explicit GRANTs to `authenticated` (this project does not rely on Supabase
-- default privileges — see 0004 header and 0010 header).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Table ────────────────────────────────────────────────────────────
create table if not exists public.profile_skill_claims (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  -- The text the user actually confirmed (or edited) for this claim. Shown
  -- verbatim in UI. Not normalized for display.
  label            text not null,
  -- Lowercased / trimmed version used for dedupe + matching. Plain text,
  -- not a slug — these are arbitrary self-declared labels, not catalogue
  -- skill_ids.
  normalized_label text not null,
  -- Provenance. 'profile_text' is the only value for this slice; future
  -- sources (e.g. manual paste, voice transcript) would extend the check.
  source           text not null default 'profile_text'
                   check (source in ('profile_text')),
  -- Trust posture. self_declared is the only value for this slice.
  -- A future manager/journal/document confirmation flow may add
  -- 'work_journal' / 'manager_confirmed' / 'document_verified', but those
  -- belong in a separate migration alongside the confirmation UI.
  status           text not null default 'self_declared'
                   check (status in ('self_declared')),
  -- Default closed. Never readable by non-owners via RLS today; this
  -- column is here so a future "share with my manager" flow has a clear
  -- place to opt-in, one row at a time.
  visibility       text not null default 'closed'
                   check (visibility in ('closed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- One claim per (profile, normalized_label). Prevents the suggest flow
  -- from creating duplicates when the user clicks Save twice or the
  -- extractor proposes the same chip from different sentences.
  unique (profile_id, normalized_label)
);

comment on table public.profile_skill_claims is
  'Owner-only self-declared skill claims derived from profiles.profile_text. NOT verified. NOT readable by employers. Reads/writes scoped to profile_id = auth.uid().';

create index if not exists idx_profile_skill_claims_profile
  on public.profile_skill_claims (profile_id);

-- ── 2. updated_at trigger (mirrors the convention used by other tables) ─
create or replace function public.profile_skill_claims_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profile_skill_claims_updated_at on public.profile_skill_claims;
create trigger trg_profile_skill_claims_updated_at
  before update on public.profile_skill_claims
  for each row execute function public.profile_skill_claims_set_updated_at();

-- ── 3. RLS — owner-only on every verb ──────────────────────────────────
alter table public.profile_skill_claims enable row level security;

drop policy if exists profile_skill_claims_select on public.profile_skill_claims;
create policy profile_skill_claims_select on public.profile_skill_claims
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_skill_claims_insert on public.profile_skill_claims;
create policy profile_skill_claims_insert on public.profile_skill_claims
  for insert with check (profile_id = auth.uid());

drop policy if exists profile_skill_claims_update on public.profile_skill_claims;
create policy profile_skill_claims_update on public.profile_skill_claims
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists profile_skill_claims_delete on public.profile_skill_claims;
create policy profile_skill_claims_delete on public.profile_skill_claims
  for delete using (profile_id = auth.uid());

-- Explicit deny for any other reader. (`is_employer()` returns true for
-- every company/agency account — DO NOT add it to the select policy.)

-- ── 4. GRANTs (this project uses explicit grants; see 0004/0010 headers) ─
grant select, insert, update, delete on public.profile_skill_claims to authenticated;

-- ── DOWN (manual rollback) ─────────────────────────────────────────────
-- drop table if exists public.profile_skill_claims;
-- drop function if exists public.profile_skill_claims_set_updated_at();
