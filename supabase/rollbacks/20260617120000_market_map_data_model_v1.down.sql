-- ============================================================================
-- ROLLBACK for 20260617120000_market_map_data_model_v1.sql
-- Reverses the Market Map Data Model v1 migration. Run ONLY to undo it.
--
-- The two NEW tables are additive → a clean DROP fully reverses them. The
-- EXTEND columns on company_demand_locations / projects are additive → dropping
-- them returns those tables to their prior shape. No data outside these new
-- tables/columns is touched.
-- ============================================================================

begin;

drop table if exists public.consented_login_location_signals;
drop table if exists public.preferred_locations;

alter table public.company_demand_locations
  drop column if exists granularity,
  drop column if exists need_type,
  drop column if exists people_count_min,
  drop column if exists people_count_max,
  drop column if exists start_date,
  drop column if exists end_date,
  drop column if exists urgency,
  drop column if exists mobility_required,
  drop column if exists accommodation_needed,
  drop column if exists active,
  drop column if exists visibility_level;

alter table public.projects
  drop column if exists granularity,
  drop column if exists location_confirmed,
  drop column if exists visibility_level;

commit;
