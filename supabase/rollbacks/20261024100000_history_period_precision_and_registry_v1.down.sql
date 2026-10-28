-- Rollback of 20261024100000_history_period_precision_and_registry_v1.
-- Additive columns only; dropping them drops their check constraints too.
-- Rows keep their dates and basis. Before running, copy any non-null
-- precision / per-bound basis / registry identifier into basis_reference
-- (or accept that only those details are lost). No policy, grant or
-- function depends on these columns.
begin;
alter table public.organization_history_periods
  drop column if exists period_start_precision,
  drop column if exists period_end_precision,
  drop column if exists period_start_basis,
  drop column if exists period_end_basis,
  drop column if exists legal_entity_registry_scheme,
  drop column if exists legal_entity_registry_value,
  drop column if exists legal_entity_registry_country;
commit;
