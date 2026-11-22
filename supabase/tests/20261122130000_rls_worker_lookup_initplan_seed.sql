-- Synthetic rows for the #3604 equivalence check (isolated database only).
-- Seven actors: worker, other worker, employer (company + organization owner,
-- worker on its company roster), agency (worker on its roster), admin,
-- stranger, anon. Two rows per table: one about the worker, one about the other worker.
set session_replication_role = replica; -- isolated DB: skip FKs and triggers while seeding
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000002');
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000003');
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000004');
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000005');
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000006');
insert into public.workers(id,profile_id) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002');
insert into public.profile_roles(profile_id,role) values ('00000000-0000-4000-8000-000000000001','worker'),('00000000-0000-4000-8000-000000000002','worker'),('00000000-0000-4000-8000-000000000003','company'),('00000000-0000-4000-8000-000000000004','agency'),('00000000-0000-4000-8000-000000000005','admin');
insert into public.companies(id,profile_id) values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000006');
insert into public.organizations(id,organization_type,legacy_company_id) values ('00000000-0000-4000-8000-000000000023','company','00000000-0000-4000-8000-000000000021'),('00000000-0000-4000-8000-000000000024','company','00000000-0000-4000-8000-000000000022');
insert into public.agencies(id,profile_id) values ('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000004');
insert into public.organizations(id,organization_type,legacy_agency_id) values ('00000000-0000-4000-8000-000000000025','agency','00000000-0000-4000-8000-000000000026');
insert into public.company_memberships(organization_id,profile_id,role,status,accepted_at) values ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000003','owner','active',now()),('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000004','owner','active',now());
insert into public.company_workers(company_id,worker_id,status) values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','active');
insert into public.agency_workers(agency_id,worker_id,status) values ('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000011','active');
insert into public.projects(id,company_id,organization_id) values ('00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000023'),('00000000-0000-4000-8000-000000000028','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000024');
insert into public.assets(id,organization_id,asset_type,name,created_by) values ('00000000-0000-4000-8000-000000000029','00000000-0000-4000-8000-000000000023','tool','drill','00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000024','tool','saw','00000000-0000-4000-8000-000000000006');
insert into public.booking_requests(id,owner_id,request_id,worker_id,status,organization_id) values ('00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011','proposed','00000000-0000-4000-8000-000000000023');
insert into public.booking_request_events(id,booking_request_id,actor_id,event_type,to_status) values ('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001000','00000000-0000-4000-8000-000000000003','proposed','proposed');
insert into public.contact_disclosure_requests(id,owner_id,organization_id,request_id,worker_id,requested_fields) values ('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011','[]');
insert into public.contact_disclosure_request_events(id,contact_disclosure_request_id,actor_profile_id,event_type,to_status) values ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000000003','created','created');
insert into public.worker_documents(id,worker_id,document_type_slug,updated_by) values ('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000000011','id_card','00000000-0000-4000-8000-000000000003');
insert into public.worker_absences(id,worker_id,absence_type,start_date,end_date,status,requested_by) values ('00000000-0000-4000-8000-000000001005','00000000-0000-4000-8000-000000000011','annual_leave','2026-12-01','2026-12-02','requested','00000000-0000-4000-8000-000000000003');
insert into public.worker_saved_searches(id,worker_id,label) values ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000000011','x');
insert into public.worker_saved_opportunities(id,worker_id,public_vacancy_id) values ('00000000-0000-4000-8000-000000001007','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000033');
insert into public.demand_interest_signals(id,worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000033','interested');
insert into public.commercial_handoffs(id,interest_signal_id,worker_id,employer_key,outreach_state,public_vacancy_id) values ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000000011','acme','ineligible_too_new','00000000-0000-4000-8000-000000000033');
insert into public.company_worker_engagements(id,company_id,worker_id,source_booking_id,status) values ('00000000-0000-4000-8000-000000001010','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000001000','active');
insert into public.asset_assignments(id,asset_id,worker_id,issued_by) values ('00000000-0000-4000-8000-000000001011','00000000-0000-4000-8000-000000000029','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003');
insert into public.work_plan_entries(id,organization_id,worker_id,start_date,end_date,created_by) values ('00000000-0000-4000-8000-000000001012','00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000011','2026-12-01','2026-12-02','00000000-0000-4000-8000-000000000003');
insert into public.project_worker_operational_statuses(id,project_id,worker_id,status,updated_by) values ('00000000-0000-4000-8000-000000001013','00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000011','ready','00000000-0000-4000-8000-000000000003');
insert into public.project_worker_readiness_items(id,project_id,worker_id,item_key,label,updated_by) values ('00000000-0000-4000-8000-000000001014','00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000011','k','label','00000000-0000-4000-8000-000000000003');
insert into public.organization_people(id,organization_id,display_name,normalized_name,link_state,link_method,linked_profile_id,linked_worker_id) values ('00000000-0000-4000-8000-000000001015','00000000-0000-4000-8000-000000000023','A','a','link_proposed','manager_offer','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011');
insert into public.booking_requests(id,owner_id,request_id,worker_id,status,organization_id) values ('00000000-0000-4000-8000-000000001016','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000012','proposed',null);
insert into public.booking_request_events(id,booking_request_id,actor_id,event_type,to_status) values ('00000000-0000-4000-8000-000000001017','00000000-0000-4000-8000-000000001016','00000000-0000-4000-8000-000000000006','proposed','proposed');
insert into public.contact_disclosure_requests(id,owner_id,organization_id,request_id,worker_id,requested_fields) values ('00000000-0000-4000-8000-000000001018','00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000012','[]');
insert into public.contact_disclosure_request_events(id,contact_disclosure_request_id,actor_profile_id,event_type,to_status) values ('00000000-0000-4000-8000-000000001019','00000000-0000-4000-8000-000000001018','00000000-0000-4000-8000-000000000006','created','created');
insert into public.worker_documents(id,worker_id,document_type_slug,updated_by) values ('00000000-0000-4000-8000-000000001020','00000000-0000-4000-8000-000000000012','id_card','00000000-0000-4000-8000-000000000006');
insert into public.worker_absences(id,worker_id,absence_type,start_date,end_date,status,requested_by) values ('00000000-0000-4000-8000-000000001021','00000000-0000-4000-8000-000000000012','annual_leave','2026-12-01','2026-12-02','approved','00000000-0000-4000-8000-000000000006');
insert into public.worker_saved_searches(id,worker_id,label) values ('00000000-0000-4000-8000-000000001022','00000000-0000-4000-8000-000000000012','x');
insert into public.worker_saved_opportunities(id,worker_id,public_vacancy_id) values ('00000000-0000-4000-8000-000000001023','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000034');
insert into public.demand_interest_signals(id,worker_id,public_vacancy_id,status) values ('00000000-0000-4000-8000-000000001024','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000034','interested');
insert into public.commercial_handoffs(id,interest_signal_id,worker_id,employer_key,outreach_state,public_vacancy_id) values ('00000000-0000-4000-8000-000000001025','00000000-0000-4000-8000-000000001024','00000000-0000-4000-8000-000000000012','acme','ineligible_too_new','00000000-0000-4000-8000-000000000034');
insert into public.company_worker_engagements(id,company_id,worker_id,source_booking_id,status) values ('00000000-0000-4000-8000-000000001026','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000001016','active');
insert into public.asset_assignments(id,asset_id,worker_id,issued_by) values ('00000000-0000-4000-8000-000000001027','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000006');
insert into public.work_plan_entries(id,organization_id,worker_id,start_date,end_date,created_by) values ('00000000-0000-4000-8000-000000001028','00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000012','2026-12-01','2026-12-02','00000000-0000-4000-8000-000000000006');
insert into public.project_worker_operational_statuses(id,project_id,worker_id,status,updated_by) values ('00000000-0000-4000-8000-000000001029','00000000-0000-4000-8000-000000000028','00000000-0000-4000-8000-000000000012','ready','00000000-0000-4000-8000-000000000006');
insert into public.project_worker_readiness_items(id,project_id,worker_id,item_key,label,updated_by) values ('00000000-0000-4000-8000-000000001030','00000000-0000-4000-8000-000000000028','00000000-0000-4000-8000-000000000012','k','label','00000000-0000-4000-8000-000000000006');
insert into public.organization_people(id,organization_id,display_name,normalized_name,link_state,link_method,linked_profile_id,linked_worker_id) values ('00000000-0000-4000-8000-000000001031','00000000-0000-4000-8000-000000000023','B','b','link_proposed','manager_offer','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012');
insert into public.public_vacancies(id,provider_key,external_id,content_hash,channel,lifecycle,title_raw,source_language,country,published_at,captured_at,attribution_code,transform_version,request_ref,is_active) values ('00000000-0000-4000-8000-000000000033','test','00000000-0000-4000-8000-000000000033','h','snapshot','published','Welder','en','SE',now(),now(),'t','1','r',true);
insert into public.public_vacancies(id,provider_key,external_id,content_hash,channel,lifecycle,title_raw,source_language,country,published_at,captured_at,attribution_code,transform_version,request_ref,is_active) values ('00000000-0000-4000-8000-000000000034','test','00000000-0000-4000-8000-000000000034','h','snapshot','published','Welder','en','SE',now(),now(),'t','1','r',true);
insert into public.public_vacancies(id,provider_key,external_id,content_hash,channel,lifecycle,title_raw,source_language,country,published_at,captured_at,attribution_code,transform_version,request_ref,is_active) values ('00000000-0000-4000-8000-000000000040','test','00000000-0000-4000-8000-000000000040','h','snapshot','published','Welder','en','SE',now(),now(),'t','1','r',true);
insert into public.public_vacancies(id,provider_key,external_id,content_hash,channel,lifecycle,title_raw,source_language,country,published_at,captured_at,attribution_code,transform_version,request_ref,is_active) values ('00000000-0000-4000-8000-000000000041','test','00000000-0000-4000-8000-000000000041','h','snapshot','published','Welder','en','SE',now(),now(),'t','1','r',true);
set session_replication_role = origin;
-- #3575: a former manager (no active governance membership of O) who created an
-- organization booking of O. Under #3575 they no longer see it; the employer
-- (owner of O) still does.
set session_replication_role = replica;
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000007');
insert into public.booking_requests(id,owner_id,request_id,worker_id,status,organization_id) values ('00000000-0000-4000-8000-000000009003','00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000009003','00000000-0000-4000-8000-000000000012','proposed','00000000-0000-4000-8000-000000000023');
set session_replication_role = origin;
create function public._eq3604_try(q text) returns text language plpgsql as $f$
declare r text;
begin
  execute q into r;
  return coalesce(r, '');
exception when others then
  return 'ERROR: ' || sqlerrm;
end $f$;
grant execute on function public._eq3604_try(text) to anon, authenticated;
