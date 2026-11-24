-- Rollback for 20260717150000_demand_interest_seen_v1.sql — restores the
-- prior state exactly. The feature created ONE new table (its policy + index)
-- and ONE RPC; seen markers live only in that table, so dropping it removes
-- every feature-created object. No existing RPC/trigger/table was recreated.
-- Consumers feature-detect the absence and degrade honestly (no interest-
-- response count, no badge — the deferred spine signal simply stays
-- deferred, exactly as before the apply).
begin;

drop function if exists public.mark_demand_interest_seen_v1(uuid[]);
drop policy if exists demand_interest_seen_select on public.demand_interest_seen;
drop index if exists demand_interest_seen_profile_idx;
drop table if exists public.demand_interest_seen;

commit;
