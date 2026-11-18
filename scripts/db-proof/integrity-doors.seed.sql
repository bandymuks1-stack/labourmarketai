-- INTEGRITY DOORS v1 - cast. Throwaway PostgreSQL only.
--   PA  worker A   employee of ORGA, assigned to PRJA (org A)
--   PB  worker B   employee of ORGB, assigned to PRJB (org B)
--   MA  manager of ORGA          MB manager of ORGB          MC manager of ORGC (a client / party org)
--   STR a stranger worker (no org)
--   ADM platform admin
insert into public.profiles (id, active_role) values
 ('a1111111-1111-4111-8111-111111111111','worker'),   -- PA
 ('b2222222-2222-4222-8222-222222222222','worker'),   -- PB
 ('3a333333-3333-4333-8333-333333333333','employer'), -- MA
 ('3b333333-3333-4333-8333-333333333333','employer'), -- MB
 ('3c333333-3333-4333-8333-333333333333','employer'), -- MC
 ('5a555555-5555-4555-8555-555555555555','worker'),   -- STR
 ('adadadad-adad-4dad-8dad-adadadadadad','admin');    -- ADM
insert into public.organizations (id, display_name) values
 ('0a000000-0000-4000-8000-00000000000a','Org A'),
 ('0b000000-0000-4000-8000-00000000000b','Org B'),
 ('0c000000-0000-4000-8000-00000000000c','Org C (client)');
insert into public.workers (id, profile_id, display_name) values
 ('aa000000-0000-4000-8000-0000000000a1','a1111111-1111-4111-8111-111111111111','Worker A'),
 ('bb000000-0000-4000-8000-0000000000b2','b2222222-2222-4222-8222-222222222222','Worker B'),
 ('55000000-0000-4000-8000-000000000005','5a555555-5555-4555-8555-555555555555','Stranger');
insert into public.company_memberships (profile_id, organization_id, status, role) values
 ('3a333333-3333-4333-8333-333333333333','0a000000-0000-4000-8000-00000000000a','active','manager'),
 ('3b333333-3333-4333-8333-333333333333','0b000000-0000-4000-8000-00000000000b','active','manager'),
 ('3c333333-3333-4333-8333-333333333333','0c000000-0000-4000-8000-00000000000c','active','manager');
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug) values
 ('ec00000a-0000-4000-8000-0000000000a1','a1111111-1111-4111-8111-111111111111','0a000000-0000-4000-8000-00000000000a','active','employee'), -- PA@A
 ('ec00000b-0000-4000-8000-0000000000b2','b2222222-2222-4222-8222-222222222222','0b000000-0000-4000-8000-00000000000b','active','employee'), -- PB@B
 ('ec000005-0000-4000-8000-000000000005','5a555555-5555-4555-8555-555555555555',null,'active','employee');                                       -- STR personal
insert into public.projects (id, organization_id, status, title) values
 ('9a000000-0000-4000-8000-00000000000a','0a000000-0000-4000-8000-00000000000a','active','Project A'),
 ('9a000000-0000-4000-8000-0000000000a2','0a000000-0000-4000-8000-00000000000a','active','Project A2 (PA NOT assigned)'),
 ('9b000000-0000-4000-8000-00000000000b','0b000000-0000-4000-8000-00000000000b','active','Project B');
insert into public.project_worker_assignments (worker_id, project_id, status) values
 ('aa000000-0000-4000-8000-0000000000a1','9a000000-0000-4000-8000-00000000000a','active'),
 ('bb000000-0000-4000-8000-0000000000b2','9b000000-0000-4000-8000-00000000000b','active');
insert into public.skills (id, slug) values
 ('5c000000-0000-4000-8000-000000000001','tiling'),
 ('5c000000-0000-4000-8000-000000000002','welding'),
 ('5c000000-0000-4000-8000-000000000003','plumbing');

-- evidence: records about worker A in ORG A, plus one party (ORG C, a client)
insert into public.organization_people (id, organization_id, display_name, normalized_name, relationship_kind, created_by) values
 ('0e000000-0000-4000-8000-0000000000e1','0a000000-0000-4000-8000-00000000000a','Worker A (roster 1)','worker a','employee','3a333333-3333-4333-8333-333333333333'),
 ('0e000000-0000-4000-8000-0000000000e2','0a000000-0000-4000-8000-00000000000a','Worker A (roster 2)','worker a','employee','3a333333-3333-4333-8333-333333333333'),
 ('0e000000-0000-4000-8000-0000000000e3','0a000000-0000-4000-8000-00000000000a','Worker A (roster 3)','worker a','employee','3a333333-3333-4333-8333-333333333333');
insert into public.organization_evidence_records (id, organization_id, organization_person_id, supplier_role, imported_by_profile_id, hours) values
 ('3e000000-0000-4000-8000-0000000000c1','0a000000-0000-4000-8000-00000000000a','0e000000-0000-4000-8000-0000000000e1','employer','3a333333-3333-4333-8333-333333333333',8),
 ('3e000000-0000-4000-8000-0000000000c2','0a000000-0000-4000-8000-00000000000a','0e000000-0000-4000-8000-0000000000e2','employer','3a333333-3333-4333-8333-333333333333',6),
 ('3e000000-0000-4000-8000-0000000000c3','0a000000-0000-4000-8000-00000000000a','0e000000-0000-4000-8000-0000000000e3','employer','3a333333-3333-4333-8333-333333333333',4);
insert into public.organization_evidence_parties (organization_id, record_id, party_organization_id, party_role) values
 ('0a000000-0000-4000-8000-00000000000a','3e000000-0000-4000-8000-0000000000c1','0c000000-0000-4000-8000-00000000000c','client');
insert into public.organization_evidence_competency_signals (organization_id, record_id, slug) values
 ('0a000000-0000-4000-8000-00000000000a','3e000000-0000-4000-8000-0000000000c1','tiling'),
 ('0a000000-0000-4000-8000-00000000000a','3e000000-0000-4000-8000-0000000000c3','tiling');
insert into public.evidence_import_rows (organization_id, organization_person_id, row_index, person_label, hours, status) values
 ('0a000000-0000-4000-8000-00000000000a','0e000000-0000-4000-8000-0000000000e1',1,'Worker A (roster 1)',8,'committed'),
 ('0a000000-0000-4000-8000-00000000000a','0e000000-0000-4000-8000-0000000000e3',1,'Worker A (roster 3)',4,'committed');
insert into public.organization_evidence_parties (organization_id, record_id, party_organization_id, party_role) values
 ('0a000000-0000-4000-8000-00000000000a','3e000000-0000-4000-8000-0000000000c3','0c000000-0000-4000-8000-00000000000c','client');
grant select on all tables in schema public to authenticated;
