-- Seed: org A (project P1,P2 + team TA), org B (project PB + team TB).
insert into public.organizations (id, organization_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','company','Org A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','company','Org B'),
  ('7ea00000-0000-0000-0000-00000000000a','team','Brigade A'),
  ('7ea00000-0000-0000-0000-00000000000b','team','Brigade B'),
  ('7ea00000-0000-0000-0000-0000000000ee','team','Empty brigade');
insert into public.profiles (id, active_role, full_name) values
  ('11111111-1111-1111-1111-111111111111','worker','Member One'),
  ('22222222-2222-2222-2222-222222222222','worker','Member Two'),
  ('33333333-3333-3333-3333-333333333333','company','Manager A'),
  ('44444444-4444-4444-4444-444444444444','worker','Outsider'),
  ('55555555-5555-5555-5555-555555555555','admin','Admin'),
  ('66666666-6666-6666-6666-666666666666','company','Manager B'),
  ('77777777-7777-7777-7777-777777777777','worker','Left Early'),
  ('88888888-8888-8888-8888-888888888888','worker','Joined Late');
insert into public.companies (id, owner_profile_id) values
  ('cccccccc-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333'),
  ('cccccccc-0000-0000-0000-000000000002','66666666-6666-6666-6666-666666666666');
insert into public.projects (id, company_id, organization_id) values
  ('99999999-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-00000000000b','cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002');
insert into public.workers (id, profile_id) values
  ('aaaa1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('aaaa2222-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('aaaa4444-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444'),
  ('aaaa7777-0000-0000-0000-000000000007','77777777-7777-7777-7777-777777777777'),
  ('aaaa8888-0000-0000-0000-000000000008','88888888-8888-8888-8888-888888888888');
-- Manager A manages org A AND team A (owner of both, as create_team_v1 provisions). Manager B manages org B and team B.
-- Team A members: One + Two active since long ago; Left Early (ended 2026-09-01, was a member before); Joined Late (created 2026-10-01).
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at, started_at, ended_at) values
  ('33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-000000000001','active','owner','2026-01-01',null,null),
  ('33333333-3333-3333-3333-333333333333','7ea00000-0000-0000-0000-00000000000a','active','owner','2026-01-01',null,null),
  ('66666666-6666-6666-6666-666666666666','bbbbbbbb-0000-0000-0000-000000000002','active','owner','2026-01-01',null,null),
  ('66666666-6666-6666-6666-666666666666','7ea00000-0000-0000-0000-00000000000b','active','owner','2026-01-01',null,null),
  ('11111111-1111-1111-1111-111111111111','7ea00000-0000-0000-0000-00000000000a','active','employee','2026-02-01',null,null),
  ('22222222-2222-2222-2222-222222222222','7ea00000-0000-0000-0000-00000000000a','active','employee','2026-02-01',null,null),
  ('77777777-7777-7777-7777-777777777777','7ea00000-0000-0000-0000-00000000000a','ended','employee','2026-02-01',null,'2026-09-01'),
  ('88888888-8888-8888-8888-888888888888','7ea00000-0000-0000-0000-00000000000a','active','employee','2026-10-01',null,null),
  ('44444444-4444-4444-4444-444444444444','bbbbbbbb-0000-0000-0000-000000000002','active','employee','2026-02-01',null,null);
-- ended membership with NO ended_at: cannot be proven to cover any past instant.
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at, ended_at) values
  ('44444444-4444-4444-4444-444444444444','7ea00000-0000-0000-0000-00000000000b','ended','employee','2026-02-01',null);
insert into public.work_tasks (id, project_id, title, created_by, status) values
  ('7a5c0000-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','Task on P1','33333333-3333-3333-3333-333333333333','todo'),
  ('7a5c0000-0000-0000-0000-000000000002','99999999-0000-0000-0000-00000000000b','Task on PB','66666666-6666-6666-6666-666666666666','todo');
insert into public.work_objects (id, organization_id, project_id, name, created_by) values
  ('0b1e0000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','Site on P1','33333333-3333-3333-3333-333333333333');
-- A second team of org A (Manager A owns it; Member One belongs to it too) for the replace flow.
insert into public.organizations (id, organization_type, display_name) values
  ('7ea00000-0000-0000-0000-0000000000a2','team','Brigade A2');
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at) values
  ('33333333-3333-3333-3333-333333333333','7ea00000-0000-0000-0000-0000000000a2','active','owner','2026-01-01'),
  ('11111111-1111-1111-1111-111111111111','7ea00000-0000-0000-0000-0000000000a2','active','employee','2026-02-01');
