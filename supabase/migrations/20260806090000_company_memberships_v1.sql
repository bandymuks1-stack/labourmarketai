-- 20260806090000 — company_memberships v1 (M-P0-4)
--
-- SAFETY CLASS: RED. New table + RLS + grants + a backfill DML. Ships with
-- NO `-- @human-gate-approved` marker: the owner commissioned the M-P0-4
-- PACKAGE (directive §14/§15), not the apply. A separate owner decision is
-- required before this touches production. CI staying RED is the honest
-- state until that decision is recorded.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- Governance ≠ employment. Today "who may act for an organization" is spread
-- across two proxies: `organizations.owner_profile_id` (creator) and ACTIVE
-- `engagement_contexts` rows (employment relationships doing double duty as
-- authority). M-P0-3 made the active workspace the authority CONTEXT; this
-- table is the authority TRUTH it will validate against, and the guard that
-- `save_company_setup_v3` widens to (per its own comment).
--
-- Doctrine (owner directive §14):
--   * membership represents GOVERNANCE, not employment;
--   * one ACTIVE canonical membership tuple per profile/organization;
--   * a person may belong to many organizations; an organization has many
--     members;
--   * owner membership cannot silently disappear;
--   * revoking membership in A does not affect B;
--   * membership creates/ends NO engagement, NO project assignment, and
--     never alters the person's identity;
--   * permissions fail closed after revocation.
--
-- Roles derive from the EXISTING role doctrine (0013's manager-authority set
-- plus the invited-member base): owner | admin | manager | external_manager
-- | member. No new semantics are invented here.
--
-- WRITES ARE RPC-ONLY BY DESIGN: authenticated gets SELECT (RLS-scoped) and
-- NO INSERT/UPDATE/DELETE grant. The invite/accept/revoke RPCs arrive in
-- their own reviewed migration (M-P0-4 slice 2); until then the table is
-- readable truth, mutated only by this migration's backfill.
--
-- BACKFILL (the only DML, classification per docs/architecture/
-- COMPANY_MEMBERSHIPS_V1.md):
--   * organizations.owner_profile_id → role 'owner', status 'active',
--     source 'backfill:organizations.owner_profile_id' — CLEAR governance
--     (production 2026-08-05: 10 owner engagements, matching org owners).
--   * engagement_contexts 'manager'/'external_manager' ACTIVE rows → role
--     manager/external_manager, source 'backfill:engagement_contexts' —
--     CLEAR governance (production today: ZERO such rows; the statement is
--     a no-op there but keeps local/preview stacks truthful).
--   * engagement_contexts 'employee' rows → EMPLOYMENT ONLY. Never migrated.
--   * No ambiguous class exists in production (verified read-only
--     2026-08-05: 36 employee + 10 owner, nothing else).
--
-- ROLLBACK: supabase/rollbacks/20260806090000_company_memberships_v1.down.sql
-- drops the table (memberships are derived truth in v1 — the sources of the
-- backfill remain intact, so a rollback loses no original data).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.company_memberships') is not null then
    raise exception 'company_memberships already exists — refusing to re-run';
  end if;
  if to_regclass('public.organizations') is null then
    raise exception 'organizations missing — this schema predates the org spine';
  end if;
end $$;

-- ── 2. Table ──────────────────────────────────────────────────────────────
create table public.company_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null
                  check (role in ('owner','admin','manager','external_manager','member')),
  status          text not null default 'invited'
                  check (status in ('invited','active','revoked')),
  invited_by      uuid references public.profiles(id) on delete set null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  -- Where this row came from ('backfill:…', 'invite', …) + optional pointer
  -- to the originating record (e.g. an invitation id). Metadata, not
  -- authority.
  source          text,
  reference_id    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Status/timestamp coherence: an active row is an accepted row; a revoked
  -- row carries its revocation time.
  constraint company_memberships_accepted_coherent
    check (status <> 'active' or accepted_at is not null),
  constraint company_memberships_revoked_coherent
    check ((status = 'revoked') = (revoked_at is not null))
);

comment on table public.company_memberships is
  'M-P0-4 governance memberships (who may ACT FOR an organization). '
  'Governance, not employment: engagement_contexts rows are never implied, '
  'created or ended by rows here. One LIVE (invited|active) tuple per '
  'profile/organization; revoked rows are history and stay.';
comment on column public.company_memberships.source is
  'Provenance metadata (backfill:…, invite). Never an authority input.';

-- One live membership per person per organization; revoked history stays.
create unique index company_memberships_live_key
  on public.company_memberships (organization_id, profile_id)
  where status in ('invited','active');

create index company_memberships_profile_idx
  on public.company_memberships (profile_id) where status = 'active';
create index company_memberships_org_idx
  on public.company_memberships (organization_id) where status = 'active';

-- Reuse the shared updated_at trigger (0006 pattern).
create trigger set_updated_at
  before update on public.company_memberships
  for each row execute function public.set_updated_at();

-- ── 3. Owner survival ─────────────────────────────────────────────────────
-- The LAST active owner membership of an organization can neither be
-- revoked, demoted nor deleted — owner membership cannot silently
-- disappear. Transferring ownership means activating ANOTHER owner first.
create or replace function public.company_memberships_protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  losing_owner boolean;
begin
  losing_owner :=
    old.role = 'owner' and old.status = 'active'
    and (tg_op = 'DELETE'
         or new.status <> 'active'
         or new.role <> 'owner');
  if losing_owner and not exists (
    select 1 from public.company_memberships m
     where m.organization_id = old.organization_id
       and m.role = 'owner' and m.status = 'active'
       and m.id <> old.id
  ) then
    raise exception 'last_owner_membership' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger protect_last_owner
  before update or delete on public.company_memberships
  for each row execute function public.company_memberships_protect_last_owner();

-- ── 4. RLS + grants — read-only surface, fail-closed writes ───────────────
alter table public.company_memberships enable row level security;

-- A person sees their own membership rows (any status — they may see what
-- was revoked from THEM), and active members see the member list of their
-- organization. Admins see everything. No existence oracle beyond that.
create policy company_memberships_select on public.company_memberships
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.company_memberships mine
       where mine.organization_id = company_memberships.organization_id
         and mine.profile_id = auth.uid()
         and mine.status = 'active'
    )
    or public.is_admin()
  );

-- NO write policies and NO write grants: every mutation path is a reviewed
-- SECURITY DEFINER RPC (slice 2). RLS without a policy denies; the missing
-- grant makes the denial fail-closed at both layers.
revoke all on table public.company_memberships from public;
revoke all on table public.company_memberships from anon;
grant select on table public.company_memberships to authenticated;
grant all on table public.company_memberships to service_role;

-- ── 5. Backfill (classification in the header; DML class = RED) ───────────
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
select o.id, o.owner_profile_id, 'owner', 'active', now(),
       'backfill:organizations.owner_profile_id'
  from public.organizations o
 where o.owner_profile_id is not null
on conflict do nothing;

insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source, reference_id)
select ec.organization_id, ec.profile_id, ec.relationship_slug, 'active',
       coalesce(ec.started_at::timestamptz, ec.created_at, now()),
       'backfill:engagement_contexts', ec.id
  from public.engagement_contexts ec
 where ec.status = 'active'
   and ec.relationship_slug in ('manager','external_manager')
   and ec.organization_id is not null
on conflict do nothing;

-- Employee engagements are EMPLOYMENT, not governance — deliberately absent.

-- ── 6. Post-conditions ────────────────────────────────────────────────────
do $$
declare
  orgs_with_owner_col int;
  orgs_with_membership int;
begin
  select count(*) into orgs_with_owner_col
    from public.organizations where owner_profile_id is not null;
  select count(distinct organization_id) into orgs_with_membership
    from public.company_memberships
   where role = 'owner' and status = 'active';
  if orgs_with_membership < orgs_with_owner_col then
    raise exception
      'backfill incomplete: % orgs have owner_profile_id, only % gained an owner membership',
      orgs_with_owner_col, orgs_with_membership;
  end if;
end $$;
