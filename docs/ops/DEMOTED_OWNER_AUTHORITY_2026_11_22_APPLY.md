# Demoted owner loses owner authority — apply guide (RED, needs-human-gate)

Migration: `supabase/migrations/20261122140000_demoted_owner_loses_owner_authority_v1.sql`
Rollback: `supabase/rollbacks/20261122140000_demoted_owner_loses_owner_authority_v1.down.sql`
Owner decision: 2026-11-22, item 2 (coordinator relay). **Not applied.** The owner approves this exact SQL first;
apply is by Supabase MCP `apply_migration` only, never `supabase db push`.

## What changes

| Path a demoted owner kept | After apply |
|---|---|
| `organizations.owner_profile_id` | moved to another active owner (the acting owner first); refused as `last_owner` if none |
| active `owner` engagement (and `manager` / `external_manager` after a demotion to member) | ended, row kept, lifecycle events + audit row |
| creator arm (`owns_company`, `owns_agency`, `save_company_setup_v3`) | gone when the creator's active membership is manager / external_manager / member |
| `companies_update` / `companies_delete` / `agencies_update` / `agencies_delete` | the creator arm follows the same rule; `is_admin()` unchanged |

Unchanged: only an owner may grant owner; an admin may neither touch nor grant owner; the last owner cannot be demoted.
No row is written at apply time.

## Before applying (read-only)

Creators already demoted below admin, who hold owner rights through the creator arm today and lose them on apply:

```sql
select o.id, o.organization_type, m.role
  from public.organizations o
  join public.companies c on c.id = o.legacy_company_id
  join public.company_memberships m on m.organization_id = o.id and m.profile_id = c.profile_id
 where m.status = 'active' and m.role not in ('owner','admin')
union all
select o.id, o.organization_type, m.role
  from public.organizations o
  join public.agencies a on a.id = o.legacy_agency_id
  join public.company_memberships m on m.organization_id = o.id and m.profile_id = a.profile_id
 where m.status = 'active' and m.role not in ('owner','admin');
```

Earlier demotions are not repaired retroactively (owner pointer and `owner` engagement stay); that needs a separate,
owner-approved data step.

## Rolled-back production test (after apply; changes nothing)

Run in one transaction that ends in `rollback`. `:org` is an organization with two active owner memberships
`:a` (acting) and `:b` (to demote), created for the test inside the transaction or chosen by the owner.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'a', 'role', 'authenticated')::text, true);

-- 1. demote b to member
select public.membership_change_role_v1(
  (select id from public.company_memberships where organization_id = :'org' and profile_id = :'b' and status = 'active'),
  'member');                                                   -- expect 'role_changed'
select owner_profile_id <> :'b' as pointer_moved from public.organizations where id = :'org';   -- expect true
select count(*) = 0 as no_governance_engagement
  from public.engagement_contexts
 where organization_id = :'org' and profile_id = :'b'
   and status = 'active' and relationship_slug in ('owner','manager','external_manager');     -- expect true

-- 2. as b: no owner right left
select set_config('request.jwt.claims', json_build_object('sub', :'b', 'role', 'authenticated')::text, true);
select public.manages_organization(:'org') as manages;                                          -- expect false
select public.owns_company((select legacy_company_id from public.organizations where id = :'org')) as owns; -- expect false

-- 3. the last owner cannot be demoted (as a, demote a)
select set_config('request.jwt.claims', json_build_object('sub', :'a', 'role', 'authenticated')::text, true);
select public.membership_change_role_v1(
  (select id from public.company_memberships where organization_id = :'org' and profile_id = :'a' and status = 'active'),
  'admin');                                                    -- expect 'last_owner'
rollback;
```

## Rollback

Apply the `.down.sql` through `apply_migration`. It restores the previous bodies and policies and drops the helper.
Owner pointers moved and engagements ended while the migration was live stay as the record of what happened.
