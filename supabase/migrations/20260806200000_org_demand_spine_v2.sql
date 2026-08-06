-- 20260806200000 — organization demand spine v2 (M-P0-6, supersedes PR #1016)
--
-- @human-gate-approved — RED class. OWNER APPROVAL recorded 2026-08-06
-- ("CLOSE MULTI-ORGANIZATION STRUCTURAL TRAIN" §1/§4): apply this exact
-- migration after #1028, merge PR #1029 after full production proof,
-- normal deployment. Covered findings, still visible as notices:
-- security-definer-function, grant-or-revoke, alter-drop-policy,
-- create-trigger, data-dml (the COUNTED unambiguous single-org backfill —
-- classified against production truth as 17 demand + 1 shortlist +
-- 0 booking rows, zero ambiguous — plus stamp UPDATEs inside function
-- bodies). Executable SQL byte-identical to reviewed HEAD `190240b1`
-- (comment-stripped sha256
-- b3b5388e23966e0556c0c8de2f015f386d0fd0879a1344aa403f8d935b278413).
-- Decision recorded in docs/human-gates/org-demand-spine-v2-gate.md and
-- docs/APPLIED_LEDGER.md.
--
-- SAFETY CLASS: RED. New SECURITY DEFINER functions, triggers, RLS policy
-- replacement, apply-time backfill DML. Built without a marker
-- (…_CODE_COMPLETE_PENDING_HUMAN_GATE); the marker above was added only
-- after the separate 2026-08-06 owner apply decision.
--
-- ── WHY V2 (what was wrong with #1016 / v1) ────────────────────────────────
-- v1 stamped from `resolve_caller_organization_id()` — a server-side GUESS
-- (exactly-one-org-or-NULL). A real multi-org actor always stamped NULL, so
-- v1 could never support the M-P0 doctrine ("actor with A and B can create
-- separate demand in either context"). v2 stamps from the VALIDATED ACTIVE
-- WORKSPACE: the app resolves the workspace (httpOnly cookie + membership
-- validation — `requireEmployerCompany()`), passes the organization to the
-- v2 entry RPCs, and the SERVER re-verifies live membership + demand role
-- before stamping. A client id without a live governance membership stamps
-- nothing and fails closed.
--
-- ── DESIGN ─────────────────────────────────────────────────────────────────
-- 1. `organization_id uuid NULL` on `customer_requests`, `demand_shortlist`,
--    `booking_requests` (+ partial indexes). NULL = personal/unattributed —
--    the pre-multi-org state stays legal (Personal buyer actions remain
--    personal).
-- 2. Helper `has_org_demand_access(org)` — ACTIVE membership with role
--    owner/admin/manager/external_manager (the §11 `manage-demand`
--    capability roles). `member` belongs but does not trade. Engagement
--    rows deliberately do NOT grant demand access.
-- 3. Entry RPCs `save_demand_draft_v2` / `submit_demand_request_v2` —
--    thin wrappers: verify membership, delegate to the UNCHANGED v1
--    (validation/status machine byte-identical because it is literally the
--    same function), then stamp the created row. No v1 signature changes.
-- 4. INHERITANCE, not parameters, downstream: BEFORE INSERT triggers stamp
--    `demand_shortlist` / `booking_requests` from their demand row's
--    organization. There is NO client-writable org id anywhere downstream —
--    booking inherits demand organization by construction.
-- 5. IMMUTABILITY: BEFORE UPDATE triggers on all three tables — historical
--    organization attribution can never be rewritten (NULL→value is allowed
--    ONLY through the SECURITY DEFINER stamp path, never via the raw
--    authenticated UPDATE surface that 0028 grants on customer_requests).
-- 6. READS: the three SELECT policies gain exactly one leg —
--    `has_org_demand_access(organization_id)` — so colleagues in the SAME
--    organization share the chain while organization A can never read B's
--    (each check is per-row, per-org). Personal (NULL-org) rows stay
--    owner-only. MARKETPLACE READS DECIDED EXPLICITLY: the public demand
--    surfaces (`list_open_demand_for_workers`, `list_open_demand_for_agencies`,
--    `contact_demand_owner_v1`) are UNTOUCHED — stamping widens no public
--    exposure.
-- 7. Backfill stamps ONLY rows whose owner maps to exactly one organization
--    (via companies.profile_id → organizations.legacy_company_id) — counted
--    with RAISE NOTICE, never guessed for multi-org owners.
--
-- ROLLBACK: supabase/rollbacks/20260806200000_org_demand_spine_v2.down.sql —
-- ARCHIVES all attribution (demand_org_attribution_archive) before dropping
-- the columns; it never silently destroys attribution once real multi-org
-- writes exist.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.company_memberships') is null then
    raise exception 'company_memberships missing — apply 20260806090000 BEFORE this migration';
  end if;
  if to_regclass('public.customer_requests') is null
     or to_regclass('public.demand_shortlist') is null
     or to_regclass('public.booking_requests') is null then
    raise exception 'demand chain tables missing — 0028/20260612220000/20260613100100 expected';
  end if;
end $$;

-- ── 1. Columns + indexes (additive, nullable) ─────────────────────────────
alter table public.customer_requests
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.demand_shortlist
  add column if not exists organization_id uuid references public.organizations(id);
alter table public.booking_requests
  add column if not exists organization_id uuid references public.organizations(id);

create index if not exists customer_requests_organization_idx
  on public.customer_requests (organization_id) where organization_id is not null;
create index if not exists demand_shortlist_organization_idx
  on public.demand_shortlist (organization_id) where organization_id is not null;
create index if not exists booking_requests_organization_idx
  on public.booking_requests (organization_id) where organization_id is not null;

-- ── 2. Demand-access helper (membership truth, §11 capability roles) ──────
create or replace function public.has_org_demand_access(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select org is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
revoke all on function public.has_org_demand_access(uuid) from public;
revoke all on function public.has_org_demand_access(uuid) from anon;
grant execute on function public.has_org_demand_access(uuid) to authenticated;

-- ── 3. Immutability + anti-forgery trigger (all three tables) ─────────────
-- NULL→value is legal ONLY off the raw authenticated surface (the SECURITY
-- DEFINER stamp paths run as the function owner, not `authenticated`).
-- value→anything is NEVER legal — historical attribution is immutable.
-- INVOKER rights ON PURPOSE: `current_user` must reflect the caller — it is
-- 'authenticated' on the raw PATCH/INSERT surface and the FUNCTION OWNER
-- inside the SECURITY DEFINER stamp paths; a definer guard would see its
-- own owner for both and the raw-surface check would never fire. The guard
-- touches only NEW/OLD — it reads no tables, so invoker rights cost nothing.
create or replace function public.demand_org_attribution_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.organization_id is not null
       and new.organization_id is distinct from old.organization_id then
      raise exception 'organization_attribution_immutable' using errcode = '42501';
    end if;
    if old.organization_id is null
       and new.organization_id is not null
       and current_user = 'authenticated' then
      -- A raw PATCH may never claim an organization.
      raise exception 'organization_attribution_immutable' using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' then
    if new.organization_id is not null and current_user = 'authenticated' then
      -- Direct-DML surfaces (demand_shortlist) may never choose an org —
      -- the inherit trigger below overwrites it from the demand row.
      new.organization_id := null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.demand_org_attribution_guard() from public;
revoke all on function public.demand_org_attribution_guard() from anon;
revoke all on function public.demand_org_attribution_guard() from authenticated;

drop trigger if exists customer_requests_org_guard on public.customer_requests;
create trigger customer_requests_org_guard
  before insert or update on public.customer_requests
  for each row execute function public.demand_org_attribution_guard();
drop trigger if exists demand_shortlist_org_guard on public.demand_shortlist;
create trigger demand_shortlist_org_guard
  before insert or update on public.demand_shortlist
  for each row execute function public.demand_org_attribution_guard();
drop trigger if exists booking_requests_org_guard on public.booking_requests;
create trigger booking_requests_org_guard
  before insert or update on public.booking_requests
  for each row execute function public.demand_org_attribution_guard();

-- ── 4. Inheritance triggers — the chain carries the demand's organization ─
-- AFTER the guard (alphabetical firing order is guaranteed by the names:
-- *_org_guard < *_org_inherit), so inheritance wins over the guard's NULL.
create or replace function public.demand_chain_inherit_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select cr.organization_id into new.organization_id
    from public.customer_requests cr
   where cr.id = new.request_id;
  return new;
end $$;
revoke all on function public.demand_chain_inherit_organization() from public;
revoke all on function public.demand_chain_inherit_organization() from anon;
revoke all on function public.demand_chain_inherit_organization() from authenticated;

drop trigger if exists demand_shortlist_org_inherit on public.demand_shortlist;
create trigger demand_shortlist_org_inherit
  before insert on public.demand_shortlist
  for each row execute function public.demand_chain_inherit_organization();
drop trigger if exists booking_requests_org_inherit on public.booking_requests;
create trigger booking_requests_org_inherit
  before insert on public.booking_requests
  for each row execute function public.demand_chain_inherit_organization();

-- ── 5. v2 entry RPCs — validated-workspace stamping ───────────────────────
-- The app passes the organization it RESOLVED from the validated active
-- workspace; the server re-verifies live membership + role. NULL = personal
-- (exactly the v1 behaviour). Merged outcome for "no such org" and "no
-- membership" — no existence oracle.
create or replace function public.save_demand_draft_v2(
  p_kind              text,
  p_title             text,
  p_payload           jsonb,
  p_original_language text,
  p_organization_id   uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and not public.has_org_demand_access(p_organization_id) then
    raise exception 'not_org_member' using errcode = '42501';
  end if;
  v_id := public.save_demand_draft(p_kind, p_title, p_payload, p_original_language);
  if p_organization_id is not null and v_id is not null then
    update public.customer_requests
       set organization_id = p_organization_id
     where id = v_id and profile_id = auth.uid() and organization_id is null;
  end if;
  return v_id;
end $$;

create or replace function public.submit_demand_request_v2(
  p_kind              text,
  p_title             text,
  p_need_summary      text,
  p_payload           jsonb,
  p_original_language text,
  p_organization_id   uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and not public.has_org_demand_access(p_organization_id) then
    raise exception 'not_org_member' using errcode = '42501';
  end if;
  v_id := public.submit_demand_request(p_kind, p_title, p_need_summary, p_payload, p_original_language);
  if p_organization_id is not null and v_id is not null then
    update public.customer_requests
       set organization_id = p_organization_id
     where id = v_id and profile_id = auth.uid() and organization_id is null;
  end if;
  return v_id;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'save_demand_draft_v2(text, text, jsonb, text, uuid)',
    'submit_demand_request_v2(text, text, text, jsonb, text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;

-- ── 6. Read legs — same-organization colleagues share the chain ───────────
-- Each policy keeps EVERY original leg and appends exactly one:
-- has_org_demand_access(organization_id). Personal (NULL-org) rows are
-- unchanged: the helper is false for NULL. A's members can never read B's
-- rows — the check is per-row against the row's own organization.
drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or public.has_org_demand_access(organization_id)
  );

drop policy if exists demand_shortlist_select on public.demand_shortlist;
create policy demand_shortlist_select on public.demand_shortlist
  for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_admin()
    or public.has_org_demand_access(organization_id)
  );

drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.workers w
       where w.id = booking_requests.worker_id and w.profile_id = auth.uid()
    )
    or public.is_admin()
    or public.has_org_demand_access(organization_id)
  );

-- ── 7. Backfill — exactly-one-organization owners only, counted ───────────
do $$
declare
  stamped_demand int;
  stamped_shortlist int;
  stamped_booking int;
begin
  with singleorg as (
    -- exactly ONE owned company AND exactly ONE bound organization —
    -- anything ambiguous stays NULL (never guessed).
    select c.profile_id, min(o.id::text)::uuid as org_id
      from public.companies c
      join public.organizations o on o.legacy_company_id = c.id
     group by c.profile_id
    having count(distinct c.id) = 1 and count(distinct o.id) = 1
  )
  update public.customer_requests cr
     set organization_id = s.org_id
    from singleorg s
   where cr.profile_id = s.profile_id and cr.organization_id is null;
  get diagnostics stamped_demand = row_count;

  update public.demand_shortlist ds
     set organization_id = cr.organization_id
    from public.customer_requests cr
   where cr.id = ds.request_id
     and ds.organization_id is null
     and cr.organization_id is not null;
  get diagnostics stamped_shortlist = row_count;

  update public.booking_requests br
     set organization_id = cr.organization_id
    from public.customer_requests cr
   where cr.id = br.request_id
     and br.organization_id is null
     and cr.organization_id is not null;
  get diagnostics stamped_booking = row_count;

  raise notice 'org-demand-spine-v2 backfill: % demand, % shortlist, % booking rows stamped',
    stamped_demand, stamped_shortlist, stamped_booking;
end $$;
