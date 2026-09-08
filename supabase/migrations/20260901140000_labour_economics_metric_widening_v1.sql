-- ============================================================================
-- 20260901140000 — labour_economics_metric_widening_v1
--
-- OWNER APPROVED 2026-09-01: "The metric widening described in
-- docs/intelligence/labour-economics-metrics-v1.md §6 is APPROVED if current
-- source/legal basis still matches."
--
-- @human-gate-approved
--   Acknowledged RED by route (`data-dml` on the registry that governs which
--   metrics an importer is ALLOWED to write). The DML is the entire point of
--   the change. It ships owner-approved with the exact SQL from §6.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
-- ----------------------------------------------------------------------------
-- `market_intelligence_sources.import_policy->'metric_keys'` is a FAIL-CLOSED
-- allowlist: an importer may only write observations whose metric key is
-- listed for its source. The labour-economics spec
-- (docs/intelligence/labour-economics-metrics-v1.md) is INERT BY DESIGN until
-- that allowlist names its metrics — the fail-closed policy is the
-- enforcement, and that is the point of it.
--
-- This migration widens the allowlist. It imports nothing, creates no table,
-- no function, no policy, and no grant. It only records WHICH metrics are
-- permitted, so the already-written import path can carry them.
--
-- ----------------------------------------------------------------------------
-- CURRENT-STATE VERIFICATION (production, 2026-09-01, before writing this)
-- ----------------------------------------------------------------------------
--   eurostat.import_policy.metric_keys =
--     labour.employment_rate, labour.unemployment_rate,
--     labour.job_vacancy_rate, labour.cost_index_yoy          (4 keys)
--   internal_platform_aggregates.metric_keys =
--     demand.role_request_count, demand.skill_request_count   (2 keys)
--
-- which matches the §6 premise exactly, so the spec is still current.
--
-- LEGAL BASIS — unchanged, re-checked against
-- docs/intelligence/eurostat-legal-evidence-v1.md:
--   "Reuse of statistical data, metadata, publications, and other
--   dissemination authorised provided the source is acknowledged."
--   Commercial reuse authorised WITH source acknowledgement; attribution is
--   already implemented per observation and per card
--   (`intelligence.eurostat.attribution`), and states it is not an endorsement
--   by Eurostat. The five added keys are Eurostat statistical data of exactly
--   the same nature as the four already permitted — the same basis covers
--   them, which is why §6 calls this a widening rather than a new source.
--
-- ----------------------------------------------------------------------------
-- SPLIT ACROSS TWO SOURCES, DELIBERATELY
-- ----------------------------------------------------------------------------
-- `productivity.value_to_cost_ratio` is NOT a Eurostat-published figure — it
-- is derived by this platform from two of them. §6 is explicit that it belongs
-- to `internal_platform_aggregates` instead, so a derived ratio can never be
-- presented as something Eurostat published. Attribution correctness is the
-- reason the split exists.
--
-- IDEMPOTENT: each key is appended only when absent, so re-running (or a clean
-- local `supabase db reset`) converges to the same array without duplicates.
--
-- ROLLBACK: supabase/rollbacks/20260901140000_labour_economics_metric_widening_v1.down.sql
--   (removes exactly the six added keys, restoring the 4 + 2 baseline above).
--   Rolling back re-seals the allowlist; already-imported observations are NOT
--   deleted by it — that is history, and removing an import permission is not
--   a reason to destroy what was lawfully imported under it.
-- ============================================================================

begin;

-- ── Eurostat: five published labour-cost / productivity metrics ─────────────
update public.market_intelligence_sources s
   set import_policy = jsonb_set(
         s.import_policy,
         '{metric_keys}',
         (select jsonb_agg(distinct k)
            from jsonb_array_elements_text(
                   (s.import_policy->'metric_keys')
                   || '["labour.cost_level_hour",
                        "labour.wage_level_hour",
                        "productivity.value_per_hour",
                        "productivity.value_per_person",
                        "labour.unit_labour_cost"]'::jsonb) as t(k))
       )
 where s.source_key = 'eurostat';

-- ── Internal aggregates: the DERIVED ratio, never attributed to Eurostat ────
update public.market_intelligence_sources s
   set import_policy = jsonb_set(
         s.import_policy,
         '{metric_keys}',
         (select jsonb_agg(distinct k)
            from jsonb_array_elements_text(
                   (s.import_policy->'metric_keys')
                   || '["productivity.value_to_cost_ratio"]'::jsonb) as t(k))
       )
 where s.source_key = 'internal_platform_aggregates';

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (read-only)
--
--   select source_key, jsonb_array_length(import_policy->'metric_keys') as n,
--          import_policy->'metric_keys'
--     from public.market_intelligence_sources
--    where source_key in ('eurostat','internal_platform_aggregates');
--
--   EXPECT eurostat                      n = 9
--   EXPECT internal_platform_aggregates  n = 3
--
--   -- and that widening a permission imported nothing on its own:
--   select count(*) from public.market_intelligence_observations
--    where metric_key in ('labour.cost_level_hour','labour.wage_level_hour',
--                         'productivity.value_per_hour',
--                         'productivity.value_per_person',
--                         'labour.unit_labour_cost',
--                         'productivity.value_to_cost_ratio');
--   EXPECT 0 — the permission exists; no import has run.
-- ============================================================================
