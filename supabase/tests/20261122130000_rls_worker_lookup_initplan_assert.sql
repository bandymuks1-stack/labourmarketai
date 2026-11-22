-- The same reads and writes for every actor, each inside its own savepoint.
-- One result line per check: READ|actor|table => visible rows, WRITE|actor|action => rows or error.
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo READ|worker|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo READ|other_worker|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo READ|employer|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo READ|agency|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo READ|admin|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo READ|stranger|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|asset_assignments
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001011' then 'asset_assignments#0' when '00000000-0000-4000-8000-000000001027' then 'asset_assignments#1' end, ',' order by id),'') from public.asset_assignments where id in ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000001027');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|booking_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001001' then 'booking_request_events#0' when '00000000-0000-4000-8000-000000001017' then 'booking_request_events#1' end, ',' order by id),'') from public.booking_request_events where id in ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001017');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|booking_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001000' then 'booking_requests#0' when '00000000-0000-4000-8000-000000001016' then 'booking_requests#1' end, ',' order by id),'') from public.booking_requests where id in ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000001016');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|commercial_handoffs
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001009' then 'commercial_handoffs#0' when '00000000-0000-4000-8000-000000001025' then 'commercial_handoffs#1' end, ',' order by id),'') from public.commercial_handoffs where id in ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001025');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|company_worker_engagements
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001010' then 'company_worker_engagements#0' when '00000000-0000-4000-8000-000000001026' then 'company_worker_engagements#1' end, ',' order by id),'') from public.company_worker_engagements where id in ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000001026');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|contact_disclosure_request_events
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001003' then 'contact_disclosure_request_events#0' when '00000000-0000-4000-8000-000000001019' then 'contact_disclosure_request_events#1' end, ',' order by id),'') from public.contact_disclosure_request_events where id in ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001019');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|contact_disclosure_requests
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001002' then 'contact_disclosure_requests#0' when '00000000-0000-4000-8000-000000001018' then 'contact_disclosure_requests#1' end, ',' order by id),'') from public.contact_disclosure_requests where id in ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001018');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|demand_interest_signals
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001008' then 'demand_interest_signals#0' when '00000000-0000-4000-8000-000000001024' then 'demand_interest_signals#1' end, ',' order by id),'') from public.demand_interest_signals where id in ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001024');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|organization_people
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001015' then 'organization_people#0' when '00000000-0000-4000-8000-000000001031' then 'organization_people#1' end, ',' order by id),'') from public.organization_people where id in ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000001031');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|project_worker_operational_statuses
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001013' then 'project_worker_operational_statuses#0' when '00000000-0000-4000-8000-000000001029' then 'project_worker_operational_statuses#1' end, ',' order by id),'') from public.project_worker_operational_statuses where id in ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000001029');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|project_worker_readiness_items
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001014' then 'project_worker_readiness_items#0' when '00000000-0000-4000-8000-000000001030' then 'project_worker_readiness_items#1' end, ',' order by id),'') from public.project_worker_readiness_items where id in ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000001030');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|work_plan_entries
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001012' then 'work_plan_entries#0' when '00000000-0000-4000-8000-000000001028' then 'work_plan_entries#1' end, ',' order by id),'') from public.work_plan_entries where id in ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000001028');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|worker_absences
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001005' then 'worker_absences#0' when '00000000-0000-4000-8000-000000001021' then 'worker_absences#1' end, ',' order by id),'') from public.worker_absences where id in ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000001021');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|worker_documents
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001004' then 'worker_documents#0' when '00000000-0000-4000-8000-000000001020' then 'worker_documents#1' end, ',' order by id),'') from public.worker_documents where id in ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001020');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|worker_saved_opportunities
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001007' then 'worker_saved_opportunities#0' when '00000000-0000-4000-8000-000000001023' then 'worker_saved_opportunities#1' end, ',' order by id),'') from public.worker_saved_opportunities where id in ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000001023');
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo READ|anon|worker_saved_searches
select 'visible='||coalesce(string_agg(case id::text when '00000000-0000-4000-8000-000000001006' then 'worker_saved_searches#0' when '00000000-0000-4000-8000-000000001022' then 'worker_saved_searches#1' end, ',' order by id),'') from public.worker_saved_searches where id in ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001022');
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
\echo WRITE|worker|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
\echo WRITE|other_worker|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
\echo WRITE|employer|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
\echo WRITE|agency|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
\echo WRITE|admin|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role authenticated; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}',true), set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
\echo WRITE|stranger|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|dis_insert_for_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000040','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|dis_insert_for_other_worker
with x as (insert into public.demand_interest_signals(worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','interested') returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|dis_update_worker_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|dis_update_other_signal
with x as (update public.demand_interest_signals set status='withdrawn' where id='00000000-0000-4000-8000-000000001024' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|dis_move_signal_to_other_worker
with x as (update public.demand_interest_signals set worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001008' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|op_confirm_own_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|op_confirm_other_link
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed' where id='00000000-0000-4000-8000-000000001031' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
savepoint chk; set local role anon; select set_config('request.jwt.claims','{"role":"anon"}',true), set_config('request.jwt.claim.sub','',true);
\echo WRITE|anon|op_link_self_to_other_worker
with x as (update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_worker_id='00000000-0000-4000-8000-000000000012' where id='00000000-0000-4000-8000-000000001015' returning 1) select 'rows='||count(*) from x;
rollback to savepoint chk; reset role;
