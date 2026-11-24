-- Rollback for 20260714161000_self_declared_work_history_v1.sql — drops the
-- two RPCs only. Self-declared engagement rows the worker already confirmed
-- through the save RPC are the worker's own entered data and stay in place
-- (removing them would silently erase user facts — same convention as the
-- 20260702140000 personal-engagement down note). No table, policy or grant
-- was changed by the up migration.
begin;

drop function if exists public.save_self_declared_work_history_v1(text, text, date, date);
drop function if exists public.remove_self_declared_work_history_v1(uuid);

commit;
