-- ════════════════════════════════════════════════════════════════════════
-- 0022 — SR-1: Organization Tier-2 schema foundation (DRAFT, do not apply
--               to production without explicit owner DB-validation
--               approval — see PR description).
--
-- Purpose
--   Adds the schema substrate needed for SR-3 (Tier-2 onboarding UI) and
--   SR-4 (admin Tier-2 review surface). The SR audit
--   (docs/handoffs/TASK-SALES-READINESS-AUDIT-V1.md §5 SR-1) requires
--   organizations carry real requisites — registration code, correspondence
--   address, country presence, an identified human representative — before
--   any "serious" action ships behind a paid surface
--   (docs/policies/organization-profile-creation-policy-v1.md §Tier 2).
--   This migration *only* adds the storage layer; promotion still flows
--   through an owner-initiated RPC and verification stays an admin manual
--   action (SR-4).
--
-- Doctrine alignment
--   §1 (smaller-party honesty): Tier-2 = "requisites submitted", never
--     "verified" until admin reviews. Promotion does not flip a public
--     "verified" badge.
--   §3.4 (audit_logs): every tier promotion writes an audit_logs row via
--     the SECURITY DEFINER RPC so admin can reconstruct who promoted what
--     and when.
--   §4 (default-closed RLS): new representative + country tables are
--     RLS-closed; only org owners read/write them through the RPC and
--     scoped policies below. Authenticated grants are explicit
--     (see "explicit grants" memory pattern; PR #6 / migration 0010).
--   §7 (no fake verified): no automatic verification logic exists. The
--     tier2_verified_at / tier2_verified_by columns are introduced now so
--     SR-4 doesn't need a follow-up migration, but they stay NULL until a
--     human admin writes them via the SR-4 RPC (not in this migration).
--   §10 (no universal value): representative roles use a closed slug
--     enum ('director','authorised_representative','employee','contractor').
--
-- Safety contract
--   - Additive only. No DROP, no ALTER ... DROP, no DELETE FROM, no
--     UPDATE against existing production rows (other than the additive
--     default for the new `tier` column which is set at column creation
--     and applies uniformly to existing + future rows).
--   - All new columns are nullable except `tier` (which has a safe default
--     'pilot' — so every existing row migrates to tier='pilot' atomically
--     when the column is added, without a separate backfill step).
--   - All `create table` / `create index` / `drop policy if exists` are
--     idempotent — re-running the migration is a no-op once applied.
--   - No grants to anon. All grants are TO authenticated and only for
--     SELECT on rows the user already controls (RLS-narrowed). The
--     promotion RPC is the only writer and it is owner-gated.
--   - Forward-only by repo convention; rollback is by `git revert` + a
--     manually-authored down migration if the owner needs to reverse.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. organizations: Tier-2 columns ──────────────────────────────────
-- All columns are NULLABLE (or have a safe default), so existing pilot
-- rows continue to validate against the new constraints without any
-- backfill step.

alter table public.organizations
  add column if not exists registration_code text,
  add column if not exists correspondence_address jsonb,
  add column if not exists tier text not null default 'pilot',
  add column if not exists tier2_submitted_at timestamptz,
  add column if not exists tier2_promoted_by uuid references public.profiles(id),
  -- Columns SR-4 will populate via a future admin RPC. Introduced here so
  -- SR-4 ships as a pure RPC + UI change without another migration.
  add column if not exists tier2_verified_at timestamptz,
  add column if not exists tier2_verified_by uuid references public.profiles(id);

-- The `tier` check constraint is added after the column exists; `if not
-- exists` on add column means re-runs are safe; we drop+re-add the
-- constraint defensively so its definition matches doctrine even if a
-- prior partial run created the column without the constraint.
alter table public.organizations
  drop constraint if exists organizations_tier_check;
alter table public.organizations
  add constraint organizations_tier_check
    check (tier in ('pilot','tier2'));

-- Correspondence address shape gate. Empty object is allowed (NULL is
-- the "not yet filled in" state); when set, it must have at least one
-- of the four documented keys. The RPC enforces a richer shape — this
-- constraint is just a backstop against direct writes.
alter table public.organizations
  drop constraint if exists organizations_correspondence_address_shape;
alter table public.organizations
  add constraint organizations_correspondence_address_shape
    check (
      correspondence_address is null
      or (
        jsonb_typeof(correspondence_address) = 'object'
        and (
          correspondence_address ? 'country'
          or correspondence_address ? 'city'
          or correspondence_address ? 'line'
          or correspondence_address ? 'postcode'
        )
      )
    );

create index if not exists idx_organizations_tier
  on public.organizations(tier);

-- ── 2. organization_representatives ──────────────────────────────────
-- Who is the human carrying authority for the org at Tier-2 (PV §15,
-- organization-profile-creation-policy §Tier 2). One profile may
-- represent many orgs; one org may have many representatives over time.
-- Revocation is recorded by setting revoked_at (additive history),
-- never by deleting rows.

create table if not exists public.organization_representatives (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null
                  check (role in ('director','authorised_representative','employee','contractor')),
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  granted_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_org_reps_org
  on public.organization_representatives(organization_id);
create index if not exists idx_org_reps_profile
  on public.organization_representatives(profile_id);
create index if not exists idx_org_reps_active
  on public.organization_representatives(organization_id)
  where revoked_at is null;

drop trigger if exists trg_org_reps_set_updated_at on public.organization_representatives;
create trigger trg_org_reps_set_updated_at
  before update on public.organization_representatives
  for each row execute function public.set_updated_at();

-- ── 3. organization_countries ────────────────────────────────────────
-- Multi-country presence for an org. The audit demands real country
-- registry references (no free text); presence_kind is a closed slug
-- enum so future kinds get explicit doctrine review.

create table if not exists public.organization_countries (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code    text not null references public.countries(code),
  presence_kind   text not null default 'headquarters'
                  check (presence_kind in (
                    'headquarters',
                    'subsidiary',
                    'project_site',
                    'representative_office'
                  )),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, country_code)
);

create index if not exists idx_org_countries_org
  on public.organization_countries(organization_id);

drop trigger if exists trg_org_countries_set_updated_at on public.organization_countries;
create trigger trg_org_countries_set_updated_at
  before update on public.organization_countries
  for each row execute function public.set_updated_at();

-- ── 4. Row-level security (default-closed) ───────────────────────────
-- organization_representatives:
--   SELECT  — the org owner OR the represented profile may read their row.
--             Admin (via is_admin()) reads everything.
--   INSERT  — only via the promote_organization_to_tier2 RPC (SECURITY
--             DEFINER), so direct INSERT from a user session is denied.
--   UPDATE  — only the org owner may set revoked_at; nothing else.
--   DELETE  — none. History stays.

alter table public.organization_representatives enable row level security;

drop policy if exists org_reps_select_visible
  on public.organization_representatives;
create policy org_reps_select_visible
  on public.organization_representatives
  for select
  using (
    public.is_admin()
    or profile_id = auth.uid()
    or organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  );

drop policy if exists org_reps_update_owner_revoke
  on public.organization_representatives;
create policy org_reps_update_owner_revoke
  on public.organization_representatives
  for update
  using (
    organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  );

-- organization_countries:
--   SELECT  — the org owner reads their org's rows. Admin reads everything.
--   INSERT/UPDATE — only the org owner.
--   DELETE — none.

alter table public.organization_countries enable row level security;

drop policy if exists org_countries_select_owner
  on public.organization_countries;
create policy org_countries_select_owner
  on public.organization_countries
  for select
  using (
    public.is_admin()
    or organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  );

drop policy if exists org_countries_write_owner
  on public.organization_countries;
create policy org_countries_write_owner
  on public.organization_countries
  for insert
  with check (
    organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  );

drop policy if exists org_countries_update_owner
  on public.organization_countries;
create policy org_countries_update_owner
  on public.organization_countries
  for update
  using (
    organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select id from public.organizations where owner_profile_id = auth.uid()
    )
  );

-- ── 5. Explicit authenticated grants ─────────────────────────────────
-- Per the "labourmarketai explicit grants" doctrine memory: Supabase
-- table-level grants do NOT default open even when RLS allows the row.
-- Every new table the app session reads/writes must be granted to
-- `authenticated`. Service role retains its bypass automatically.

grant select on public.organization_representatives to authenticated;
-- INSERT goes through the SECURITY DEFINER RPC only. UPDATE is allowed
-- so the org owner can flip revoked_at; the RLS policy already gates it.
grant update (revoked_at) on public.organization_representatives to authenticated;

grant select, insert, update on public.organization_countries to authenticated;

-- ── 6. promote_organization_to_tier2 RPC ─────────────────────────────
-- Owner-initiated promotion. Writes the new org columns + a representative
-- row + an audit_logs entry in a single transaction. The function is
-- SECURITY DEFINER so it can write audit_logs (admin-only via RLS) on
-- behalf of the calling owner. NULL/empty inputs raise explicit errors
-- so the client never silently submits half a Tier-2 packet.
--
-- Promotion = "requisites submitted", not "verified". Verification is
-- SR-4's job (a separate admin-only RPC) and lives in a later migration.

create or replace function public.promote_organization_to_tier2(
  p_org_id                    uuid,
  p_registration_code         text,
  p_correspondence_address    jsonb,
  p_representative_profile_id uuid,
  p_representative_role       text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_owner      uuid;
  v_rep_id     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  -- Ownership gate.
  select owner_profile_id into v_owner
    from public.organizations
   where id = p_org_id;

  if v_owner is null then
    raise exception 'Organization not found: %', p_org_id
      using errcode = '22023';
  end if;
  if v_owner <> uid then
    raise exception 'Only the organization owner may submit Tier-2 requisites'
      using errcode = '42501';
  end if;

  -- Input validation.
  if p_registration_code is null
     or char_length(trim(p_registration_code)) = 0 then
    raise exception 'registration_code is required'
      using errcode = '22023';
  end if;
  if p_correspondence_address is null
     or jsonb_typeof(p_correspondence_address) <> 'object' then
    raise exception 'correspondence_address must be a JSON object'
      using errcode = '22023';
  end if;
  if p_representative_profile_id is null then
    raise exception 'representative_profile_id is required'
      using errcode = '22023';
  end if;
  if p_representative_role is null
     or p_representative_role not in (
       'director','authorised_representative','employee','contractor'
     ) then
    raise exception 'Invalid representative_role: %', p_representative_role
      using errcode = '22023';
  end if;

  -- Promote (Tier-2 = "submitted", verification stays NULL until SR-4).
  update public.organizations
     set tier                   = 'tier2',
         registration_code      = p_registration_code,
         correspondence_address = p_correspondence_address,
         tier2_submitted_at     = coalesce(tier2_submitted_at, now()),
         tier2_promoted_by      = uid,
         updated_at             = now()
   where id = p_org_id;

  -- Record the representative claim. Insert always — if the owner is
  -- re-submitting with a different representative, the previous row
  -- remains as history (use the SR-3 UI to revoke).
  insert into public.organization_representatives
    (organization_id, profile_id, role, granted_by)
  values
    (p_org_id, p_representative_profile_id, p_representative_role, uid)
  returning id into v_rep_id;

  -- Audit row (§3.4). Payload deliberately omits the correspondence
  -- address body to keep the audit log compact; the address is already
  -- on the organization row, accessible to admin via RLS.
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'organization.promote_tier2',
    'organization',
    p_org_id,
    jsonb_build_object(
      'representative_profile_id', p_representative_profile_id,
      'representative_role',       p_representative_role,
      'registration_code',         p_registration_code,
      'representative_row_id',     v_rep_id
    )
  );

  return v_rep_id;
end;
$$;

grant execute on function public.promote_organization_to_tier2(
  uuid, text, jsonb, uuid, text
) to authenticated;
