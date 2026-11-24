-- ============================================================================
-- Booking→engagement ORG-FIRST resolution proof — SEED (re-runnable).
--
-- The live defect's exact shape: ONE owner profile holding TWO companies
-- (each mirrored by an organization), demands stamped with an organization /
-- left NULL, and proposed bookings addressed to workers.
-- ============================================================================

truncate public.company_worker_engagements,
         public.booking_request_events,
         public.booking_requests,
         public.customer_requests,
         public.organizations,
         public.companies,
         public.workers,
         public.profiles
  cascade;

-- Profiles ------------------------------------------------------------------
insert into public.profiles (id) values
  ('a0000000-0000-4000-8000-00000000000a'),  -- P_OWN: multi-company owner (the live-defect shape)
  ('a0000000-0000-4000-8000-00000000000b'),  -- P_SGL: single-company owner
  ('c0000000-0000-4000-8000-000000000001'),  -- P_W1 worker profile
  ('c0000000-0000-4000-8000-000000000002'),  -- P_W2 worker profile
  ('c0000000-0000-4000-8000-000000000003'); -- P_W3 worker profile

-- Workers ---------------------------------------------------------------- --
insert into public.workers (id, profile_id, display_name) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Worker One'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'Worker Two'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'Worker Three');

-- Companies: P_OWN holds TWO, P_SGL holds ONE --------------------------------
insert into public.companies (id, profile_id) values
  ('ca000000-0000-4000-8000-0000000000ca', 'a0000000-0000-4000-8000-00000000000a'),  -- CA
  ('cb000000-0000-4000-8000-0000000000cb', 'a0000000-0000-4000-8000-00000000000a'),  -- CB
  ('cc000000-0000-4000-8000-0000000000cc', 'a0000000-0000-4000-8000-00000000000b'); -- CS

-- Organizations: OA→CA, OB→CB, OS→CS, ONC→(no company) -----------------------
insert into public.organizations (id, owner_profile_id, legacy_company_id) values
  ('0a000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', 'ca000000-0000-4000-8000-0000000000ca'),
  ('0b000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000000a', 'cb000000-0000-4000-8000-0000000000cb'),
  ('0c000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000000b', 'cc000000-0000-4000-8000-0000000000cc'),
  ('0d000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000000a', null);

-- Demands ---------------------------------------------------------------- --
insert into public.customer_requests (id, profile_id, organization_id) values
  -- D1: org-stamped (OA), multi-company owner — the BEFORE-phase booking
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', '0a000000-0000-4000-8000-00000000000a'),
  -- D2: org-stamped (OA) — the org-first mint proof
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', '0a000000-0000-4000-8000-00000000000a'),
  -- D3: NULL org, multi-company owner — fallback ambiguity stays honest
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', null),
  -- D4: NULL org, single-company owner — fallback singleton still mints
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000b', null),
  -- D5: stamped with ONC (organization WITHOUT a bound company)
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a', '0d000000-0000-4000-8000-00000000000d'),
  -- D6: org-stamped (OA) — overlap-guard booking
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-00000000000a', '0a000000-0000-4000-8000-00000000000a'),
  -- D7: org-stamped (OA) — decline path
  ('e0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-00000000000a', '0a000000-0000-4000-8000-00000000000a'),
  -- D8: org-stamped (OB) — the SIBLING company of the SAME owner. §4's exact
  -- question: a booking whose demand belongs to B must engage under CB, and
  -- CA must not receive it merely because one profile owns both.
  ('e0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-00000000000a', '0b000000-0000-4000-8000-00000000000b'),
  -- D9: org-stamped (OA) — second booking for a worker ALREADY actively
  -- engaged with CA (the already_active idempotency arm).
  ('e0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-00000000000a', '0a000000-0000-4000-8000-00000000000a');

-- Proposed bookings ------------------------------------------------------ --
insert into public.booking_requests
    (id, owner_id, request_id, worker_id, status, start_date, expected_end_date) values
  -- B_BEFORE: the live 88a43ead shape — org-stamped demand, TWO-company owner
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'proposed', date '2026-09-01', date '2026-09-03'),
  -- B1: org-first mint (worker 1, disjoint dates)
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'proposed', date '2026-10-01', date '2026-10-05'),
  -- B2: NULL-org demand, multi-company owner (worker 2)
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002',
   'proposed', date '2026-10-01', date '2026-10-05'),
  -- B3: NULL-org demand, single-company owner (worker 2, disjoint dates)
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000b',
   'e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000002',
   'proposed', date '2026-11-01', date '2026-11-05'),
  -- B4: demand stamped with the company-less organization (worker 3)
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000003',
   'proposed', date '2026-09-10', date '2026-09-12'),
  -- B5: worker 1, OVERLAPS B1 (2026-10-03..07) — the preserved 23P01 guard
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001',
   'proposed', date '2026-10-03', date '2026-10-07'),
  -- B6: decline path (worker 3, disjoint dates)
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000003',
   'proposed', date '2026-12-01', date '2026-12-03'),
  -- B7: SIBLING-company demand (OB) — worker 3, disjoint dates
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000003',
   'proposed', date '2026-11-10', date '2026-11-12'),
  -- B8: worker 1 AGAIN under OA→CA, disjoint from B_BEFORE/B1/B5 — the
  -- already_active arm (worker 1 gains an active CA engagement via B1)
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-00000000000a',
   'e0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000001',
   'proposed', date '2026-12-10', date '2026-12-12');
