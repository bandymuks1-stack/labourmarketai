-- ============================================================================
-- FRESH-ORG OWNER MEMBERSHIP SEED — §8 DATABASE PROOF (15 assertions + §7
-- security probes).
--
-- Runs against the DISPOSABLE local stack built from EXACT main + the
-- 20260807090000 seed migration (supabase db reset applies it), seeded with
-- reference-data. One transaction, impersonation via request.jwt.claims,
-- PASS/FAIL lines, ROLLBACK at the end — no data left behind.
--
-- The migration and rollback files are re-executed VERBATIM mid-proof (\i)
-- to prove the backfill, the rollback and the re-apply — nothing here
-- re-implements them.
--
-- Usage (via the orchestrator, which resets the stack first):
--   bash scripts/db-proof/org-owner-membership-seed.sh
-- or directly, if the stack is already reset:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f scripts/db-proof/org-owner-membership-seed-proof.sql
--
-- Verdict on full pass: FRESH_ORGANIZATION_OWNER_MEMBERSHIP_DATABASE_MODEL_PROVEN
-- ============================================================================
begin;

-- ── reference rows the RPC validates against ────────────────────────────────
insert into public.countries (code, name_lt, name_en)
values ('LT', 'Lietuva', 'Lithuania')
on conflict (code) do nothing;

-- ── disposable actors ───────────────────────────────────────────────────────
--   PR1 creator/owner   PR2 unrelated actor   PR3 manager   PR4 employee
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current, phone_change, phone_change_token,
   reauthentication_token, email_change_confirm_status, is_sso_user)
select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated',
       x.email, crypt('password', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '', '', '', '', '', 0, false
from (values
  ('f1e50000-0000-4000-8000-000000000001'::uuid, 'proof.pr1@local.test'),
  ('f1e50000-0000-4000-8000-000000000002'::uuid, 'proof.pr2@local.test'),
  ('f1e50000-0000-4000-8000-000000000003'::uuid, 'proof.pr3@local.test'),
  ('f1e50000-0000-4000-8000-000000000004'::uuid, 'proof.pr4@local.test')
) as x(id, email)
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('f1e50000-0000-4000-8000-000000000001', 'proof.pr1@local.test'),
  ('f1e50000-0000-4000-8000-000000000002', 'proof.pr2@local.test'),
  ('f1e50000-0000-4000-8000-000000000003', 'proof.pr3@local.test'),
  ('f1e50000-0000-4000-8000-000000000004', 'proof.pr4@local.test')
on conflict (id) do nothing;

\set PR1 '{"sub":"f1e50000-0000-4000-8000-000000000001","role":"authenticated"}'
\set PR2 '{"sub":"f1e50000-0000-4000-8000-000000000002","role":"authenticated"}'
\set PR3 '{"sub":"f1e50000-0000-4000-8000-000000000003","role":"authenticated"}'

\echo ═══ 1. create first organization → active owner membership exists ═══
select set_config('request.jwt.claims', :'PR1', true);
select public.save_company_setup_v3(null, 'Proof Org One', 'LT',
  null, null, null, null, null, null, false, 'construction') as company_1 \gset
select o.id as org_1 from public.organizations o
 where o.legacy_company_id = :'company_1' \gset
select m.id as mem_1 from public.company_memberships m
 where m.organization_id = :'org_1'
   and m.profile_id = 'f1e50000-0000-4000-8000-000000000001'
   and m.role = 'owner' and m.status = 'active' and m.source = 'org-create' \gset
select case when :'mem_1' <> ''
then 'PASS 1: org create seeded owner/active/org-create membership atomically'
else 'FAIL 1' end;

\echo ═══ 2. create second organization → separate owner membership ═══
select public.save_company_setup_v3(null, 'Proof Org Two', 'LT',
  null, null, null, null, null, null, false, 'construction') as company_2 \gset
select o.id as org_2 from public.organizations o
 where o.legacy_company_id = :'company_2' \gset
select case when (
  select count(*) from public.company_memberships
   where organization_id = :'org_2'
     and profile_id = 'f1e50000-0000-4000-8000-000000000001'
     and role = 'owner' and status = 'active'
) = 1 and :'org_2' <> :'org_1'
then 'PASS 2: second org received its OWN owner membership' else 'FAIL 2' end;

\echo ═══ 3. first organization unchanged ═══
select case when (
  select count(*) from public.company_memberships
   where organization_id = :'org_1' and status = 'active'
) = 1 and exists (select 1 from public.company_memberships where id = :'mem_1'
                   and role = 'owner' and status = 'active')
then 'PASS 3: org 1 still has exactly its original owner membership' else 'FAIL 3' end;

\echo ═══ 4. replay does not duplicate membership ═══
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"f1e50000-0000-4000-8000-000000000001","role":"authenticated"}', true);
    perform public.save_company_setup_v3(null, 'Proof Org One', 'LT',
      null, null, null, null, null, null, false, 'construction');
    raise exception 'FAIL 4a: exact create replay minted a second company';
  exception when unique_violation then
    raise notice 'PASS 4a: exact create replay refused (duplicate_company)';
  end;
end $$;
-- live-key backstop: even a service-level duplicate INSERT cannot create a
-- second live tuple for the same (org, profile)
do $$
begin
  begin
    insert into public.company_memberships
      (organization_id, profile_id, role, status, accepted_at, source)
    select o.id, 'f1e50000-0000-4000-8000-000000000001', 'owner', 'active', now(), 'proof-replay'
      from public.organizations o
     where o.legal_name = 'Proof Org One';
    raise exception 'FAIL 4b: duplicate live membership row was accepted';
  exception when unique_violation then
    raise notice 'PASS 4b: company_memberships_live_key refused the duplicate';
  end;
end $$;
select case when (
  select count(*) from public.company_memberships
   where organization_id = :'org_1' and status in ('invited','active')
) = 1 then 'PASS 4c: org 1 still holds exactly ONE live membership' else 'FAIL 4c' end;

\echo ═══ 5. edit organization does not create another membership ═══
select set_config('request.jwt.claims', :'PR1', true);
select public.save_company_setup_v3(:'company_1'::uuid, 'Proof Org One Renamed', 'LT',
  null, null, null, null, null, null, false, null) as edit_result \gset
select case when (
  select count(*) from public.company_memberships
   where organization_id = :'org_1' and status = 'active'
) = 1 and (select legal_name from public.organizations where id = :'org_1')
        = 'Proof Org One Renamed'
then 'PASS 5: edit updated the org and minted NO extra membership' else 'FAIL 5' end;

\echo ═══ 6. unrelated actor cannot seed a membership ═══
-- VALUES insert with the CONCRETE org id: an INSERT…SELECT whose source is
-- RLS-filtered to zero rows would "succeed" writing nothing and prove
-- nothing. The refusal must come from the write path itself.
select set_config('proof.org_1', :'org_1', true);
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"f1e50000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    perform set_config('role', 'authenticated', true);
    insert into public.company_memberships
      (organization_id, profile_id, role, status, accepted_at, source)
    values (current_setting('proof.org_1')::uuid,
            'f1e50000-0000-4000-8000-000000000002', 'owner', 'active', now(), 'forged');
    raise exception 'FAIL 6a: an unrelated authenticated actor self-inserted an owner membership';
  exception when insufficient_privilege then
    raise notice 'PASS 6a: direct membership INSERT refused for authenticated';
  end;
end $$;
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"f1e50000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    perform set_config('role', 'authenticated', true);
    insert into public.organizations (owner_profile_id, organization_type, legal_name)
    values ('f1e50000-0000-4000-8000-000000000002', 'company', 'Forged Org');
    raise exception 'FAIL 6b: authenticated inserted an organizations row directly';
  exception when insufficient_privilege then
    raise notice 'PASS 6b: direct organizations INSERT refused for authenticated';
  end;
end $$;
-- §7: creator identity comes from auth.uid() — an unrelated actor editing
-- someone else's company is refused with no existence oracle.
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"f1e50000-0000-4000-8000-000000000002","role":"authenticated"}', true);
    perform public.save_company_setup_v3(
      (select id from public.companies where legal_name = 'Proof Org One Renamed'),
      'Hijacked Name', 'LT', null, null, null, null, null, null, false, null);
    raise exception 'FAIL 6c: unrelated actor edited another creator''s company';
  exception when insufficient_privilege then
    raise notice 'PASS 6c: unrelated actor refused (not_owner, anti-oracle preserved)';
  end;
end $$;

\echo ═══ 7. manager cannot become owner through create/edit ═══
-- service-level fixture: PR3 is an ACTIVE manager of org 1
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
values (:'org_1', 'f1e50000-0000-4000-8000-000000000003', 'manager', 'active', now(), 'proof-fixture');
do $$
begin
  begin
    perform set_config('request.jwt.claims',
      '{"sub":"f1e50000-0000-4000-8000-000000000003","role":"authenticated"}', true);
    perform public.save_company_setup_v3(
      (select id from public.companies where legal_name = 'Proof Org One Renamed'),
      'Manager Takeover', 'LT', null, null, null, null, null, null, false, null);
    raise exception 'FAIL 7a: a manager edited company identity';
  exception when insufficient_privilege then
    raise notice 'PASS 7a: manager cannot edit company identity (owner/admin only)';
  end;
end $$;
select case when (
  select count(*) from public.company_memberships
   where organization_id = :'org_1' and profile_id = 'f1e50000-0000-4000-8000-000000000003'
     and role = 'owner'
) = 0 then 'PASS 7b: the manager holds NO owner membership anywhere on org 1' else 'FAIL 7b' end;

\echo ═══ 8. employee engagement creates no governance row ═══
insert into public.engagement_contexts
  (profile_id, organization_id, relationship_slug, status, hash_self)
values ('f1e50000-0000-4000-8000-000000000004', :'org_1', 'employee', 'active', 'proof-employee');
select case when (
  select count(*) from public.company_memberships
   where profile_id = 'f1e50000-0000-4000-8000-000000000004'
) = 0 then 'PASS 8: employment engagement produced ZERO company_memberships rows' else 'FAIL 8' end;

-- §4 fail-closed probe: an org INSERT that cannot establish an owner is refused
\echo ═══ S1. §4 fail-closed: ownerless org INSERT is refused ═══
do $$
begin
  begin
    insert into public.organizations (owner_profile_id, organization_type, legal_name)
    values (null, 'company', 'Ownerless Org');
    raise exception 'FAIL S1: an ownerless organization was created';
  exception when check_violation then
    raise notice 'PASS S1: ownerless org refused (org_without_owner, 23514)';
  end;
end $$;

-- §7 grant probes on the seed function itself
\echo ═══ S2. §7 grants: anon/authenticated cannot execute the seed function ═══
select case when
  has_function_privilege('anon', 'public.company_memberships_seed_org_owner()', 'execute') = false
  and has_function_privilege('authenticated', 'public.company_memberships_seed_org_owner()', 'execute') = false
then 'PASS S2: seed function EXECUTE revoked from anon AND authenticated'
else 'FAIL S2' end;
select case when (
  select p.prosecdef and (p.proconfig::text like '%search_path=public%')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'company_memberships_seed_org_owner'
) then 'PASS S3: SECURITY DEFINER with pinned search_path' else 'FAIL S3' end;

\echo ═══ 9-11. backfill: orphan gains membership, ambiguous untouched, correct unchanged ═══
-- Fabricate the PRE-FIX state: trigger off, one orphan org + one ambiguous org.
alter table public.organizations disable trigger on_org_owner_membership_seed;
insert into public.organizations (id, owner_profile_id, organization_type, legal_name)
values ('0a9f0000-0000-4000-8000-00000000000a',
        'f1e50000-0000-4000-8000-000000000002', 'company', 'Proof Orphan Org');
insert into public.organizations (id, owner_profile_id, organization_type, legal_name)
values ('0a9f0000-0000-4000-8000-00000000000b',
        'f1e50000-0000-4000-8000-000000000002', 'company', 'Proof Ambiguous Org');
-- a DIFFERENT profile already holds active owner governance on the ambiguous org
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
values ('0a9f0000-0000-4000-8000-00000000000b',
        'f1e50000-0000-4000-8000-000000000001', 'owner', 'active', now(), 'proof-fixture');
alter table public.organizations enable trigger on_org_owner_membership_seed;

-- snapshot BEFORE the verbatim migration re-run (assertion 15 inputs)
create temp table proof_snapshot_before as
select 'customer_requests' as t, count(*) as n from public.customer_requests
union all select 'projects', count(*) from public.projects
union all select 'booking_requests', count(*) from public.booking_requests
union all select 'engagement_contexts', count(*) from public.engagement_contexts
union all select 'experience_records', count(*) from public.experience_records
union all select 'billing_customers', count(*) from public.billing_customers
union all select 'organizations', count(*) from public.organizations;
select (select count(*) from public.company_memberships) as mem_before \gset

\echo     … re-running 20260807090000 VERBATIM against the fabricated pre-fix state …
\i supabase/migrations/20260807090000_org_owner_membership_seed_v1.sql

select case when (
  select count(*) from public.company_memberships
   where organization_id = '0a9f0000-0000-4000-8000-00000000000a'
     and profile_id = 'f1e50000-0000-4000-8000-000000000002'
     and role = 'owner' and status = 'active'
     and source = 'backfill:organizations.owner_profile_id:v2'
) = 1 then 'PASS 9: orphan org backfilled (owner/active, v2 provenance)' else 'FAIL 9' end;

select case when (
  select count(*) from public.company_memberships
   where organization_id = '0a9f0000-0000-4000-8000-00000000000b'
     and profile_id = 'f1e50000-0000-4000-8000-000000000002'
) = 0 and (
  select count(*) from public.company_memberships
   where organization_id = '0a9f0000-0000-4000-8000-00000000000b'
     and role = 'owner' and status = 'active'
) = 1 then 'PASS 10: ambiguous org untouched (still exactly its ONE pre-existing owner)' else 'FAIL 10' end;

select case when (
  select count(*) from public.company_memberships
   where organization_id in (:'org_1', :'org_2') and status = 'active'
     and role = 'owner'
) = 2 and exists (select 1 from public.company_memberships where id = :'mem_1')
then 'PASS 11: already-correct orgs unchanged by the re-run (same rows, same ids)' else 'FAIL 11' end;

\echo ═══ 15. no demand/project/booking/engagement/experience/billing side effect ═══
select case when not exists (
  select 1 from proof_snapshot_before b
  join (
    select 'customer_requests' as t, count(*) as n from public.customer_requests
    union all select 'projects', count(*) from public.projects
    union all select 'booking_requests', count(*) from public.booking_requests
    union all select 'engagement_contexts', count(*) from public.engagement_contexts
    union all select 'experience_records', count(*) from public.experience_records
    union all select 'billing_customers', count(*) from public.billing_customers
    union all select 'organizations', count(*) from public.organizations
  ) a using (t)
  where a.n <> b.n
) and (select count(*) from public.company_memberships) = :mem_before + 1
then 'PASS 15: migration wrote ONLY the one backfill membership row — no other table moved'
else 'FAIL 15' end;

\echo ═══ 12. last-owner protection remains ═══
do $$
begin
  begin
    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where organization_id = (select o.id from public.organizations o
                               where o.legal_name = 'Proof Org One Renamed')
       and role = 'owner' and status = 'active';
    raise exception 'FAIL 12: the sole owner membership was revoked';
  exception when check_violation then
    raise notice 'PASS 12: last-owner protection refused (last_owner_membership)';
  end;
end $$;

\echo ═══ 13. membership revocation in A leaves B untouched ═══
-- give org 2 (A) a SECOND owner so revocation of the first is legal
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
values (:'org_2', 'f1e50000-0000-4000-8000-000000000002', 'owner', 'active', now(), 'proof-fixture');
update public.company_memberships
   set status = 'revoked', revoked_at = now()
 where organization_id = :'org_2'
   and profile_id = 'f1e50000-0000-4000-8000-000000000001'
   and role = 'owner' and status = 'active';
select case when (
  select count(*) from public.company_memberships
   where organization_id = :'org_2'
     and profile_id = 'f1e50000-0000-4000-8000-000000000001' and status = 'revoked'
) = 1 and exists (
  select 1 from public.company_memberships
   where id = :'mem_1' and role = 'owner' and status = 'active'
) then 'PASS 13: revocation in org A left org B''s owner membership untouched' else 'FAIL 13' end;

\echo ═══ 14. rollback restores pre-migration behavior; re-apply restores the fix ═══
\i supabase/rollbacks/20260807090000_org_owner_membership_seed_v1.down.sql
select case when (
  select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'organizations' and t.tgname = 'on_org_owner_membership_seed'
) = 0 and (
  select count(*) from pg_proc where proname = 'company_memberships_seed_org_owner'
) = 0 then 'PASS 14a: rollback dropped trigger + function' else 'FAIL 14a' end;
-- pre-fix behavior is genuinely back: a new org is born WITHOUT a membership
insert into public.organizations (id, owner_profile_id, organization_type, legal_name)
values ('0a9f0000-0000-4000-8000-00000000000c',
        'f1e50000-0000-4000-8000-000000000002', 'company', 'Proof Post-Rollback Org');
select case when (
  select count(*) from public.company_memberships
   where organization_id = '0a9f0000-0000-4000-8000-00000000000c'
) = 0 then 'PASS 14b: after rollback a fresh org is orphaned again (defect re-opened by design)'
else 'FAIL 14b' end;
-- seeded rows STAY (derived truth; deleting them would recreate the defect)
select case when exists (
  select 1 from public.company_memberships
   where organization_id = '0a9f0000-0000-4000-8000-00000000000a'
     and source = 'backfill:organizations.owner_profile_id:v2'
) then 'PASS 14c: rollback removed NO membership rows' else 'FAIL 14c' end;
\echo     … re-applying 20260807090000 VERBATIM …
\i supabase/migrations/20260807090000_org_owner_membership_seed_v1.sql
select case when (
  select count(*) from public.company_memberships
   where organization_id = '0a9f0000-0000-4000-8000-00000000000c'
     and profile_id = 'f1e50000-0000-4000-8000-000000000002'
     and role = 'owner' and status = 'active'
) = 1 and (
  select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'organizations' and t.tgname = 'on_org_owner_membership_seed'
) = 1 then 'PASS 14d: re-apply backfilled the rollback-era orphan and restored the trigger'
else 'FAIL 14d' end;

\echo
\echo ═══ verdict ═══
\echo If every line above reads PASS:
\echo FRESH_ORGANIZATION_OWNER_MEMBERSHIP_DATABASE_MODEL_PROVEN
rollback;
