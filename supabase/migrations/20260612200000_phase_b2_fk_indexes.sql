-- ============================================================================
-- 20260612200000 — Phase B2: additive FK indexes for taxonomy/reference paths.
--
-- WHY: continues closing `unindexed_foreign_keys` (advisor INFO). Phase B1
-- (20260612190000) indexed 15 active-path FKs (49 → 34). This slice indexes
-- the 10 taxonomy/reference/lookup FKs — columns that point at slug registries
-- and reference catalogues (skills, professions, esco_skills, document_types,
-- productivity_units, plans, countries). Person/actor/ownership FKs are left
-- for Phase B3 (see docs/audits/PHASE_B2_FK_INDEXES.md).
--
-- SCOPE: strictly additive. `CREATE INDEX IF NOT EXISTS` only — no RLS, no
-- policy, no grant, no SECURITY DEFINER, no data change, no UI/API change.
-- GREEN tier. Non-concurrent inside a transaction; target tables are small.
-- ============================================================================

begin;

-- skills / professions / esco taxonomy
create index if not exists idx_worker_skills_skill_id
  on public.worker_skills (skill_id);
create index if not exists idx_worker_skills_current_pace_unit_slug
  on public.worker_skills (current_pace_unit_slug);
create index if not exists idx_worker_professions_profession_id
  on public.worker_professions (profession_id);
create index if not exists idx_profession_skills_skill_id
  on public.profession_skills (skill_id);
create index if not exists idx_esco_occupation_skills_skill_id
  on public.esco_occupation_skills (skill_id);

-- document-type taxonomy
create index if not exists idx_worker_documents_document_type_slug
  on public.worker_documents (document_type_slug);
create index if not exists idx_country_document_requirements_document_type_slug
  on public.country_document_requirements (document_type_slug);

-- productivity-unit taxonomy
create index if not exists idx_productivity_units_base_unit_slug
  on public.productivity_units (base_unit_slug);

-- plans reference
create index if not exists idx_subscriptions_plan_id
  on public.subscriptions (plan_id);

-- countries reference
create index if not exists idx_organizations_country
  on public.organizations (country);

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see supabase/rollbacks/20260612200000_phase_b2_fk_indexes.down.sql).
-- Drops ONLY the 10 indexes created here. Reversible, no data impact.
-- ─────────────────────────────────────────────────────────────────────────
