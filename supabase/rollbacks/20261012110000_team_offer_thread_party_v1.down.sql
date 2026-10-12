-- Rollback for 20261012110000_team_offer_thread_party_v1.sql
-- The function stores nothing; dropping it loses no data. The thread action
-- then degrades to ?notice=cannot_open again.
drop function if exists public.team_offer_thread_party_v1(uuid);
