-- Rollback for 20261122130000_rls_worker_lookup_initplan_v1: the 18 policy
-- bodies exactly as they were before it, i.e. after #3575
-- (20261121100200, booking_requests_select) and as production read
-- 2026-11-22 for the other 17.

begin;

alter policy asset_assignments_select on public.asset_assignments
  using ((caller_manages_asset(asset_id) OR is_admin() OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = asset_assignments.worker_id) AND (w.profile_id = auth.uid()))))));

alter policy booking_request_events_select on public.booking_request_events
  using (((EXISTS ( SELECT 1
   FROM booking_requests br
  WHERE ((br.id = booking_request_events.booking_request_id) AND ((br.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM workers w
          WHERE ((w.id = br.worker_id) AND (w.profile_id = auth.uid())))))))) OR is_admin()));

alter policy booking_requests_select on public.booking_requests
  using ((((owner_id = auth.uid()) AND ((organization_id IS NULL) OR has_org_demand_access(organization_id))) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = booking_requests.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin() OR has_org_demand_access(organization_id)));

alter policy commercial_handoffs_worker_select on public.commercial_handoffs
  using ((is_admin() OR (worker_id IN ( SELECT w.id
   FROM workers w
  WHERE (w.profile_id = auth.uid())))));

alter policy company_worker_engagements_select on public.company_worker_engagements
  using ((owns_company(company_id) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = company_worker_engagements.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin()));

alter policy contact_disclosure_request_events_select on public.contact_disclosure_request_events
  using (((EXISTS ( SELECT 1
   FROM contact_disclosure_requests r
  WHERE ((r.id = contact_disclosure_request_events.contact_disclosure_request_id) AND ((r.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM workers w
          WHERE ((w.id = r.worker_id) AND (w.profile_id = auth.uid())))))))) OR is_admin()));

alter policy contact_disclosure_requests_select on public.contact_disclosure_requests
  using (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = contact_disclosure_requests.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin() OR has_org_demand_access(organization_id)));

alter policy demand_interest_signals_worker_insert on public.demand_interest_signals
  with check (((worker_id IN ( SELECT w.id
   FROM workers w
  WHERE (w.profile_id = auth.uid()))) AND (status = 'interested'::text) AND (((request_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM list_open_demand_for_workers() b(id, role_text, country, team_size, start_period, accommodation, created_at, company_name, route_status, location_label, transport, required_tools, structured, need_skill_slugs, need_skill_source)
  WHERE (b.id = demand_interest_signals.request_id)))) OR ((request_id IS NULL) AND (public_vacancy_id IS NOT NULL)))));

alter policy demand_interest_signals_worker_select on public.demand_interest_signals
  using ((worker_id IN ( SELECT w.id
   FROM workers w
  WHERE (w.profile_id = auth.uid()))));

alter policy demand_interest_signals_worker_update on public.demand_interest_signals
  using ((worker_id IN ( SELECT w.id
   FROM workers w
  WHERE (w.profile_id = auth.uid()))))
  with check ((worker_id IN ( SELECT w.id
   FROM workers w
  WHERE (w.profile_id = auth.uid()))));

alter policy organization_people_subject_decides on public.organization_people
  using ((linked_profile_id = auth.uid()))
  with check ((((link_state = 'linked'::text) AND (link_method = 'worker_confirmed'::text) AND (linked_profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = organization_people.linked_worker_id) AND (w.profile_id = auth.uid()))))) OR ((link_state = 'unlinked'::text) AND (linked_profile_id IS NULL) AND (linked_worker_id IS NULL))));

alter policy pwos_select on public.project_worker_operational_statuses
  using ((can_manage_project(project_id) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = project_worker_operational_statuses.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin()));

alter policy pwri_select on public.project_worker_readiness_items
  using ((can_manage_project(project_id) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = project_worker_readiness_items.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin()));

alter policy work_plan_entries_select on public.work_plan_entries
  using ((manages_organization(organization_id) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = work_plan_entries.worker_id) AND (w.profile_id = auth.uid()))))));

alter policy worker_absences_select on public.worker_absences
  using (((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = worker_absences.worker_id) AND (w.profile_id = auth.uid())))) OR (caller_manages_worker_absence(worker_id) AND (status = 'requested'::text)) OR is_admin()));

alter policy worker_documents_select on public.worker_documents
  using (((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = worker_documents.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin()));

alter policy worker_saved_opportunities_select on public.worker_saved_opportunities
  using (((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = worker_saved_opportunities.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin()));

alter policy worker_saved_searches_select on public.worker_saved_searches
  using (((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = worker_saved_searches.worker_id) AND (w.profile_id = auth.uid())))) OR is_admin()));


commit;
