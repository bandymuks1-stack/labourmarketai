-- Rollback for 20260713120000_company_locations_v1.sql
-- Drops the write RPCs and the company_locations table. Company geography
-- rows are owner-entered management data (no worker data) — assert the
-- owner accepts losing them before running.

drop function if exists public.save_company_location_v1(text, text, text, text, text, double precision, double precision);
drop function if exists public.remove_company_location_v1(uuid);

drop trigger if exists trg_company_locations_updated_at on public.company_locations;
drop table if exists public.company_locations;
