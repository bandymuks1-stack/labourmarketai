-- ============================================================================
-- §7.1 proof harness — SEED. Idempotent: truncates and re-inserts, so every
-- phase measures the SAME starting world and a phase can never inherit the
-- previous phase's writes.
--
-- The cast:
--   CO_A  owns company A          — the employer party of E1 and E3
--   CO_B  owns company B          — an employer with no relation to E1
--   WK_1  the worker of E1        — the worker party
--   WK_2  an unrelated worker     — no engagement at all
--   ADMIN a platform admin
--
--   E1  company A ↔ WK_1, ACTIVE   — the ordinary case
--   E2  company B ↔ WK_2, ACTIVE   — the row neither A nor WK_1 may touch
--   E3  company A ↔ (detached), ACTIVE — GDPR model A: worker_id IS NULL.
--       Nobody is its worker, so no worker authority can reach it; company A
--       still owns it and may still end it.
--   E4  company A ↔ ... ENDED      — already ended before anything runs
-- ============================================================================

truncate table public.company_worker_engagements,
               public.booking_requests,
               public.project_worker_assignments,
               public.experience_records,
               public.engagement_contexts,
               public.audit_logs,
               public.projects,
               public.workers,
               public.companies,
               public.profiles
  restart identity cascade;

insert into public.profiles (id, role) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'company'),  -- CO_A
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'company'),  -- CO_B
  ('cccccccc-0000-4000-8000-00000000000c', 'worker'),   -- WK_1
  ('dddddddd-0000-4000-8000-00000000000d', 'worker'),   -- WK_2
  ('ffffffff-0000-4000-8000-00000000000f', 'admin');    -- ADMIN

insert into public.companies (id, profile_id, display_name, legal_name) values
  ('11110000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Company A', 'Company A UAB'),
  ('22220000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Company B', 'Company B UAB');

insert into public.workers (id, profile_id, display_name) values
  ('33330000-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-00000000000c', 'Worker One'),
  ('44440000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-00000000000d', 'Worker Two');

insert into public.booking_requests (id, worker_id, status) values
  ('55550000-0000-4000-8000-000000000001', '33330000-0000-4000-8000-000000000003', 'accepted'),
  ('55550000-0000-4000-8000-000000000002', '44440000-0000-4000-8000-000000000004', 'accepted'),
  ('55550000-0000-4000-8000-000000000003', null, 'accepted'),
  ('55550000-0000-4000-8000-000000000004', '33330000-0000-4000-8000-000000000003', 'accepted');

insert into public.company_worker_engagements
    (id, company_id, worker_id, source_booking_id, status, started_at, ended_at, subject_key)
values
  ('66660000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-000000000001',
   '33330000-0000-4000-8000-000000000003', '55550000-0000-4000-8000-000000000001',
   'active', '2026-03-03T09:00:00Z', null, '99990000-0000-4000-8000-00000000000e'),
  ('66660000-0000-4000-8000-000000000002', '22220000-0000-4000-8000-000000000002',
   '44440000-0000-4000-8000-000000000004', '55550000-0000-4000-8000-000000000002',
   'active', '2026-03-04T09:00:00Z', null, '99990000-0000-4000-8000-00000000000f'),
  -- GDPR-detached: the worker was erased, the audit lineage survived.
  ('66660000-0000-4000-8000-000000000003', '11110000-0000-4000-8000-000000000001',
   null, '55550000-0000-4000-8000-000000000003',
   'active', '2026-03-05T09:00:00Z', null, '99990000-0000-4000-8000-000000000010'),
  ('66660000-0000-4000-8000-000000000004', '11110000-0000-4000-8000-000000000001',
   '33330000-0000-4000-8000-000000000003', '55550000-0000-4000-8000-000000000004',
   'ended', '2026-01-01T09:00:00Z', '2026-02-02T12:00:00Z', '99990000-0000-4000-8000-000000000011');

-- Witnesses: one live row each, so "unchanged" is a measurable claim.
insert into public.projects (id, status)
  values ('77770000-0000-4000-8000-000000000001', 'live');
insert into public.project_worker_assignments (project_id, worker_id, status)
  values ('77770000-0000-4000-8000-000000000001', '33330000-0000-4000-8000-000000000003', 'active');
insert into public.engagement_contexts (profile_id, status)
  values ('cccccccc-0000-4000-8000-00000000000c', 'active');
