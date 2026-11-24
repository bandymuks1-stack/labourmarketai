-- ============================================================================
-- can_view_worker vs booking engagements — PROOF SEED.
--
-- Re-runnable: the shell script re-seeds after the mutating (end-engagement)
-- probe so the ROLLBACK comparison is like-for-like. Everything is deleted in
-- FK order and re-inserted with fixed uuids.
--
-- ── THE CAST ────────────────────────────────────────────────────────────────
-- Workers
--   W1  engaged with E1's company, NO discoverability consent, no roster,
--       no assignment.  ← THE SUBJECT. Before the migration nobody but W1
--       and admin can see this row.
--   W2  consented (current version granted). Consent control: every employer
--       sees W2 before AND after; the migration must not change that.
--   W3  granted THEN withdrew, and is engaged with E4. This is memo §7.1 —
--       the withdrawal path. Before: invisible. After: E4 sees W3 again on
--       the RELATIONSHIP basis, while every other employer still cannot.
--   W4  on E2's company roster, no consent. Roster control.
--   W5  engaged with E5 AND actively assigned to E5's project. Exists to
--       prove memo §5's caveat: ending the engagement does NOT revoke,
--       because the project-assignment branch is independent.
--
-- Employers (all active_role='company', so is_employer() is TRUE for each)
--   E1  owns C1 — the ACTIVE engagement with W1.
--   E2  owns C2 — unrelated to W1. Rosters W4. Also holds a DETACHED
--       engagement row (worker_id IS NULL) that must grant nothing.
--   E3  owns C3 — an ENDED engagement with W1. Must grant nothing.
--   E4  owns C4 — ACTIVE engagement with W3 (the withdrawn-consent worker).
--   E5  owns C5 — ACTIVE engagement with W5 + an active project assignment.
--   ADMIN  active_role='admin'.
-- ============================================================================

-- ── Reset (FK order) ────────────────────────────────────────────────────────
delete from public.company_worker_engagements;
delete from public.project_worker_assignments;
delete from public.worker_languages;
delete from public.worker_professions;
delete from public.worker_skills;
delete from public.company_workers;
delete from public.agency_workers;
delete from public.privacy_consent_events;
delete from public.projects;
delete from public.organizations;
delete from public.booking_requests;
delete from public.skills;
delete from public.professions;
delete from public.workers;
delete from public.companies;
delete from public.agencies;
delete from public.profiles;

-- ── Profiles ────────────────────────────────────────────────────────────────
insert into public.profiles (id, active_role) values
  ('11111111-1111-4111-8111-111111111111', 'worker'),   -- W1 profile
  ('15151515-1515-4151-8151-151515151515', 'worker'),   -- W2 profile
  ('16161616-1616-4161-8161-161616161616', 'worker'),   -- W3 profile
  ('17171717-1717-4171-8171-171717171717', 'worker'),   -- W4 profile
  ('18181818-1818-4181-8181-181818181818', 'worker'),   -- W5 profile
  ('22222222-2222-4222-8222-222222222222', 'company'),  -- E1
  ('33333333-3333-4333-8333-333333333333', 'company'),  -- E2
  ('55555555-5555-4555-8555-555555555555', 'company'),  -- E3
  ('66666666-6666-4666-8666-666666666666', 'company'),  -- E4
  ('77777777-7777-4777-8777-777777777777', 'company'),  -- E5
  ('44444444-4444-4444-8444-444444444444', 'admin');    -- ADMIN

-- ── Companies ───────────────────────────────────────────────────────────────
insert into public.companies (id, profile_id) values
  ('cccc1111-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222'),
  ('cccc2222-0000-4000-8000-00000000000b', '33333333-3333-4333-8333-333333333333'),
  ('cccc3333-0000-4000-8000-00000000000c', '55555555-5555-4555-8555-555555555555'),
  ('cccc4444-0000-4000-8000-00000000000d', '66666666-6666-4666-8666-666666666666'),
  ('cccc5555-0000-4000-8000-00000000000e', '77777777-7777-4777-8777-777777777777');

-- ── Workers (identity fields the proof reads back) ──────────────────────────
insert into public.workers (id, profile_id, display_name, headline, bio) values
  ('aaaa1111-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-111111111111',
   'ENGAGED-W1', 'Steel fixer 10y', 'W1 private bio'),
  ('aaaa2222-0000-4000-8000-00000000000b', '15151515-1515-4151-8151-151515151515',
   'CONSENTED-W2', 'Welder 5y', 'W2 private bio'),
  ('aaaa3333-0000-4000-8000-00000000000c', '16161616-1616-4161-8161-161616161616',
   'WITHDRAWN-W3', 'Carpenter 8y', 'W3 private bio'),
  ('aaaa4444-0000-4000-8000-00000000000d', '17171717-1717-4171-8171-171717171717',
   'ROSTER-W4', 'Painter 3y', 'W4 private bio'),
  ('aaaa5555-0000-4000-8000-00000000000e', '18181818-1818-4181-8181-181818181818',
   'ASSIGNED-W5', 'Electrician 12y', 'W5 private bio');

-- ── Professional summary rows (the other three gated tables) ────────────────
insert into public.skills (id, slug) values
  ('5c111111-0000-4000-8000-00000000000a', 'steel-fixing');
insert into public.professions (id, slug) values
  ('b0111111-0000-4000-8000-00000000000a', 'steel-fixer');

insert into public.worker_skills (worker_id, skill_id, self_rated_level, verified) values
  ('aaaa1111-0000-4000-8000-00000000000a', '5c111111-0000-4000-8000-00000000000a', 4, true);
insert into public.worker_professions (worker_id, profession_id, is_primary) values
  ('aaaa1111-0000-4000-8000-00000000000a', 'b0111111-0000-4000-8000-00000000000a', true);
insert into public.worker_languages (worker_id, lang, level) values
  ('aaaa1111-0000-4000-8000-00000000000a', 'lt', 'native'),
  ('aaaa1111-0000-4000-8000-00000000000a', 'en', 'B2');

-- ── Consent ledger ──────────────────────────────────────────────────────────
-- W2: granted, CURRENT version → discoverable.
insert into public.privacy_consent_events
  (user_id, purpose, action, consent_text_version, consent_text_hash, created_at)
values
  ('15151515-1515-4151-8151-151515151515', 'profile_discoverability', 'granted',
   '2026-07-11.v1', 'hash-v1', now() - interval '10 days');

-- W3: granted, then WITHDREW. Newest row wins → NOT discoverable.
insert into public.privacy_consent_events
  (user_id, purpose, action, consent_text_version, consent_text_hash, created_at)
values
  ('16161616-1616-4161-8161-161616161616', 'profile_discoverability', 'granted',
   '2026-07-11.v1', 'hash-v1', now() - interval '20 days'),
  ('16161616-1616-4161-8161-161616161616', 'profile_discoverability', 'withdrawn',
   '2026-07-11.v1', 'hash-v1', now() - interval '2 days');

-- W1, W4, W5: no consent event at all (fail closed).

-- ── Roster control: E2's company holds W4 ───────────────────────────────────
insert into public.company_workers (company_id, worker_id, status) values
  ('cccc2222-0000-4000-8000-00000000000b', 'aaaa4444-0000-4000-8000-00000000000d', 'active');

-- ── Bookings (provenance anchors only; bodies not exercised) ────────────────
insert into public.booking_requests (id, status) values
  ('bb000001-0000-4000-8000-000000000001', 'accepted'),   -- ENG1  (C1 ↔ W1)
  ('bb000002-0000-4000-8000-000000000002', 'accepted'),   -- detached row (C2)
  ('bb000003-0000-4000-8000-000000000003', 'accepted'),   -- ended  (C3 ↔ W1)
  ('bb000004-0000-4000-8000-000000000004', 'accepted'),   -- ENG_W3 (C4 ↔ W3)
  ('bb000005-0000-4000-8000-000000000005', 'accepted');   -- ENG_W5 (C5 ↔ W5)

-- ── Engagements ─────────────────────────────────────────────────────────────
insert into public.company_worker_engagements
  (id, company_id, worker_id, source_booking_id, status, ended_at, created_by)
values
  -- ACTIVE: E1's company ↔ W1. The whole point of the migration.
  ('e9000001-0000-4000-8000-000000000001', 'cccc1111-0000-4000-8000-00000000000a',
   'aaaa1111-0000-4000-8000-00000000000a', 'bb000001-0000-4000-8000-000000000001',
   'active', null, '11111111-1111-4111-8111-111111111111'),
  -- DETACHED (#856 model A): worker erased, worker_id NULL, still 'active'.
  -- Must grant E2 nothing.
  ('e9000002-0000-4000-8000-000000000002', 'cccc2222-0000-4000-8000-00000000000b',
   null, 'bb000002-0000-4000-8000-000000000002', 'active', null, null),
  -- ENDED: E3's company ↔ W1. Must grant nothing.
  ('e9000003-0000-4000-8000-000000000003', 'cccc3333-0000-4000-8000-00000000000c',
   'aaaa1111-0000-4000-8000-00000000000a', 'bb000003-0000-4000-8000-000000000003',
   'ended', now() - interval '1 day', null),
  -- ACTIVE: E4's company ↔ W3 (consent WITHDRAWN). Memo §7.1.
  ('e9000004-0000-4000-8000-000000000004', 'cccc4444-0000-4000-8000-00000000000d',
   'aaaa3333-0000-4000-8000-00000000000c', 'bb000004-0000-4000-8000-000000000004',
   'active', null, '16161616-1616-4161-8161-161616161616'),
  -- ACTIVE: E5's company ↔ W5, alongside an active project assignment.
  ('e9000005-0000-4000-8000-000000000005', 'cccc5555-0000-4000-8000-00000000000e',
   'aaaa5555-0000-4000-8000-00000000000e', 'bb000005-0000-4000-8000-000000000005',
   'active', null, '18181818-1818-4181-8181-181818181818');

-- ── E5's project + the active assignment (memo §5 caveat) ───────────────────
insert into public.organizations (id, legacy_company_id) values
  ('0e000005-0000-4000-8000-000000000005', 'cccc5555-0000-4000-8000-00000000000e');
insert into public.projects (id, company_id, organization_id, status) values
  ('99000005-0000-4000-8000-000000000005', 'cccc5555-0000-4000-8000-00000000000e',
   '0e000005-0000-4000-8000-000000000005', 'live');
insert into public.project_worker_assignments (project_id, worker_id, status, ended_at) values
  ('99000005-0000-4000-8000-000000000005', 'aaaa5555-0000-4000-8000-00000000000e',
   'active', null);
