-- ROLLBACK for 20261025050302_history_period_precision_and_registry_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- Refuses while any of the added columns holds a value, so no recorded detail is lost.
begin;
do $$
begin
  if exists (select 1 from public.organization_history_periods
              where period_start_precision is not null or period_end_precision is not null
                 or period_start_basis is not null or period_end_basis is not null
                 or legal_entity_registry_scheme is not null or legal_entity_registry_value is not null
                 or legal_entity_registry_country is not null) then
    raise exception 'rollback refused: precision/basis/registry values are recorded';
  end if;
end $$;
alter table public.organization_history_periods
  drop constraint if exists organization_history_periods_start_precision_check,
  drop constraint if exists organization_history_periods_end_precision_check,
  drop constraint if exists organization_history_periods_start_basis_check,
  drop constraint if exists organization_history_periods_end_basis_check,
  drop constraint if exists organization_history_periods_start_detail_needs_bound,
  drop constraint if exists organization_history_periods_end_detail_needs_bound,
  drop constraint if exists organization_history_periods_registry_scheme_check,
  drop constraint if exists organization_history_periods_registry_value_check,
  drop constraint if exists organization_history_periods_registry_country_check,
  drop constraint if exists organization_history_periods_registry_pair;
alter table public.organization_history_periods
  drop column if exists period_start_precision,
  drop column if exists period_end_precision,
  drop column if exists period_start_basis,
  drop column if exists period_end_basis,
  drop column if exists legal_entity_registry_scheme,
  drop column if exists legal_entity_registry_value,
  drop column if exists legal_entity_registry_country;
commit;
