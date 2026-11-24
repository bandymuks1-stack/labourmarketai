-- Rollback for 20260714230000_market_intelligence_observations_v1.sql —
-- restores the prior state exactly. The feature created THREE new tables
-- (market_intelligence_sources, market_intelligence_observations,
-- market_intelligence_insight_queries) plus their policies / indexes / seed
-- rows; every intelligence row lives only in those tables, so dropping them
-- removes every feature-created object. No existing RPC/trigger/table was
-- recreated or touched.
--
-- WARNING (destructive reversal): dropping market_intelligence_observations
-- discards any imported/derived observation rows and their audit history, and
-- dropping market_intelligence_insight_queries discards the insight-query
-- audit log. All of that data is DERIVED (canonical tables are untouched by
-- the forward migration), so nothing user-entered is lost — but re-deriving
-- external imports requires their snapshots to still exist upstream.
begin;

drop policy if exists market_intelligence_insight_queries_insert
  on public.market_intelligence_insight_queries;
drop policy if exists market_intelligence_insight_queries_select
  on public.market_intelligence_insight_queries;
drop policy if exists market_intelligence_observations_select
  on public.market_intelligence_observations;
drop policy if exists market_intelligence_sources_select
  on public.market_intelligence_sources;

drop index if exists market_intelligence_observations_subject_idx;
drop index if exists market_intelligence_observations_source_idx;

-- Dependency order: observations references sources(source_key), so the
-- referencing tables drop first.
drop table if exists public.market_intelligence_insight_queries;
drop table if exists public.market_intelligence_observations;
drop table if exists public.market_intelligence_sources;

commit;
