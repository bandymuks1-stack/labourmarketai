-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714150000 — ai_runs audit v1: APPEND-ONLY log of every LIVE internal
-- AI agent run (Sprint v2 §7 — shared AI routing layer; PLATFORM_DOCTRINE
-- §7.1 — AI extraction runs logged append-only with provider + model +
-- response + accepted subset).
--
-- PROBLEM: the cost-aware routing layer (apps/web/lib/ai/runtime/
-- task-routing.ts) builds a complete AiRoutingAuditRecord per run, but the
-- record was only exposed in-memory. There was no persisted audit trail and
-- no persisted daily-run counter, so the AI_DAILY_RUN_BUDGET guard could not
-- be enforced across requests.
--
-- SOLUTION (smallest honest slice): ONE new append-only table. Writes are
-- SERVER-ONLY via the service-role client (apps/web/lib/ai/runtime/
-- audit-store.ts — same pattern as billing_test_mode_records). The
-- authenticated session gets NO write path and admin-only SELECT.
--
-- Honesty / safety invariants:
--   * APPEND-ONLY: no UPDATE/DELETE policy exists; update/delete are REVOKEd
--     from every role including service_role;
--   * NO input content is ever stored — data_categories_sent carries field
--     NAMES only; output_excerpt is a bounded (<= 4000 chars) excerpt of the
--     schema-VALIDATED output (the accepted subset), never raw input;
--   * unknown costs stay NULL — never fabricated;
--   * only LIVE provider runs are persisted (mock/disabled runs never write);
--   * additive only; no existing table/policy/grant is touched.
--
-- @human-gate-approved — TIER: owner-gated (new RLS-bearing table is
-- RED-class). Ships as a needs-human-gate DRAFT with the exact SQL; prod
-- apply stays manual via Supabase MCP after owner approval. Until applied,
-- the app degrades honestly: persistAiRunAudit logs the failure and the run
-- outcome is unaffected; the daily-run counter falls back to "unknown" and
-- the budget guard stays caller-supplied-only (nothing faked).
--
-- ROLLBACK: supabase/rollbacks/20260714150000_ai_runs_audit_v1.down.sql
-- (also inlined in the -- DOWN block at the end of this file).
-- ============================================================================

begin;

-- ── 1. ai_runs — append-only audit log for internal AI agent runs ───────────
create table if not exists public.ai_runs (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  -- routing facts
  task_type            text not null check (char_length(task_type) <= 64),
  provider             text not null check (char_length(provider) <= 32),
  model_alias          text not null check (char_length(model_alias) <= 32),
  model_id             text check (char_length(model_id) <= 128),
  prompt_version       text check (char_length(prompt_version) <= 32),
  tier                 text check (char_length(tier) <= 32),
  route_reason         text check (char_length(route_reason) <= 600),
  -- routing dimensions considered
  locale               text check (char_length(locale) <= 16),
  input_source         text check (char_length(input_source) <= 120),
  -- field NAMES only — never values (no PII in the audit trail)
  data_categories_sent text[] not null default '{}'::text[],
  -- bounded excerpt of the schema-VALIDATED output (accepted subset)
  output_excerpt       text check (char_length(output_excerpt) <= 4000),
  schema_validation    text check (schema_validation in ('passed','failed','skipped')),
  confidence           text check (confidence is null or char_length(confidence) <= 16),
  -- cost / usage — NULL when unknown, never fabricated
  estimated_cost_usd   numeric,
  actual_cost_usd      numeric,
  input_tokens         int,
  output_tokens        int,
  latency_ms           int,
  -- fallback / escalation / block — honest flags
  fallback_applied     boolean not null default false,
  fallback_reason      text check (fallback_reason is null or char_length(fallback_reason) <= 120),
  escalation_applied   boolean,
  blocked_reason       text check (blocked_reason is null or char_length(blocked_reason) <= 64),
  human_review_state   text check (
                         human_review_state is null
                         or human_review_state in ('not_required','pending','approved','rejected')
                       ),
  -- optional linkage (no cascade delete of the audit trail)
  profile_id           uuid references public.profiles(id) on delete set null,
  request_context      text check (request_context is null or char_length(request_context) <= 120)
);

-- Daily-run-budget counter + audit browsing both query by created_at.
create index if not exists ai_runs_created_at_idx
  on public.ai_runs (created_at);
create index if not exists ai_runs_task_type_idx
  on public.ai_runs (task_type, created_at);

-- ── 2. RLS — admin-only SELECT; NO anon access; NO client write path ────────
alter table public.ai_runs enable row level security;

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (public.is_admin());
-- No insert/update/delete policies: writes are SERVER-only via the
-- service-role client (RLS-bypassing), and the table is append-only.

-- ── 3. Grants — append-only enforced at the grant level too ─────────────────
revoke all on public.ai_runs from anon;
grant select on public.ai_runs to authenticated;
revoke insert, update, delete on public.ai_runs from authenticated;
grant select, insert on public.ai_runs to service_role;
revoke update, delete on public.ai_runs from service_role;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714150000_ai_runs_audit_v1.down.sql):
--   drop policy if exists ai_runs_select on public.ai_runs;
--   drop index if exists ai_runs_task_type_idx;
--   drop index if exists ai_runs_created_at_idx;
--   drop table if exists public.ai_runs;
-- ════════════════════════════════════════════════════════════════════════════
