-- ============================================================================
-- MIGRATION ALREADY APPLIED IN PRODUCTION — NEVER MANUALLY RE-APPLY.
--
-- Production ledger version : 20261025050302
-- Production ledger name    : history_period_precision_and_registry_v1
-- Restored to repo          : 2026-11-01, for migration-history parity only. The live
--                             migration-parity gate (quality) found this ledger row with
--                             no repository file; the owner approved restoring the six
--                             such rows byte-exact (option 2, 2026-11-01).
-- Source of truth           : supabase_migrations.schema_migrations.statements of the row
--                             above, read 2026-11-01. Later-edited branch copies were NOT
--                             used as a source.
-- Parity proof              : everything after the marker line below is BYTE-EXACT to
--                             production's stored statements (3552 bytes).
--                             md5 = 2018655993c11548dcd6354449141042
--                             Verify: drop every line up to and including the marker line,
--                             then md5sum the remainder (no trailing newline).
-- ROLLBACK                  : supabase/rollbacks/20261025050302_history_period_precision_and_registry_v1.down.sql — RECONSTRUCTED after the
--                             production apply; the ledger stored no rollback. Local
--                             development resets and repo governance only.
--
-- No migration-safety risk finding: this file carries NO human-gate annotation.
-- ============================================================================
-- >>> PRODUCTION STATEMENTS BELOW (byte-exact; do not edit) <<<
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