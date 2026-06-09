-- ─────────────────────────────────────────────────────────────────────────
-- Candidate / provider draft v1 (slice candidate-provider-draft-v1)
--
-- WHY: a requester / company manager / agency / project owner must be able to
-- start managing a real person or service provider BEFORE that person registers.
-- A DRAFT is NOT a user account — it never logs in, accepts, consents, uploads a
-- document, or gets verified. It is the creator's private working note about
-- someone they intend to engage, with an honest "can be linked later" path.
--
-- WHAT (purely ADDITIVE; no drop, no change to existing tables/policies/grants):
--   a new owner-scoped table candidate_drafts. The creator reads/writes ONLY
--   their own rows (owner_id = auth.uid()); admin may read. Explicit grants
--   (Supabase has no default grants). No SECURITY DEFINER — the owner-scoped RLS
--   is the gate. Nothing here creates an account, acceptance, consent,
--   verification, document, or AI match.
--
-- A draft is NOT assignable: F4 assignment requires a real registered worker
-- (workers.id). linked_profile_id lets an operator point a draft at a real
-- profile AFTER that person registers — it never creates the account itself.
--
-- ROLLBACK (reversible):
--   drop table if exists public.candidate_drafts;  -- assert 0 rows first
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.candidate_drafts (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  -- Optional association to a project the draft is being considered for.
  project_id         uuid references public.projects(id) on delete set null,
  -- Operational fields — all manager-entered, none verified.
  name_or_title      text not null,
  contact            text,          -- email / phone if known (free text)
  profession_service text,
  language           text,
  skills_text        text,          -- free-text skills / services
  notes              text,
  status             text not null default 'draft'
                       check (status in ('draft', 'contacted', 'shortlisted', 'archived')),
  -- "Can be linked later": once the real person registers, an operator may point
  -- the draft at their real profile. Never auto-set; never creates the account.
  linked_profile_id  uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_candidate_drafts_owner
  on public.candidate_drafts (owner_id);
create index if not exists idx_candidate_drafts_project
  on public.candidate_drafts (project_id);

alter table public.candidate_drafts enable row level security;

-- Owner-scoped: the creator (or admin) reads ONLY their own drafts.
drop policy if exists candidate_drafts_select on public.candidate_drafts;
create policy candidate_drafts_select on public.candidate_drafts
  for select using (owner_id = auth.uid() or public.is_admin());

-- Owner-only writes: a manager manages ONLY the drafts they created.
drop policy if exists candidate_drafts_write on public.candidate_drafts;
create policy candidate_drafts_write on public.candidate_drafts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Explicit grants — Supabase has NO default table grants. authenticated only.
grant select, insert, update, delete on public.candidate_drafts to authenticated;
