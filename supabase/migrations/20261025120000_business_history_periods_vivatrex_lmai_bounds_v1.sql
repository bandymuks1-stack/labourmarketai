-- ============================================================================
-- 20261025120000 — BUSINESS HISTORY PERIODS: document-grounded bounds for the
-- Vivat Rex period, and the missing Labour Market AI period.
--
-- RED by rule (data write that states a business-history / legal-entity fact and
-- governs how 2944 historical evidence records are placed on read). Owner-gated.
-- Apply ONLY via Supabase MCP apply_migration AFTER the owner approves the exact
-- SQL and the one flagged date (see §OWNER DECISION below). Do NOT auto-merge.
-- @human-gate  (NOT @human-gate-approved: the owner has not yet approved this SQL)
--
-- WHY. Production org `19f47e78` (Labour market ai Sp. z o.o — the CONTINUING
-- business, the platform-operator legal entity today) holds 2944 historical
-- evidence records, span 2022-01-17 → 2026-03-29, every row supplier_role
-- 'employer'. Per the owner model (docs/design/business-history-continuity-v1.md,
-- 2026-09-30) the records correctly stay under this organization as the
-- continuing-business anchor; the historical LEGAL employer is expressed by the
-- period a record falls in, COMPOSED ON READ (lib/organization-evidence/
-- business-history.ts) from the record's source-sheet label, else its date.
--
-- Today exactly ONE period row exists ("Vivat Rex", source_labels
-- {Vivat Rex PL, Nonstop-Vivat Rex PL}) with NULL bounds. NULL bounds place
-- nothing by date, so only the 800 label-matched records are placed; the other
-- ~2132 pre-switch records are "not placed", and the post-switch records have no
-- period at all. This migration closes both gaps WITHOUT moving any record or
-- changing any supplied_by_organization_id — the two forbidden conflations.
--
-- DOCUMENT BASIS (primary sources, owner mailbox / Drive):
--   · Company switch is DOCUMENTED on 2026-02-23: Ramūnas Šukys (sss.ramunas@
--     gmail.com) to De Klusbaas B.V. — "we are establishing a new company in
--     Poland … do not send money to V.R. … lower taxes as for a new company";
--     first invoice under the new name is NL26001_23february2026. The new entity
--     is Labour Market AI Sp. z o.o (NIP 7011295735, Żurawia 47/49 Warszawa).
--     → Vivat Rex period_end = 2026-02-22; Labour Market AI period_start = 2026-02-23.
--   · Client / main contractor throughout: De Klusbaas B.V. (KvK 86884913), the
--     party invoiced — NOT the employer. Recorded in the plan doc, not asserted here.
--   · Production boundary check (read-only, 2026-10-25): 2932 records dated
--     < 2026-02-23, 12 records on/after. Matches the documented switch.
--
-- OWNER DECISION still required before apply (one date + one relation):
--   (1) Vivat Rex period_start. Set below to 2022-01-17 = the EARLIEST evidence
--       day. Source sheets name "Vivat Rex PL" only from 2024 and person-name
--       sheets in 2022; the 2022 employer identity is NOT fully documented. The
--       owner must confirm 2022-01-17, or give the real start, before apply.
--   (2) legal_entity_relation stays 'not_asserted' (unchanged). The owner's
--       2026-09-30 statement ("sold; people continued through LabourMarket.ai")
--       reads as 'sold_and_continued_by_new_entity'; upgrading needs the owner's
--       word + the Vivat Rex contract as basis. Left as-is on purpose.
--
-- APPEND-ONLY. A period is corrected by a NEW row whose supersedes_id points at
-- the row it replaces; the original statement stays permanent. Re-runnable: each
-- insert is guarded so a second apply writes nothing.
--
-- ROLLBACK: supabase/rollbacks/20261025120000_business_history_periods_vivatrex_lmai_bounds_v1.down.sql
-- ============================================================================

begin;

-- 1. Vivat Rex period: add the DOCUMENTED end bound (2026-02-22) and the flagged
--    start bound, by superseding the current live row. source_labels / statement
--    / continuity / relation / basis carried verbatim from the live row.
insert into public.organization_history_periods
  (organization_id, period_label, legal_entity_label, legal_entity_organization_id,
   source_labels, period_start, period_end, continuity, legal_entity_relation,
   basis, basis_reference, statement, supersedes_id)
select
  live.organization_id,
  live.period_label,
  live.legal_entity_label,
  live.legal_entity_organization_id,
  live.source_labels,
  date '2022-01-17',                         -- OWNER DECISION (1): earliest evidence day
  date '2026-02-22',                         -- DOCUMENTED: day before the 2026-02-23 switch
  live.continuity,
  live.legal_entity_relation,                -- unchanged: not_asserted (OWNER DECISION (2))
  'contract',                                -- stronger basis: the 2026-02-23 switch is documented
  'Primary sources: owner mailbox thread 2026-02-23 (switch away from V.R.), invoice NL26001_23february2026; Drive "umowa zlecenia dla Vivat Rex" contract. See docs/launch/HISTORICAL_ORG_LINKAGE_CORRECTION_2026-10-25.md',
  live.statement,
  live.id
from public.organization_history_periods live
where live.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and lower(btrim(live.period_label)) = 'vivat rex'
  and live.supersedes_id is null
  -- idempotency: do nothing if this live row was already superseded with these bounds
  and not exists (
    select 1 from public.organization_history_periods nx
    where nx.supersedes_id = live.id
      and nx.period_start = date '2022-01-17'
      and nx.period_end = date '2026-02-22'
  );

-- 2. Labour Market AI Sp. z o.o period: the documented successor period. Open end
--    (period_end NULL = not documented, never "open-ended"). No source-sheet label
--    exists for it (the prepared files carry none), so records are placed by date.
insert into public.organization_history_periods
  (organization_id, period_label, legal_entity_label, legal_entity_organization_id,
   source_labels, period_start, period_end, continuity, legal_entity_relation,
   basis, basis_reference, statement, supersedes_id)
select
  '19f47e78-7bd1-4120-9937-603dba769f8a',
  'Labour Market AI Sp. z o.o',
  'Labour market ai Sp. z o.o',
  '19f47e78-7bd1-4120-9937-603dba769f8a',    -- the legal entity IS this platform organization
  '{}'::text[],
  date '2026-02-23',                         -- DOCUMENTED: first day under the new company
  null,                                      -- end not documented
  'continuous_business_history',
  'not_asserted',
  'contract',
  'Primary sources: owner mailbox thread 2026-02-23; invoice NL26001_23february2026; NIP 7011295735, Żurawia 47/49 Warszawa. See docs/launch/HISTORICAL_ORG_LINKAGE_CORRECTION_2026-10-25.md',
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
-- Deletes ONLY the two rows this migration inserted (by their exact bounds +
-- supersedes link), restoring the prior single null-bound Vivat Rex head. Safe
-- because no other row references them (append-only; nothing supersedes them yet).
