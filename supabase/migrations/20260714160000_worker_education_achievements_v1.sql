-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714160000 — worker education + achievements v1 (Full CV System slice,
-- Sprint v2 §2 "complete CV lifecycle").
--
-- PROBLEM: the CV/profile has NO first-class store for education or
-- achievements — verified in the slice's source-first audit. The Verified CV
-- (apps/web/lib/cv-export/verified-cv.ts) reads summary, professions, skills,
-- work history and confirmed proof; education and achievements exist nowhere,
-- so both a created CV and an imported CV silently drop those facts.
--
-- SOLUTION (smallest honest slice): TWO slug registries + TWO owner-only
-- tables.
--
--   1. education_types / achievement_types — §10 Lego slug registries
--      (labels live in per-locale JSON under `cvSections.*`, never in DB).
--      Extensible without a code deploy, same pattern as document_types.
--   2. worker_education — one row per education entry, keyed on profiles
--      (the person identity — same axis engagement_contexts uses). All facts
--      are SELF-DECLARED; no verified flag exists here on purpose.
--   3. worker_achievements — one row per achievement OR declared certificate
--      (achievement_type_slug='declared_certificate' is the honest home for
--      certificates found in an imported CV text: no file exists, so no
--      worker_documents row may be fabricated — the documents readiness
--      surface must stay real). `confirmed_by_manager` defaults false and is
--      EXCLUDED from the authenticated insert/update column grants, so the
--      owner can never flip it — only a future REAL confirmation flow
--      (SECURITY DEFINER) may. Nothing in this migration builds fake
--      verification.
--
-- RLS: default-closed, owner-only CRUD (profile_id = auth.uid()) on both
-- tables — the CV is the worker's OWN document; no employer read path in v1.
-- Registries are readable by all authenticated users (slugs only).
--
-- ABUSE BOUNDS: every text column is length-CHECKed; years are bounded
-- 1900..2100; the app caps list sizes (50 education / 100 achievements).
--
-- COMPATIBILITY / BACKFILL: none — new tables, no existing readers. The
-- consumer layer lands repo-safe and degrades honestly via 42P01 until this
-- is applied. No existing rows are touched.
--
-- ROLLBACK: paired supabase/rollbacks/20260714160000_worker_education_achievements_v1.down.sql
--
-- POST-APPLY VERIFICATION:
--   insert into worker_education (profile_id, institution_name, education_type_slug)
--     values (auth.uid(), 'Test school', 'vocational');          -- as a user: 1 row
--   select * from worker_education;                              -- other user: 0 rows
--   update worker_achievements set confirmed_by_manager = true;  -- as owner: permission denied
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new tables + RLS + grants =
-- RED-class by the migration-safety classifier; the OWNER applies manually).
-- ============================================================================

begin;

-- ── 1. Slug registries (§10 — slugs in DB, labels in i18n JSON) ─────────────

create table if not exists public.education_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.education_types (slug) values
  ('primary'),
  ('secondary'),
  ('vocational'),
  ('college'),
  ('university_bachelor'),
  ('university_master'),
  ('doctorate'),
  ('course_certificate'),
  ('other')
on conflict (slug) do nothing;

create table if not exists public.achievement_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.achievement_types (slug) values
  ('achievement'),
  ('award'),
  ('course_completion'),
  ('declared_certificate'),
  ('other')
on conflict (slug) do nothing;

alter table public.education_types enable row level security;
alter table public.achievement_types enable row level security;

drop policy if exists education_types_select on public.education_types;
create policy education_types_select
  on public.education_types for select using (true);
drop policy if exists achievement_types_select on public.achievement_types;
create policy achievement_types_select
  on public.achievement_types for select using (true);

-- Registry writes: admin only (same convention as other registries).
drop policy if exists education_types_write on public.education_types;
create policy education_types_write
  on public.education_types for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists achievement_types_write on public.achievement_types;
create policy achievement_types_write
  on public.achievement_types for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.education_types to authenticated;
grant select on public.achievement_types to authenticated;

-- ── 2. worker_education — self-declared education entries ───────────────────

create table if not exists public.worker_education (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  institution_name    text not null
    check (char_length(btrim(institution_name)) between 2 and 200),
  program_or_field    text
    check (program_or_field is null or char_length(program_or_field) <= 200),
  education_type_slug text not null references public.education_types(slug),
  start_year          int  check (start_year is null or start_year between 1900 and 2100),
  end_year            int  check (end_year   is null or end_year   between 1900 and 2100),
  is_current          boolean not null default false,
  note                text check (note is null or char_length(note) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- an entry cannot both be "current" and carry an end year
  check (not (is_current and end_year is not null)),
  check (start_year is null or end_year is null or end_year >= start_year)
);

create index if not exists worker_education_profile_idx
  on public.worker_education (profile_id);

alter table public.worker_education enable row level security;

-- Owner-only, default-closed. The CV is the person's own document (v1: no
-- employer read path; export shares it, not RLS).
drop policy if exists worker_education_select on public.worker_education;
create policy worker_education_select
  on public.worker_education for select
  using (profile_id = auth.uid() or public.is_admin());
drop policy if exists worker_education_insert on public.worker_education;
create policy worker_education_insert
  on public.worker_education for insert
  with check (profile_id = auth.uid());
drop policy if exists worker_education_update on public.worker_education;
create policy worker_education_update
  on public.worker_education for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
drop policy if exists worker_education_delete on public.worker_education;
create policy worker_education_delete
  on public.worker_education for delete
  using (profile_id = auth.uid());

grant select, delete on public.worker_education to authenticated;
grant insert (profile_id, institution_name, program_or_field,
              education_type_slug, start_year, end_year, is_current, note)
  on public.worker_education to authenticated;
grant update (institution_name, program_or_field, education_type_slug,
              start_year, end_year, is_current, note, updated_at)
  on public.worker_education to authenticated;

-- ── 3. worker_achievements — achievements + declared certificates ───────────

create table if not exists public.worker_achievements (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles(id) on delete cascade,
  title                   text not null
    check (char_length(btrim(title)) between 2 and 160),
  description             text
    check (description is null or char_length(description) <= 2000),
  achieved_at             date,
  achievement_type_slug   text not null default 'achievement'
    references public.achievement_types(slug),
  source_journal_entry_id uuid references public.journal_entries(id) on delete set null,
  -- Only a REAL confirmation flow (future, SECURITY DEFINER) may set true.
  -- Excluded from authenticated insert/update grants below — the owner can
  -- never self-confirm. NO fake verification.
  confirmed_by_manager    boolean not null default false,
  created_at              timestamptz not null default now()
);

create index if not exists worker_achievements_profile_idx
  on public.worker_achievements (profile_id);

alter table public.worker_achievements enable row level security;

drop policy if exists worker_achievements_select on public.worker_achievements;
create policy worker_achievements_select
  on public.worker_achievements for select
  using (profile_id = auth.uid() or public.is_admin());
drop policy if exists worker_achievements_insert on public.worker_achievements;
create policy worker_achievements_insert
  on public.worker_achievements for insert
  with check (profile_id = auth.uid());
drop policy if exists worker_achievements_update on public.worker_achievements;
create policy worker_achievements_update
  on public.worker_achievements for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
drop policy if exists worker_achievements_delete on public.worker_achievements;
create policy worker_achievements_delete
  on public.worker_achievements for delete
  using (profile_id = auth.uid());

-- confirmed_by_manager is deliberately ABSENT from both column lists.
grant select, delete on public.worker_achievements to authenticated;
grant insert (profile_id, title, description, achieved_at,
              achievement_type_slug, source_journal_entry_id)
  on public.worker_achievements to authenticated;
grant update (title, description, achieved_at, achievement_type_slug)
  on public.worker_achievements to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714160000_worker_education_achievements_v1.down.sql):
--   drop table if exists public.worker_achievements;
--   drop table if exists public.worker_education;
--   drop table if exists public.achievement_types;
--   drop table if exists public.education_types;
-- ════════════════════════════════════════════════════════════════════════════
