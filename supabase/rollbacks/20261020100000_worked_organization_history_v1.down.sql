-- Rollback for 20261020100000_worked_organization_history_v1.sql
-- Both functions are NEW (v1 of the periods read, v2 of the names read);
-- dropping them restores the previous state exactly. The app degrades to the
-- leaders-only period read and the v1 names read when they are absent.
drop function if exists public.my_worked_organization_periods_v1(uuid[]);
drop function if exists public.my_historical_organization_names_v2(uuid[]);
