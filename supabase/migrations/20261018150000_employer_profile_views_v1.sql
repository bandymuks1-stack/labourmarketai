-- 20261018150000_employer_profile_views_v1
-- @human-gate-approved
--
-- RED (needs-human-gate): new tables, SECURITY DEFINER functions, GRANT. Apply ONLY via Supabase MCP
-- `apply_migration` after the owner's explicit approval (pricing numbers included). Never `db push`.
--
-- OWNER DIRECTIVE 2026-10-18 (employer accounts and pricing):
--   - Free employer plan: up to 3 UNIQUE anonymized worker profile views per ORGANIZATION; re-opening
--     one of those three never counts again; enforced server-side at the organization level.
--   - Paid plans: larger limits per the approved pricing. Current owner pricing (2026-09-05 / 10-06)
--     has ONE paid organization plan, `company_pilot`, with no fixed cap on positions and no
--     profile-view figure yet, so a paid organization is treated as NO FIXED LIMIT until the owner
--     sets a number (change `v_paid_limit` below).
--   - VIP: only the owner may grant a free VIP status to a specific organization; never automatic;
--     scope managed and audited.
--   - No plan, paid or VIP, ever bypasses the worker's consent: this gate only COUNTS views of the
--     anonymized professional profile; identity still needs the worker's own disclosure.
--
-- Reuses, does not duplicate: plans/entitlements stay in `billing_subscriptions` + lib/billing;
-- the VIP table mirrors the existing `platform_capability_grants` audit shape.
-- Rollback: supabase/rollbacks/20261018150000_employer_profile_views_v1.down.sql

begin;

-- 1. A working relationship (can_view_worker minus the employer-visibility-consent branch).
--    A related viewer is never counted against a plan.
create or replace function public.caller_has_worker_relation_v1(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.owns_worker(p_worker_id)
    or public.is_admin()
    or exists (
      select 1 from public.company_workers cw join public.companies c on c.id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.agency_workers aw join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.company_worker_engagements e
       where e.worker_id is not null and e.worker_id = p_worker_id and e.status = 'active'
         and public.owns_company(e.company_id)
    )
    or exists (
      select 1 from public.engagement_contexts ec
        join public.relationship_types rt on rt.slug = ec.relationship_slug and rt.grants_worker_visibility
        join public.workers x on x.id = p_worker_id and x.profile_id = ec.profile_id
       where ec.status = 'active' and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = p_worker_id and pwa.status = 'active' and pwa.ended_at is null
         and public.can_manage_project(pwa.project_id)
    );
$$;
revoke all on function public.caller_has_worker_relation_v1(uuid) from public;
revoke all on function public.caller_has_worker_relation_v1(uuid) from anon;
grant execute on function public.caller_has_worker_relation_v1(uuid) to authenticated;

-- 2. Owner-granted organization access (VIP). Audited; written ONLY through the platform-admin RPCs
--    set_organization_vip_v1 / revoke_organization_vip_v1 below. No write policy or table write
--    privilege for any API role, by design — an organization can never grant itself VIP.
create table if not exists public.organization_access_grants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  grant_kind      text not null check (grant_kind in ('vip')),
  -- e.g. {"profile_views": null}  (null = no fixed limit) or {"profile_views": 50}
  scope           jsonb not null default '{}'::jsonb,
  -- set null (not no-action) so erasing an admin account never blocks on this audit row
  granted_by      uuid references public.profiles(id) on delete set null,
  granted_at      timestamptz not null default now(),
  revoked_by      uuid references public.profiles(id) on delete set null,
  revoked_at      timestamptz,
  note            text check (note is null or char_length(note) <= 500),
  check (revoked_by is null or revoked_at is not null)
);
create unique index if not exists organization_access_grants_one_active
  on public.organization_access_grants (organization_id, grant_kind) where revoked_at is null;
alter table public.organization_access_grants enable row level security;
revoke all on table public.organization_access_grants from public, anon, authenticated;
create policy organization_access_grants_select on public.organization_access_grants
  for select using (public.is_admin() or public.manages_organization(organization_id));
grant select on public.organization_access_grants to authenticated;

-- 3. Unique profile views per organization. Re-opening never inserts again.
create table if not exists public.employer_profile_views (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  worker_id        uuid not null references public.workers(id) on delete cascade,
  first_viewed_at  timestamptz not null default now(),
  first_viewed_by  uuid references public.profiles(id) on delete set null,
  primary key (organization_id, worker_id)
);
alter table public.employer_profile_views enable row level security;
revoke all on table public.employer_profile_views from public, anon, authenticated;
create policy employer_profile_views_select on public.employer_profile_views
  for select using (public.is_admin() or public.manages_organization(organization_id));
grant select on public.employer_profile_views to authenticated;

-- 3b. VIP is granted and revoked only by a platform admin (the owner), with who/when/why kept.
create or replace function public.set_organization_vip_v1(
  p_organization_id uuid,
  p_profile_views int default null,   -- null = no fixed limit
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Only a platform admin can grant VIP' using errcode = '42501';
  end if;
  if p_organization_id is null
     or not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'Unknown organization' using errcode = 'P0002';
  end if;
  if p_profile_views is not null and (p_profile_views < 1 or p_profile_views > 100000) then
    raise exception 'Invalid profile view limit' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Note too long' using errcode = '22023';
  end if;
  -- One active grant per organization: a new grant closes the previous one (kept as history).
  update public.organization_access_grants
     set revoked_at = now(), revoked_by = uid
   where organization_id = p_organization_id and grant_kind = 'vip' and revoked_at is null;
  insert into public.organization_access_grants (organization_id, grant_kind, scope, granted_by, note)
  values (p_organization_id, 'vip', jsonb_build_object('profile_views', p_profile_views), uid,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.set_organization_vip_v1(uuid, int, text) from public;
revoke all on function public.set_organization_vip_v1(uuid, int, text) from anon;
grant execute on function public.set_organization_vip_v1(uuid, int, text) to authenticated;

create or replace function public.revoke_organization_vip_v1(p_organization_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Only a platform admin can revoke VIP' using errcode = '42501';
  end if;
  update public.organization_access_grants
     set revoked_at = now(), revoked_by = uid
   where organization_id = p_organization_id and grant_kind = 'vip' and revoked_at is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.revoke_organization_vip_v1(uuid) from public;
revoke all on function public.revoke_organization_vip_v1(uuid) from anon;
grant execute on function public.revoke_organization_vip_v1(uuid) to authenticated;

-- 4. The gate. The limit is computed HERE from the organization's own state — never passed in.
create or replace function public.record_worker_profile_view_v1(
  p_organization_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_free_limit constant int := 3;
  v_paid_limit int := null;          -- owner pricing: no fixed figure yet for the paid plan
  v_limit int;
  v_plan text := 'free';
  v_used int;
  v_vip jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is null or p_worker_id is null then
    raise exception 'Invalid arguments' using errcode = '22023';
  end if;
  if not public.manages_organization(p_organization_id) then
    raise exception 'Not a manager of this organization' using errcode = '42501';
  end if;
  if not public.can_view_worker(p_worker_id) then
    raise exception 'Worker not visible' using errcode = 'P0002';
  end if;

  -- A working relationship is not a "view of a found profile".
  if public.caller_has_worker_relation_v1(p_worker_id) then
    return jsonb_build_object('allowed', true, 'counted', false, 'reason', 'relationship');
  end if;

  -- Serialize counting per organization so concurrent opens cannot pass the limit.
  perform 1 from public.organizations where id = p_organization_id for update;

  if exists (select 1 from public.employer_profile_views
              where organization_id = p_organization_id and worker_id = p_worker_id) then
    return jsonb_build_object('allowed', true, 'counted', false, 'reason', 'already_viewed');
  end if;

  select g.scope into v_vip
    from public.organization_access_grants g
   where g.organization_id = p_organization_id and g.grant_kind = 'vip' and g.revoked_at is null
   limit 1;

  if v_vip is not null then
    v_plan := 'vip';
    v_limit := case when v_vip ? 'profile_views' and jsonb_typeof(v_vip->'profile_views') = 'number'
                    then (v_vip->>'profile_views')::int else null end;
  elsif exists (
    select 1 from public.billing_subscriptions s
     where s.organization_id = p_organization_id
       and s.plan_key = 'company_pilot'
       and s.status in ('active', 'trialing')
       and s.test_mode = false
       and coalesce(s.provider_subscription_id, '') not like 'manual\_%'
  ) then
    v_plan := 'paid';
    v_limit := v_paid_limit;
  else
    v_limit := v_free_limit;
  end if;

  select count(*) into v_used from public.employer_profile_views where organization_id = p_organization_id;

  if v_limit is not null and v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'counted', false, 'reason', 'limit_reached',
                              'plan', v_plan, 'used', v_used, 'limit', v_limit);
  end if;

  insert into public.employer_profile_views (organization_id, worker_id, first_viewed_by)
  values (p_organization_id, p_worker_id, uid)
  on conflict (organization_id, worker_id) do nothing;

  return jsonb_build_object('allowed', true, 'counted', true, 'reason', 'new_view',
                            'plan', v_plan, 'used', v_used + 1, 'limit', v_limit);
end;
$$;
revoke all on function public.record_worker_profile_view_v1(uuid, uuid) from public;
revoke all on function public.record_worker_profile_view_v1(uuid, uuid) from anon;
grant execute on function public.record_worker_profile_view_v1(uuid, uuid) to authenticated;

commit;
