-- agentai_capability_readback_counts_v1 — aggregate COUNTS for Agentai OS capability-contract re-verification.
--
-- WHY. Agentai OS cites LabourMarket.ai capabilities in employer outreach only while its capability contract
-- (agentai: contracts/labourmarket-capability-contract.json) is current. That contract is a dated snapshot of
-- production row counts; it expired 2026-10-22T13:53Z and nothing could re-measure it, because Agentai holds no
-- database connection string (owner 2026-10-21) and the agreed first-party route GET
-- /api/internal/capability-readback/v1 did not exist. This function is what that route reads.
--
-- WHAT. The four counts that need SQL (an index-only full count, two DISTINCT counts): a jsonb object of non-negative
-- integers and nothing else — no row, no name, no id, no address. The route takes every other readback count as an
-- exact head-count of its table through the same service client.
--
-- WHO. SECURITY INVOKER, no GRANT/REVOKE. The route calls it with the service role (which already reads every table
-- under RLS bypass); ANY other caller is refused before a single count runs, so an anonymous RPC call can neither read
-- totals nor make the database count 643 MB of vacancies.
--
-- enable_seqscan = off: public_vacancies is ~170k rows / 643 MB; a sequential count(*) exceeds 50 s on this instance,
-- the primary-key index count answers instantly (measured 2026-10-22). Only the planner choice changes.
--
-- ROLLBACK: supabase/rollbacks/20261022150000_agentai_capability_readback_counts_v1.down.sql

create or replace function public.agentai_capability_readback_counts_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set enable_seqscan = off
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'agentai_capability_readback_counts_v1: service role only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'public_vacancies',                      (select count(*) from public.public_vacancies),
    'public_vacancies_browsable',            (select count(*) from public.public_vacancies
                                               where is_active and (expires_at is null or expires_at > now())),
    'public_vacancies_identified_employers', (select count(distinct employer_name) from public.public_vacancies
                                               where is_active and (expires_at is null or expires_at > now())),
    'workers_with_profession',               (select count(distinct worker_id) from public.worker_professions)
  );
end;
$$;

comment on function public.agentai_capability_readback_counts_v1() is
  'Aggregate counts only, for the Agentai OS capability readback route. Service role only; raises for any other caller.';
