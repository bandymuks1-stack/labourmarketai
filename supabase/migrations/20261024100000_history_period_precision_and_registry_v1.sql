-- @human-gate-approved
-- Owner integrated-architecture order 2026-10-24 (Stage 3 — history
-- reconstruction + one hours ledger): additive, non-destructive
-- implementation pre-approved by the owner; still draft + needs-human-gate,
-- applied only by main via Supabase MCP `apply_migration` after review.
-- ============================================================================
-- 20261024100000 — business-period statements carry the PRECISION and the
-- BASIS of each bound, and the earlier legal entity's REGISTRY identifier.
--
-- PROBLEM (production, read-only 2026-10-24)
--   `organization_history_periods` is the ONE place a company states an
--   earlier legal entity whose business it continues (decision 0025
--   addendum B: separate legal entities, one person history). A statement
--   has ONE `basis` and day-exact bounds. Real successions are not like that:
--     · the START of the earlier entity is a register fact (its court
--       registration day — basis `registry_extract`, day precision);
--     · the END (the takeover by other owners) is often known only to the
--       MONTH from the owner ("January"), while the register shows the
--       change later — basis `owner_statement`, month precision.
--   With one basis and day-exact bounds the statement must either invent a
--   day or stay undated. Undated, the one professional history cannot place
--   the earlier entity's work by date (lib/journal/professional-experience.ts
--   rule 8), so the work done under the earlier entity reads as the new
--   company's — exactly what the owner forbids ("never present the earlier
--   entity's work as performed by the successor").
--   The earlier entity also has no platform organization row (it belongs to
--   other owners now): its registry identity has nowhere to live, so the
--   statement cannot be upgraded from `owner_statement` to a register fact.
--
-- SOLUTION (smallest coherent structure; no new table, no new function, no
--   grant, no policy change):
--     period_start_precision / period_end_precision  day | month | year
--         NULL = as stated (day). A reader places only work CERTAINLY inside
--         the inner span (lib/journal/professional-experience.ts periodForDates).
--     period_start_basis / period_end_basis           same vocabulary as `basis`
--         NULL = the row's `basis` applies.
--     legal_entity_registry_scheme / _value / _country
--         the earlier entity's register identifier (e.g. a court register
--         number), so a statement can name the entity it continues without a
--         platform organization row. Both scheme and value, or neither.
--   The table stays APPEND-ONLY (INSERT + SELECT policies only, unchanged):
--   a statement with dates is a NEW row with `supersedes_id`, never an edit.
--
-- DATA: no row is created, altered or deleted. Every existing row keeps NULL
--   in every new column = exactly today's meaning.
--
-- ROLLBACK: supabase/rollbacks/20261024100000_history_period_precision_and_registry_v1.down.sql
--   drops the seven columns (and their checks). Rows written meanwhile keep
--   their dates and basis; only the precision / per-bound basis / registry
--   identifier are lost — so before rolling back, copy any non-null values
--   into `basis_reference` text.
--
-- POST-APPLY VERIFICATION (main, via MCP execute_sql):
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'organization_history_periods'
--      and column_name like any (array['period_%_precision','period_%_basis','legal_entity_registry_%']);
--   -- expect 7 rows, all nullable
--   select count(*) from public.organization_history_periods
--    where coalesce(period_start_precision, period_end_precision, period_start_basis,
--                   period_end_basis, legal_entity_registry_scheme) is not null;
--   -- expect 0 (no existing row changed)
-- ============================================================================

begin;

alter table public.organization_history_periods
  add column if not exists period_start_precision text,
  add column if not exists period_end_precision text,
  add column if not exists period_start_basis text,
  add column if not exists period_end_basis text,
  add column if not exists legal_entity_registry_scheme text,
  add column if not exists legal_entity_registry_value text,
  add column if not exists legal_entity_registry_country text;

alter table public.organization_history_periods
  add constraint organization_history_periods_start_precision_check
    check (period_start_precision is null or period_start_precision in ('day', 'month', 'year')),
  add constraint organization_history_periods_end_precision_check
    check (period_end_precision is null or period_end_precision in ('day', 'month', 'year')),
  add constraint organization_history_periods_start_basis_check
    check (period_start_basis is null
           or period_start_basis in ('owner_statement', 'registry_extract', 'contract', 'other_document')),
  add constraint organization_history_periods_end_basis_check
    check (period_end_basis is null
           or period_end_basis in ('owner_statement', 'registry_extract', 'contract', 'other_document')),
  -- A precision or a per-bound basis says something about a bound that exists.
  add constraint organization_history_periods_start_detail_needs_bound
    check ((period_start_precision is null and period_start_basis is null) or period_start is not null),
  add constraint organization_history_periods_end_detail_needs_bound
    check ((period_end_precision is null and period_end_basis is null) or period_end is not null),
  add constraint organization_history_periods_registry_scheme_check
    check (legal_entity_registry_scheme is null
           or legal_entity_registry_scheme in ('krs', 'nip', 'regon', 'jar_code', 'vat', 'other')),
  add constraint organization_history_periods_registry_value_check
    check (legal_entity_registry_value is null
           or char_length(btrim(legal_entity_registry_value)) between 1 and 64),
  add constraint organization_history_periods_registry_country_check
    check (legal_entity_registry_country is null or legal_entity_registry_country ~ '^[A-Z]{2}$'),
  add constraint organization_history_periods_registry_pair
    check ((legal_entity_registry_scheme is null) = (legal_entity_registry_value is null));

comment on column public.organization_history_periods.period_start_precision is
  'How precisely period_start is known: day | month | year. NULL = as stated (day). Readers place only work certainly inside the inner span.';
comment on column public.organization_history_periods.period_end_precision is
  'How precisely period_end is known: day | month | year. NULL = as stated (day).';
comment on column public.organization_history_periods.period_start_basis is
  'Basis of period_start alone (owner_statement | registry_extract | contract | other_document). NULL = the row basis applies.';
comment on column public.organization_history_periods.period_end_basis is
  'Basis of period_end alone. NULL = the row basis applies.';
comment on column public.organization_history_periods.legal_entity_registry_scheme is
  'Register scheme of the earlier legal entity (krs | nip | regon | jar_code | vat | other); set together with legal_entity_registry_value.';
comment on column public.organization_history_periods.legal_entity_registry_value is
  'The earlier legal entity''s register identifier, as registered.';
comment on column public.organization_history_periods.legal_entity_registry_country is
  'ISO 3166-1 alpha-2 country of the register.';

commit;

-- ROLLBACK (down) — also shipped as supabase/rollbacks/20261024100000_history_period_precision_and_registry_v1.down.sql
-- alter table public.organization_history_periods
--   drop column if exists period_start_precision,
--   drop column if exists period_end_precision,
--   drop column if exists period_start_basis,
--   drop column if exists period_end_basis,
--   drop column if exists legal_entity_registry_scheme,
--   drop column if exists legal_entity_registry_value,
--   drop column if exists legal_entity_registry_country;
