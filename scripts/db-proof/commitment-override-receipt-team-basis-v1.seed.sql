-- Team seed (runs after the commitment seed + 20261003150100 + 20261003150600).
-- Manager aa..b1 (MGR) manages org A and owns teams T1 / T2. Manager bb..b2 (MGRB) is the other tenant.
insert into public.profiles (id, active_role, full_name) values
 ('c1000000-0000-0000-0000-000000000001','worker','Member One'),    -- TM1 active member of T1
 ('c2000000-0000-0000-0000-000000000002','worker','Member Two'),    -- TM2 active member of T1
 ('c3000000-0000-0000-0000-000000000003','worker','Left Early'),    -- TL  left T1 before now
 ('c4000000-0000-0000-0000-000000000004','worker','Joins Later'),   -- TJ  joins T1 in the future
 ('c5000000-0000-0000-0000-000000000005','worker','Not A Member'),  -- NM  worker, no team
 ('c6000000-0000-0000-0000-000000000006','worker','Member Three');  -- TM3 member of T2 only
insert into public.workers (id, profile_id) values
 ('cccc0001-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001'),
 ('cccc0002-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000002'),
 ('cccc0003-0000-0000-0000-000000000003','c3000000-0000-0000-0000-000000000003'),
 ('cccc0004-0000-0000-0000-000000000004','c4000000-0000-0000-0000-000000000004'),
 ('cccc0005-0000-0000-0000-000000000005','c5000000-0000-0000-0000-000000000005'),
 ('cccc0006-0000-0000-0000-000000000006','c6000000-0000-0000-0000-000000000006');
insert into public.organizations (id, organization_type, display_name) values
 ('7ea00000-0000-0000-0000-00000000000a','team','Brigade T1'),
 ('7ea00000-0000-0000-0000-0000000000a2','team','Brigade T2');
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at, ended_at) values
 ('aa000000-0000-0000-0000-0000000000b1','7ea00000-0000-0000-0000-00000000000a','active','owner',now() - interval '1 year',null),
 ('aa000000-0000-0000-0000-0000000000b1','7ea00000-0000-0000-0000-0000000000a2','active','owner',now() - interval '1 year',null),
 ('c1000000-0000-0000-0000-000000000001','7ea00000-0000-0000-0000-00000000000a','active','employee',now() - interval '1 year',null),
 ('c2000000-0000-0000-0000-000000000002','7ea00000-0000-0000-0000-00000000000a','active','employee',now() - interval '1 year',null),
 ('c3000000-0000-0000-0000-000000000003','7ea00000-0000-0000-0000-00000000000a','ended','employee',now() - interval '1 year',(now() - interval '30 days')::date),
 ('c4000000-0000-0000-0000-000000000004','7ea00000-0000-0000-0000-00000000000a','active','employee',now() + interval '1 year',null),
 ('c6000000-0000-0000-0000-000000000006','7ea00000-0000-0000-0000-0000000000a2','active','employee',now() - interval '1 year',null),
 -- PW1 (person-assigned on PA1) is ALSO a member of T1: the person basis must win.
 ('a1000000-0000-0000-0000-000000000001','7ea00000-0000-0000-0000-00000000000a','active','employee',now() - interval '1 year',null);
