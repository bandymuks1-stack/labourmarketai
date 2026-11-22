-- The 18 policies #3604 touches, exactly as pg_policies reports them.
select 'POLICY|'||tablename||'|'||policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'<null>')||'|'||coalesce(with_check,'<null>')
  from pg_policies
 where schemaname = 'public'
   and (tablename, policyname) in (
   ('asset_assignments','asset_assignments_select'),('booking_request_events','booking_request_events_select'),
   ('booking_requests','booking_requests_select'),('commercial_handoffs','commercial_handoffs_worker_select'),
   ('company_worker_engagements','company_worker_engagements_select'),('contact_disclosure_request_events','contact_disclosure_request_events_select'),
   ('contact_disclosure_requests','contact_disclosure_requests_select'),('demand_interest_signals','demand_interest_signals_worker_insert'),
   ('demand_interest_signals','demand_interest_signals_worker_select'),('demand_interest_signals','demand_interest_signals_worker_update'),
   ('organization_people','organization_people_subject_decides'),('project_worker_operational_statuses','pwos_select'),
   ('project_worker_readiness_items','pwri_select'),('work_plan_entries','work_plan_entries_select'),
   ('worker_absences','worker_absences_select'),('worker_documents','worker_documents_select'),
   ('worker_saved_opportunities','worker_saved_opportunities_select'),('worker_saved_searches','worker_saved_searches_select'))
 order by tablename, policyname;
