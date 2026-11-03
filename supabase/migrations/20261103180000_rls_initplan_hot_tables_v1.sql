-- @human-gate-approved — RED draft (system audit 2026-11-03, performance P2); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261103180000_rls_initplan_hot_tables_v1
--
-- ██ RED CLASS — human gate (ALTER POLICY on ten tables). Draft; owner-channel
-- ██ apply only, never auto-merged.
--
-- WHAT: in the row policies of the ten most-read tables, the row-INDEPENDENT
-- calls `auth.uid()`, `is_admin()` and `profile_role()` are wrapped as
-- `(select …)`. Postgres then evaluates each ONCE per statement (an InitPlan)
-- instead of once per row (Supabase advisor `auth_rls_initplan`).
--
-- WHY IT CHANGES NOTHING ABOUT WHO SEES WHAT: all three are STABLE functions
-- with ZERO arguments (verified on production 2026-11-03: auth.uid, is_admin,
-- profile_role → pronargs 0, provolatile 's'). A STABLE zero-argument call has
-- one value per statement, so `f()` and `(select f())` are the same predicate.
-- Every other term — the row-dependent functions (`can_view_worker`,
-- `owns_worker`, `manages_organization`, …), the EXISTS sub-queries, the
-- column comparisons — is copied VERBATIM from production `pg_policies`
-- (read 2026-11-03), not from older migration files. Roles, commands and
-- permissive/restrictive settings are untouched (ALTER POLICY changes only the
-- expressions given).
--
-- NOT IN THIS FILE: row-DEPENDENT functions are untouched (changing what they
-- compute is an authority change with its own design and proof). Measurements
-- and the follow-up design live in the private audit record. The remaining
-- `auth_rls_initplan` policies on smaller tables follow in later batches of
-- the same mechanical shape.
--
-- Rollback: supabase/rollbacks/20261103180000_rls_initplan_hot_tables_v1.down.sql
-- restores every expression exactly as production holds it today.

begin;

alter policy booking_requests_select on public.booking_requests
  using (((owner_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = booking_requests.worker_id) AND (w.profile_id = (select auth.uid()))))) OR (select is_admin()) OR has_org_demand_access(organization_id)));

alter policy education_cohort_members_select on public.education_cohort_members
  using (((profile_id = (select auth.uid())) OR is_education_cohort_internal_decider_v1(education_cohort_organization_v1(cohort_id)) OR (select is_admin())));

alter policy engagement_contexts_select on public.engagement_contexts
  using (((profile_id = (select auth.uid())) OR manages_organization(organization_id) OR (select is_admin())));

alter policy engagement_contexts_write on public.engagement_contexts
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy journal_entries_select on public.journal_entries
  using ((owns_worker(worker_id) OR (select is_admin()) OR (EXISTS ( SELECT 1
   FROM engagement_contexts ec
  WHERE ((ec.id = journal_entries.engagement_context_id) AND manages_organization(ec.organization_id))))));

alter policy journal_entry_confirmations_insert on public.journal_entry_confirmations
  with check (((confirmer_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM (journal_entries je
     JOIN engagement_contexts ec ON ((ec.id = je.engagement_context_id)))
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND (je.superseded_by IS NULL) AND (je.deleted_at IS NULL) AND manages_organization(ec.organization_id))))));

alter policy journal_entry_confirmations_select on public.journal_entry_confirmations
  using (((confirmer_id = (select auth.uid())) OR (select is_admin()) OR (EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND owns_worker(je.worker_id)))) OR (EXISTS ( SELECT 1
   FROM (journal_entries je
     JOIN engagement_contexts ec ON ((ec.id = je.engagement_context_id)))
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND manages_organization(ec.organization_id))))));

alter policy organizations_select on public.organizations
  using (((owner_profile_id = (select auth.uid())) OR belongs_to_organization(id) OR (select is_admin())));

alter policy organizations_write_admin on public.organizations
  using ((select is_admin()))
  with check ((select is_admin()));

alter policy profile_roles_delete on public.profile_roles
  using (((profile_id = (select auth.uid())) OR (select is_admin())));

alter policy profile_roles_insert on public.profile_roles
  with check (((profile_id = (select auth.uid())) OR (select is_admin())));

alter policy profile_roles_select on public.profile_roles
  using (((profile_id = (select auth.uid())) OR (select is_admin())));

alter policy profile_roles_update on public.profile_roles
  using (((profile_id = (select auth.uid())) OR (select is_admin())))
  with check (((profile_id = (select auth.uid())) OR (select is_admin())));

alter policy "Users can update own profile" on public.profiles
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));

alter policy profiles_delete on public.profiles
  using ((select is_admin()));

alter policy profiles_insert on public.profiles
  with check (((id = (select auth.uid())) OR (select is_admin())));

alter policy profiles_select on public.profiles
  using (((id = (select auth.uid())) OR (select is_admin())));

alter policy profiles_update on public.profiles
  using (((id = (select auth.uid())) OR (select is_admin())))
  with check (((id = (select auth.uid())) OR (select is_admin())));

alter policy worker_skills_write on public.worker_skills
  using ((owns_worker(worker_id) OR (select is_admin())))
  with check ((owns_worker(worker_id) OR (select is_admin())));

alter policy workers_delete on public.workers
  using (((profile_id = (select auth.uid())) OR (select is_admin())));

alter policy workers_insert on public.workers
  with check ((((profile_id = (select auth.uid())) AND ((select profile_role()) = 'worker'::text)) OR (select is_admin())));

alter policy workers_update on public.workers
  using (((profile_id = (select auth.uid())) OR (select is_admin())))
  with check (((profile_id = (select auth.uid())) OR (select is_admin())));

commit;
