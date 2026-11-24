-- Rollback for 20260714170000_worker_opportunity_seen_v1.sql — restores the
-- prior state exactly. The feature created ONE new table (its policy + index)
-- and ONE RPC; seen markers live only in that table, so dropping it removes
-- every feature-created object. No existing RPC/trigger/table was recreated.
-- Consumers feature-detect the absence and degrade honestly (the "new job
-- matches" spine count returns to 0; the card's "Nauja" chip falls back to
-- the 7-day created_at window).
begin;

drop function if exists public.mark_worker_opportunities_seen_v1(uuid[]);
drop policy if exists worker_opportunity_seen_select on public.worker_opportunity_seen;
drop index if exists worker_opportunity_seen_profile_idx;
drop table if exists public.worker_opportunity_seen;

commit;
