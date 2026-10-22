-- Rollback of 20261022150000_agentai_capability_readback_counts_v1: the function holds no data and nothing depends on it
-- except the capability readback route, which answers 503 without it.
drop function if exists public.agentai_capability_readback_counts_v1();
