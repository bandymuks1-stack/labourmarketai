-- LOCAL FIXTURE ONLY (supabase local stack, 127.0.0.1:54322). Never run on production.
-- Seeds a small, clearly synthetic roster + projects + stages + leave + demand for the
-- dev.company@local.test organization so PEOPLE IN TIME / PROJECTS IN TIME can be rendered.
-- Names carry the surname "Fixture". Idempotent.
begin;

-- six roster people (reuse existing local rls.* worker rows; give them fixture names)
update workers set display_name = v.n from (values
  ('2f209d88-93be-4a8b-b460-ff88f9285816'::uuid, 'Anna Fixture'),
  ('1249b2b9-d246-431a-bc46-0e0acde4230e'::uuid, 'Bram Fixture'),
  ('b01de09c-a053-4df8-a8fc-805e84228875'::uuid, 'Chiara Fixture'),
  ('2cebdb34-feee-4da1-9da8-007931386a61'::uuid, 'Dovydas Fixture'),
  ('d87e7374-7cfc-4ff2-89c2-108d3c5c96a2'::uuid, 'Elif Fixture'),
  ('7595b37f-fb07-432c-8dd0-6e0d582b4a1f'::uuid, 'Finn Fixture')
) as v(id, n) where workers.id = v.id;

insert into company_workers (company_id, worker_id, status)
select 'cccccccc-0000-0000-0000-000000000001', id, 'active' from workers
where id in ('2f209d88-93be-4a8b-b460-ff88f9285816','1249b2b9-d246-431a-bc46-0e0acde4230e','b01de09c-a053-4df8-a8fc-805e84228875',
             '2cebdb34-feee-4da1-9da8-007931386a61','d87e7374-7cfc-4ff2-89c2-108d3c5c96a2','7595b37f-fb07-432c-8dd0-6e0d582b4a1f')
on conflict (company_id, worker_id) do update set status = 'active';

-- project windows (the others stay undated on purpose: NOT PROVIDED)
update projects set start_date = '2026-09-21', end_date = '2026-11-06' where id = 'eeeeeeee-0000-0000-0000-000000000001';
update projects set start_date = '2026-10-05', end_date = '2026-10-30' where id = '2b000000-0000-0000-0000-000000000001';
update projects set start_date = '2026-09-28', end_date = '2026-10-16' where id = '2b000000-0000-0000-0000-000000000003';

-- assignments (active). Bram is on two overlapping projects on purpose: a real overlap.
insert into project_worker_assignments (project_id, worker_id, status) values
  ('eeeeeeee-0000-0000-0000-000000000001','2f209d88-93be-4a8b-b460-ff88f9285816','active'),
  ('eeeeeeee-0000-0000-0000-000000000001','1249b2b9-d246-431a-bc46-0e0acde4230e','active'),
  ('2b000000-0000-0000-0000-000000000001','1249b2b9-d246-431a-bc46-0e0acde4230e','active'),
  ('2b000000-0000-0000-0000-000000000001','b01de09c-a053-4df8-a8fc-805e84228875','active'),
  ('2b000000-0000-0000-0000-000000000003','2cebdb34-feee-4da1-9da8-007931386a61','active'),
  ('2b000000-0000-0000-0000-000000000003','d87e7374-7cfc-4ff2-89c2-108d3c5c96a2','active')
on conflict (project_id, worker_id) do update set status = 'active';

-- stages
delete from project_stages where name like '%(fixture)';
insert into project_stages (project_id, name, stage_order, status, planned_start, planned_end, actual_start, actual_end, created_by) values
  ('eeeeeeee-0000-0000-0000-000000000001','Demolition (fixture)',0,'done','2026-09-21','2026-10-01','2026-09-21','2026-10-01','aaaaaaaa-0000-0000-0000-000000000002'),
  ('eeeeeeee-0000-0000-0000-000000000001','Electrics (fixture)',1,'in_progress','2026-10-02','2026-10-16','2026-10-02',null,'aaaaaaaa-0000-0000-0000-000000000002'),
  ('eeeeeeee-0000-0000-0000-000000000001','Finishing (fixture)',2,'planned','2026-10-19','2026-11-06',null,null,'aaaaaaaa-0000-0000-0000-000000000002'),
  ('2b000000-0000-0000-0000-000000000001','Cable routing (fixture)',0,'planned','2026-10-05','2026-10-16',null,null,'aaaaaaaa-0000-0000-0000-000000000002'),
  ('2b000000-0000-0000-0000-000000000003','Plumbing (fixture)',0,'in_progress','2026-09-28','2026-10-09','2026-09-28',null,'aaaaaaaa-0000-0000-0000-000000000002');

-- approved leave: Chiara overlaps the Rotterdam project; Anna later in the month
delete from worker_absences where note = 'fixture';
insert into worker_absences (worker_id, absence_type, start_date, end_date, status, requested_by, reviewed_by, reviewed_at, note) values
  ('b01de09c-a053-4df8-a8fc-805e84228875','annual_leave','2026-10-12','2026-10-16','approved','aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002', now(), 'fixture'),
  ('2f209d88-93be-4a8b-b460-ff88f9285816','annual_leave','2026-10-26','2026-10-28','approved','aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002', now(), 'fixture');

-- stated demand: dated (open need lane) and undated (NOT PROVIDED dates)
delete from customer_requests where title like '%(fixture)';
insert into customer_requests (profile_id, title, status, kind, team_size, payload) values
  ('aaaaaaaa-0000-0000-0000-000000000002','Bricklayers for the Maasvlakte hall (fixture)','submitted','company_request',4,
   '{"structured_v2":{"time":{"start_earliest":"2026-10-19","end_date":"2026-11-13"}}}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002','Painters, dates not decided (fixture)','submitted','company_request',2,'{}'::jsonb);

commit;
