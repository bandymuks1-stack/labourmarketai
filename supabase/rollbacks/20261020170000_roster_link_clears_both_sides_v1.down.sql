-- Rollback of 20261020170000_roster_link_clears_both_sides_v1.
-- Removes the trigger and its function; no data was changed by the migration.
drop trigger if exists organization_people_0_clear_both_link_sides_v1 on public.organization_people;
drop function if exists public.organization_people_clear_both_link_sides_v1();
