-- DOWN / rollback for 20260612190000_phase_b1_fk_indexes.sql
--
-- Drops ONLY the 15 indexes created by the forward migration. Reversible,
-- no data impact (indexes are derived structures). Apply via Supabase MCP
-- apply_migration, never `db push`.

begin;

drop index if exists public.idx_conversation_messages_project_id;
drop index if exists public.idx_conversation_participants_added_by;
drop index if exists public.idx_conversation_participants_revoked_by;
drop index if exists public.idx_journal_entries_profession_id;
drop index if exists public.idx_journal_entries_superseded_by;
drop index if exists public.idx_journal_entry_confirmations_confirmer_ctx;
drop index if exists public.idx_journal_entry_metrics_unit_slug;
drop index if exists public.idx_engagement_contexts_country_code;
drop index if exists public.idx_engagement_contexts_relationship_slug;
drop index if exists public.idx_customer_requests_customer_id;
drop index if exists public.idx_matches_job_demand_id;
drop index if exists public.idx_match_actions_actor_id;
drop index if exists public.idx_match_actions_match_id;
drop index if exists public.idx_agency_worker_invitations_inviter_profile_id;
drop index if exists public.idx_company_worker_invitations_inviter_profile_id;

commit;
