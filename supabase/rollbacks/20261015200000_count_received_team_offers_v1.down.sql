-- ROLLBACK for 20261015200000_count_received_team_offers_v1.sql
-- Removes the count. lib/company/team-offer.ts falls back to the per-need
-- list_team_offers_for_request_v2 reads when the function is absent, so the
-- badge keeps its value — only the extra round trips return.
drop function if exists public.count_received_team_offers_v1(uuid[]);
