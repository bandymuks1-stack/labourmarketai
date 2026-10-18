-- DOWN for 20260919190000_demand_lifecycle_colleague_v1
-- The migration created TWO functions and changed no table, policy, grant on
-- a table, trigger or row. Dropping them restores the prior state exactly;
-- needs already closed or reopened through them stay as they are — real,
-- audited decisions by an authorized person. The app degrades honestly to
-- the owner-only direct update it used before (42883 / PGRST202 fallback).

begin;

drop function if exists public.reopen_demand_v1(uuid);
drop function if exists public.close_demand_v1(uuid);

commit;
