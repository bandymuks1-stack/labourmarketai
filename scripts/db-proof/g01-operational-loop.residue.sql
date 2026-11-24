-- ===========================================================================
-- G-01 residue check — run IMMEDIATELY after g01-operational-loop.sql.
--
-- The probe rolls itself back, so every count below must equal the count from
-- before the run, and every `probe_*` row must be 0. A non-zero probe_* row
-- means the rollback did NOT happen and the synthetic world is now sitting in
-- production: stop and remove it before doing anything else.
--
-- "Unchanged" is checked by the operator against the pre-run baseline, which
-- is why the raw counts are printed rather than asserted -- an assertion
-- against a hardcoded number would go stale the first time the product is
-- actually used, and a stale assertion that still passes is worse than none.
-- ===========================================================================
select 'probe_auth_users'        as check, count(*)::text as value from auth.users
  where id::text like '9901%' or id::text like '9902%' or email like '%@proof.invalid'
union all select 'probe_profiles', count(*)::text from public.profiles
  where id::text like '9901%' or id::text like '9902%' or email like '%@proof.invalid'
union all select 'probe_organizations', count(*)::text from public.organizations
  where id::text like '9901%' or id::text like '9902%'
union all select 'probe_companies', count(*)::text from public.companies
  where id::text like '9901%' or id::text like '9902%'
union all select 'probe_customer_requests', count(*)::text from public.customer_requests
  where id::text like '9901%' or id::text like '9902%'
union all select 'probe_projects', count(*)::text from public.projects
  where id::text like '9901%' or id::text like '9902%'
union all select 'probe_work_objects', count(*)::text from public.work_objects
  where name like 'G-01 Object%'
-- Totals: compare each against the pre-run baseline.
union all select 'total_booking_requests', count(*)::text from public.booking_requests
union all select 'total_company_worker_engagements', count(*)::text from public.company_worker_engagements
union all select 'total_engagement_contexts', count(*)::text from public.engagement_contexts
union all select 'total_project_worker_assignments', count(*)::text from public.project_worker_assignments
union all select 'total_work_objects', count(*)::text from public.work_objects
union all select 'total_work_hour_allocations', count(*)::text from public.work_hour_allocations
union all select 'total_timesheets', count(*)::text from public.timesheets
union all select 'total_workflow_definitions', count(*)::text from public.workflow_definitions
union all select 'total_workflow_instances', count(*)::text from public.workflow_instances
union all select 'total_demand_interest_signals', count(*)::text from public.demand_interest_signals
order by 1;
