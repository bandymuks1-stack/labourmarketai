-- ─────────────────────────────────────────────────────────────────────────
-- Adaptive skills — candidate clarifications (slice skill-clarify-capture-v1)
--
-- WHY: an unknown skill is a CANDIDATE signal (not an error). A worker can add a
-- skill the catalogue may not know yet and CLARIFY it in their own words — how
-- they call it, the trade it belongs to, the tools/materials, what it goes with.
-- These are explicitly SELF-DECLARED / needs-clarification — never verified.
--
-- WHAT (purely ADDITIVE; no drop, no change to existing tables/policies):
--   a new owner-scoped table skill_candidate_clarifications. A worker reads/writes
--   ONLY their own rows (profile_id = auth.uid()). Explicit grants (Supabase has
--   no default grants). No SECURITY DEFINER needed — the owner-scoped RLS is the
--   gate. Nothing here verifies, AI-maps, or fabricates.
--
-- ROLLBACK (reversible):
--   drop table if exists public.skill_candidate_clarifications;  -- assert 0 rows
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.skill_candidate_clarifications (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  -- The worker's verbatim label ("how you call it").
  label            text not null,
  -- Lowercased/trimmed for dedupe. Plain text, not a catalogue slug.
  normalized_label text not null,
  -- Clarify answers — worker-provided, nullable (blanks stay blank).
  related_to       text,
  tools_materials  text,
  often_with       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (profile_id, normalized_label)
);

create index if not exists idx_scc_profile
  on public.skill_candidate_clarifications (profile_id);

alter table public.skill_candidate_clarifications enable row level security;

-- Owner-scoped: a worker sees + manages ONLY their own candidate clarifications.
drop policy if exists scc_select on public.skill_candidate_clarifications;
create policy scc_select on public.skill_candidate_clarifications
  for select using (profile_id = auth.uid());

drop policy if exists scc_write on public.skill_candidate_clarifications;
create policy scc_write on public.skill_candidate_clarifications
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Explicit grants — Supabase has NO default table grants.
grant select, insert, update, delete
  on public.skill_candidate_clarifications to authenticated;
