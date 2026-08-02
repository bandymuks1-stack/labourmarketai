-- ============================================================================
-- W12 Slice 1 proof harness — FIXTURES.
-- Deterministic uuids so the runner can address each booking by name.
-- Re-runnable: truncates the booking tables first.
-- ============================================================================

truncate public.booking_request_events, public.booking_requests,
         public.company_worker_engagements restart identity cascade;
delete from public.customer_requests;
delete from public.companies;
delete from public.workers;
delete from public.profiles;

-- profiles: two workers, two employers
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111111'), -- worker 1 profile
  ('22222222-2222-2222-2222-222222222222'), -- worker 2 profile
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), -- employer A profile
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); -- employer B profile

insert into public.workers (id, profile_id, display_name) values
  ('f1111111-1111-4111-8111-111111111111', '11111111-1111-1111-1111-111111111111', 'Worker One'),
  ('f2222222-2222-4222-8222-222222222222', '22222222-2222-2222-2222-222222222222', 'Worker Two');

insert into public.companies (id, profile_id) values
  ('cccccccc-000a-4000-8000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('cccccccc-000b-4000-8000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- one demand row per booking (the unique(owner,request,worker) key needs them)
insert into public.customer_requests (id, profile_id) values
  ('d0000001-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('d0000002-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('d0000003-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('d0000004-0000-4000-8000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('d0000005-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('d0000006-0000-4000-8000-000000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('d0000007-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('d0000008-0000-4000-8000-000000000008', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('d0000009-0000-4000-8000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Bookings. All 'proposed' at seed time.
insert into public.booking_requests
  (id, owner_id, request_id, worker_id, status, start_date, expected_end_date) values
  -- CASE A: two employers, SAME worker, OVERLAPPING dates
  ('b0000001-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d0000001-0000-4000-8000-000000000001','f1111111-1111-4111-8111-111111111111','proposed','2026-09-01','2026-09-10'),
  ('b0000002-0000-4000-8000-000000000002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','d0000002-0000-4000-8000-000000000002','f1111111-1111-4111-8111-111111111111','proposed','2026-09-05','2026-09-15'),
  -- CASE B: duplicate submit target (same worker, isolated dates)
  ('b0000003-0000-4000-8000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d0000003-0000-4000-8000-000000000003','f1111111-1111-4111-8111-111111111111','proposed','2027-03-01','2027-03-05'),
  -- CASE C: same worker, NON-overlapping (both must be accepted)
  ('b0000004-0000-4000-8000-000000000004','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','d0000004-0000-4000-8000-000000000004','f1111111-1111-4111-8111-111111111111','proposed','2026-10-01','2026-10-05'),
  ('b0000005-0000-4000-8000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d0000005-0000-4000-8000-000000000005','f1111111-1111-4111-8111-111111111111','proposed','2026-10-20','2026-10-25'),
  -- CASE D: DIFFERENT worker, overlapping dates with CASE A (both allowed)
  ('b0000006-0000-4000-8000-000000000006','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','d0000006-0000-4000-8000-000000000006','f2222222-2222-4222-8222-222222222222','proposed','2026-09-05','2026-09-15'),
  -- CASE F: single-day, SAME day, same worker (must conflict)
  ('b0000007-0000-4000-8000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d0000007-0000-4000-8000-000000000007','f1111111-1111-4111-8111-111111111111','proposed','2026-11-01',null),
  ('b0000008-0000-4000-8000-000000000008','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','d0000008-0000-4000-8000-000000000008','f1111111-1111-4111-8111-111111111111','proposed','2026-11-01',null),
  -- CASE F: ADJACENT (b0000009 starts the day AFTER b0000004 ends → allowed)
  ('b0000009-0000-4000-8000-000000000009','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','d0000009-0000-4000-8000-000000000009','f1111111-1111-4111-8111-111111111111','proposed','2026-10-06','2026-10-10');
