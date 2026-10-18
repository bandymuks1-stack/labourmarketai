-- RED #4 + #5 proof harness — SEED. Deterministic ids so every assertion in
-- the runner names a real, inspectable row.
begin;

delete from public.booking_request_events;
delete from public.company_worker_engagements;
delete from public.booking_requests;
delete from public.customer_requests;
delete from public.organization_evidence_events;
delete from public.organization_evidence_parties;
delete from public.organization_evidence_records;
delete from public.organization_people;
delete from public.organization_members;
delete from public.workers;
delete from public.companies;
delete from public.organizations;
delete from public.profiles;

-- people
insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- SUBJECT      the record is about them
  ('22222222-2222-2222-2222-222222222222'),  -- OUTSIDER     unrelated person
  ('33333333-3333-3333-3333-333333333333'),  -- ORGMANAGER   manages the employer org
  ('44444444-4444-4444-4444-444444444444'),  -- UNLINKED     an org_person row, link_state<>'linked'
  ('55555555-5555-5555-5555-555555555555');  -- EMPLOYER     books workers

-- organisations
insert into public.organizations (id, legacy_company_id) values
  ('a0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000c'),  -- EMPLOYER ORG
  ('a0000000-0000-4000-8000-00000000000b', null);                                     -- OTHER ORG
insert into public.organization_members (organization_id, profile_id) values
  ('a0000000-0000-4000-8000-00000000000a', '33333333-3333-3333-3333-333333333333');

-- roster: one LINKED subject, one deliberately NOT linked
insert into public.organization_people (id, organization_id, linked_profile_id, link_state) values
  ('40000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
   '11111111-1111-1111-1111-111111111111', 'linked'),
  ('40000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
   '44444444-4444-4444-4444-444444444444', 'proposed');

-- the employer's evidence ABOUT the subject
insert into public.organization_evidence_records
  (id, organization_id, organization_person_id, imported_by_profile_id, original_text, activity_date) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
   '40000000-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333',
   'Poured foundation slab, Vilnius site', '2026-03-04'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
   '40000000-0000-4000-8000-000000000002', '33333333-3333-3333-3333-333333333333',
   'Record about the UNLINKED person', '2026-03-05');

-- booking side
insert into public.companies (id, profile_id) values
  ('c0000000-0000-4000-8000-00000000000c', '55555555-5555-5555-5555-555555555555');
insert into public.workers (id, profile_id, display_name) values
  ('70000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'Subject Worker');
insert into public.customer_requests (id, profile_id, organization_id) values
  ('d0000000-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555',
   'a0000000-0000-4000-8000-00000000000a');

-- B1 will be ACCEPTED first; B2 overlaps it; B3 does not overlap anything.
insert into public.booking_requests (id, owner_id, request_id, worker_id, status, start_date, expected_end_date) values
  ('b0000000-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555',
   'd0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   'accepted', '2026-10-01', '2026-10-10'),
  ('b0000000-0000-4000-8000-000000000002', '55555555-5555-5555-5555-555555555555',
   'd0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   'proposed', '2026-10-05', '2026-10-15'),
  ('b0000000-0000-4000-8000-000000000003', '55555555-5555-5555-5555-555555555555',
   'd0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   'proposed', '2026-12-01', '2026-12-05');
commit;
