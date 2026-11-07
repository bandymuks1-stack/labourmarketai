-- Rollback of 20261029120000_agentai_daily_growth_aggregate_v1: the function holds no data and nothing depends on it
-- except the growth-daily route, which answers 503 without it.
drop function if exists public.agentai_daily_growth_aggregate_v1(date);
