-- ROLLBACK for 20261019160000_worker_public_summary_v1.sql
-- Removes the RPC only. Text people already wrote stays in workers.headline /
-- workers.bio (their own data; erasure handles it with the worker row).

begin;

drop function if exists public.save_worker_public_summary_v1(text, text);

commit;
