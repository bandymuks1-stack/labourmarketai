-- Two workers who must never see each other's saved questions.
insert into public.profiles (id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Worker one'),
  ('22222222-2222-4222-8222-222222222222', 'Worker two');

insert into public.workers (id, profile_id, display_name) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'Worker one'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'Worker two');
