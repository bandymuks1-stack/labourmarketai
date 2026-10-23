-- Rollback of 20261020172000_team_offer_agree_seen_terms_v1.
-- Drops v2; the app falls back to respond_team_demand_offer_v1 (42883).
drop function if exists public.respond_team_demand_offer_v2(uuid, text, integer);
