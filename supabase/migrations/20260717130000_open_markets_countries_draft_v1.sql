-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
--
-- Prepared under "Open Markets Update v1" (2026-07-17): migration prepared
-- FULLY but NOT applied — production apply happens ONLY via Supabase MCP
-- apply_migration after the owner reviews the PR gate report. Never `db push`.
-- NOTE: this file contains only additive `insert ... on conflict do nothing`
-- statements, so the static migration-safety gate may classify it GREEN — the
-- DRAFT header above is authoritative: the owner decides whether these six
-- markets become selectable countries rows at all. Do not self-apply.
--
-- 20260717130000 — open-markets countries draft v1 (GE / BE / FR / ES / AT / CH).
--
-- PROBLEM: the owner announced six newly opened markets (Georgia, Belgium,
-- France, Spain, Austria, Switzerland). The marketing index and the demand
-- intake selects are config-driven and already updated in-app, but company
-- setup (`organizations.country` → FK `public.countries(code)`) cannot store
-- these markets because the `countries` master list has no rows for them.
--
-- SOLUTION: add the six rows to `public.countries`, following the FI
-- precedent in 20260613100200 (insert with name_lt / name_en /
-- is_target_market, `on conflict (code) do nothing`). Reference data only —
-- no listings, counts, or availability are claimed by these rows.
--
-- Out of scope (separate owner decisions, NOT drafted here):
--  * widening the `company_need_public_intake` RPC 10-country allowlist
--    (20260707120000);
--  * widening the `country_document_requirements` /
--    `country_document_requirements_country_check` allowlist (20260610170000,
--    last widened in 20260613100200);
--  * widening the `market_rate_averages` country CHECK (20260610214000).
-- ============================================================================

insert into public.countries (code, name_lt, name_en, is_target_market) values
  ('GE', 'Gruzija',    'Georgia',     true),
  ('BE', 'Belgija',    'Belgium',     true),
  ('FR', 'Prancūzija', 'France',      true),
  ('ES', 'Ispanija',   'Spain',       true),
  ('AT', 'Austrija',   'Austria',     true),
  ('CH', 'Šveicarija', 'Switzerland', true)
on conflict (code) do nothing;

-- ROLLBACK: see supabase/rollbacks/20260717130000_open_markets_countries_draft_v1.down.sql
-- (guarded delete of the six rows — refuses to run if any organizations /
-- engagement_contexts row references one of the codes).
