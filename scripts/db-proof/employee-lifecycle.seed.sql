-- Employee Lifecycle v1 proof seed — deterministic actors and rows.
-- Throwaway harness data only; never production values.

insert into public.profiles (id, email, full_name) values
  ('11111111-1111-4111-8111-111111111111', 'owner-a@proof.local',   'Owner A'),
  ('22222222-2222-4222-8222-222222222222', 'manager-a@proof.local', 'Manager A'),
  ('33333333-3333-4333-8333-333333333333', 'worker-1@proof.local',  'Worker One'),
  ('44444444-4444-4444-8444-444444444444', 'worker-2@proof.local',  'Worker Two'),
  ('55555555-5555-4555-8555-555555555555', 'owner-b@proof.local',   'Owner B'),
  ('66666666-6666-4666-8666-666666666666', 'attacker@proof.local',  'Attacker'),
  ('77777777-7777-4777-8777-777777777777', 'platform@proof.local',  'Platform Admin');

insert into public.organizations (id, owner_profile_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555');

-- Governance truth: owner + manager memberships in org A; owner in org B.
insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner',   'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'manager', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'owner',   'active');

insert into public.workers (id, profile_id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444');

-- Employment truth (EC): owner engagement + two employees in org A, and a
-- PERSONAL (org NULL) engagement for worker 1.
insert into public.engagement_contexts (id, profile_id, organization_id, relationship_slug, status) values
  ('e0000000-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner',    'active'),
  ('e0000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'employee', 'active'),
  ('e0000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'employee', 'active'),
  ('e0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', null,                                     'worker',   'active');

-- Asset reality: one org-A asset OPEN (issued) in worker 2's hands, one
-- org-B asset issued to worker 2 (must NOT surface in org-A offboarding).
insert into public.assets (id, organization_id, name, availability) values
  ('a5000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Drill kit',  'assigned'),
  ('a5000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Foreign saw','assigned');
insert into public.asset_assignments (id, asset_id, worker_id, status) values
  ('a5100000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'issued'),
  ('a5100000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'issued');

-- Task reality for onboarding link validation: one DONE task assigned to
-- worker 1, one still-open task assigned to worker 1.
insert into public.work_tasks (id, title, status, assignee_profile_id) values
  ('40000000-0000-4000-8000-000000000001', 'Safety intro', 'done', '33333333-3333-4333-8333-333333333333'),
  ('40000000-0000-4000-8000-000000000002', 'Site tour',    'todo', '33333333-3333-4333-8333-333333333333');

-- Acknowledgement reality: one acknowledged row for worker 1, one pending.
insert into public.document_acknowledgements (id, assignee_profile_id, organization_id, acknowledged_at, acknowledged_by) values
  ('50000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now(), '33333333-3333-4333-8333-333333333333'),
  ('50000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null);
