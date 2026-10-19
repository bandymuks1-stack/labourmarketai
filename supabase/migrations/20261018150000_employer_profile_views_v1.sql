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

-- 0. ORDER: this file is applied AFTER 20261018160000_worker_identity_split_v1 (it replaces that file's
--    discovery projection with the counted two-tier version). Refuse otherwise.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'workers' and policyname = 'workers_select'
       and qual like '%caller_has_worker_relation_v1%'
  ) or to_regprocedure('public.list_discoverable_worker_profiles_v1(uuid[])') is null then
    raise exception 'apply 20261018160000_worker_identity_split_v1 first' using errcode = '55000';
  end if;
end $$;

-- 1. A working relationship — byte-identical to 20261018160000 (guard-pinned). A related viewer is
--    never counted against a plan.
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
      select 1 from public.company_workers cw join public.organizations o on o.legacy_company_id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and public.manages_organization(o.id)
    )
    or exists (
      select 1 from public.agency_workers aw join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.agency_workers aw join public.organizations o on o.legacy_agency_id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and public.manages_organization(o.id)
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
    )
    or exists (
      select 1 from public.booking_requests b
       where b.worker_id = p_worker_id and b.status = 'accepted'
         and (b.owner_id = auth.uid()
              or (b.organization_id is not null and public.manages_organization(b.organization_id)))
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

-- 3c. The plan of an organization for profile views — ONE place for the figures (free 3; live paid
--     company_pilot: no fixed figure until the owner sets one; owner-granted VIP: its scope).
create or replace function public.organization_profile_view_plan_v1(p_organization_id uuid)
returns table (plan text, view_limit integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_free_limit constant int := 3;
  v_paid_limit int := null;          -- owner pricing: no fixed figure yet for the paid plan
  v_vip jsonb;
begin
  select g.scope into v_vip
    from public.organization_access_grants g
   where g.organization_id = p_organization_id and g.grant_kind = 'vip' and g.revoked_at is null
   limit 1;
  if v_vip is not null then
    return query select 'vip'::text,
      case when v_vip ? 'profile_views' and jsonb_typeof(v_vip->'profile_views') = 'number'
           then (v_vip->>'profile_views')::int else null end;
  elsif exists (
    select 1 from public.billing_subscriptions s
     where s.organization_id = p_organization_id
       and s.plan_key = 'company_pilot'
       and s.status in ('active', 'trialing')
       and s.test_mode = false
       and coalesce(s.provider_subscription_id, '') not like 'manual\_%'
  ) then
    return query select 'paid'::text, v_paid_limit;
  else
    return query select 'free'::text, v_free_limit;
  end if;
end;
$$;
revoke all on function public.organization_profile_view_plan_v1(uuid) from public;
revoke all on function public.organization_profile_view_plan_v1(uuid) from anon;

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
  v_limit int;
  v_plan text;
  v_used int;
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

  select pl.plan, pl.view_limit into v_plan, v_limit
    from public.organization_profile_view_plan_v1(p_organization_id) pl;

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
-- 5. The discovery projection, two-tier (replaces the single-tier version of 20261018160000; same
--    signature, same audience, same never-identity rule).
create or replace function public.list_discoverable_worker_profiles_v1(p_worker_ids uuid[])
returns table (
  id uuid,
  experience_years integer,
  current_location_country text,
  preferred_countries text[],
  availability_status text,
  available_from date,
  salary_min_eur integer,
  salary_max_eur integer,
  preferred_contract_type text,
  pay_basis_preference text,
  night_shifts_ok boolean,
  weekend_shifts_ok boolean,
  overtime_ok boolean,
  driving_licence_categories text[],
  own_vehicle boolean,
  own_tools boolean,
  last_active_week date,
  is_synthetic_fixture boolean,
  -- card tier: whether a start date is SET (the communication rule needs only that, never the date)
  has_available_from boolean,
  -- false when detail fields were withheld (20261018150000 plan limit), so null never reads as "not entered"
  detail_unlocked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unlimited boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_worker_ids is null or cardinality(p_worker_ids) = 0 then
    return;
  end if;
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';
  end if;
  if not (public.is_employer() or public.is_admin()) then
    return;
  end if;
  -- THE PLAN LIMIT HOLDS ON THE DATA, not only on a page: the DETAIL fields (pay, start date,
  -- engagement form, pay basis, shifts, overtime, licence, vehicle, tools) come back only for a
  -- worker one of the caller's organizations has already OPENED (a counted view, see
  -- record_worker_profile_view_v1), or when one of them has no fixed view limit (VIP / paid
  -- without a figure), or for an admin. Everyone else receives the uncounted CARD tier, and
  -- detail_unlocked = false says the nulls mean "open the profile", never "not entered".
  v_unlimited := public.is_admin() or exists (
    select 1
      from (select o.id from public.organizations o where public.manages_organization(o.id)) m
      cross join lateral public.organization_profile_view_plan_v1(m.id) pl
     where pl.view_limit is null
  );
  return query
    select w.id, w.experience_years, w.current_location_country, w.preferred_countries,
           w.availability_status,
           case when d.unlocked then w.available_from end,
           case when d.unlocked then w.salary_min_eur end,
           case when d.unlocked then w.salary_max_eur end,
           case when d.unlocked then w.preferred_contract_type end,
           case when d.unlocked then w.pay_basis_preference end,
           case when d.unlocked then w.night_shifts_ok end,
           case when d.unlocked then w.weekend_shifts_ok end,
           case when d.unlocked then w.overtime_ok end,
           case when d.unlocked then w.driving_licence_categories end,
           case when d.unlocked then w.own_vehicle end,
           case when d.unlocked then w.own_tools end,
           -- a week bucket, never an exact timestamp
           date_trunc('week', coalesce(w.updated_at, w.created_at))::date,
           -- QA fixtures by their documented markers (lib/qa/synthetic-fixture.ts); the flag leaves
           -- the database, the name and headline never do.
           (coalesce(w.display_name, '') || ' ' || coalesce(w.headline, ''))
             ~* '(\mQA[-_ ]SYNTHETIC\M|\[E2E\]|\mE2E[-_ ]FIXTURE\M)',
           w.available_from is not null,
           d.unlocked
      from public.workers w
      cross join lateral (
        select v_unlimited or exists (
          select 1 from public.employer_profile_views v
           where v.worker_id = w.id and public.manages_organization(v.organization_id)
        ) as unlocked
      ) d
     where w.id = any (p_worker_ids)
       and w.profile_id is not null
       and public.worker_profile_discoverable(w.profile_id);
end;
$$;
revoke all on function public.list_discoverable_worker_profiles_v1(uuid[]) from public;
revoke all on function public.list_discoverable_worker_profiles_v1(uuid[]) from anon;
grant execute on function public.list_discoverable_worker_profiles_v1(uuid[]) to authenticated;

revoke all on function public.record_worker_profile_view_v1(uuid, uuid) from public;
revoke all on function public.record_worker_profile_view_v1(uuid, uuid) from anon;
grant execute on function public.record_worker_profile_view_v1(uuid, uuid) to authenticated;

-- 4. GDPR erasure decisions for the four person references above (executor v3,
--    20261019140000, is applied before this file in production; on a database
--    without it the block is skipped and the plan refuses these FKs by name).
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'organization_access_grants', 'granted_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'admin identity on an audit row; the grant stays with the organisation'),
  ('public', 'organization_access_grants', 'revoked_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'admin identity on an audit row; the grant stays with the organisation'),
  ('public', 'employer_profile_views', 'worker_id', 'workers', 'cascade', 'allow_cascade', 'engineering', false, 'Art. 17(1)(a)/(b): the record that an organisation viewed this person; deleted with the account', 'cascade confirmed as the decision (the person''s own data)'),
  ('public', 'employer_profile_views', 'first_viewed_by', 'profiles', 'set null', 'set_null', 'engineering', false, 'nullable reference; severed by NULL', 'the viewer''s identity on the organisation''s view counter')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;

commit;
