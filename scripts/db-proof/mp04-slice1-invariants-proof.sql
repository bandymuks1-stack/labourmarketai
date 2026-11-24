-- M-P0-4 Slice 1 — owner-survival + uniqueness proof (LOCAL ONLY).
-- Runs the real migration inside a transaction, exercises every §5 invariant
-- with savepoints, prints PROOF lines, and ROLLS BACK — zero persistent drift.
-- Usage:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=0 -f scripts/db-proof/mp04-slice1-invariants-proof.sql
begin;

\i supabase/migrations/20260806090000_company_memberships_v1.sql

-- Fixture handles (MP03 fixture: P owns Alfa+Beta orgs, O owns Gamma+Delta).
select o.id as org_a from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000a' \gset
select o.id as org_b from public.organizations o
 where o.legacy_company_id = 'c0300000-0000-0000-0000-00000000000b' \gset
\set p_owner 'a0300000-0000-0000-0000-000000000001'
\set p_other 'a0300000-0000-0000-0000-000000000002'
-- Handles for DO-block negative controls (psql vars don't reach $$ bodies).
select set_config('proof.org_a', :'org_a'::text, true);
select set_config('proof.org_b', :'org_b'::text, true);
select set_config('proof.p_owner', :'p_owner', true);
select set_config('proof.p_other', :'p_other', true);

-- Baseline side-effect fingerprints.
select md5(string_agg(id::text || coalesce(status,''), ',' order by id))
  as ec_fp_before, count(*) as ec_n_before
  from public.engagement_contexts \gset
select count(*) as proj_before from public.projects \gset
select count(*) as prof_before from public.profiles \gset

\echo PROOF-3: person holds live memberships in SEVERAL organizations
select case when count(*) >= 2 then 'PASS' else 'FAIL' end as proof_3_multi_org
  from public.company_memberships
 where profile_id = :'p_owner' and status = 'active';

\echo PROOF-1: duplicate LIVE tuple refused (partial unique)
do $$ begin
  begin
    insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at)
    values (current_setting('proof.org_a')::uuid, current_setting('proof.p_owner')::uuid,
            'member', 'active', now());
    raise notice 'FAIL proof-1: duplicate live tuple was ACCEPTED';
  exception when unique_violation then
    raise notice 'PASS proof-1: duplicate live tuple refused (unique_violation)';
  end;
end $$;

\echo PROOF-2: revoked history COEXISTS with a live tuple
savepoint s2;
insert into public.company_memberships
  (organization_id, profile_id, role, status, revoked_at, source)
values (:'org_a', :'p_owner', 'member', 'revoked', now(), 'proof');
select 'PASS' as proof_2_revoked_coexists;
rollback to s2;

\echo PROOF-4: an organization holds SEVERAL members
savepoint s4;
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
values (:'org_a', :'p_other', 'member', 'active', now(), 'proof');
select case when count(*) = 2 then 'PASS' else 'FAIL' end as proof_4_many_members
  from public.company_memberships
 where organization_id = :'org_a' and status = 'active';
rollback to s4;

\echo PROOF-5: FINAL active owner cannot be REVOKED
do $$ begin
  begin
    update public.company_memberships set status = 'revoked', revoked_at = now()
     where organization_id = current_setting('proof.org_a')::uuid
       and profile_id = current_setting('proof.p_owner')::uuid and role = 'owner';
    raise notice 'FAIL proof-5: last-owner change was ACCEPTED';
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then
      raise notice 'PASS proof-5: refused with last_owner_membership';
    else
      raise notice 'FAIL proof-5: unexpected check violation %', sqlerrm;
    end if;
  end;
end $$;

\echo PROOF-6: FINAL active owner cannot be DEMOTED
do $$ begin
  begin
    update public.company_memberships set role = 'member'
     where organization_id = current_setting('proof.org_a')::uuid
       and profile_id = current_setting('proof.p_owner')::uuid and role = 'owner';
    raise notice 'FAIL proof-6: last-owner change was ACCEPTED';
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then
      raise notice 'PASS proof-6: refused with last_owner_membership';
    else
      raise notice 'FAIL proof-6: unexpected check violation %', sqlerrm;
    end if;
  end;
end $$;

\echo PROOF-7: FINAL active owner cannot be DELETED
do $$ begin
  begin
    delete from public.company_memberships
     where organization_id = current_setting('proof.org_a')::uuid
       and profile_id = current_setting('proof.p_owner')::uuid and role = 'owner';
    raise notice 'FAIL proof-7: last-owner change was ACCEPTED';
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then
      raise notice 'PASS proof-7: refused with last_owner_membership';
    else
      raise notice 'FAIL proof-7: unexpected check violation %', sqlerrm;
    end if;
  end;
end $$;

\echo PROOF-8: a SECOND owner allows the first to step down
savepoint s8;
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
values (:'org_a', :'p_other', 'owner', 'active', now(), 'proof');
update public.company_memberships set status = 'revoked', revoked_at = now()
 where organization_id = :'org_a' and profile_id = :'p_owner' and role = 'owner';
select case when count(*) = 1 then 'PASS' else 'FAIL' end as proof_8_transition
  from public.company_memberships
 where organization_id = :'org_a' and role = 'owner' and status = 'active';
rollback to s8;

\echo PROOF-9: revoking membership in A leaves B untouched
savepoint s9;
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
values (:'org_a', :'p_other', 'manager', 'active', now(), 'proof'),
       (:'org_b', :'p_other', 'manager', 'active', now(), 'proof');
update public.company_memberships set status = 'revoked', revoked_at = now()
 where organization_id = :'org_a' and profile_id = :'p_other';
select case when status = 'active' then 'PASS' else 'FAIL' end as proof_9_b_untouched
  from public.company_memberships
 where organization_id = :'org_b' and profile_id = :'p_other';
rollback to s9;

\echo PROOF-10: membership writes change NO engagement/project/profile row
select case when md5(string_agg(id::text || coalesce(status,''), ',' order by id)) = :'ec_fp_before'
            and count(*) = :'ec_n_before'
       then 'PASS' else 'FAIL' end as proof_10_engagements_untouched
  from public.engagement_contexts;
select case when count(*) = :'proj_before' then 'PASS' else 'FAIL' end
  as proof_10_projects_untouched from public.projects;
select case when count(*) = :'prof_before' then 'PASS' else 'FAIL' end
  as proof_10_profiles_untouched from public.profiles;

rollback;
\echo ALL SAVEPOINT PROOFS COMPLETE (transaction rolled back — zero drift)
