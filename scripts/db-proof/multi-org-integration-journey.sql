-- MULTI-ORGANIZATION STRUCTURAL SPINE — §5 LOCAL INTEGRATION JOURNEY.
-- Runs against the DISPOSABLE local stack built from EXACT main (db reset +
-- reference-data + dev-fixtures + dev-fixtures-mp03). One transaction,
-- impersonation via request.jwt.claims (+ role for RLS reads), PASS/FAIL
-- lines, ROLLBACK at the end — no data left behind.
--
-- Actor map (mp03 fixtures + journey fixtures):
--   P  a0300000-…-0001  owns A (Alfa) + B (Beta); manages C (Gamma) via a
--                       manager ENGAGEMENT (no membership on C)
--   O  a0300000-…-0002  owns D (Delta) — unrelated
--   W  a0300000-…-0003  worker engaged by A AND B (journey fixture adds B)
--   X  a0800000-…-0001  lifecycle actor: invited→accepted admin in A,
--                       active member in B
-- Usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/db-proof/multi-org-integration-journey.sql
begin;

select o.id as org_a from public.organizations o where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000a' \gset
select o.id as org_b from public.organizations o where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000b' \gset
select o.id as org_c from public.organizations o where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000c' \gset
select o.id as org_d from public.organizations o where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000d' \gset
select w.id as worker_w from public.workers w where w.profile_id = 'a0300000-0000-0000-0000-000000000003' \gset

-- ── journey fixtures ──────────────────────────────────────────────────────
-- P's owner memberships on A and B (the fixture orgs post-date the slice-1
-- migration backfill, so the governance rows are seeded here).
insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
values (:'org_a', 'a0300000-0000-0000-0000-000000000001', 'owner', 'active', 'journey', now()),
       (:'org_b', 'a0300000-0000-0000-0000-000000000001', 'owner', 'active', 'journey', now()),
       (:'org_d', 'a0300000-0000-0000-0000-000000000002', 'owner', 'active', 'journey', now())
on conflict do nothing;

-- lifecycle actor X (auth + profile + an ACTIVE member row in B)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token, email_change_confirm_status, is_sso_user)
select '00000000-0000-0000-0000-000000000000', 'a0800000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
       'journey.x@local.test', crypt('password', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '', '', '', '', '', 0, false
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('a0800000-0000-0000-0000-000000000001', 'journey.x@local.test')
on conflict (id) do nothing;
insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
values (:'org_b', 'a0800000-0000-0000-0000-000000000001', 'member', 'active', 'journey', now());

-- worker W: independent employment engagements in A AND B
insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, hash_self)
select 'a0300000-0000-0000-0000-000000000003', :'org_a', 'employee', 'active', 'journey-a'
where not exists (select 1 from public.engagement_contexts
  where profile_id='a0300000-0000-0000-0000-000000000003' and organization_id=:'org_a'
    and relationship_slug='employee' and status='active');
insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, hash_self)
values ('a0300000-0000-0000-0000-000000000003', :'org_b', 'employee', 'active', 'journey-b');

-- projects in A and B (draft; company-keyed like the real insert path)
insert into public.projects (id, company_id, title, status)
values ('feed0000-0000-4000-8000-00000000000a', 'c0300000-0000-0000-0000-00000000000a', 'Journey project A', 'draft'),
       ('feed0000-0000-4000-8000-00000000000b', 'c0300000-0000-0000-0000-00000000000b', 'Journey project B', 'draft');

\set P '{"sub":"a0300000-0000-0000-0000-000000000001","role":"authenticated"}'
\set O '{"sub":"a0300000-0000-0000-0000-000000000002","role":"authenticated"}'
\set W '{"sub":"a0300000-0000-0000-0000-000000000003","role":"authenticated"}'
\set X '{"sub":"a0800000-0000-0000-0000-000000000001","role":"authenticated"}'

\echo ═══ 1-4 + 12-13. P selects A → A writes A; switches to B → B writes B ═══
select set_config('request.jwt.claims', :'P', true);
select public.submit_demand_request_v2('company_request','Journey demand A','crew for A','{}'::jsonb,'lt',:'org_a') as demand_a \gset
select public.submit_demand_request_v2('company_request','Journey demand B','crew for B','{}'::jsonb,'lt',:'org_b') as demand_b \gset
select case when
  (select organization_id from public.customer_requests where id=:'demand_a') = :'org_a'
  and (select organization_id from public.customer_requests where id=:'demand_b') = :'org_b'
then 'PASS 1-4/12-13: A context wrote ONLY A; B context wrote ONLY B' else 'FAIL 1-4' end;

\echo ═══ 5. Personal context grants no employer authority ═══
select public.submit_demand_request_v2('company_request','Journey personal','personal need','{}'::jsonb,'lt',null) as demand_p \gset
select case when
  (select organization_id from public.customer_requests where id=:'demand_p') is null
then 'PASS 5a: personal demand carries NO organization' else 'FAIL 5a' end;
do $$
begin
  begin
    perform set_config('request.jwt.claims','{"sub":"a0800000-0000-0000-0000-000000000001","role":"authenticated"}',true);
    perform public.submit_demand_request_v2('company_request','member try','x','{}'::jsonb,'lt',
      (select id from public.organizations where legacy_company_id='c0300000-0000-0000-0000-00000000000b'));
    raise exception 'FAIL 5b: a mere member created org demand';
  exception when insufficient_privilege then
    raise notice 'PASS 5b: member role has no employer demand authority';
  end;
end $$;

\echo ═══ 6. C management capability matches role (manager ≠ identity) ═══
select set_config('request.jwt.claims', :'P', true);
select case when public.manages_organization(:'org_c')
then 'PASS 6a: P manages C (manager engagement arm)' else 'FAIL 6a' end;
do $$
begin
  begin
    perform set_config('request.jwt.claims','{"sub":"a0300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
    perform public.save_company_setup_v3('c0300000-0000-0000-0000-00000000000c'::uuid,
      'MP03 Gamma (manager edit)', null,null,null,null,null,null,null,false,null);
    raise exception 'FAIL 6b: manager edited C company identity';
  exception when insufficient_privilege then
    raise notice 'PASS 6b: manager cannot edit C identity (no owner/admin membership)';
  end;
end $$;

\echo ═══ 7. D remains inaccessible to P ═══
select case when not public.manages_organization(:'org_d')
then 'PASS 7a: P does not manage D' else 'FAIL 7a' end;
do $$
begin
  begin
    perform public.submit_demand_request_v2('company_request','forged D','x','{}'::jsonb,'lt',
      (select id from public.organizations where legacy_company_id='c0300000-0000-0000-0000-00000000000d'));
    raise exception 'FAIL 7b: P stamped D';
  exception when insufficient_privilege then
    raise notice 'PASS 7b: P cannot stamp D (not_org_member)';
  end;
end $$;

\echo ═══ 8-9. Worker W: independent A and B engagements; ending A leaves B ═══
select case when (
  select count(*) from public.engagement_contexts
   where profile_id='a0300000-0000-0000-0000-000000000003'
     and organization_id in (:'org_a', :'org_b')
     and relationship_slug='employee' and status='active'
) = 2 then 'PASS 8: W holds independent ACTIVE engagements in A and B' else 'FAIL 8' end;
select ec.id as eng_a from public.engagement_contexts ec
 where ec.profile_id='a0300000-0000-0000-0000-000000000003'
   and ec.organization_id=:'org_a' and ec.relationship_slug='employee' and ec.status='active'
 limit 1 \gset
select set_config('request.jwt.claims', :'P', true);
select public.end_org_membership_v1(:'eng_a', 'journey: A employment ends') as end_result \gset
select case when
  (select status from public.engagement_contexts where id=:'eng_a') = 'ended'
  and (select count(*) from public.engagement_contexts
        where profile_id='a0300000-0000-0000-0000-000000000003'
          and organization_id=:'org_b' and relationship_slug='employee' and status='active') = 1
then 'PASS 9: A engagement ended, B engagement remains ACTIVE' else 'FAIL 9 (end result: ' || (:'end_result')::text || ')' end;

\echo ═══ 10. Completing A project leaves B project untouched ═══
select set_config('request.jwt.claims', :'P', true);
select public.set_project_status_v1('feed0000-0000-4000-8000-00000000000a'::uuid,'live') as a_live \gset
select public.set_project_status_v1('feed0000-0000-4000-8000-00000000000a'::uuid,'completed') as a_done \gset
select case when
  (select status from public.projects where id='feed0000-0000-4000-8000-00000000000a') = 'completed'
  and (select status from public.projects where id='feed0000-0000-4000-8000-00000000000b') = 'draft'
then 'PASS 10: A completed, B untouched (draft)' else 'FAIL 10' end;

\echo ═══ 11. Calendar conflict spans companies A and B ═══
select set_config('request.jwt.claims', :'P', true);
select public.propose_booking_request(:'demand_a', :'worker_w', '2026-09-01', '2026-09-10', 'LT', 'journey A', null) as booking_a \gset
select public.propose_booking_request(:'demand_b', :'worker_w', '2026-09-05', '2026-09-15', 'LT', 'journey B overlap', null) as booking_b \gset
select set_config('request.jwt.claims', :'W', true);
select (public.respond_booking_request_v3(:'booking_a', 'accepted', null, null))->>'decision' as accept_a \gset
select case when :'accept_a' = 'accepted'
then 'PASS 11a: W accepted the A booking' else 'FAIL 11a: ' || :'accept_a' end;
do $$
declare bid uuid;
begin
  select id into bid from public.booking_requests where role_text = 'journey B overlap';
  begin
    perform public.respond_booking_request_v3(bid, 'accepted', null, null);
    raise exception 'FAIL 11: overlapping cross-company booking was accepted';
  exception when exclusion_violation then
    raise notice 'PASS 11: overlapping B booking REFUSED — calendar conflict spans companies (23P01)';
  end;
end $$;
select case when
  (select organization_id from public.booking_requests where id=:'booking_a') = :'org_a'
  and (select organization_id from public.booking_requests where id=:'booking_b') = :'org_b'
then 'PASS 11b: both bookings inherited their demand organizations' else 'FAIL 11b' end;

\echo ═══ 14. Billing subject isolation (main schema truth) ═══
insert into public.billing_subscriptions (owner_id, plan_key, provider, status, test_mode, provider_subscription_id)
values ('a0300000-0000-0000-0000-000000000001', 'company_pilot', 'stripe', 'active', true, 'manual_journey-p');
select case when
  (select count(*) from information_schema.columns where table_schema='public'
    and table_name='billing_subscriptions' and column_name in ('organization_id','origin_organization_id')) = 0
then 'PASS 14: no org-subject columns exist on main — an ORG entitlement read (eq organization_id) fails closed to FREE (42703 feature-detect, unit-proven in effective-entitlements); P''s personal row can never entitle A or B'
else 'FAIL 14: unexpected org columns present' end;

\echo ═══ 15. Analytics events remain A/B/Personal scoped ═══
select set_config('request.jwt.claims', :'P', true);
select set_config('role', 'authenticated', true);
insert into public.pilot_events (profile_id, session_id, route, locale, event_name, result, metadata)
values ('a0300000-0000-0000-0000-000000000001','server:journey','/dashboard','lt','demand_submitted','info',
        jsonb_build_object('workspace_type','organization','organization_id', (:'org_a')::text)),
       ('a0300000-0000-0000-0000-000000000001','server:journey','/dashboard','lt','demand_submitted','info',
        jsonb_build_object('workspace_type','organization','organization_id', (:'org_b')::text)),
       ('a0300000-0000-0000-0000-000000000001','server:journey','/dashboard','lt','demand_submitted','info',
        jsonb_build_object('workspace_type','personal'));
select case when (select count(*) from public.pilot_events where session_id='server:journey') = 0
then 'PASS 15a: analytics rows are admin-only (author cannot read them back)' else 'FAIL 15a' end;
select set_config('role', 'postgres', true);
select case when
  (select count(*) from public.pilot_events where session_id='server:journey'
     and metadata->>'organization_id' = (:'org_a')::text) = 1
  and (select count(*) from public.pilot_events where session_id='server:journey'
     and metadata->>'organization_id' = (:'org_b')::text) = 1
  and (select count(*) from public.pilot_events where session_id='server:journey'
     and metadata->>'workspace_type' = 'personal' and metadata ? 'organization_id') = 0
then 'PASS 15b: A event carries only A, B only B, personal carries NO org' else 'FAIL 15b' end;

\echo ═══ 16 + lifecycle. invite → accept → change-role → revoke; B intact ═══
select set_config('request.jwt.claims', :'P', true);
select public.membership_invite_v1(:'org_a', 'journey.x@local.test', 'member') as invite_x \gset
select m.id as mem_x_a from public.company_memberships m
 where m.organization_id=:'org_a' and m.profile_id='a0800000-0000-0000-0000-000000000001'
   and m.status='invited' \gset
select set_config('request.jwt.claims', :'X', true);
select public.membership_accept_v1(:'mem_x_a') as accept_x \gset
select set_config('request.jwt.claims', :'P', true);
select public.membership_change_role_v1(:'mem_x_a', 'admin') as promote_x \gset
select public.membership_revoke_v1(:'mem_x_a') as revoke_x \gset
select case when :'invite_x'='invited' and :'accept_x'='accepted'
  and :'promote_x'='role_changed' and :'revoke_x'='revoked'
then 'PASS lifecycle: invite→accept→change-role→revoke all clean' else 'FAIL lifecycle' end;
select case when
  (select status from public.company_memberships where id=:'mem_x_a') = 'revoked'
  and (select count(*) from public.company_memberships
        where organization_id=:'org_b' and profile_id='a0800000-0000-0000-0000-000000000001'
          and status='active') = 1
  and (select count(*) from public.profiles where id='a0800000-0000-0000-0000-000000000001') = 1
then 'PASS 16: A membership revoked; B membership, identity intact' else 'FAIL 16' end;
-- revoked A member can no longer read A''s stamped demand chain
select set_config('request.jwt.claims', :'X', true);
select set_config('role', 'authenticated', true);
select case when (select count(*) from public.customer_requests where id=:'demand_a') = 0
then 'PASS 16b: revoked A member reads ZERO A demand rows' else 'FAIL 16b' end;
select set_config('role', 'postgres', true);

rollback;
\echo ═══ journey complete — transaction rolled back, no data left behind ═══
