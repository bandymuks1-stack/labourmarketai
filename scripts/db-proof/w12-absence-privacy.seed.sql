-- Deterministic actors + absences for the W12 privacy proof. Re-runnable.
truncate public.worker_absences, public.company_workers, public.agency_workers cascade;
delete from public.workers;
delete from public.companies;
delete from public.agencies;
delete from public.profiles;

insert into public.profiles (id) values
  ('11111111-1111-4111-8111-111111111111'),  -- worker W's profile
  ('22222222-2222-4222-8222-222222222222'),  -- employer A (manages W)
  ('33333333-3333-4333-8333-333333333333'),  -- employer B (unrelated)
  ('44444444-4444-4444-8444-444444444444');  -- admin

insert into public.workers (id, profile_id, display_name) values
  ('aaaa1111-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'Worker W');

insert into public.companies (id, profile_id) values
  ('cccc2222-0000-4000-8000-00000000000c', '22222222-2222-4222-8222-222222222222'),
  ('cccc3333-0000-4000-8000-00000000000d', '33333333-3333-4333-8333-333333333333');

insert into public.company_workers (company_id, worker_id, status) values
  ('cccc2222-0000-4000-8000-00000000000c', 'aaaa1111-0000-4000-8000-00000000000a', 'active');
-- employer B has NO roster row for W: unrelated by construction.

insert into public.worker_absences
  (id, worker_id, absence_type, start_date, end_date, half_day, note, status, requested_by)
values
  -- APPROVED absence carrying health information + private free text.
  ('ab000001-0000-4000-8000-000000000001', 'aaaa1111-0000-4000-8000-00000000000a',
   'sickness', '2026-09-01', '2026-09-05', false,
   'PRIVATE-REASON do not disclose to employer', 'approved',
   '11111111-1111-4111-8111-111111111111'),
  -- PENDING request: the approval workflow must keep seeing this one whole.
  ('ab000002-0000-4000-8000-000000000002', 'aaaa1111-0000-4000-8000-00000000000a',
   'annual_leave', '2026-10-01', '2026-10-03', false,
   'PENDING-REASON manager must read this to decide', 'requested',
   '11111111-1111-4111-8111-111111111111'),
  -- REJECTED / CANCELLED: neither is unavailability, neither is scheduling data.
  ('ab000003-0000-4000-8000-000000000003', 'aaaa1111-0000-4000-8000-00000000000a',
   'unpaid', '2026-11-01', '2026-11-02', false, 'REJECTED-REASON', 'rejected',
   '11111111-1111-4111-8111-111111111111');
