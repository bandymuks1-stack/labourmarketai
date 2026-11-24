insert into public.profiles(id) values
 ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222'),('55555555-5555-5555-5555-555555555555');
insert into public.organizations(id, public_profile_enabled) values ('aaaaaaaa-0000-0000-0000-000000000001', true);
insert into public.projects(id) values ('99999999-0000-0000-0000-000000000001');
insert into public.org_members values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
insert into public.proof_admins values ('55555555-5555-5555-5555-555555555555');
-- pre-existing v1 data that MUST survive: an active + a draft work listing, an active offering
insert into public.marketplace_listings(id,owner_id,organization_id,listing_kind,category,title,status) values
 ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','sale','tools','Pre-existing drill','active'),
 ('cccccccc-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',null,'rental','vehicle','Pre-existing van','draft');
insert into public.service_offerings(id,provider_id,title,category_slug,status) values
 ('dddddddd-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Tiling','trade','active');
