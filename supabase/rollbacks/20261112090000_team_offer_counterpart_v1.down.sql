-- Rollback of 20261112090000 (team_offer_counterpart_v1). The function holds
-- no data; dropping it only returns team-offer notifications to
-- "recipient unresolved" (nothing is sent), which is the state before it.
begin;
drop function if exists public.team_offer_counterpart_v1(uuid);
commit;
