-- ============================================================================
-- 20260612210000 — Phase B3: remaining FK indexes (person/actor + org/project).
--
-- WHY: closes `unindexed_foreign_keys` (advisor INFO). B1 indexed 15 active-
-- path FKs (49 → 34), B2 indexed 10 taxonomy/reference FKs (34 → 24). B3
-- indexes the final 24 — person/actor/author refs and org-scope/project refs —
-- bringing the FK set to fully indexed (24 → 0 expected).
--
-- SIZE PREFLIGHT (read-only, 2026-06-12): every target table is tiny — the
-- largest is worker_skills (96 kB / 22 rows) and pilot_events (88 kB); all
-- others ≤72 kB. NONE is a large, write-heavy table, so plain non-concurrent
-- `CREATE INDEX` is safe (sub-millisecond build; any write-block window is
-- negligible). No table required `CREATE INDEX CONCURRENTLY`; nothing deferred.
--
-- SCOPE: strictly additive. `CREATE INDEX IF NOT EXISTS` only — no RLS, no
-- policy, no grant, no SECURITY DEFINER, no data change, no UI/API change.
-- GREEN tier.
-- ============================================================================

begin;

-- ── person / actor / author refs → profiles (or worker/profile rows) ──────
create index if not exists idx_agencies_profile_id
  on public.agencies (profile_id);
create index if not exists idx_agency_workers_worker_id
  on public.agency_workers (worker_id);
create index if not exists idx_audit_logs_actor_id
  on public.audit_logs (actor_id);
create index if not exists idx_candidate_drafts_linked_profile_id
  on public.candidate_drafts (linked_profile_id);
create index if not exists idx_company_workers_worker_id
  on public.company_workers (worker_id);
create index if not exists idx_consents_profile_id
  on public.consents (profile_id);
create index if not exists idx_language_feedback_user_id
  on public.language_feedback (user_id);
create index if not exists idx_leads_assigned_to
  on public.leads (assigned_to);
create index if not exists idx_market_rate_averages_entered_by
  on public.market_rate_averages (entered_by);
create index if not exists idx_pilot_events_profile_id
  on public.pilot_events (profile_id);
create index if not exists idx_productivity_units_created_by_profile_id
  on public.productivity_units (created_by_profile_id);
create index if not exists idx_subscriptions_profile_id
  on public.subscriptions (profile_id);
create index if not exists idx_worker_document_events_actor_id
  on public.worker_document_events (actor_id);
create index if not exists idx_worker_documents_updated_by
  on public.worker_documents (updated_by);
create index if not exists idx_worker_skills_verified_by
  on public.worker_skills (verified_by);
create index if not exists idx_project_worker_operational_statuses_updated_by
  on public.project_worker_operational_statuses (updated_by);
create index if not exists idx_project_worker_operational_statuses_worker_id
  on public.project_worker_operational_statuses (worker_id);
create index if not exists idx_project_worker_readiness_items_updated_by
  on public.project_worker_readiness_items (updated_by);
create index if not exists idx_project_worker_readiness_items_worker_id
  on public.project_worker_readiness_items (worker_id);

-- ── org-scope / project refs ──────────────────────────────────────────────
create index if not exists idx_job_demands_project_id
  on public.job_demands (project_id);
create index if not exists idx_productivity_units_organization_id
  on public.productivity_units (organization_id);
create index if not exists idx_profession_templates_organization_id
  on public.profession_templates (organization_id);
create index if not exists idx_skill_icons_organization_id
  on public.skill_icons (organization_id);
create index if not exists idx_projects_company_id
  on public.projects (company_id);

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see supabase/rollbacks/20260612210000_phase_b3_fk_indexes.down.sql).
-- Drops ONLY the 24 indexes created here. Reversible, no data impact.
-- ─────────────────────────────────────────────────────────────────────────
