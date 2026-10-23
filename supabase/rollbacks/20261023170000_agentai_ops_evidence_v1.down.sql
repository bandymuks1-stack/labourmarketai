-- Rollback of 20261023170000_agentai_ops_evidence_v1. The table holds only Agentai OS machine snapshots (no personal
-- data, re-sent every cycle); the ops evidence route answers 503 without the function.
drop function if exists public.agentai_ops_evidence_insert_v1(jsonb);
drop table if exists public.agentai_ops_evidence;
