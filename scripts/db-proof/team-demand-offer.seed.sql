-- Seed 2 (after team-assignment-canonical.seed.sql): a brigade owned by someone who owns NO demand, the receiving
-- organisation B (owner MB, plus a manager-by-membership), assorted demands.
update public.companies set profile_id = owner_profile_id, verification_status = 'verified',
  display_name = case id when 'cccccccc-0000-0000-0000-000000000001' then 'Company A' else 'Company B' end;

insert into public.profiles (id, active_role, full_name) values
  ('c0c00000-0000-0000-0000-0000000000a1','company','Crew Owner'),
  ('c0c10000-0000-0000-0000-000000000001','worker','Secret Alpha'),
  ('c0c10000-0000-0000-0000-000000000002','worker','Secret Beta'),
  ('c0c10000-0000-0000-0000-000000000003','worker','Secret Gamma'),
  ('c0c10000-0000-0000-0000-000000000004','worker','Secret Solo'),
  ('c0c30000-0000-0000-0000-000000000001','company','Org B Manager By Membership'),
  ('c0c40000-0000-0000-0000-000000000001','company','Unverified Owner');
insert into public.workers (id, profile_id) values
  ('c0c20000-0000-0000-0000-000000000001','c0c10000-0000-0000-0000-000000000001'),
  ('c0c20000-0000-0000-0000-000000000002','c0c10000-0000-0000-0000-000000000002'),
  ('c0c20000-0000-0000-0000-000000000003','c0c10000-0000-0000-0000-000000000003'),
  ('c0c20000-0000-0000-0000-000000000004','c0c10000-0000-0000-0000-000000000004');

-- Brigade C: owned by Crew Owner, THREE active members. Brigade SOLO: ONE active member.
insert into public.organizations (id, organization_type, display_name, owner_profile_id) values
  ('7ea00000-0000-0000-0000-0000000000c1','team','Crew C','c0c00000-0000-0000-0000-0000000000a1'),
  ('7ea00000-0000-0000-0000-0000000000c2','team','Crew Solo','c0c00000-0000-0000-0000-0000000000a1'),
  ('cccc0000-0000-0000-0000-0000000000d1','company','Crew Owner Co','c0c00000-0000-0000-0000-0000000000a1');
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at) values
  ('c0c00000-0000-0000-0000-0000000000a1','7ea00000-0000-0000-0000-0000000000c1','active','owner','2026-01-01'),
  ('c0c00000-0000-0000-0000-0000000000a1','7ea00000-0000-0000-0000-0000000000c2','active','owner','2026-01-01'),
  ('c0c10000-0000-0000-0000-000000000001','7ea00000-0000-0000-0000-0000000000c1','active','employee','2026-02-01'),
  ('c0c10000-0000-0000-0000-000000000002','7ea00000-0000-0000-0000-0000000000c1','active','employee','2026-02-01'),
  ('c0c10000-0000-0000-0000-000000000003','7ea00000-0000-0000-0000-0000000000c1','active','employee','2026-02-01'),
  ('c0c10000-0000-0000-0000-000000000004','7ea00000-0000-0000-0000-0000000000c2','active','employee','2026-02-01');
insert into public.companies (id, owner_profile_id, profile_id, verification_status, display_name) values
  ('cccccccc-0000-0000-0000-0000000000d1','c0c00000-0000-0000-0000-0000000000a1','c0c00000-0000-0000-0000-0000000000a1','verified','Crew Owner Co'),
  ('cccccccc-0000-0000-0000-0000000000d3','c0c40000-0000-0000-0000-000000000001','c0c40000-0000-0000-0000-000000000001','pending','Unverified Co');
-- Org B also has a membership manager (org-level demand access) who is NOT the demand's owner profile.
insert into public.company_memberships (profile_id, organization_id, status, role) values
  ('c0c30000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','active','manager');

insert into public.skills (id, slug) values
  ('51110000-0000-0000-0000-000000000001','welding'),
  ('51110000-0000-0000-0000-000000000002','tiling');
insert into public.worker_skills (worker_id, skill_id, verified) values
  ('c0c20000-0000-0000-0000-000000000001','51110000-0000-0000-0000-000000000001',true),
  ('c0c20000-0000-0000-0000-000000000002','51110000-0000-0000-0000-000000000001',false),
  ('c0c20000-0000-0000-0000-000000000003','51110000-0000-0000-0000-000000000002',false),
  ('c0c20000-0000-0000-0000-000000000004','51110000-0000-0000-0000-000000000001',true);
insert into public.worker_languages (worker_id, lang, level) values
  ('c0c20000-0000-0000-0000-000000000001','en','B2'),
  ('c0c20000-0000-0000-0000-000000000002','en','B2'),
  ('c0c20000-0000-0000-0000-000000000003','lt','native');
insert into public.team_details (org_id, availability_status, deployable_size_min, deployable_size_max,
  destination_countries, accommodation_needed, transport_own) values
  ('7ea00000-0000-0000-0000-0000000000c1','available_now',2,3,array['NO','SE'],true,true);
-- Two of the three members accepted a join_team invitation (consent completeness = 2 of 3).
insert into public.invitations (organization_id, invitation_type, status, accepted_by_profile_id) values
  ('7ea00000-0000-0000-0000-0000000000c1','join_team','accepted','c0c10000-0000-0000-0000-000000000001'),
  ('7ea00000-0000-0000-0000-0000000000c1','join_team','accepted','c0c10000-0000-0000-0000-000000000002');

-- Demands.
insert into public.customer_requests (id, profile_id, organization_id, title, role_or_work_type, country, team_size, start_period, status, kind, payload) values
  -- R1: Org B (owner MB, org attribution B), open demand kind company_request
  ('d0d00000-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666','bbbbbbbb-0000-0000-0000-000000000002','Weld crew','welder','NO',3,'2026-11','submitted','company_request','{"contact":"secret@example.com"}'),
  -- R2: same owner, legacy null-kind row, org attribution null (profile-owned only)
  ('d0d00000-0000-0000-0000-000000000002','66666666-6666-6666-6666-666666666666',null,'Legacy need','tiler','SE',2,'2026-12','submitted',null,null),
  -- R3: closed
  ('d0d00000-0000-0000-0000-000000000003','66666666-6666-6666-6666-666666666666','bbbbbbbb-0000-0000-0000-000000000002','Closed need','welder','NO',3,'2026-11','closed','company_request',null),
  -- R4: SUPPLY direction (agency_offer) - never offerable
  ('d0d00000-0000-0000-0000-000000000004','66666666-6666-6666-6666-666666666666','bbbbbbbb-0000-0000-0000-000000000002','We have people','welder','NO',3,'2026-11','submitted','agency_offer',null),
  -- R5: unverified company
  ('d0d00000-0000-0000-0000-000000000005','c0c40000-0000-0000-0000-000000000001',null,'Unverified need','welder','NO',3,'2026-11','submitted','company_request',null),
  -- R6: the team owner's OWN demand
  ('d0d00000-0000-0000-0000-000000000006','c0c00000-0000-0000-0000-0000000000a1',null,'Own need','welder','NO',3,'2026-11','submitted','company_request',null),
  -- R7: kind not recognised (closed allow-list, not a deny-list)
  ('d0d00000-0000-0000-0000-000000000007','66666666-6666-6666-6666-666666666666','bbbbbbbb-0000-0000-0000-000000000002','Odd kind','welder','NO',3,'2026-11','submitted','something_new',null);
