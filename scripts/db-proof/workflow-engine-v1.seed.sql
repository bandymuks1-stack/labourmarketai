-- WORKFLOW ENGINE PROOF SEED — two orgs, every caller class the authority
-- matrix names. Fixed uuids so the shell probes can address them.

insert into public.organizations (id) values
  ('01000000-0000-4000-8000-000000000001'), -- O1 (the org under test)
  ('02000000-0000-4000-8000-000000000002')  -- O2 (the wrong org)
on conflict do nothing;

insert into public.profiles (id, email) values
  ('a1000000-0000-4000-8000-00000000000a', 'owner1@proof.test'),   -- OWNER of O1
  ('a2000000-0000-4000-8000-00000000000a', 'admin1@proof.test'),   -- ADMIN of O1
  ('a3000000-0000-4000-8000-00000000000a', 'manager1@proof.test'), -- MANAGER of O1
  ('a4000000-0000-4000-8000-00000000000a', 'member1@proof.test'),  -- plain MEMBER of O1
  ('a5000000-0000-4000-8000-00000000000a', 'engreq@proof.test'),   -- engagement-truth member of O1 (NO membership row)
  ('a6000000-0000-4000-8000-00000000000a', 'revoked1@proof.test'), -- REVOKED former admin of O1
  ('a7000000-0000-4000-8000-00000000000a', 'out2@proof.test'),     -- owner of O2 only
  ('a8000000-0000-4000-8000-00000000000a', 'noone@proof.test')     -- attacker: no org at all
on conflict do nothing;

insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('01000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-00000000000a', 'owner',   'active'),
  ('01000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-00000000000a', 'admin',   'active'),
  ('01000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-00000000000a', 'manager', 'active'),
  ('01000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-00000000000a', 'member',  'active'),
  ('01000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-00000000000a', 'admin',   'revoked'),
  ('02000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-00000000000a', 'owner',   'active')
on conflict do nothing;

-- The BOTH-truths boundary: ENGREQ belongs to O1 only through the
-- employment-context spine.
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values
  ('a5000000-0000-4000-8000-00000000000a', '01000000-0000-4000-8000-000000000001', 'active', 'worker')
on conflict do nothing;
