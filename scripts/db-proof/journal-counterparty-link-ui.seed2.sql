update public.organizations set name = 'Client C Ltd' where id = 'c0000000-0000-0000-0000-0000000000c0';
update public.workers set display_name = 'Free Lancer' where id = 'aaaaf000-0000-0000-0000-000000000f01';
update public.projects set name = 'Fence project' where id = '90000000-0000-0000-0000-00000000000c';
-- a TEAM (organization) with employees: TM1 (member), TM2 (membership ended), TM3 (not in the team)
insert into public.organizations (id, name) values
  ('7e000000-0000-0000-0000-0000000000e0','Brigade B'),
  ('7e000000-0000-0000-0000-0000000000f0','Own org of team member');
insert into public.profiles (id, active_role) values
  ('7e111111-1111-1111-1111-111111111111','worker'),
  ('7e222222-2222-2222-2222-222222222222','worker'),
  ('7e333333-3333-3333-3333-333333333333','worker');
insert into public.workers (id, profile_id, display_name) values
  ('aaaa7e11-0000-0000-0000-000000000001','7e111111-1111-1111-1111-111111111111','Team Member'),
  ('aaaa7e22-0000-0000-0000-000000000002','7e222222-2222-2222-2222-222222222222','Ex Member'),
  ('aaaa7e33-0000-0000-0000-000000000003','7e333333-3333-3333-3333-333333333333','Outsider');
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug, created_at, started_at, ended_at) values
  ('ec7e0001-0000-0000-0000-000000000001','7e111111-1111-1111-1111-111111111111','7e000000-0000-0000-0000-0000000000e0','active','employee', now() - interval '30 days', current_date - 30, null),
  ('ec7e0002-0000-0000-0000-000000000002','7e222222-2222-2222-2222-222222222222','7e000000-0000-0000-0000-0000000000e0','ended','employee', now() - interval '30 days', current_date - 30, current_date - 5),
  ('ec7e0003-0000-0000-0000-000000000003','7e333333-3333-3333-3333-333333333333','d0000000-0000-0000-0000-0000000000d0','active','employee', now() - interval '30 days', current_date - 30, null),
  ('ec7e0011-0000-0000-0000-000000000011','7e111111-1111-1111-1111-111111111111','7e000000-0000-0000-0000-0000000000f0','active','owner', now() - interval '30 days', current_date - 30, null);
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id) values
  ('7e100000-0000-0000-0000-000000000001','aaaa7e11-0000-0000-0000-000000000001','ec7e0011-0000-0000-0000-000000000011','Team member laid 40 m2 of paving.','ht1','90000000-0000-0000-0000-00000000000c');
insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug) values
  ('7e100000-0000-0000-0000-000000000001','area_done',40,'m2');
insert into public.journal_entry_photos (entry_id, profile_id, file_name, storage_path) values
  ('7e100000-0000-0000-0000-000000000001','7e111111-1111-1111-1111-111111111111','paving.jpg','7e111111/paving.jpg');
