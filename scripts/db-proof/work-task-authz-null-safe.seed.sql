-- Seed: org A (owner M, project P1), org N (owner NULL = the latent invitation case), org B (outsider).
insert into public.profiles (id, active_role) values
  ('33333333-3333-3333-3333-333333333333','company'),  -- M   owner of org A / company owner of P1
  ('77777777-7777-7777-7777-777777777777','company'),  -- PM  engagement-manager in org A (project manager path)
  ('11111111-1111-1111-1111-111111111111','worker'),   -- ASG assignee, employee of A
  ('88888888-8888-8888-8888-888888888888','worker'),   -- CR  creator of personal tasks, employee of A
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','worker'),   -- OUTA employee of A with NO task/invitation authority
  ('44444444-4444-4444-4444-444444444444','worker'),   -- OUT outsider: org B only
  ('55555555-5555-5555-5555-555555555555','admin'),    -- ADM
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','company');  -- DEL delegated invitation authority in org N
insert into public.organizations (id, owner_profile_id) values
  ('a0a0a0a0-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333'),
  ('a0a0a0a0-0000-0000-0000-00000000000f', null),
  ('b0b0b0b0-0000-0000-0000-00000000000b', null);
insert into public.companies (id, owner_profile_id) values
  ('cccccccc-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333');
insert into public.projects (id, company_id, organization_id) values
  ('99999999-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','a0a0a0a0-0000-0000-0000-00000000000a');
insert into public.workers (id, profile_id) values
  ('aaaa1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('aaaa8888-0000-0000-0000-000000000008','88888888-8888-8888-8888-888888888888'),
  ('aaaa4444-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444');
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug) values
  ('ecec1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a0a0a0a0-0000-0000-0000-00000000000a','active','employee'),
  ('ecec8888-0000-0000-0000-000000000008','88888888-8888-8888-8888-888888888888','a0a0a0a0-0000-0000-0000-00000000000a','active','employee'),
  ('ececaaaa-0000-0000-0000-00000000000a','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','a0a0a0a0-0000-0000-0000-00000000000a','active','employee'),
  ('ecec3333-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','a0a0a0a0-0000-0000-0000-00000000000a','active','manager'),
  ('ecec7777-0000-0000-0000-000000000007','77777777-7777-7777-7777-777777777777','a0a0a0a0-0000-0000-0000-00000000000a','active','manager'),
  ('ecec4444-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','b0b0b0b0-0000-0000-0000-00000000000b','active','employee');
insert into public.company_memberships (profile_id, organization_id, status, role) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','a0a0a0a0-0000-0000-0000-00000000000f','active','admin');
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self) values
  ('e1e1e1e1-0000-0000-0000-00000000000a','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','asg entry A','h1'),
  ('e1e1e1e1-0000-0000-0000-00000000000b','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','asg entry B','h2'),
  ('e1e1e1e1-0000-0000-0000-00000000000c','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','asg entry C','h3'),
  ('e8e8e8e8-0000-0000-0000-000000000001','aaaa8888-0000-0000-0000-000000000008','ecec8888-0000-0000-0000-000000000008','cr entry','h4'),
  ('e4e4e4e4-0000-0000-0000-000000000001','aaaa4444-0000-0000-0000-000000000004','ecec4444-0000-0000-0000-000000000004','outsider entry','h5');
-- workflow: an active work_task definition in org A with a published, step-less version
insert into public.workflow_definitions (id, organization_id, slug, name, context_entity_type, created_by) values
  ('de1de1de-0000-0000-0000-000000000001','a0a0a0a0-0000-0000-0000-00000000000a','task_signoff','Task sign-off','work_task','33333333-3333-3333-3333-333333333333');
insert into public.workflow_definition_versions (definition_id, version, published_at, created_by) values
  ('de1de1de-0000-0000-0000-000000000001',1,now(),'33333333-3333-3333-3333-333333333333');
