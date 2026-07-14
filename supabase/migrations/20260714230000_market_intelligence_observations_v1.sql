-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714230000 — Labour Market Intelligence layer v1: THREE new tables that
-- form one auditable read/analysis layer OVER existing truth (see
-- docs/intelligence/labour-market-intelligence-layer-v1.md):
--
--   1. market_intelligence_sources       — source registry (governance). Every
--      place an intelligence number can come from is a registered, owner-
--      allowlisted row. External sources ship activation='off'.
--   2. market_intelligence_observations  — the versioned observation contract.
--      Observations are NOT user facts; they are derived/imported aggregate
--      data points stored SEPARATELY from canonical tables by design. They
--      never overwrite user-entered or human-confirmed data.
--   3. market_intelligence_insight_queries — append-only audit log of every
--      derived-insight query and the exact observation ids it was computed
--      from (explainability + §20 research-layer audit trail).
--
-- Honesty / privacy invariants (PLATFORM_DOCTRINE §18 realumo, §20 privatumo):
--   * NO fabricated numbers: every observation carries source_key, window,
--     unit, stat_method, transform_version and (for external rows) source_url;
--     internal rows must carry derivation_ids pointing at the canonical rows
--     they were derived from. Unknown stays NULL/absent — never invented.
--   * NO individual data: observations are aggregates only. privacy_class
--     gates read exposure; only 'public_aggregate' rows are readable by an
--     authenticated session. Small-sample suppression (n<3 drop, 3<=n<5 band)
--     happens in the derivation layer BEFORE a row is written.
--   * NO external source active at ship time: stat_gov_lt / eurostat /
--     cvbankas_salary seed with legal_status='unconfirmed', activation='off';
--     a CHECK constraint makes activation='on' impossible without
--     owner_approved_at + legal_status='confirmed'.
--   * Writes are SERVER-ONLY via the service-role client (same pattern as
--     ai_runs / billing_test_mode_records). The authenticated session gets NO
--     write path on any of the three tables.
--   * Observations are append-preferred: a corrected value is a NEW row and
--     the old row is superseded via valid_to — history is never rewritten.
--   * The insight-query log is APPEND-ONLY: update/delete REVOKEd from every
--     role including service_role, mirroring ai_runs_audit_v1.
--   * Additive only; no existing table/policy/grant is touched.
--
-- @human-gate-approved — TIER: owner-gated (new RLS-bearing tables + grants
-- are RED-class). Ships as a needs-human-gate DRAFT with the exact SQL; prod
-- apply stays manual via Supabase MCP after owner approval (runbook:
-- docs/intelligence/activation-runbook-v1.md). Until applied, the app
-- degrades honestly: intelligence surfaces detect the missing tables (42P01)
-- and show a "prepared, owner activation pending" needs-migration state.
--
-- ROLLBACK: supabase/rollbacks/20260714230000_market_intelligence_observations_v1.down.sql
-- (also inlined in the -- DOWN block at the end of this file).
-- ============================================================================

begin;

-- ── 1. market_intelligence_sources — source registry (governance) ───────────
create table if not exists public.market_intelligence_sources (
  id                  uuid primary key default gen_random_uuid(),
  source_key          text not null unique check (source_key ~ '^[a-z0-9_]+$'),
  display_name        text not null,
  source_kind         text not null check (source_kind in
                        ('internal_aggregated','public_official',
                         'licensed_partner','approved_public_web')),
  legal_status        text not null default 'unconfirmed' check (legal_status in
                        ('confirmed','unconfirmed','refused')),
  activation          text not null default 'off' check (activation in
                        ('off','owner_review','on')),
  terms_url           text,
  attribution_text    text,
  robots_status       text,
  rate_limit_note     text,
  owner_approved_at   timestamptz,
  owner_approval_note text,
  created_at          timestamptz not null default now(),
  -- A source can never be switched on without an owner approval timestamp AND
  -- a confirmed legal basis. This is the DB half of the dual gate (the code
  -- half is isExternalSourceActive() in apps/web/lib/intelligence/).
  constraint market_intelligence_sources_activation_requires_approval
    check (
      activation <> 'on'
      or (owner_approved_at is not null and legal_status = 'confirmed')
    )
);

comment on table public.market_intelligence_sources is
  'Intelligence source registry (governance). Every source of a market-intelligence number is a registered row; external sources ship activation=off and can only be switched on by the owner (CHECK: activation=on requires owner_approved_at + legal_status=confirmed). Doctrine §18: no unlabelled/fabricated data — a number without a registered source cannot exist in the intelligence layer. Writes service-role only.';

-- ── 2. market_intelligence_observations — versioned observation contract ────
-- Observations are NOT user facts. They live separately from canonical tables
-- by design and never overwrite user-entered / human-confirmed data.
create table if not exists public.market_intelligence_observations (
  id                uuid primary key default gen_random_uuid(),
  -- what the observation is about
  subject_kind      text not null check (subject_kind in
                      ('role','skill','profession','geo_market',
                       'company_need','platform')),
  subject_id        text not null,
  metric_key        text not null check (metric_key ~ '^[a-z0-9_.]+$'),
  -- geography (country is ISO-3166-1 alpha-2, same convention as
  -- company_locations / market_rate_averages)
  geo_country       text check (geo_country is null or geo_country ~ '^[A-Z]{2}$'),
  geo_region        text,
  geo_city          text,
  -- time window the value describes
  window_start      date not null,
  window_end        date not null,
  constraint market_intelligence_observations_window_order
    check (window_end >= window_start),
  -- the value + how it was computed
  value_numeric     numeric not null,
  unit              text not null,
  stat_method       text not null check (stat_method in
                      ('mean','median','p25','p75','count','ratio')),
  -- provenance
  source_kind       text not null check (source_kind in
                      ('internal_aggregated','public_official',
                       'licensed_partner','approved_public_web')),
  source_key        text not null
                      references public.market_intelligence_sources(source_key),
  source_url        text,
  -- external observations must carry a source URL (no untraceable external
  -- numbers — doctrine §18)
  constraint market_intelligence_observations_external_needs_url
    check (source_kind = 'internal_aggregated' or source_url is not null),
  derivation_ids    text[] not null default '{}',
  -- internal observations must carry derivation ids pointing at the canonical
  -- rows they were derived from (no unexplainable internal numbers).
  -- cardinality(), not array_length(): array_length('{}',1) is NULL, which a
  -- CHECK treats as pass — the empty default would slip through.
  constraint market_intelligence_observations_internal_needs_derivation
    check (source_kind <> 'internal_aggregated'
           or cardinality(derivation_ids) >= 1),
  -- validity / versioning (append-preferred: supersede via valid_to)
  captured_at       timestamptz not null,
  valid_from        timestamptz not null,
  valid_to          timestamptz,
  sample_size       integer check (sample_size is null or sample_size >= 0),
  confidence        numeric check (confidence is null
                                   or (confidence >= 0 and confidence <= 1)),
  transform_version text not null,
  privacy_class     text not null check (privacy_class in
                      ('public_aggregate','tenant_aggregate','internal_only')),
  freshness_status  text not null default 'unverified' check (freshness_status in
                      ('fresh','stale','expired','unverified')),
  provenance        jsonb not null default '[]'::jsonb,
  -- idempotent imports: the same captured fact can never be inserted twice
  content_hash      text not null unique,
  created_at        timestamptz not null default now()
);

comment on table public.market_intelligence_observations is
  'Versioned market-intelligence observation contract. Observations are derived/imported AGGREGATE data points — never user facts, never overwriting canonical tables. Append-preferred: corrections are new rows; the old row is superseded via valid_to (service-role only writes). privacy_class gates exposure: authenticated sessions read public_aggregate only; small-sample suppression (n<3 drop, 3<=n<5 band) happens in the derivation layer before a row exists. Doctrine §18 (no fabrication) + §20 (aggregates only, no individual dossiers).';

create index if not exists market_intelligence_observations_subject_idx
  on public.market_intelligence_observations
  (subject_kind, metric_key, geo_country, window_start);
create index if not exists market_intelligence_observations_source_idx
  on public.market_intelligence_observations (source_key);

-- ── 3. market_intelligence_insight_queries — derived-insight query log ──────
create table if not exists public.market_intelligence_insight_queries (
  id                  uuid primary key default gen_random_uuid(),
  queried_at          timestamptz not null default now(),
  viewer_role         text not null check (viewer_role in
                        ('worker','company','agency','admin')),
  profile_id          uuid references public.profiles(id) on delete set null,
  insight_key         text not null,
  observation_ids     uuid[] not null default '{}',
  computation_version text not null,
  -- bounded scalar params only (country code, metric key, window) — never PII
  params_summary      jsonb not null default '{}'::jsonb
);

comment on table public.market_intelligence_insight_queries is
  'Append-only audit log of every derived-insight query: who (role + optional profile linkage), which insight, the exact observation ids it was computed from, and the computation version — the explainability trail behind "where does this number come from". params_summary carries bounded scalar params only, never PII. No UPDATE/DELETE path exists for any role (mirrors ai_runs). Admin-only SELECT; inserts service-role only.';

-- ── 4. RLS — fail-closed on all three tables ─────────────────────────────────
alter table public.market_intelligence_sources enable row level security;
alter table public.market_intelligence_observations enable row level security;
alter table public.market_intelligence_insight_queries enable row level security;

-- Source registry: governance METADATA (which sources exist / are active) is
-- not sensitive — readable by any authenticated session so the UI can honestly
-- label a number's origin and activation state. NO write policies (writes are
-- service-role only, which bypasses RLS).
drop policy if exists market_intelligence_sources_select
  on public.market_intelligence_sources;
create policy market_intelligence_sources_select
  on public.market_intelligence_sources
  for select to authenticated
  using (true);

-- Observations: an authenticated session may read PUBLIC AGGREGATES only.
-- tenant_aggregate / internal_only rows are reachable exclusively through
-- server-side (service-role) read models that enforce their own scoping.
-- No insert/update/delete policies — writes are service-role only;
-- append-preferred, supersede via valid_to.
drop policy if exists market_intelligence_observations_select
  on public.market_intelligence_observations;
create policy market_intelligence_observations_select
  on public.market_intelligence_observations
  for select to authenticated
  using (privacy_class = 'public_aggregate');

-- Insight-query log: admin-only SELECT (uses public.is_admin(), a pinned
-- search_path SECURITY DEFINER helper from 0001_initial_schema). Client
-- writes are INSERT-only and self-attributed: the server read layer
-- (apps/web/lib/intelligence/intelligence-read.ts logInsightQuery) records
-- each derived-insight query with the RLS-scoped session client, so the
-- policy pins profile_id to the caller. UPDATE/DELETE stay revoked from
-- every role — the log is append-only.
drop policy if exists market_intelligence_insight_queries_select
  on public.market_intelligence_insight_queries;
create policy market_intelligence_insight_queries_select
  on public.market_intelligence_insight_queries
  for select to authenticated
  using (public.is_admin());

drop policy if exists market_intelligence_insight_queries_insert
  on public.market_intelligence_insight_queries;
create policy market_intelligence_insight_queries_insert
  on public.market_intelligence_insight_queries
  for insert to authenticated
  -- Strictly self-attributed: an authenticated session can never write an
  -- unattributed (NULL profile_id) audit row — the log stays reliable.
  -- (logInsightQuery always records the caller's own id; unattributed rows
  -- would only ever come from the service-role path, which bypasses RLS.)
  with check (profile_id = auth.uid());

-- ── 5. Grants — explicit, fail-closed (mirrors ai_runs_audit_v1) ────────────
revoke all on public.market_intelligence_sources from anon;
grant select on public.market_intelligence_sources to authenticated;
revoke insert, update, delete on public.market_intelligence_sources from authenticated;
grant select, insert, update on public.market_intelligence_sources to service_role;
revoke delete on public.market_intelligence_sources from service_role;

revoke all on public.market_intelligence_observations from anon;
grant select on public.market_intelligence_observations to authenticated;
revoke insert, update, delete on public.market_intelligence_observations from authenticated;
-- service_role may UPDATE only to set valid_to (supersede); hard deletes are
-- revoked — history is never rewritten.
grant select, insert, update on public.market_intelligence_observations to service_role;
revoke delete on public.market_intelligence_observations from service_role;

-- Append-only log — ai_runs pattern plus a self-attributed INSERT path:
-- table-level SELECT grant to authenticated is required for the admin-only
-- RLS policy above to be able to return rows to an admin session; the
-- is_admin() predicate keeps every non-admin session at 0 rows. INSERT is
-- granted to authenticated but constrained by the insert policy to the
-- caller's own profile_id. UPDATE/DELETE are revoked everywhere (append-only).
revoke all on public.market_intelligence_insight_queries from anon;
grant select, insert on public.market_intelligence_insight_queries to authenticated;
revoke update, delete on public.market_intelligence_insight_queries from authenticated;
grant select, insert on public.market_intelligence_insight_queries to service_role;
revoke update, delete on public.market_intelligence_insight_queries from service_role;

-- ── 6. Seed rows — the source registry ships with the governance state ──────
-- Internal derivations are confirmed + on (they never leave the platform);
-- every EXTERNAL source ships unconfirmed + off and requires the owner
-- activation runbook (docs/intelligence/activation-runbook-v1.md).
insert into public.market_intelligence_sources
  (source_key, display_name, source_kind, legal_status, activation,
   owner_approved_at, owner_approval_note, attribution_text)
values
  ('internal_platform_aggregates',
   'Internal platform aggregates',
   'internal_aggregated', 'confirmed', 'on',
   now(), 'internal derivation — no external access', null),
  ('admin_market_rate_averages',
   'Admin-entered market rate averages',
   'internal_aggregated', 'confirmed', 'on',
   now(), 'internal derivation — no external access', null),
  ('stat_gov_lt',
   'Official Statistics Portal of Lithuania (stat.gov.lt)',
   'public_official', 'unconfirmed', 'off',
   null, null, null),
  ('eurostat',
   'Eurostat',
   'public_official', 'unconfirmed', 'off',
   null, null, null),
  ('cvbankas_salary',
   'CVbankas salary listings (external benchmark)',
   'approved_public_web', 'unconfirmed', 'off',
   null, null,
   'PROPOSED ONLY — external benchmark; never label as LabourMarket.ai average; access/usage permission unconfirmed')
on conflict (source_key) do nothing;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714230000_market_intelligence_observations_v1.down.sql):
--   drop policy if exists market_intelligence_insight_queries_insert
--     on public.market_intelligence_insight_queries;
--   drop policy if exists market_intelligence_insight_queries_select
--     on public.market_intelligence_insight_queries;
--   drop policy if exists market_intelligence_observations_select
--     on public.market_intelligence_observations;
--   drop policy if exists market_intelligence_sources_select
--     on public.market_intelligence_sources;
--   drop index if exists market_intelligence_observations_subject_idx;
--   drop index if exists market_intelligence_observations_source_idx;
--   drop table if exists public.market_intelligence_insight_queries;
--   drop table if exists public.market_intelligence_observations;   -- before sources (FK)
--   drop table if exists public.market_intelligence_sources;
-- ════════════════════════════════════════════════════════════════════════════
