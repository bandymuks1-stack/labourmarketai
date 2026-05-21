-- ════════════════════════════════════════════════════════════════════════
-- 0010_skills_and_worker_skills.sql — Profession-scoped skills + verified flag
--
-- M1 skills system. NOT RUN by the agent — DI applies it (AGENTS.md).
--
-- ── Schema reconciliation (spec ⇄ actual) ──────────────────────────────────
-- The spec assumed `skills` / `worker_skills` were new tables using a
-- `translations jsonb` column. In reality both ALREADY EXIST (migration 0001)
-- using `name_lt` / `name_en` columns — the same multilingual convention as
-- `professions` (0008). So this migration is ADDITIVE, not create-from-scratch:
--
--   spec                              actual / this migration
--   --------------------------------  ----------------------------------------
--   skills.translations jsonb         skills.name_lt / name_en (kept; 38 rows
--                                       already seeded in 0001/0002)
--   skills.active                     skills.is_active (added; matches
--                                       professions.is_active naming)
--   worker_skills (new, PK composite) already exists (PK id + UNIQUE(worker_id,
--                                       skill_id)); we ADD the `source` column
--   worker_skills.verified_by →       already FK → profiles(id) (not auth.users)
--     auth.users
--   RLS using workers.user_id         already correct via owns_worker(worker_id)
--                                       which checks workers.profile_id=auth.uid()
--
-- ── Critical: table GRANTs ──────────────────────────────────────────────────
-- This project uses EXPLICIT grants (no Supabase default privileges — see
-- 0004, which granted only profiles/profile_roles to `authenticated`). Every
-- other table is owner-only, so the app's `authenticated` session currently
-- CANNOT read skills/professions/workers/worker_skills/worker_professions —
-- those reads silently fail and onboarding only works via SECURITY DEFINER
-- RPCs. The skills feature reads/writes these tables via the user session, so
-- the GRANTs at the bottom are REQUIRED for it to function. (Side effect: the
-- dashboard's profession display, also a direct read, starts working too.)
-- RLS still restricts which ROWS each grant can touch.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. skills.is_active (taxonomy soft-delete; mirrors professions.is_active)
alter table public.skills
  add column if not exists is_active boolean not null default true;

-- ── 2. worker_skills.source (verification provenance) ───────────────────────
alter table public.worker_skills
  add column if not exists source text not null default 'self_declared';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'worker_skills_source_check'
  ) then
    alter table public.worker_skills
      add constraint worker_skills_source_check
      check (source in ('self_declared', 'work_journal', 'manager_confirmed'));
  end if;
end $$;

-- ── 3. profession_skills — M:N junction (a skill can serve many professions) ─
create table if not exists public.profession_skills (
  profession_id uuid not null references public.professions(id) on delete cascade,
  skill_id      uuid not null references public.skills(id)      on delete cascade,
  is_core       boolean  not null default false,  -- core vs nice-to-have
  display_order smallint not null default 0,
  created_at    timestamptz not null default now(),
  primary key (profession_id, skill_id)
);

-- ── 4. Indexes ──────────────────────────────────────────────────────────────
create index if not exists idx_profession_skills_profession
  on public.profession_skills (profession_id);
create index if not exists idx_worker_skills_worker
  on public.worker_skills (worker_id);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
-- profession_skills is public taxonomy (mirror skills_select); writes admin-only.
alter table public.profession_skills enable row level security;

drop policy if exists profession_skills_select on public.profession_skills;
create policy profession_skills_select on public.profession_skills
  for select using (true);

drop policy if exists profession_skills_write_admin on public.profession_skills;
create policy profession_skills_write_admin on public.profession_skills
  for all using (is_admin()) with check (is_admin());

-- ── 6. GRANTs (the missing layer — see header) ──────────────────────────────
-- Read-only taxonomy.
grant select on public.skills            to authenticated;
grant select on public.professions       to authenticated;
grant select on public.profession_skills to authenticated;
-- Worker resolves their own worker.id / profession; RLS limits rows.
grant select on public.workers           to authenticated;
grant select, insert, update, delete on public.worker_skills      to authenticated;
grant select, insert, update, delete on public.worker_professions to authenticated;
