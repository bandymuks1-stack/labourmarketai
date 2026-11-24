-- @human-gate-approved
-- ============================================================================
-- HUMAN GATE SATISFIED — owner approval 2026-08-27, in-session and explicit:
--   "OWNER APPROVAL — #1290 + #1296 … I approve proceeding with BOTH prepared
--    owner-gated changes … This approval applies only to the exact
--    reviewed/tested scopes you described. Do NOT broaden either migration
--    while using this authorization."
--
-- The annotation above is an ACKNOWLEDGEMENT of that approval, not a
-- self-grant: it lets CI record the three RED findings below as reviewed and
-- accepted rather than unexamined. The findings themselves are unchanged and
-- are enumerated in the SAFETY CLASS block. Nothing in this file was widened
-- after approval — the scope is byte-identical to the reviewed version except
-- for this header and the migration-count baselines.
--
-- Apply ONLY via Supabase MCP apply_migration. Never `db push`.
--
-- 20260827050000 — organization roles v1 (multi-capability foundation).
--
-- ── WHY (owner decision 2026-08-27: path B, minimum safe slice) ─────────────
-- An education institution cannot currently register honestly. Production:
--
--   organizations.organization_type  text NOT NULL
--     CHECK (organization_type in ('company','agency','team','other'))
--   -- 10 'company', 3 'agency'. No education value exists.
--
-- The owner REFUSED the cheap fix (adding 'education' as a fifth mutually
-- exclusive value), and that refusal matches doctrine already on record:
--
--   * ORGANIZATION_ROLE_ORCHESTRATION_V1 (binding, owner text 2026-07-28):
--     "Viena organizacija gali turėti kelis vaidmenis vienu metu." One
--     organization holds MANY roles at once — a single-valued column cannot
--     express that. `lib/product-gate/organization-roles.ts` already records
--     the gap: verdict `single_type_directory`, addingRoleNeedsMigration=true.
--   * PLATFORM_DOCTRINE §10 (Lego architecture): a taxonomy is a slug registry,
--     "never a hardcoded enum for anything extensible". The closed CHECK is
--     itself the violation being repaired here.
--   * The same doctrine's FUTURE-PROOF rule: "Pakanka naujai organizacijai
--     priskirti reikiamus vaidmenis" — adding a role must be DATA, not a
--     migration. After this lands, it is.
--
-- ── WHY NOT A PARALLEL STRUCTURE (doctrine §2 canonical check) ──────────────
-- The canonical ORG family is `organizations` + `engagement_contexts` +
-- `relationship_types`. This extends that family with the SAME idiom
-- `relationship_types` already uses: a slug registry + a link table.
--
--   relationship_types (slug, category)  ← person↔org relationship vocabulary
--   organization_role_types (slug, category)  ← org CAPABILITY vocabulary
--
-- It does NOT introduce a second role vocabulary: the seeded slugs are exactly
-- ORGANIZATION_ROLES from `lib/product-gate/organization-roles.ts`, which is
-- the one owner-locked list. `training_provider` is the education role — this
-- migration invents no new name for it.
--
-- The institution↔LEARNER link needs NOTHING here: it is an engagement_contexts
-- row with relationship_slug='student', a slug seeded since 0002. Making it
-- writable is PR #1290's job, not this one.
--
-- ── COMPATIBILITY ──────────────────────────────────────────────────────────
-- `organizations.organization_type` is NOT dropped, NOT narrowed and NOT
-- changed. Every existing row stays valid and every existing reader keeps
-- working. The backfill below gives current organizations their equivalent
-- role so the new read path returns the same answer as the old column on day
-- one; the TS read layer falls back to the column when no role row exists, so
-- the two can coexist indefinitely.
--
-- ── SAFETY CLASS: RED ──────────────────────────────────────────────────────
-- Not because anything here is destructive — nothing is dropped, no row is
-- updated or deleted, no policy is altered, no guarantee is removed — but
-- because the envelope classes these as RED and RED is absolute:
--   * GRANT (detector h) — a new table needs explicit grants; `pg_default_acl`
--     for schema public is EMPTY on this project, so a new table would
--     otherwise be unreadable by `authenticated`.
--   * CREATE FUNCTION ... SECURITY DEFINER (detector g) — the writer RPC.
--   * `using (true)` on the vocabulary table (detector e) — deliberate and
--     identical to the existing `relationship_types_select` precedent: a
--     vocabulary of role NAMES is not private data. The instance table is
--     scoped, not permissive (see organization_roles_select).
-- CREATE POLICY on a new table is GREEN by the classifier; it is listed here
-- for the reviewer's completeness, not as a risk.
--
-- ROLLBACK: supabase/rollbacks/20260827050000_organization_roles_v1.down.sql
-- ============================================================================

-- ── 1. The capability vocabulary (registry, not a constraint) ───────────────
create table if not exists public.organization_role_types (
  slug        text primary key,
  category    text not null,
  created_at  timestamptz not null default now()
);

comment on table public.organization_role_types is
  'Organization CAPABILITY vocabulary (ORGANIZATION_ROLE_ORCHESTRATION_V1 §2). '
  'Adding a role is an INSERT here — never a migration, never a new enum.';

-- ── 2. The assignments — many roles per organization ────────────────────────
create table if not exists public.organization_roles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role_slug        text not null references public.organization_role_types(slug),
  granted_at       timestamptz not null default now(),
  unique (organization_id, role_slug)
);

create index if not exists organization_roles_org_idx
  on public.organization_roles (organization_id);
create index if not exists organization_roles_slug_idx
  on public.organization_roles (role_slug);

comment on table public.organization_roles is
  'One organization holds MANY capabilities at once. Replaces the expressive '
  'role of the single-valued organizations.organization_type, which is kept '
  'for compatibility and is no longer the only answer.';

-- ── 3. Seed: exactly ORGANIZATION_ROLES, the one owner-locked vocabulary ────
insert into public.organization_role_types (slug, category) values
  ('employer',              'demand'),
  ('client',                'demand'),
  ('workforce_provider',    'supply'),
  ('talent_provider',       'supply'),
  ('recruitment_partner',   'supply'),
  ('training_provider',     'education'),
  ('payroll_provider',      'service'),
  ('logistics_provider',    'service'),
  ('verification_provider', 'service'),
  ('project_operator',      'project')
on conflict (slug) do nothing;

-- ── 4. Backfill — the new path must answer what the old column answers ──────
-- Deliberately conservative. Only the two mappings that are defensible from
-- the column's own meaning are written; 'team' and 'other' get NO role,
-- because a brigade and an unclassified organization are not orchestration
-- capabilities and inventing one for them would be fabricated data. (Neither
-- value occurs in production today: 10 'company', 3 'agency'.)
insert into public.organization_roles (organization_id, role_slug)
select o.id, 'employer' from public.organizations o
where o.organization_type = 'company'
on conflict (organization_id, role_slug) do nothing;

insert into public.organization_roles (organization_id, role_slug)
select o.id, 'workforce_provider' from public.organizations o
where o.organization_type = 'agency'
on conflict (organization_id, role_slug) do nothing;

-- ── 5. RLS ─────────────────────────────────────────────────────────────────
alter table public.organization_role_types enable row level security;
alter table public.organization_roles      enable row level security;

-- Vocabulary: readable by everyone, exactly like relationship_types_select.
-- A list of role NAMES carries no data subject.
create policy organization_role_types_select on public.organization_role_types
  for select using (true);
create policy organization_role_types_write on public.organization_role_types
  for all using (is_admin()) with check (is_admin());

-- Assignments: readable by exactly whoever may already read the organization
-- itself (mirrors organizations_select). No widened disclosure.
create policy organization_roles_select on public.organization_roles
  for select using (
    is_admin()
    or exists (
      select 1 from public.organizations o
      where o.id = organization_roles.organization_id
        and (o.owner_profile_id = auth.uid() or public.belongs_to_organization(o.id))
    )
  );
create policy organization_roles_write on public.organization_roles
  for all using (is_admin()) with check (is_admin());

-- ── 6. Grants — EXPLICIT ONLY, so local and production agree ────────────────
-- REVOKE FIRST, and this is not ceremony. Measured on a local `db reset`
-- 2026-08-27, BEFORE these revokes existed: the new table came up with
-- `anon` holding INSERT, SELECT, UPDATE, DELETE and TRUNCATE, and
-- `authenticated` holding the same. Production would grant NONE of that —
-- `pg_default_acl` for schema public is EMPTY there, while the local stack
-- still carries Supabase's stock ALTER DEFAULT PRIVILEGES.
--
-- Left alone, the two environments disagree about who may write this table.
-- RLS still refuses the write in both (the policies below are scoped, and
-- `is_admin()` is false for anon), so nothing is exposed — but a local test
-- would be exercising a privilege surface production does not have, which is
-- precisely the reproducibility trap 20260722160000 closed for FUNCTIONS.
-- This closes it for these TABLES: after the revoke, both environments hold
-- exactly what the next two lines grant, and nothing else.
revoke all on public.organization_role_types from public, anon, authenticated, service_role;
revoke all on public.organization_roles      from public, anon, authenticated, service_role;

-- Read-only for authenticated; writes go through the RPC below, exactly like
-- engagement_contexts (authenticated holds SELECT only there too).
grant select on public.organization_role_types to authenticated;
grant select on public.organization_roles      to authenticated;

-- ── 7. The writer — an organization OWNER declares its own capability ───────
-- ADDITIVE ONLY: it can add a role, never remove one. Removal is a separate
-- decision with its own consequences (an organization that stops being an
-- employer has live engagements), and the minimum slice does not guess at it.
-- No DELETE and no UPDATE of data anywhere in this migration.
create or replace function public.add_organization_role_v1(
  p_organization_id uuid,
  p_role_slug       text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Only the organization's OWNER (or an admin) may declare what it is.
  -- Membership is deliberately NOT enough: a capability is an identity claim.
  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id
      and (o.owner_profile_id = uid or public.is_admin())
  ) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  -- The slug must exist in the registry. This is what keeps the vocabulary
  -- one list instead of free text.
  if p_role_slug is null or not exists (
    select 1 from public.organization_role_types t where t.slug = p_role_slug
  ) then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  -- Idempotent: declaring the same capability twice returns the same row.
  select r.id into v_id from public.organization_roles r
  where r.organization_id = p_organization_id and r.role_slug = p_role_slug;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.organization_roles (organization_id, role_slug)
  values (p_organization_id, p_role_slug)
  returning id into v_id;

  return v_id;
end;
$function$;

-- Reachable by a signed-in user only. A SECURITY DEFINER function bypasses
-- RLS, so `anon` is revoked EXPLICITLY rather than left to default privileges:
-- this project's `pg_default_acl` for schema public is empty, and a local
-- `db reset` would otherwise leave the anon grant in a different state than
-- production (the reproducibility trap closed by 20260722160000).
revoke all on function public.add_organization_role_v1(uuid, text) from public, anon;
grant execute on function public.add_organization_role_v1(uuid, text) to authenticated;

-- ── POST-APPLY VERIFICATION (run as owner, record the output) ──────────────
--   select count(*) from public.organization_role_types;          -- expect 10
--   select role_slug, count(*) from public.organization_roles
--     group by 1 order by 1;                 -- expect employer 10, workforce_provider 3
--   select organization_type, count(*) from public.organizations
--     group by 1;                            -- unchanged: company 10, agency 3
