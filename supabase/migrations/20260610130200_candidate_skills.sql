-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (S2 / feat/cc/esco-taxonomy-foundation). Never `db push`.
--
-- candidate_skills — the Etapas 3 growth loop (design doc §4): unrecognized
-- free-text skill input becomes a CANDIDATE row; independent mentions bump
-- mention_count; the owner approval queue (a later slice) promotes it to a
-- canonical skills row or maps it to an ESCO concept. NEVER auto-approved,
-- NEVER verified — a candidate skill is Level 0 self-declared input.
--
-- Doctrine §2.3 (user-authored content): original_text + original_language
-- are NOT NULL from day 1. Default-closed (§4): owner + admin only.
-- ============================================================================

begin;

create table if not exists public.candidate_skills (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  original_text      text not null check (char_length(original_text) between 1 and 400),
  original_language  char(2) not null
                       check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')),
  mention_count      integer not null default 1 check (mention_count > 0),
  status             text not null default 'candidate'
                       check (status in ('candidate','approved','rejected')),
  mapped_esco_uri    text,
  review_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists candidate_skills_profile_idx
  on public.candidate_skills (profile_id, created_at desc);
create index if not exists candidate_skills_status_idx
  on public.candidate_skills (status, mention_count desc);

alter table public.candidate_skills enable row level security;

-- Default-closed: the author sees/creates their own; admin reviews all.
drop policy if exists candidate_skills_select on public.candidate_skills;
create policy candidate_skills_select on public.candidate_skills
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists candidate_skills_insert on public.candidate_skills;
create policy candidate_skills_insert on public.candidate_skills
  for insert to authenticated
  with check (profile_id = auth.uid());

-- Status transitions (approve/reject/map) are an ADMIN review act only —
-- the author cannot self-approve; nothing auto-approves.
drop policy if exists candidate_skills_update on public.candidate_skills;
create policy candidate_skills_update on public.candidate_skills
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- No DELETE policy: rejection is a status, the original row stays (audit).

grant select, insert, update on public.candidate_skills to authenticated;

commit;

-- ROLLBACK (reverse SQL — new table, import/user data only; reversible):
-- drop table if exists public.candidate_skills;
