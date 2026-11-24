-- ============================================================================
-- W11 Slice 2 proof harness — SEED. Idempotent; re-run between phases so each
-- phase measures the same world.
--
-- Six actors, three projects, two companies:
--
--   COMPANY A (owned by A_OWNER)   P1 draft  — ASSIGNED_WORKER active on it
--                                             ENDED_WORKER  ended  on it
--                                  P3 live   — nobody assigned
--   COMPANY B (owned by B_OWNER)   P2 live   — nobody assigned
--
-- P1 is `draft` on purpose: that is what every project the app creates looks
-- like, and it is why the assigned worker's own project is invisible today.
-- P2/P3 are `live` on purpose: nothing in the app can set that status, but the
-- PRE-SLICE policy grants every signed-in user of every tenant read on them,
-- which is P1-2. Seeding them is what makes the leak measurable.
-- ============================================================================

insert into public.profiles(id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001','company'),
  ('bbbbbbbb-0000-4000-8000-000000000002','company'),
  ('cccccccc-0000-4000-8000-000000000003','worker'),
  ('dddddddd-0000-4000-8000-000000000004','worker'),
  ('eeeeeeee-0000-4000-8000-000000000005','worker'),
  ('ffffffff-0000-4000-8000-000000000006','admin')
on conflict (id) do update set role = excluded.role;

insert into public.companies(id, profile_id, display_name) values
  ('01010101-0000-4000-8000-00000000000a','aaaaaaaa-0000-4000-8000-000000000001','Company A'),
  ('02020202-0000-4000-8000-00000000000b','bbbbbbbb-0000-4000-8000-000000000002','Company B')
on conflict (id) do update set profile_id = excluded.profile_id;

insert into public.workers(id, profile_id, display_name) values
  ('11110000-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000003','Assigned worker'),
  ('22220000-0000-4000-8000-000000000002','dddddddd-0000-4000-8000-000000000004','Ended worker'),
  ('33330000-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000005','Unrelated worker')
on conflict (id) do update set profile_id = excluded.profile_id;

insert into public.projects(id, company_id, title, status) values
  ('44440000-0000-4000-8000-000000000001','01010101-0000-4000-8000-00000000000a','P1 Rotterdam warehouse','draft'),
  ('55550000-0000-4000-8000-000000000002','02020202-0000-4000-8000-00000000000b','P2 other tenant','live'),
  ('66660000-0000-4000-8000-000000000003','01010101-0000-4000-8000-00000000000a','P3 same tenant, live','live')
on conflict (id) do update set status = excluded.status, company_id = excluded.company_id;

insert into public.project_worker_assignments(id, project_id, worker_id, status, ended_at) values
  ('77770000-0000-4000-8000-000000000001','44440000-0000-4000-8000-000000000001','11110000-0000-4000-8000-000000000001','active', null),
  ('88880000-0000-4000-8000-000000000002','44440000-0000-4000-8000-000000000001','22220000-0000-4000-8000-000000000002','ended',  now())
on conflict (id) do update set status = excluded.status, ended_at = excluded.ended_at;
