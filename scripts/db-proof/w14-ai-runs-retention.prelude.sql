-- ============================================================================
-- W14 item 6 — ai_runs retention redaction PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260808130000_ai_runs_retention_redaction_v1.sql
--   supabase/rollbacks/20260808130000_ai_runs_retention_redaction_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres 15 instance and the
-- resulting APPEND-ONLY / REDACTION behaviour measured per role.
--
-- `ai_runs` here is the REAL DDL, RLS, policy and GRANT posture copied from
-- supabase/migrations/20260714150000_ai_runs_audit_v1.sql — including the
-- `revoke update, delete ... from service_role` that is the guarantee under
-- test. Nothing here re-implements the migration.
--
-- `auth.uid()` / `is_admin()` are session-GUC stubs, as in the other proofs in
-- this directory. Definer functions are owned by `postgres` and
-- relforcerowsecurity stays false, matching production.
--
-- Throwaway only. Never point this at production or at a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid; $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_admin', true), ''), 'false')::boolean;
$$;
grant execute on function public.is_admin() to authenticated, anon, service_role;

create table if not exists public.profiles (id uuid primary key default gen_random_uuid());

-- ── ai_runs: the REAL 20260714150000 shape, RLS, policy and grants ──────────
create table if not exists public.ai_runs (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  task_type            text not null check (char_length(task_type) <= 64),
  provider             text not null check (char_length(provider) <= 32),
  model_alias          text not null check (char_length(model_alias) <= 32),
  model_id             text check (char_length(model_id) <= 128),
  prompt_version       text check (char_length(prompt_version) <= 32),
  tier                 text check (char_length(tier) <= 32),
  route_reason         text check (char_length(route_reason) <= 600),
  locale               text check (char_length(locale) <= 16),
  input_source         text check (char_length(input_source) <= 120),
  data_categories_sent text[] not null default '{}'::text[],
  output_excerpt       text check (char_length(output_excerpt) <= 4000),
  schema_validation    text check (schema_validation in ('passed','failed','skipped')),
  confidence           text check (confidence is null or char_length(confidence) <= 16),
  estimated_cost_usd   numeric,
  actual_cost_usd      numeric,
  input_tokens         int,
  output_tokens        int,
  latency_ms           int,
  fallback_applied     boolean not null default false,
  fallback_reason      text check (fallback_reason is null or char_length(fallback_reason) <= 120),
  escalation_applied   boolean,
  blocked_reason       text check (blocked_reason is null or char_length(blocked_reason) <= 64),
  human_review_state   text check (human_review_state is null
                         or human_review_state in ('not_required','pending','approved','rejected')),
  profile_id           uuid references public.profiles(id) on delete set null,
  request_context      text check (request_context is null or char_length(request_context) <= 120)
);

create index if not exists ai_runs_created_at_idx on public.ai_runs (created_at);

alter table public.ai_runs enable row level security;

drop policy if exists ai_runs_select on public.ai_runs;
create policy ai_runs_select on public.ai_runs
  for select to authenticated
  using (public.is_admin());

revoke all on public.ai_runs from anon;
grant select on public.ai_runs to authenticated;
revoke insert, update, delete on public.ai_runs from authenticated;
grant select, insert on public.ai_runs to service_role;
revoke update, delete on public.ai_runs from service_role;
