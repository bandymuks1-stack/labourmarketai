-- Rollback of 20261114150000_invitation_known_historical_unknown_v1: the function holds no data. Without it
-- readKnownHistoricalCount returns null and the unknown-outcome alert is kept (fail closed).
drop function if exists public.invitation_known_historical_unknown_v1(uuid[]);
