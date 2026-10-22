-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT; draft + needs-human-gate, owner applies)
-- agentai_capability_readback_counts_v1 — aggregate COUNTS for Agentai OS capability-contract re-verification.
--
-- WHY. Agentai OS cites LabourMarket.ai capabilities in employer outreach only while its capability contract
-- (agentai: contracts/labourmarket-capability-contract.json) is current. That contract is a dated snapshot of
-- production row counts; it expired 2026-10-22T13:53Z and nothing could re-measure it, because Agentai holds no
-- database connection string (owner 2026-10-21) and the agreed first-party route GET
-- /api/internal/capability-readback/v1 did not exist. This function is what that route reads.
--
-- WHY SECURITY DEFINER. In this database the service role bypasses RLS but is NOT granted SELECT on 14 of the 22 tables
-- counted here (measured 2026-10-22: worker_skills, customer_requests, projects, matches, … — the same gap
-- 20261012090000_ops_product_metrics_v1 documents). So, exactly like ops_product_metrics_v1: definer rights, a pinned
-- search_path, EXECUTE revoked from everyone and granted to service_role only.
--
-- WHAT. One jsonb object of non-negative integers, one key per count the contract's 17 readbacks need, and nothing
-- else: no row, no name, no id, no address. Every value is a COUNT over a whole table or a fixed filter of one.
-- Reads only; touches no workflow-engine object beyond counting workflow_instances / onboarding_runs.
--
-- enable_seqscan = off: public_vacancies is ~170k rows / 643 MB; a sequential count(*) exceeds 50 s on this instance,
-- the primary-key index count answers instantly (measured 2026-10-22). Only the planner choice changes.
--
-- ROLLBACK: supabase/rollbacks/20261022150000_agentai_capability_readback_counts_v1.down.sql

create or replace function public.agentai_capability_readback_counts_v1()
returns jsonb
language sql
stable
security definer
set search_path = public
set enable_seqscan = off
as $$
  select jsonb_build_object(
    'workers',                               (select count(*) from public.workers),
    'workers_with_profession',               (select count(distinct worker_id) from public.worker_professions),
    'worker_skills',                         (select count(*) from public.worker_skills),
    'profile_skill_claims',                  (select count(*) from public.profile_skill_claims),
    'matches',                               (select count(*) from public.matches),
    'match_actions',                         (select count(*) from public.match_actions),
    'public_vacancies',                      (select count(*) from public.public_vacancies),
    'public_vacancies_browsable',            (select count(*) from public.public_vacancies
                                               where is_active and (expires_at is null or expires_at > now())),
    'public_vacancies_identified_employers', (select count(distinct employer_name) from public.public_vacancies
                                               where is_active and (expires_at is null or expires_at > now())),
    'vacancy_import_cursors',                (select count(*) from public.vacancy_import_cursors),
    'journal_entries',                       (select count(*) from public.journal_entries),
    'journal_entry_skills',                  (select count(*) from public.journal_entry_skills),
    'journal_entry_confirmations',           (select count(*) from public.journal_entry_confirmations),
    'projects',                              (select count(*) from public.projects),
    'project_worker_assignments',            (select count(*) from public.project_worker_assignments),
    'worker_absences',                       (select count(*) from public.worker_absences),
    'booking_requests',                      (select count(*) from public.booking_requests),
    'company_worker_engagements',            (select count(*) from public.company_worker_engagements),
    'customer_requests',                     (select count(*) from public.customer_requests),
    'company_need_public_intakes',           (select count(*) from public.company_need_public_intakes),
    'service_offerings',                     (select count(*) from public.service_offerings),
    'workflow_instances',                    (select count(*) from public.workflow_instances),
    'onboarding_runs',                       (select count(*) from public.onboarding_runs),
    'ai_runs',                               (select count(*) from public.ai_runs)
  );
$$;

revoke all on function public.agentai_capability_readback_counts_v1() from public, anon, authenticated;
grant execute on function public.agentai_capability_readback_counts_v1() to service_role;

comment on function public.agentai_capability_readback_counts_v1() is
  'Aggregate counts only, for the Agentai OS capability readback route. EXECUTE: service_role only.';
