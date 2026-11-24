-- ============================================================================
-- 20260612190000 — Phase B1: additive FK indexes for active paths.
--
-- WHY: the 2026-06-12 advisor snapshot flagged `unindexed_foreign_keys`
-- (INFO ×49). A foreign-key column with no covering index forces sequential
-- scans on JOINs and reverse lookups, and makes parent-side ON UPDATE/DELETE
-- checks O(n). This slice indexes ONLY the active-path subset (chat, journal,
-- engagement, requests, matches, invitations) — 15 indexes — leaving the rest
-- for Phase B2/B3 (see docs/audits/PHASE_B1_FK_INDEXES.md).
--
-- SCOPE: strictly additive. `CREATE INDEX IF NOT EXISTS` only — no RLS, no
-- policy, no grant, no SECURITY DEFINER, no data change, no UI/API change.
-- GREEN tier. Indexes are created non-concurrently inside a transaction; the
-- target tables are small (early-stage prod), so the brief lock is negligible.
-- ============================================================================

begin;

-- chat / conversations
create index if not exists idx_conversation_messages_project_id
  on public.conversation_messages (project_id);
create index if not exists idx_conversation_participants_added_by
  on public.conversation_participants (added_by);
create index if not exists idx_conversation_participants_revoked_by
  on public.conversation_participants (revoked_by);

-- journal
create index if not exists idx_journal_entries_profession_id
  on public.journal_entries (profession_id);
create index if not exists idx_journal_entries_superseded_by
  on public.journal_entries (superseded_by);
create index if not exists idx_journal_entry_confirmations_confirmer_ctx
  on public.journal_entry_confirmations (confirmer_engagement_context_id);
create index if not exists idx_journal_entry_metrics_unit_slug
  on public.journal_entry_metrics (unit_slug);

-- engagement
create index if not exists idx_engagement_contexts_country_code
  on public.engagement_contexts (country_code);
create index if not exists idx_engagement_contexts_relationship_slug
  on public.engagement_contexts (relationship_slug);

-- demand / requests
create index if not exists idx_customer_requests_customer_id
  on public.customer_requests (customer_id);

-- matches
create index if not exists idx_matches_job_demand_id
  on public.matches (job_demand_id);
create index if not exists idx_match_actions_actor_id
  on public.match_actions (actor_id);
create index if not exists idx_match_actions_match_id
  on public.match_actions (match_id);

-- worker invitations
create index if not exists idx_agency_worker_invitations_inviter_profile_id
  on public.agency_worker_invitations (inviter_profile_id);
create index if not exists idx_company_worker_invitations_inviter_profile_id
  on public.company_worker_invitations (inviter_profile_id);

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see supabase/rollbacks/20260612190000_phase_b1_fk_indexes.down.sql).
-- Drops ONLY the 15 indexes created here. Reversible, no data impact.
-- ─────────────────────────────────────────────────────────────────────────
