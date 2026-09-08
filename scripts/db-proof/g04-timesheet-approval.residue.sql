-- ===========================================================================
-- G-04 residue check. Run after g04-timesheet-approval.sql. EVERY probe_* row
-- must be 0 -- a non-zero row means the probe's rollback did not happen.
--
-- The document tables are printed as absolute totals as well, because
-- "0 probe rows" and "the timesheet/workflow tables are back where they
-- started" are two different claims and only the second one closes the run.
-- ===========================================================================
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

select 'probe_auth_users|'    || count(*) from auth.users           where email      like 'g04-%@proof.invalid';
select 'probe_profiles|'      || count(*) from public.profiles      where email      like 'g04-%@proof.invalid';
select 'probe_companies|'     || count(*) from public.companies     where legal_name like 'G04 %';
select 'probe_organizations|' || count(*) from public.organizations where legal_name like 'G04 %';
select 'probe_projects|'      || count(*) from public.projects      where title      like 'G04 %';
select 'probe_work_objects|'  || count(*) from public.work_objects  where name       like 'G04 %';
select 'probe_workers|'       || count(*) from public.workers w
  join public.profiles p on p.id = w.profile_id where p.email like 'g04-%@proof.invalid';

-- Absolute totals -- compare against the audit baseline, not against zero.
select 'total_timesheets|'             || count(*) from public.timesheets;
select 'total_timesheet_events|'       || count(*) from public.timesheet_events;
select 'total_workflow_instances|'     || count(*) from public.workflow_instances;
select 'total_workflow_definitions|'   || count(*) from public.workflow_definitions;
select 'total_work_hour_allocations|'  || count(*) from public.work_hour_allocations;
select 'total_work_objects|'           || count(*) from public.work_objects;
select 'total_engagement_contexts|'    || count(*) from public.engagement_contexts;
