-- Cast. ISSUER org A (the contractor), CLIENT org C, outsider org B.
--  A1 owner, A2 admin (finance authority), A3 manager (manages the project, NOT finance), W worker (A employee)
--  C1 client representative (manages org C), B1 other org owner, D1 platform admin
insert into public.organizations (id) values
 ('aaaaaaaa-0000-0000-0000-00000000000a'),('cccccccc-0000-0000-0000-00000000000c'),('bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.profiles (id, active_role) values
 ('a0000001-0000-0000-0000-000000000001','company'),('a0000002-0000-0000-0000-000000000002','company'),
 ('a0000003-0000-0000-0000-000000000003','company'),('a0000004-0000-0000-0000-000000000004','worker'),
 ('c0000001-0000-0000-0000-000000000001','company'),('b0000001-0000-0000-0000-000000000001','company'),
 ('d0000001-0000-0000-0000-000000000001','admin');
insert into public.company_memberships (profile_id, organization_id, status, role) values
 ('a0000001-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','active','owner'),
 ('a0000002-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','active','admin'),
 ('a0000003-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','active','manager'),
 ('c0000001-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','active','owner'),
 ('b0000001-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','active','owner');
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug, journal_review_enabled) values
 ('ec000001-0000-0000-0000-000000000001','a0000001-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','active','owner',true),
 ('ec000002-0000-0000-0000-000000000002','a0000002-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','active','manager',true),
 ('ec000003-0000-0000-0000-000000000003','a0000003-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','active','manager',true),
 ('ec000004-0000-0000-0000-000000000004','a0000004-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-00000000000a','active','employee',true),
 ('ec00000c-0000-0000-0000-00000000000c','c0000001-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','active','owner',true),
 ('ec00000b-0000-0000-0000-00000000000b','b0000001-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','active','owner',true);
insert into public.workers (id, profile_id) values ('aaaa0004-0000-0000-0000-000000000004','a0000004-0000-0000-0000-000000000004');
insert into public.projects (id, organization_id, title) values
 ('90000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-00000000000a','Tower fit-out'),
 ('90000000-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-00000000000b','Other org project');
insert into public.project_worker_assignments (project_id, worker_id, status) values
 ('90000000-0000-0000-0000-0000000000a1','aaaa0004-0000-0000-0000-000000000004','active');
grant select on public.company_memberships, public.organizations to authenticated;
