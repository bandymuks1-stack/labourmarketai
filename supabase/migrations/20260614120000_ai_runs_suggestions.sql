-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- Internal LLM Agents v1 (PR4) — AI run audit log + suggestion store.
-- Two additive tables. They record what the AI runtime did and hold its
-- suggestions in a draft→accepted/rejected lifecycle. They are NOT factual
-- tables: accepting a suggestion only flips its own status; persisting to a
-- canonical table still goes through the existing human-confirmed write paths.
--
-- Honesty / safety invariants:
--   * ai_runs is APPEND-ONLY (no UPDATE/DELETE policy) — an audit trail per §7.1;
--   * it stores HASHES of input/output (sha256 hex), never raw secrets/PII, and
--     no API key / provider secret;
--   * writes are SERVER-only (service-role); the authenticated session gets
--     SELECT on its own rows (owner) or all (admin);
--   * a worker/company may UPDATE only their OWN ai_suggestions row to record a
--     human decision (accept/reject/edit) — this is the human-confirm action,
--     and it touches NO factual table;
--   * additive + reversible; no destructive change, no RLS loosening.
-- ============================================================================

-- @human-gate-approved
begin;

-- 1. ai_runs — append-only audit of every AI completion ─────────────────────
create table if not exists public.ai_runs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.profiles(id) on delete set null,
  org_id        uuid,
  agent_key     text not null,
  prompt_version text not null,
  provider      text not null check (provider in ('disabled','mock','anthropic','openai')),
  model         text,
  status        text not null check (status in ('suggestion','disabled','needs_review','error')),
  error_code    text,
  -- sha256 hex of the structured input / raw output — NEVER the raw content.
  input_hash    text,
  output_hash   text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);
create index if not exists ai_runs_owner_idx on public.ai_runs (owner_id, created_at);
create index if not exists ai_runs_agent_idx on public.ai_runs (agent_key, created_at);

-- 2. ai_suggestions — draft → accepted/rejected/edited/expired lifecycle ─────
create table if not exists public.ai_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid references public.ai_runs(id) on delete set null,
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  agent_key          text not null,
  source_entity_type text,
  source_entity_id   text,
  status             text not null default 'draft'
                       check (status in ('draft','accepted','rejected','edited','expired')),
  payload            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists ai_suggestions_owner_idx
  on public.ai_suggestions (owner_id, status, created_at);

-- 3. RLS — owner reads/decides own; admin reads all; server writes ───────────
alter table public.ai_runs enable row level security;
alter table public.ai_suggestions enable row level security;

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
-- No insert/update/delete policy: ai_runs is append-only, written server-side.

drop policy if exists ai_suggestions_select on public.ai_suggestions;
create policy ai_suggestions_select on public.ai_suggestions
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- The owner may record their OWN human decision (accept/reject/edit) on their
-- OWN suggestion — this is the human-confirm action; it changes only the
-- suggestion's lifecycle, never a factual table. owner_id is pinned both sides.
drop policy if exists ai_suggestions_owner_update on public.ai_suggestions;
create policy ai_suggestions_owner_update on public.ai_suggestions
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
-- No insert/delete policy for authenticated: rows are created server-side.

-- 4. Grants — authenticated SELECT + owner UPDATE; service_role full writes ──
grant select, update on public.ai_suggestions to authenticated;
grant select on public.ai_runs to authenticated;
grant select, insert on public.ai_runs to service_role;
grant select, insert, update on public.ai_suggestions to service_role;

commit;

-- ROLLBACK: see supabase/rollbacks/20260614120000_ai_runs_suggestions.down.sql
