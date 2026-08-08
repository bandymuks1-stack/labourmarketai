-- ============================================================================
-- Deterministic actors for the A1 proof. Re-runnable (truncates first).
--
-- The shape under test, in one sentence: WORKER 1 is bound to EMPLOYER 1 ONLY
-- through an accepted booking (`company_worker_engagements`), never through a
-- roster row — exactly the canonical #1047 path the audit exercised.
--
--   worker W1  ── ACTIVE engagement (booking B1) ──>  company C_ENG   (owner E1)
--   worker W1  ── ENDED  engagement (booking B2) ──>  company C_ENDED (owner E3)
--   (detached) ── ACTIVE engagement (booking B3) ──>  company C_UNREL (owner E2)
--   worker W2  ── ACTIVE company_workers ROSTER  ──>  company C_UNREL (owner E2)
--
-- E1 deliberately owns TWO companies (C_ENG and its sibling C_SIB) with a
-- project each. That is the trap: E1 `can_manage_project` BOTH projects, so a
-- naive widening of `caller_manages_worker` would let the C_ENG engagement
-- reach the C_SIB project and silently break the 2026-07-23 owner decision.
-- W2 on E2's roster is the control that the roster path itself never changes.
-- ============================================================================

truncate public.worker_absences, public.company_worker_engagements,
         public.project_worker_assignments, public.company_workers,
         public.agency_workers, public.booking_requests, public.projects,
         public.engagement_contexts cascade;
delete from public.organizations;
delete from public.workers;
delete from public.companies;
delete from public.agencies;
delete from public.profiles;

insert into public.profiles (id) values
  ('11111111-1111-4111-8111-111111111111'),  -- W1's profile — the ENGAGED worker
  ('15151515-1515-4151-8151-151515151515'),  -- W2's profile — the ROSTERED worker
  ('22222222-2222-4222-8222-222222222222'),  -- E1 — engaging employer, owns C_ENG + C_SIB
  ('33333333-3333-4333-8333-333333333333'),  -- E2 — unrelated employer, rosters W2
  ('55555555-5555-4555-8555-555555555555'),  -- E3 — employer whose engagement ENDED
  ('44444444-4444-4444-8444-444444444444');  -- admin

insert into public.workers (id, profile_id, display_name) values
  ('aaaa1111-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111', 'Worker Engaged'),
  ('aaaa2222-0000-4000-8000-00000000000b', '15151515-1515-4151-8151-151515151515', 'Worker Rostered');

insert into public.companies (id, profile_id) values
  ('cccc1111-0000-4000-8000-00000000000c', '22222222-2222-4222-8222-222222222222'),  -- C_ENG
  ('cccc2222-0000-4000-8000-00000000000c', '22222222-2222-4222-8222-222222222222'),  -- C_SIB (same owner!)
  ('cccc3333-0000-4000-8000-00000000000c', '33333333-3333-4333-8333-333333333333'),  -- C_UNREL
  ('cccc4444-0000-4000-8000-00000000000c', '55555555-5555-4555-8555-555555555555');  -- C_ENDED

insert into public.organizations (id, legacy_company_id) values
  ('dddd1111-0000-4000-8000-00000000000d', 'cccc1111-0000-4000-8000-00000000000c'),
  ('dddd2222-0000-4000-8000-00000000000d', 'cccc2222-0000-4000-8000-00000000000c'),
  ('dddd3333-0000-4000-8000-00000000000d', 'cccc3333-0000-4000-8000-00000000000c');

insert into public.projects (id, company_id, organization_id, status) values
  ('eeee1111-0000-4000-8000-00000000000e', 'cccc1111-0000-4000-8000-00000000000c',
   'dddd1111-0000-4000-8000-00000000000d', 'live'),   -- PRJ_ENG   — the engaging company's own project
  ('eeee2222-0000-4000-8000-00000000000e', 'cccc2222-0000-4000-8000-00000000000c',
   'dddd2222-0000-4000-8000-00000000000d', 'live'),   -- PRJ_SIB   — sibling company, SAME owner
  ('eeee3333-0000-4000-8000-00000000000e', 'cccc3333-0000-4000-8000-00000000000c',
   'dddd3333-0000-4000-8000-00000000000d', 'live');   -- PRJ_UNREL — the roster control's project

-- W2 is on E2's roster. W1 is on NO roster anywhere, by construction.
insert into public.company_workers (company_id, worker_id, status) values
  ('cccc3333-0000-4000-8000-00000000000c', 'aaaa2222-0000-4000-8000-00000000000b', 'active');

insert into public.booking_requests (id, status) values
  ('bbbb1111-0000-4000-8000-00000000000b', 'accepted'),
  ('bbbb2222-0000-4000-8000-00000000000b', 'accepted'),
  ('bbbb3333-0000-4000-8000-00000000000b', 'accepted');

insert into public.company_worker_engagements
  (company_id, worker_id, source_booking_id, status, ended_at, created_by)
values
  -- THE SUBJECT: active accepted-booking engagement, no roster row anywhere.
  ('cccc1111-0000-4000-8000-00000000000c', 'aaaa1111-0000-4000-8000-00000000000a',
   'bbbb1111-0000-4000-8000-00000000000b', 'active', null,
   '11111111-1111-4111-8111-111111111111'),
  -- ENDED engagement: must grant its owner (E3) nothing at all.
  ('cccc4444-0000-4000-8000-00000000000c', 'aaaa1111-0000-4000-8000-00000000000a',
   'bbbb2222-0000-4000-8000-00000000000b', 'ended', now(),
   '11111111-1111-4111-8111-111111111111'),
  -- GDPR-DETACHED audit row (worker_id NULL) held by the unrelated employer:
  -- an active row that must grant nothing, because it identifies no subject.
  ('cccc3333-0000-4000-8000-00000000000c', null,
   'bbbb3333-0000-4000-8000-00000000000b', 'active', null,
   '11111111-1111-4111-8111-111111111111');

insert into public.worker_absences
  (id, worker_id, absence_type, start_date, end_date, half_day, note, status, requested_by)
values
  -- The request the engaging employer must be able to see and approve (A1).
  ('ab000001-0000-4000-8000-000000000001', 'aaaa1111-0000-4000-8000-00000000000a',
   'annual_leave', '2026-10-01', '2026-10-03', false,
   'ENGAGED-PENDING employer must be able to review this', 'requested',
   '11111111-1111-4111-8111-111111111111'),
  -- Approved absence carrying a private health reason: the W12 narrowing must
  -- still hide the reason from the employer AFTER this migration widens who
  -- counts as a manager.
  ('ab000002-0000-4000-8000-000000000002', 'aaaa1111-0000-4000-8000-00000000000a',
   'sickness', '2026-09-01', '2026-09-05', false,
   'PRIVATE-REASON do not disclose to employer', 'approved',
   '11111111-1111-4111-8111-111111111111'),
  -- Roster control: the pre-existing path must behave identically throughout.
  ('ab000003-0000-4000-8000-000000000003', 'aaaa2222-0000-4000-8000-00000000000b',
   'annual_leave', '2026-11-01', '2026-11-02', false,
   'ROSTER-PENDING control', 'requested',
   '15151515-1515-4151-8151-151515151515');
