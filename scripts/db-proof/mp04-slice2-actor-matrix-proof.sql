-- M-P0-4 Slice 2 — §14 ACTOR MATRIX proof (LOCAL ONLY).
-- Impersonates each actor via request.jwt.claims (what auth.uid() reads),
-- exercises the seven membership commands, prints PASS/FAIL lines, ROLLS
-- BACK — zero persistent drift. Requires: Slice 1 + Slice 2 applied locally
-- and dev-fixtures-mp03.sql (P owns Alfa+Beta; O owns Gamma+Delta; W is an
-- employment-roster worker with NO membership).
-- Usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/db-proof/mp04-slice2-actor-matrix-proof.sql
begin;

select o.id as org_a from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000a' \gset
select o.id as org_b from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000b' \gset

-- Disposable §14 actors (auth.users minimal rows so profiles FK holds; the
-- proof never signs in — auth.uid() is impersonated per statement).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token, email_change_confirm_status, is_sso_user)
select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated',
       x.email, crypt('password', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"role":"worker","locale":"en"}'::jsonb,
       '', '', '', '', '', '', '', '', 0, false
from (values
  ('a0400000-0000-0000-0000-000000000001'::uuid, 'mp04.owner2@local.test'),
  ('a0400000-0000-0000-0000-000000000002'::uuid, 'mp04.admin@local.test'),
  ('a0400000-0000-0000-0000-000000000003'::uuid, 'mp04.manager@local.test'),
  ('a0400000-0000-0000-0000-000000000004'::uuid, 'mp04.extmgr@local.test'),
  ('a0400000-0000-0000-0000-000000000005'::uuid, 'mp04.member@local.test'),
  ('a0400000-0000-0000-0000-000000000006'::uuid, 'mp04.invitee@local.test'),
  ('a0400000-0000-0000-0000-000000000007'::uuid, 'mp04.unrelated@local.test')
) as x(id, email)
on conflict (id) do nothing;

-- Fingerprints BEFORE any command (org B isolation + employment isolation).
select md5(string_agg(id::text || status || role, ',' order by id)) as b_fp_before
  from public.company_memberships where organization_id = :'org_b' \gset
select md5(string_agg(id::text || coalesce(status,''), ',' order by id)) as ec_fp_before
  from public.engagement_contexts \gset

\set OWNER_P '{"sub":"a0300000-0000-0000-0000-000000000001"}'
\set OWNER2  '{"sub":"a0400000-0000-0000-0000-000000000001"}'
\set ADMIN   '{"sub":"a0400000-0000-0000-0000-000000000002"}'
\set MANAGER '{"sub":"a0400000-0000-0000-0000-000000000003"}'
\set EXTMGR  '{"sub":"a0400000-0000-0000-0000-000000000004"}'
\set MEMBER  '{"sub":"a0400000-0000-0000-0000-000000000005"}'
\set INVITEE '{"sub":"a0400000-0000-0000-0000-000000000006"}'
\set UNREL   '{"sub":"a0400000-0000-0000-0000-000000000007"}'
\set WORKER  '{"sub":"a0300000-0000-0000-0000-000000000003"}'

\echo === 1. owner invites every permitted role (incl. a second owner) ===
select set_config('request.jwt.claims', :'OWNER_P', true);
select public.membership_invite_v1(:'org_a', 'mp04.owner2@local.test',  'owner')            as owner_invites_owner;
select public.membership_invite_v1(:'org_a', 'mp04.admin@local.test',   'admin')            as owner_invites_admin;
select public.membership_invite_v1(:'org_a', 'mp04.manager@local.test', 'manager')          as owner_invites_manager;
select public.membership_invite_v1(:'org_a', 'mp04.extmgr@local.test',  'external_manager') as owner_invites_extmgr;
select public.membership_invite_v1(:'org_a', 'mp04.member@local.test',  'member')           as owner_invites_member;
\echo === 14a. duplicate invite is replay-safe ===
select public.membership_invite_v1(:'org_a', 'mp04.admin@local.test', 'admin') as duplicate_invite_refused;

\echo === 7. invited user has NO active authority before acceptance ===
select set_config('request.jwt.claims', :'ADMIN', true);
select public.membership_invite_v1(:'org_a', 'mp04.invitee@local.test', 'member') as invited_admin_cannot_administer_yet;

\echo === 8. acceptance grants exactly the invited role ===
select set_config('request.jwt.claims', :'OWNER2', true);
select public.membership_accept_v1(m.id) as owner2_accepts
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000001' and m.status = 'invited';
select set_config('request.jwt.claims', :'ADMIN', true);
select public.membership_accept_v1(m.id) as admin_accepts
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000002' and m.status = 'invited';
select set_config('request.jwt.claims', :'MANAGER', true);
select public.membership_accept_v1(m.id) as manager_accepts
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000003' and m.status = 'invited';
select set_config('request.jwt.claims', :'EXTMGR', true);
select public.membership_accept_v1(m.id) as extmgr_accepts
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000004' and m.status = 'invited';
select set_config('request.jwt.claims', :'MEMBER', true);
select public.membership_accept_v1(m.id) as member_accepts
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000005' and m.status = 'invited';

\echo === 14b. accept is replay-safe ===
select public.membership_accept_v1(m.id) as second_accept_is_noop
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000005';

\echo === 2. admin behavior matches doctrine (may invite non-owner; never owner) ===
select set_config('request.jwt.claims', :'ADMIN', true);
select public.membership_invite_v1(:'org_a', 'mp04.invitee@local.test', 'member') as admin_invites_member;
select public.membership_invite_v1(:'org_a', 'mp04.unrelated@local.test', 'owner') as admin_cannot_grant_owner;

\echo === 3/4. manager and external manager are BOUNDED (no administration) ===
select set_config('request.jwt.claims', :'MANAGER', true);
select public.membership_invite_v1(:'org_a', 'mp04.unrelated@local.test', 'member') as manager_cannot_invite;
select set_config('request.jwt.claims', :'EXTMGR', true);
select public.membership_invite_v1(:'org_a', 'mp04.unrelated@local.test', 'member') as extmgr_cannot_invite;

\echo === 5. member cannot administer ===
select set_config('request.jwt.claims', :'MEMBER', true);
select public.membership_invite_v1(:'org_a', 'mp04.unrelated@local.test', 'member') as member_cannot_invite;
select public.membership_revoke_v1(m.id) as member_cannot_revoke
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000003' and m.status = 'active';

\echo === 6. engagement-only worker has NO governance authority ===
select set_config('request.jwt.claims', :'WORKER', true);
select public.membership_invite_v1(:'org_a', 'mp04.unrelated@local.test', 'member') as engagement_worker_cannot_invite;

\echo === 13. no oracle for unrelated actors: real id vs random id, SAME answer ===
select set_config('request.jwt.claims', :'UNREL', true);
select public.membership_revoke_v1(m.id) as unrelated_on_real_id
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000005' and m.status = 'active';
select public.membership_revoke_v1('ffffffff-ffff-4fff-8fff-ffffffffffff') as unrelated_on_random_id;

\echo === admin bounded on existing rows: cannot touch owner rows ===
select set_config('request.jwt.claims', :'ADMIN', true);
select public.membership_revoke_v1(m.id) as admin_cannot_revoke_owner
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0300000-0000-0000-0000-000000000001'
   and m.role = 'owner' and m.status = 'active';
select public.membership_change_role_v1(m.id, 'owner') as admin_cannot_promote_to_owner
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000005' and m.status = 'active';

\echo === role change by owner works; unchanged is a no-op outcome ===
select set_config('request.jwt.claims', :'OWNER_P', true);
select public.membership_change_role_v1(m.id, 'manager') as owner_demotes_extmgr_to_manager
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000004' and m.status = 'active';
select public.membership_change_role_v1(m.id, 'manager') as unchanged_noop
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000004' and m.status = 'active';

\echo === 9. revocation removes authority IMMEDIATELY ===
select public.membership_revoke_v1(m.id) as owner_revokes_member
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000005' and m.status = 'active';
select set_config('request.jwt.claims', :'MEMBER', true);
select public.membership_invite_v1(:'org_a', 'mp04.unrelated@local.test', 'member') as revoked_member_has_no_authority;
\echo === 14c. revoke is replay-safe ===
select set_config('request.jwt.claims', :'OWNER_P', true);
select public.membership_revoke_v1(m.id) as second_revoke_is_noop
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000005'
 order by m.created_at desc limit 1;

\echo === 11. second owner allows a safe owner transition ===
select public.membership_revoke_v1(m.id) as first_owner_steps_down_with_owner2_active
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0300000-0000-0000-0000-000000000001'
   and m.role = 'owner' and m.status = 'active';

\echo === 10. the LAST owner cannot be revoked / cannot leave ===
select set_config('request.jwt.claims', :'OWNER2', true);
select public.membership_revoke_v1(m.id) as last_owner_revocation_refused
  from public.company_memberships m
 where m.organization_id = :'org_a' and m.profile_id = 'a0400000-0000-0000-0000-000000000001'
   and m.role = 'owner' and m.status = 'active';
select public.membership_leave_v1(:'org_a') as last_owner_leave_refused;

\echo === leave works for a non-final role ===
select set_config('request.jwt.claims', :'MANAGER', true);
select public.membership_leave_v1(:'org_a') as manager_leaves;

\echo === 12. organization B is COMPLETELY unaffected ===
select case when md5(string_agg(id::text || status || role, ',' order by id)) = :'b_fp_before'
       then 'PASS' else 'FAIL' end as org_b_untouched
  from public.company_memberships where organization_id = :'org_b';

\echo === governance != employment: engagements byte-identical after ALL commands ===
select case when md5(string_agg(id::text || coalesce(status,''), ',' order by id)) = :'ec_fp_before'
       then 'PASS' else 'FAIL' end as engagements_untouched
  from public.engagement_contexts;

rollback;
\echo ACTOR MATRIX COMPLETE (transaction rolled back — zero drift)
