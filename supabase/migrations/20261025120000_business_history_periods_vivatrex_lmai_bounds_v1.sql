-- ============================================================================
-- 20261025120000 — BUSINESS HISTORY PERIODS: document-grounded bounds for the
-- Vivat Rex period, and the missing Labour Market AI period.
--
-- Executes the owner's 2026-09-30 business-history-continuity decision (already
-- made — not re-opened here) against production org `19f47e78`
-- (Labour market ai Sp. z o.o — the continuing business). It fills the MISSING
-- historical-employer periods so the existing read composer
-- (lib/organization-evidence/business-history.ts) places each of the 2944
-- historical records with its correct historical employer, COMPOSED ON READ.
-- No evidence record is moved or rewritten; no supplied_by_organization_id
-- changes; append-only (a correction is a new superseding row).
--
-- Why needed: today one period row exists ("Vivat Rex", NULL bounds), so only
-- the 800 label-matched records are placed; ~2132 pre-switch records and all 12
-- post-switch records are "not placed". The composer places by date only when
-- BOTH bounds are set, so each period here carries documented bounds.
--
-- DOCUMENT BASIS (primary sources — owner mailbox / Drive; see
-- docs/launch/HISTORICAL_ORG_LINKAGE_CORRECTION_2026-10-25.md):
--   · 2026-02-23 company switch: owner mailbox thread (Ramūnas Šukys → De
--     Klusbaas) "establishing a new company … do not send money to V.R."; first
--     invoice NL26001_23february2026; new entity Labour Market AI Sp. z o.o,
--     NIP 7011295735. → Vivat Rex end = 2026-02-22, Labour Market AI start = 2026-02-23.
--   · Production boundary (read-only 2026-10-25): 2932 records < 2026-02-23, 12 on/after.
--   · Vivat Rex start = 2022-01-17 = earliest documented evidence day for this
--     business (basis other_document; precision day).
--   · Labour Market AI end = 2026-03-29 = last documented evidence day so far
--     (basis other_document); the period is extended by a superseding row when
--     later records arrive — NULL end cannot place by date in this composer.
--   · legal_entity_relation stays 'not_asserted' (the 2026-09-30 decision; not
--     re-opened). "Nonstop-Vivat Rex PL" stays a Vivat Rex source label
--     (dataset provenance), never a Nonstop party — same decision.
--
-- APPEND-ONLY, re-runnable (each insert guarded). RED (data write stating a
-- business-history fact). ROLLBACK:
-- supabase/rollbacks/20261025120000_business_history_periods_vivatrex_lmai_bounds_v1.down.sql
-- ============================================================================

begin;

-- 1. Vivat Rex period: documented bounds, by superseding the current live row.
insert into public.organization_history_periods
  (organization_id, period_label, legal_entity_label, legal_entity_organization_id,
   source_labels, period_start, period_start_precision, period_start_basis,
   period_end, period_end_precision, period_end_basis,
   continuity, legal_entity_relation, basis, basis_reference, statement, supersedes_id)
select
  live.organization_id,
  live.period_label,
  live.legal_entity_label,
  live.legal_entity_organization_id,
  live.source_labels,
  date '2022-01-17', 'day', 'other_document',   -- earliest documented evidence day
  date '2026-02-22', 'day', 'contract',         -- day before the documented 2026-02-23 switch
  live.continuity,
  live.legal_entity_relation,                   -- not_asserted (2026-09-30 decision)
  'contract',
  'Primary sources: owner mailbox thread 2026-02-23 (switch away from V.R.), invoice NL26001_23february2026; Drive "umowa zlecenia dla Vivat Rex". docs/launch/HISTORICAL_ORG_LINKAGE_CORRECTION_2026-10-25.md',
  live.statement,
  live.id
from public.organization_history_periods live
where live.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and lower(btrim(live.period_label)) = 'vivat rex'
  and live.supersedes_id is null
  and not exists (
    select 1 from public.organization_history_periods nx
    where nx.supersedes_id = live.id
      and nx.period_start = date '2022-01-17'
      and nx.period_end = date '2026-02-22'
  );

-- 2. Labour Market AI Sp. z o.o period: the documented successor period.
insert into public.organization_history_periods
  (organization_id, period_label, legal_entity_label, legal_entity_organization_id,
   source_labels, period_start, period_start_precision, period_start_basis,
   period_end, period_end_precision, period_end_basis,
   continuity, legal_entity_relation, basis, basis_reference, statement, supersedes_id)
select
  '19f47e78-7bd1-4120-9937-603dba769f8a',
  'Labour Market AI Sp. z o.o',
  'Labour market ai Sp. z o.o',
  '19f47e78-7bd1-4120-9937-603dba769f8a',    -- the legal entity IS this platform organization
  '{}'::text[],
  date '2026-02-23', 'day', 'contract',      -- first day under the new company
  date '2026-03-29', 'day', 'other_document',-- last documented evidence day so far (extended by supersede)
  'continuous_business_history',
  'not_asserted',
  'contract',
  'Primary sources: owner mailbox thread 2026-02-23; invoice NL26001_23february2026; NIP 7011295735, Żurawia 47/49 Warszawa. docs/launch/HISTORICAL_ORG_LINKAGE_CORRECTION_2026-10-25.md',
  'From 2026-02-23 the De Klusbaas work was invoiced by the newly established Labour Market AI Sp. z o.o, continuing the same business history previously carried under Vivat Rex. Legal-entity identity is not asserted.',
  null
where not exists (
  select 1 from public.organization_history_periods p
  where p.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
    and lower(btrim(p.period_label)) = 'labour market ai sp. z o.o'
    and p.supersedes_id is null
);

commit;

-- ROLLBACK (down): supabase/rollbacks/20261025120000_business_history_periods_vivatrex_lmai_bounds_v1.down.sql
