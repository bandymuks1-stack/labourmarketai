-- Seed: two workers in the SAME org, their manager, an OUTSIDER worker in a
-- different org, and an admin. Journal entries with a photo and a real
-- manager confirmation, and two tasks (project task + personal task).

insert into public.organizations (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),   -- org A
  ('bbbbbbbb-0000-0000-0000-000000000002');   -- org B

insert into public.profiles (id, active_role) values
  ('11111111-1111-1111-1111-111111111111','worker'),   -- worker one
  ('22222222-2222-2222-2222-222222222222','worker'),   -- worker two (same org)
  ('33333333-3333-3333-3333-333333333333','company'),  -- manager of org A
  ('44444444-4444-4444-4444-444444444444','worker'),   -- OUTSIDER, org B
  ('55555555-5555-5555-5555-555555555555','admin');    -- platform admin

insert into public.companies (id, owner_profile_id) values
  ('cccccccc-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333');

insert into public.projects (id, company_id, organization_id) values
  ('99999999-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');

insert into public.workers (id, profile_id) values
  ('aaaa1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('aaaa2222-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('aaaa4444-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444');

insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug) values
  ('ecec1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','active','employee'),
  ('ecec2222-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','active','employee'),
  ('ecec3333-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-000000000001','active','manager'),
  ('ecec4444-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','bbbbbbbb-0000-0000-0000-000000000002','active','employee');

-- Journal entries with a REAL hash chain (worker one has a 2-entry chain).
insert into public.journal_entries
  (id, worker_id, engagement_context_id, original_text, original_language, hash_prev, hash_self, project_id)
values
  ('e1e1e1e1-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001',
   'Įrengiau 18 metrų kabelio 3 aukšte.', 'lt', null,
   encode(digest('entry1','sha256'),'hex'), '99999999-0000-0000-0000-000000000001'),
  ('e1e1e1e1-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001',
   'Antra diena, baigiau trasą.', 'lt',
   encode(digest('entry1','sha256'),'hex'),
   encode(digest('entry2','sha256'),'hex'), '99999999-0000-0000-0000-000000000001'),
  -- worker two, same org
  ('e2e2e2e2-0000-0000-0000-000000000001','aaaa2222-0000-0000-0000-000000000002','ecec2222-0000-0000-0000-000000000002',
   'Sumontavau skydą.', 'lt', null, encode(digest('w2entry1','sha256'),'hex'), null),
  -- OUTSIDER, org B
  ('e4e4e4e4-0000-0000-0000-000000000001','aaaa4444-0000-0000-0000-000000000004','ecec4444-0000-0000-0000-000000000004',
   'Other org work.', 'en', null, encode(digest('outsider1','sha256'),'hex'), null);

-- A photo and a REAL manager confirmation on worker one's first entry.
insert into public.journal_entry_photos (entry_id, profile_id)
values ('e1e1e1e1-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');

insert into public.journal_entry_confirmations
  (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role)
values ('e1e1e1e1-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333',
        'ecec3333-0000-0000-0000-000000000003','manager');

-- Tasks: a project task (manager created, worker one assigned) and the
-- OUTSIDER's personal task (no project).
insert into public.work_tasks (id, project_id, title, created_by, assignee_profile_id) values
  ('7a5c0000-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001',
   'Install cable run, floor 3','33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111'),
  ('7a5c0000-0000-0000-0000-000000000002', null,
   'Outsider personal task','44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444444');
