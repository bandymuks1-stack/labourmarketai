-- FINANCIAL OPS PROOF SEED — loaded after workflow-engine-v1.seed.sql, which
-- already created O1/O2 and the eight actor profiles (owner1/admin1/manager1/
-- member1/engreq/revoked1/out2/noone) with their memberships.
--
-- This adds only what the financial-ops migrations need on top:
--   * a company bridged to O1 (so finance_company_authority_v1 has a path),
--   * a project managed through O1, and a project of the WRONG org,
--   * a work object in O1 and one in O2 (the org-boundary probe),
--   * two org documents in O1 (a readable ACTIVE 'standard' one and a
--     'classified' one only owner/admin may read), plus one in O2.
-- Fixed uuids so the shell probes can address them.

insert into public.companies (id, profile_id, name) values
  ('c1000000-0000-4000-8000-00000000000c', 'a1000000-0000-4000-8000-00000000000a', 'Org One Ltd'),
  ('c2000000-0000-4000-8000-00000000000c', 'a7000000-0000-4000-8000-00000000000a', 'Org Two Ltd')
on conflict do nothing;

update public.organizations
   set legacy_company_id = 'c1000000-0000-4000-8000-00000000000c'
 where id = '01000000-0000-4000-8000-000000000001';
update public.organizations
   set legacy_company_id = 'c2000000-0000-4000-8000-00000000000c'
 where id = '02000000-0000-4000-8000-000000000002';

insert into public.projects (id, title, company_id, organization_id) values
  ('91000000-0000-4000-8000-000000000091', 'Hall renovation',
   'c1000000-0000-4000-8000-00000000000c', '01000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000092', 'Wrong-org project',
   'c2000000-0000-4000-8000-00000000000c', '02000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.work_objects (id, organization_id, name) values
  ('81000000-0000-4000-8000-000000000081', '01000000-0000-4000-8000-000000000001', 'Site A'),
  ('82000000-0000-4000-8000-000000000082', '02000000-0000-4000-8000-000000000002', 'Wrong-org site')
on conflict do nothing;

insert into public.org_documents (id, organization_id, title, status, classification) values
  ('71000000-0000-4000-8000-000000000071', '01000000-0000-4000-8000-000000000001',
   'Cement invoice scan', 'active', 'standard'),
  ('72000000-0000-4000-8000-000000000072', '01000000-0000-4000-8000-000000000001',
   'Board minutes', 'active', 'classified'),
  ('73000000-0000-4000-8000-000000000073', '02000000-0000-4000-8000-000000000002',
   'Wrong-org document', 'active', 'standard')
on conflict do nothing;
