-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260809160000 — public vacancy persistence v1.
--
-- PROBLEM (measured, not inferred). The public-vacancy pipeline is complete:
-- provider registry, adapter, parser, normalizer, categorizer, validator,
-- deduper, cursor, accounting and importer all exist and are tested. It
-- imports nothing, and can import nothing, because there is NOWHERE TO PUT A
-- VACANCY. Counted against origin/main 0d8de71d: 194 migration files, none of
-- which creates a vacancy table. `runVacancyImport` has ZERO non-test callers
-- and its `persist` callback has no implementation anywhere in the repo.
--
-- Production consequence, read from the live database 2026-08-09:
--   job_demands             0 rows
--   marketplace_listings    0 rows
--   customer_requests      19 rows total, 11 'submitted', all first-party,
--                          8 of them with country IS NULL
-- There is no real EU job supply. A worker who searches has nothing to find.
-- This migration is the missing floor under the pipeline.
--
-- WHAT THIS IS. Two tables and nothing else:
--   1. `public_vacancies`        — the canonical record from PublicVacancyV1.
--   2. `vacancy_import_cursors`  — the per-channel checkpoint the importer
--                                  already computes but cannot store.
--
-- WHAT THIS IS NOT.
--   - NOT a second demand model. These rows are clearly-attributed EXTERNAL
--     public-employment-service ads. They never become a LabourMarket.ai
--     customer request and never carry a platform employer identity. The
--     matching engine reaches them through the existing `vacancy-need.ts`
--     conversion into the ONE `MatchNeed`, not through a forked model.
--   - NOT an activation. Creating a table activates nothing. Import still
--     requires BOTH the source-governance owner decision (arbetsformedlingen
--     is `activation: "owner_review"` today) AND the runtime env kill switch.
--     Applying this migration to production imports zero rows by itself.
--   - NOT personal data. Every column here is content a public employment
--     service already publishes on its own public website under CC0. No
--     platform user, worker or profile is referenced. There is deliberately no
--     foreign key to `profiles`, `workers` or `companies`.
--
-- ── RLS DECISION, STATED EXPLICITLY ────────────────────────────────────────
--
-- `public_vacancies` is READABLE BY `anon` AND `authenticated` for rows where
-- `is_active`. That is a DELIBERATE product decision, not an oversight:
--   * the rows are already-public CC0 job ads whose publisher asks only to be
--     credited (attribution is carried per-row and pinned by the boundary
--     guard), and
--   * a job board that requires a login before it will admit a job exists is
--     the thing the beta is trying to stop being.
-- Withdrawn ads (`is_active = false`) are NOT readable — a removed ad must
-- stop being findable the moment the publisher withdraws it.
--
-- Writes are service_role only. This is enforced TWICE, on purpose:
--   * privileges: REVOKE ALL first, then GRANT exactly SELECT to anon and
--     authenticated. Granting without revoking first leaves Supabase's default
--     privileges in place and is how a table ends up anon-writable while the
--     migration reads as if it did not; and
--   * RLS: no INSERT/UPDATE/DELETE policy exists, so even a role that somehow
--     held the privilege would still be refused by row-level security.
--
-- `vacancy_import_cursors` has RLS ENABLED AND NO POLICIES AT ALL. That is the
-- correct shape for an operator-only table: every non-service_role request is
-- refused by default, and there is no policy to misread later. A cursor is an
-- ingestion checkpoint; no product surface has any reason to read it.
--
-- ── IDENTITY AND IDEMPOTENCE ───────────────────────────────────────────────
--
-- `(provider_key, external_id)` is the natural key — the publisher's own ad id
-- is stable across the snapshot and stream channels, which is exactly what
-- makes a re-run safe. `content_hash` carries the pipeline's content-addressed
-- identity so a revision is distinguishable from a repeat: same external_id +
-- different content_hash = the ad changed; same both = nothing happened. The
-- repository upserts on the natural key and only writes when the hash moved,
-- so re-running an import is free rather than merely harmless.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--
-- Paired: supabase/rollbacks/20260809160000_public_vacancy_persistence_v1.down.sql
-- Safe at any time. It drops two tables that hold ONLY re-fetchable public
-- data — every row can be re-imported from the publisher, so a rollback costs
-- one snapshot run and loses nothing that originated here.
-- ============================================================================

-- ── public_vacancies ───────────────────────────────────────────────────────

create table if not exists public.public_vacancies (
  id uuid primary key default gen_random_uuid(),

  -- Provenance. `provider_key` is ALSO the source-governance registry key:
  -- one source, one governance row, one owner decision.
  provider_key text not null,
  external_id text not null,
  content_hash text not null,
  channel text not null check (channel in ('snapshot', 'stream', 'links')),
  lifecycle text not null check (lifecycle in ('published', 'removed')),

  -- Publisher's own words, verbatim and bounded exactly as VACANCY_IMPORT_
  -- BOUNDS bounds them in the pipeline. The check constraints are the same
  -- numbers, so a bound that drifts in code fails here loudly instead of
  -- silently storing an over-long string.
  title_raw text not null check (length(title_raw) between 1 and 300),
  description_raw text not null default '' check (length(description_raw) <= 8000),
  source_language text not null,

  -- Employer, as published. NEVER joined to a platform company.
  employer_name text,
  employer_external_org_id text,
  employer_homepage text,

  -- Geography, as published. No geocoding happens anywhere in this pipeline,
  -- so lat/lng are present only when the publisher supplied them.
  country text not null,
  region text,
  city text,
  lat double precision,
  lng double precision,

  -- Compensation, as published. No currency conversion: a SEK figure stays a
  -- SEK figure, because converting it would need an FX rate we do not have.
  compensation_currency text,
  compensation_min numeric,
  compensation_max numeric,
  compensation_description text,

  employment_form text not null default 'unknown'
    check (employment_form in ('permanent', 'temporary', 'seasonal', 'assignment', 'unknown')),
  working_time text not null default 'unknown'
    check (working_time in ('full_time', 'part_time', 'unknown')),
  -- null = the ad did not say. Never defaulted to 1.
  positions integer check (positions is null or positions > 0),

  start_date date,
  published_at timestamptz not null,
  expires_at timestamptz,
  captured_at timestamptz not null,

  -- Publisher taxonomy, verbatim.
  occupation_raw text,
  occupation_concept_id text,

  -- Platform taxonomy, ALWAYS derived by the same recognizer the platform's
  -- own demand intake uses. `categorization_origin` keeps that visible so a
  -- derived guess is never rendered as a publisher fact.
  profession_slug text,
  skill_slugs text[] not null default '{}',
  categorization_origin text not null default 'derived'
    check (categorization_origin in ('publisher', 'derived')),

  required_languages text[] not null default '{}',

  application_url text,
  -- i18n code, never a display string. A record whose provider requires
  -- attribution cannot be rendered without it (pinned by the boundary guard).
  attribution_code text not null,

  -- Translation stage result. `status` is the translation service's verbatim
  -- answer; with no provider configured (the shipped default) it is
  -- 'unavailable' and the publisher's own words are what a user sees.
  translation_target_language text,
  translation_status text
    check (translation_status is null or translation_status in
      ('pending', 'unavailable', 'available', 'failed', 'needs_review')),
  translation_title_text text,
  translation_description_text text,
  translation_provider text,

  -- Import provenance.
  transform_version text not null,
  request_ref text not null,
  import_session_id text,

  -- Lifecycle in OUR store. A withdrawal or an expiry deactivates a row; it
  -- never deletes one, so an ad that came back can be reactivated and the
  -- accounting stays auditable.
  is_active boolean not null default true,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A range that reads backwards is a data defect, not a preference.
  constraint public_vacancies_compensation_range_ordered
    check (
      compensation_min is null
      or compensation_max is null
      or compensation_min <= compensation_max
    )
);

-- The natural key. This is what makes the importer's upsert idempotent.
create unique index if not exists public_vacancies_provider_external_key
  on public.public_vacancies (provider_key, external_id);

-- Search shape: the job board filters live ads by country, then orders by
-- recency. A partial index on is_active keeps withdrawn ads out of the index
-- entirely rather than merely out of the result.
create index if not exists public_vacancies_active_country_published_idx
  on public.public_vacancies (country, published_at desc)
  where is_active;

create index if not exists public_vacancies_active_profession_idx
  on public.public_vacancies (profession_slug, published_at desc)
  where is_active and profession_slug is not null;

create index if not exists public_vacancies_skill_slugs_idx
  on public.public_vacancies using gin (skill_slugs)
  where is_active;

-- Free-text search over the publisher's own words. Config 'simple' on
-- purpose: the corpus is multilingual by definition (a Swedish ad and a
-- Latvian ad live in the same table), and applying one language's stemmer to
-- every language stems most of them wrongly. 'simple' does no stemming, which
-- is honest rather than clever.
create index if not exists public_vacancies_fulltext_idx
  on public.public_vacancies
  using gin (to_tsvector('simple', title_raw || ' ' || description_raw))
  where is_active;

comment on table public.public_vacancies is
  'External public-employment-service job ads, imported under source governance. '
  'CC0/open-licence public content only. No platform identity, no personal data. '
  'Read: anon+authenticated for active rows. Write: service_role only.';

alter table public.public_vacancies enable row level security;

-- Privileges: revoke first so Supabase default privileges cannot leave a wider
-- grant in place than this migration appears to give.
revoke all on public.public_vacancies from anon, authenticated;
grant select on public.public_vacancies to anon, authenticated;
grant all on public.public_vacancies to service_role;

-- The ONLY policy. Active rows are world-readable; withdrawn ads are not
-- readable by anyone but service_role. There is deliberately no INSERT,
-- UPDATE or DELETE policy — ingestion runs as service_role.
drop policy if exists public_vacancies_read_active on public.public_vacancies;
create policy public_vacancies_read_active
  on public.public_vacancies
  for select
  to anon, authenticated
  using (is_active);

-- ── vacancy_import_cursors ─────────────────────────────────────────────────

create table if not exists public.vacancy_import_cursors (
  provider_key text not null,
  channel text not null check (channel in ('snapshot', 'stream', 'links')),
  -- The publisher's own last-seen timestamp. Opaque to us on purpose: it is
  -- the publisher's continuation token, not our clock.
  cursor_value text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  -- Stable machine code, never a sentence and never anything secret-bearing.
  last_failure_code text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider_key, channel)
);

comment on table public.vacancy_import_cursors is
  'Per-provider/channel ingestion checkpoint and health. Operator-only: RLS is '
  'enabled with NO policies, so every non-service_role request is refused.';

alter table public.vacancy_import_cursors enable row level security;

revoke all on public.vacancy_import_cursors from anon, authenticated;
grant all on public.vacancy_import_cursors to service_role;

-- No policies. RLS with zero policies denies every anon/authenticated request
-- by default, which is exactly the intent for an operator-only table.
