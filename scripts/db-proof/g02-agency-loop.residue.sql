-- ===========================================================================
-- G-02 residue check. Run after g02-agency-loop.sql. EVERY probe_* row must
-- be 0 -- a non-zero row means the probe's rollback did not happen and the
-- synthetic identities are sitting in the database.
--
-- The five agency tables are printed as absolute totals as well, because
-- "0 probe rows" and "the agency tables are back where they started" are two
-- different claims and only the second one closes the run.
-- ===========================================================================
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

select 'probe_auth_users|'   || count(*) from auth.users            where email      like 'g02-%@proof.invalid';
select 'probe_profiles|'     || count(*) from public.profiles       where email      like 'g02-%@proof.invalid';
select 'probe_agencies|'     || count(*) from public.agencies       where legal_name like 'G02 %';
select 'probe_companies|'    || count(*) from public.companies      where legal_name like 'G02 %';
select 'probe_organizations|'|| count(*) from public.organizations  where legal_name like 'G02 %';
select 'probe_requests|'     || count(*) from public.customer_requests where title   like 'G02 %';
select 'probe_workers|'      || count(*) from public.workers w
  join public.profiles p on p.id = w.profile_id where p.email like 'g02-%@proof.invalid';

-- Absolute totals -- compare against the audit baseline, not against zero.
select 'total_agency_workers|'              || count(*) from public.agency_workers;
select 'total_agency_worker_invitations|'   || count(*) from public.agency_worker_invitations;
select 'total_agency_client_connections|'   || count(*) from public.agency_client_connections;
select 'total_agency_client_request_shares|'|| count(*) from public.agency_client_request_shares;
select 'total_agency_candidate_offers|'     || count(*) from public.agency_candidate_offers;
select 'total_company_workers|'             || count(*) from public.company_workers;
select 'total_agencies|'                    || count(*) from public.agencies;
select 'total_companies|'                   || count(*) from public.companies;
