-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714200000 — Usage events + credits + per-customer cost tracking
-- (Pricing & Payments slice, Sprint v2 §11 — cost engine).
--
-- WHAT IS REAL TODAY vs SCHEMA-READY:
--   * AI cost is measurable NOW: the shared AI router logs per-run
--     actual_cost_usd into ai_runs (20260714150000, also gated). The cost
--     engine (apps/web/lib/billing/cost-engine.ts) rolls AI cost up
--     READ-TIME from ai_runs — ai_runs stays the single source of truth for
--     AI cost and is NOT mirrored into usage_events (documented decision:
--     no double-write drift).
--   * The other categories (storage, emails, bandwidth, database, payments,
--     media, voice, video) get an honest schema seam here: usage_events can
--     receive rows the moment a REAL collector exists. Until then they report
--     "not instrumented" — never a fabricated number.
--
-- Honesty / safety invariants (same append-only pattern as ai_runs):
--   * usage_events + credit_ledger are APPEND-ONLY: no UPDATE/DELETE policy;
--     update/delete REVOKEd from every role including service_role;
--   * metadata is bounded (<= 2000 chars serialized) and carries labels /
--     counters only — never document contents, never message bodies;
--   * cost_usd is NULL when unknown — never fabricated;
--   * writes are SERVER-only via the service-role client; authenticated users
--     read their own usage/credits, admins read all;
--   * additive only; reversible; no existing object touched.
--
-- ROLLBACK: supabase/rollbacks/20260714200000_usage_cost_tracking_v1.down.sql
-- ============================================================================

begin;

-- ── 1. usage_categories — §10 slug registry of billable cost categories ─────
create table if not exists public.usage_categories (
  slug        text primary key check (char_length(slug) <= 32),
  description text check (description is null or char_length(description) <= 300),
  created_at  timestamptz not null default now()
);

insert into public.usage_categories (slug, description) values
  ('ai',        'Internal AI agent runs. Real source TODAY: ai_runs.actual_cost_usd (read-time rollup; not mirrored here).'),
  ('storage',   'File/photo/document storage. Schema-ready; no collector yet.'),
  ('emails',    'Transactional email sends. Schema-ready; no collector yet.'),
  ('bandwidth', 'Egress/bandwidth. Schema-ready; no collector yet.'),
  ('database',  'Database usage attribution. Schema-ready; no collector yet.'),
  ('payments',  'Payment-provider fees. Schema-ready; no collector yet (payments are OFF).'),
  ('media',     'Media processing (images, galleries). Schema-ready; no collector yet.'),
  ('voice',     'Voice transcription minutes. Schema-ready; no collector yet.'),
  ('video',     'Video processing/streaming. Schema-ready; no collector yet.')
on conflict (slug) do nothing;

-- ── 2. usage_events — append-only per-customer usage log ────────────────────
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- customer attribution; nullable for platform-level (unattributable) usage.
  profile_id  uuid references public.profiles(id) on delete set null,
  category    text not null references public.usage_categories(slug),
  quantity    numeric not null check (quantity >= 0),
  unit        text not null check (char_length(unit) <= 32),
  -- NULL = cost unknown at record time (honest), never fabricated.
  cost_usd    numeric check (cost_usd is null or cost_usd >= 0),
  source      text not null check (char_length(source) <= 120),
  metadata    jsonb not null default '{}'::jsonb
                check (char_length(metadata::text) <= 2000)
);

create index if not exists usage_events_profile_idx
  on public.usage_events (profile_id, category, occurred_at);
create index if not exists usage_events_occurred_idx
  on public.usage_events (occurred_at);

-- ── 3. credit_types — §10 slug registry of purchasable credit kinds ─────────
create table if not exists public.credit_types (
  slug        text primary key check (char_length(slug) <= 32),
  description text check (description is null or char_length(description) <= 300),
  created_at  timestamptz not null default now()
);

insert into public.credit_types (slug, description) values
  ('ad_credits', 'Job-advertisement credits (from ad products; consumed by publishing an ad beyond the plan allowance).'),
  ('ai_credits', 'AI-assist credits (future top-up product; architecture only).')
on conflict (slug) do nothing;

-- ── 4. credit_balances — current balance per subject per credit type ────────
create table if not exists public.credit_balances (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  credit_type text not null references public.credit_types(slug),
  balance     int not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now(),
  primary key (profile_id, credit_type)
);

-- ── 5. credit_ledger — append-only movements behind every balance change ────
create table if not exists public.credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  credit_type text not null references public.credit_types(slug),
  delta       int not null check (delta <> 0),
  reason      text not null check (char_length(reason) <= 200),
  source      text not null check (char_length(source) <= 120),
  test_mode   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists credit_ledger_profile_idx
  on public.credit_ledger (profile_id, credit_type, created_at);

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
alter table public.usage_categories enable row level security;
alter table public.usage_events enable row level security;
alter table public.credit_types enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists usage_categories_select on public.usage_categories;
create policy usage_categories_select on public.usage_categories
  for select to authenticated using (true); -- registry, no personal data

drop policy if exists usage_events_select on public.usage_events;
create policy usage_events_select on public.usage_events
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists credit_types_select on public.credit_types;
create policy credit_types_select on public.credit_types
  for select to authenticated using (true);

drop policy if exists credit_balances_select on public.credit_balances;
create policy credit_balances_select on public.credit_balances
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists credit_ledger_select on public.credit_ledger;
create policy credit_ledger_select on public.credit_ledger
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies anywhere: writes are SERVER-only.

-- ── 7. Grants — append-only enforced at the grant level too ─────────────────
revoke all on public.usage_categories from anon;
revoke all on public.usage_events from anon;
revoke all on public.credit_types from anon;
revoke all on public.credit_balances from anon;
revoke all on public.credit_ledger from anon;

grant select on public.usage_categories to authenticated;
grant select on public.usage_events to authenticated;
grant select on public.credit_types to authenticated;
grant select on public.credit_balances to authenticated;
grant select on public.credit_ledger to authenticated;
revoke insert, update, delete on public.usage_events from authenticated;
revoke insert, update, delete on public.credit_balances from authenticated;
revoke insert, update, delete on public.credit_ledger from authenticated;

grant select on public.usage_categories to service_role;
grant select on public.credit_types to service_role;
-- usage_events: append-only for EVERY role.
grant select, insert on public.usage_events to service_role;
revoke update, delete on public.usage_events from service_role;
-- credit_ledger: append-only for EVERY role.
grant select, insert on public.credit_ledger to service_role;
revoke update, delete on public.credit_ledger from service_role;
-- credit_balances: mutable current state (server-only writes).
grant select, insert, update on public.credit_balances to service_role;
revoke delete on public.credit_balances from service_role;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714200000_usage_cost_tracking_v1.down.sql):
--   drop policy if exists credit_ledger_select on public.credit_ledger;
--   drop policy if exists credit_balances_select on public.credit_balances;
--   drop policy if exists credit_types_select on public.credit_types;
--   drop policy if exists usage_events_select on public.usage_events;
--   drop policy if exists usage_categories_select on public.usage_categories;
--   drop index if exists credit_ledger_profile_idx;
--   drop index if exists usage_events_occurred_idx;
--   drop index if exists usage_events_profile_idx;
--   drop table if exists public.credit_ledger;
--   drop table if exists public.credit_balances;
--   drop table if exists public.credit_types;
--   drop table if exists public.usage_events;
--   drop table if exists public.usage_categories;
-- ════════════════════════════════════════════════════════════════════════════
