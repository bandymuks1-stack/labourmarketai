-- TRAIN D proof seed — deterministic actors and world. Re-runnable: wipes
-- feature tables first (throwaway DB only).
delete from public.notification_events;
delete from public.audit_logs;
delete from public.project_worker_assignments;
delete from public.company_memberships;
delete from public.engagement_contexts;
delete from public.company_workers;
delete from public.projects;
delete from public.workers;
delete from public.organizations;
delete from public.companies;
delete from public.profiles;

insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111111'), -- OWNER   (company owner, org owner member)
  ('22222222-2222-2222-2222-222222222222'), -- MANAGER (org manager member + manager engagement)
  ('33333333-3333-3333-3333-333333333333'), -- MEMBER  (org plain member)
  ('44444444-4444-4444-4444-444444444444'), -- WORKERP (engaged worker, on roster)
  ('55555555-5555-5555-5555-555555555555'), -- STRANGER (no relationship)
  ('66666666-6666-6666-6666-666666666666'); -- OTHER   (owner of the OTHER org)

insert into public.companies (id, profile_id) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-4000-8000-000000000002', '66666666-6666-6666-6666-666666666666');

insert into public.organizations (id, legacy_company_id) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002');

insert into public.workers (id, profile_id, display_name) values
  ('40000000-0000-4000-8000-000000000001', '44444444-4444-4444-4444-444444444444', 'W One');

insert into public.company_workers (company_id, worker_id, status) values
  ('c0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'active');

insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner',   'active'),
  ('a0000000-0000-4000-8000-000000000001', '22222222-2222-2222-2222-222222222222', 'manager', 'active'),
  ('a0000000-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333', 'member',  'active'),
  ('a0000000-0000-4000-8000-000000000002', '66666666-6666-6666-6666-666666666666', 'owner',   'active');

insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values
  ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-4000-8000-000000000001', 'active', 'manager'),
  ('44444444-4444-4444-4444-444444444444', 'a0000000-0000-4000-8000-000000000001', 'active', 'employee');

insert into public.projects (id, company_id, organization_id, title, status) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'P1', 'live'),
  ('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'P2 other org', 'live');

insert into public.project_worker_assignments (project_id, worker_id, status) values
  ('b0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'active');
