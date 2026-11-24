-- Document & Evidence Engine v1 — proof seed (throwaway PG only).
-- Actors:
--   OWNER    11111111-… owner of ORG_A (active membership)
--   ADMIN2   22222222-… admin of ORG_A
--   MEMBER   33333333-… plain member of ORG_A (the ack assignee)
--   MANAGER  44444444-… manager of ORG_A (has_org_demand-class, NOT doc mgr)
--   OUTSIDER 55555555-… owner of ORG_B (wrong org)
--   WORKER   66666666-… worker profile with one worker_documents row
--   PLATFORM 77777777-… platform admin (app.is_admin=true)

insert into public.profiles (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777');

insert into public.organizations (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ORG_A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ORG_B');

insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner',   'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin',   'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member',  'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'manager', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'owner',   'active');

insert into public.workers (id, profile_id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '66666666-6666-4666-8666-666666666666');

insert into public.worker_documents (id, worker_id, document_type_slug, status, updated_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   'a1_certificate', 'ready', '66666666-6666-4666-8666-666666666666');
