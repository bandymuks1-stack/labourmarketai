-- Rollback for 20261103180000_rls_initplan_hot_tables_v1
-- Restores, exactly: the 22 policy expressions as production `pg_policies`
-- held them on 2026-11-03 (bare `auth.uid()` / `is_admin()` / `profile_role()`).
-- No data changes.

begin;

alter policy booking_requests_select on public.booking_requests
  using (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = booking_requests.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin() OR has_org_demand_access(organization_id)));

alter policy education_cohort_members_select on public.education_cohort_members
  using (((profile_id = auth.uid()) OR is_education_cohort_internal_decider_v1(education_cohort_organization_v1(cohort_id)) OR is_admin()));

alter policy engagement_contexts_select on public.engagement_contexts
  using (((profile_id = auth.uid()) OR manages_organization(organization_id) OR is_admin()));

alter policy engagement_contexts_write on public.engagement_contexts
  using (is_admin())
  with check (is_admin());

alter policy journal_entries_select on public.journal_entries
  using ((owns_worker(worker_id) OR is_admin() OR (EXISTS ( SELECT 1
   FROM engagement_contexts ec
  WHERE ((ec.id = journal_entries.engagement_context_id) AND manages_organization(ec.organization_id))))));

alter policy journal_entry_confirmations_insert on public.journal_entry_confirmations
  with check (((confirmer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (journal_entries je
     JOIN engagement_contexts ec ON ((ec.id = je.engagement_context_id)))
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND (je.superseded_by IS NULL) AND (je.deleted_at IS NULL) AND manages_organization(ec.organization_id))))));

alter policy journal_entry_confirmations_select on public.journal_entry_confirmations
  using (((confirmer_id = auth.uid()) OR is_admin() OR (EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND owns_worker(je.worker_id)))) OR (EXISTS ( SELECT 1
   FROM (journal_entries je
     JOIN engagement_contexts ec ON ((ec.id = je.engagement_context_id)))
  WHERE ((je.id = journal_entry_confirmations.entry_id) AND manages_organization(ec.organization_id))))));

alter policy organizations_select on public.organizations
  using (((owner_profile_id = auth.uid()) OR belongs_to_organization(id) OR is_admin()));

alter policy organizations_write_admin on public.organizations
  using (is_admin())
  with check (is_admin());

alter policy profile_roles_delete on public.profile_roles
  using (((profile_id = auth.uid()) OR is_admin()));

alter policy profile_roles_insert on public.profile_roles
  with check (((profile_id = auth.uid()) OR is_admin()));

alter policy profile_roles_select on public.profile_roles
  using (((profile_id = auth.uid()) OR is_admin()));

alter policy profile_roles_update on public.profile_roles
  using (((profile_id = auth.uid()) OR is_admin()))
  with check (((profile_id = auth.uid()) OR is_admin()));

alter policy "Users can update own profile" on public.profiles
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

alter policy profiles_delete on public.profiles
  using (is_admin());

alter policy profiles_insert on public.profiles
  with check (((id = auth.uid()) OR is_admin()));

alter policy profiles_select on public.profiles
  using (((id = auth.uid()) OR is_admin()));

alter policy profiles_update on public.profiles
  using (((id = auth.uid()) OR is_admin()))
  with check (((id = auth.uid()) OR is_admin()));

alter policy worker_skills_write on public.worker_skills
  using ((owns_worker(worker_id) OR is_admin()))
  with check ((owns_worker(worker_id) OR is_admin()));

alter policy workers_delete on public.workers
  using (((profile_id = auth.uid()) OR is_admin()));

alter policy workers_insert on public.workers
  with check ((((profile_id = auth.uid()) AND (profile_role() = 'worker'::text)) OR is_admin()));

alter policy workers_update on public.workers
  using (((profile_id = auth.uid()) OR is_admin()))
  with check (((profile_id = auth.uid()) OR is_admin()));

commit;
