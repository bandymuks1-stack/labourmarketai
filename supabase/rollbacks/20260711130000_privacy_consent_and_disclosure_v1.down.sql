-- Rollback for 20260711130000_privacy_consent_and_disclosure_v1.sql
-- Restores the pre-migration state EXACTLY:
--  - the original (pre-consent) SELECT policies on workers / worker_skills /
--    worker_professions (as created in 0001_initial_schema.sql),
--  - drops every function, trigger and table added by the migration.
-- NOTE: rolling back re-opens the audited exposure (every employer sees every
-- worker again). Only use for a hard technical failure, not as a product choice.

-- 1. Restore original policies FIRST (so dropping can_view_worker is possible).
drop policy if exists workers_select on public.workers;
create policy workers_select
  on public.workers for select
  using ((profile_id = auth.uid()) or is_admin() or is_employer());

drop policy if exists worker_skills_select on public.worker_skills;
create policy worker_skills_select
  on public.worker_skills for select
  using (owns_worker(worker_id) or is_admin() or is_employer());

drop policy if exists worker_professions_select on public.worker_professions;
create policy worker_professions_select
  on public.worker_professions for select
  using (owns_worker(worker_id) or is_employer() or is_admin());

-- 2. Drop RPCs.
drop function if exists public.admin_list_worker_privacy_states();
drop function if exists public.admin_privacy_readiness_counts();
drop function if exists public.record_personal_data_disclosure(uuid, uuid, text, uuid, text[], uuid[], text);
drop function if exists public.has_employer_data_disclosure(uuid, uuid, text, uuid);
drop function if exists public.my_privacy_consent_history();
drop function if exists public.current_profile_discoverability_consent();
drop function if exists public.withdraw_employer_data_disclosure(uuid, text, uuid, text);
drop function if exists public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb);
drop function if exists public.withdraw_profile_discoverability_consent(text);
drop function if exists public.grant_profile_discoverability_consent(text, text, text, text);
drop function if exists public.can_view_worker(uuid);
drop function if exists public.worker_profile_discoverable(uuid);

-- 3. Drop ledgers (triggers + guard functions go with them).
drop trigger if exists personal_data_disclosures_append_only on public.personal_data_disclosures;
drop function if exists public.personal_data_disclosures_guard();
drop table if exists public.personal_data_disclosures;

drop trigger if exists privacy_consent_events_append_only on public.privacy_consent_events;
drop function if exists public.privacy_ledger_block_mutation();
drop table if exists public.privacy_consent_events;

drop table if exists public.privacy_consent_purposes;
