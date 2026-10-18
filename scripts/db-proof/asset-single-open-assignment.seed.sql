-- Asset reality for the MKT-3 proof.
--
-- One organization, one manager (the actor for every issue/transfer/return),
-- one second manager of the SAME org — because the race that matters is two
-- legitimately authorized people acting at the same moment, not an attack —
-- and two workers who could each be handed the same drill.

insert into public.profiles (id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Manager one'),
  ('22222222-2222-4222-8222-222222222222', 'Manager two'),
  ('33333333-3333-4333-8333-333333333333', 'Worker A'),
  ('44444444-4444-4444-8444-444444444444', 'Worker B'),
  ('55555555-5555-4555-8555-555555555555', 'Outsider');

insert into public.organizations (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Org A');

insert into public.org_managers (organization_id, profile_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');

insert into public.workers (id, profile_id, display_name) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '33333333-3333-4333-8333-333333333333', 'Worker A'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '44444444-4444-4444-8444-444444444444', 'Worker B');

insert into public.projects (id, title) values
  ('99999999-9999-4999-8999-999999999999', 'Site 1');

-- The asset at the centre of the race: one drill, available, owned by Org A.
insert into public.assets (id, organization_id, asset_type, name, availability, created_by) values
  ('a5000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'tool', 'Drill kit', 'available', '11111111-1111-4111-8111-111111111111');

-- A second asset used only for the maintenance / retired refusals.
insert into public.assets (id, organization_id, asset_type, name, availability, created_by) values
  ('a5000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'equipment', 'Hoist', 'maintenance', '11111111-1111-4111-8111-111111111111');
