-- ============================================================================
-- 20260802170000 — organization RLS hardening v1 (W9 slice 2).
--
-- SAFETY CLASS: RED. This migration creates SECURITY DEFINER functions, changes
-- GRANTs (REVOKE on a table) and REPLACES two existing RLS policies. It carries
-- NO `-- @human-gate-approved` marker: at the time of writing the owner has not
-- reviewed the human-gate package, and an agent must never self-approve.
-- The marker is added ONLY after an explicit owner decision on the PR.
--
-- PRODUCTION APPLY IS NOT APPROVED AND IS NOT REQUESTED BY MERGE.
-- Application deploy is not migration apply. Status after any merge:
-- PENDING_SEPARATE_OWNER_APPROVAL. Apply ONLY via Supabase MCP apply_migration
-- after that separate approval. Never `db push`.
--
-- ── PROBLEM 1 (P0) — every authenticated user can read every organization ────
--
-- 0013 line 327:  create policy organizations_select
--                   on public.organizations for select using (true);
-- 0013 line 409:  grant select on public.organizations to authenticated;
--
-- `using (true)` is not scoped by ownership, membership, or publication. Any
-- authenticated session can issue a direct PostgREST read —
--   GET /rest/v1/organizations?select=*
-- — and receive EVERY column of EVERY row: `owner_profile_id` (a bare
-- auth.users id, i.e. a cross-account identity handle), `legal_name`,
-- `vat_number`, `public_contact_email`, `public_contact_phone`, `description`,
-- `trust_score`, `legacy_company_id` and `legacy_agency_id`. This is not
-- limited to what the product's own queries select: the grant is on the table,
-- so the column list is the CALLER's choice.
--
-- This silently voids a documented product contract. 20260719120000
-- (business public profiles) is built on "default PRIVATE, opt in per org",
-- and its own header asserts (line 6) that "the owner-scoped RLS on
-- `organizations` is UNCHANGED". That assertion was FACTUALLY WRONG — the RLS
-- was `using (true)`, never owner-scoped. So the entire opt-in boundary that
-- migration built (SECURITY DEFINER readers filtered on
-- `public_profile_enabled = true`, returning an allowlisted column set) was
-- bypassable by simply querying the table directly. An org that never opted in
-- was as readable as one that did. `apps/web/lib/invitations/network.ts:182`
-- carries the same wrong assumption ("organizations expose only their public
-- display fields"), and `apps/web/lib/company/public-profile.ts:112` documents
-- an "owner-scoped SELECT on organizations" that did not exist.
--
-- PRODUCTION READ-ONLY PREFLIGHT (2026-08-02, counts only, no PII):
--   organizations rows ................................. 10
--   public_profile_enabled = true ....................... 0
--   public_profile_enabled = false ..................... 10
--   rows with vat_number ................................ 0
--   rows with public_contact_email / phone .......... 0 / 0
--   rows with owner_profile_id ......................... 10
--   rows with legal_name ................................ 6
--   pg_policies organizations_select qual ........... `true`   (P0 confirmed)
--   grants: authenticated = SELECT ; anon = (none)
-- So in production TODAY every authenticated user can read 10 private
-- organizations, including 10 owner ids and 6 legal names. Equally important:
-- because ZERO organizations are published, tightening this policy removes NO
-- reachable public surface in production.
--
-- ── PROBLEM 2 (P1, latent) — engagement_contexts self-write escalation ───────
--
-- 0013 line 334:
--   create policy engagement_contexts_write on public.engagement_contexts
--     for all using  (profile_id = auth.uid() or is_admin())
--             with check (profile_id = auth.uid() or is_admin());
--
-- The policy PERMITS a user to INSERT/UPDATE their own membership rows. Today
-- that is unreachable, but only by accident: `authenticated` holds `GRANT
-- SELECT` alone (0013 line 416), so the DML never gets past the grant layer.
-- The safety therefore rests on the ABSENCE of a grant rather than on the
-- policy — and a single future `grant insert on public.engagement_contexts`
-- (the kind of line that looks innocuous in an unrelated migration) would
-- immediately let any user INSERT themselves a `relationship_slug='manager'`
-- row and take `manages_organization()` authority over an arbitrary
-- organization. That helper gates the org journal stream, the membership list,
-- invitation sending, journal review, and organization-voice replies.
--
-- Verified before changing it: NO application code performs direct DML on
-- `engagement_contexts`. Every writer is a SECURITY DEFINER RPC (0013, 0032,
-- 0035, 20260530140000, 20260702140000, 20260712200000, 20260714161000,
-- 20260802160000 — 25 functions, 25 SECURITY DEFINER, 0 invoker). The only
-- non-RPC writers are service-role paths (seed script + e2e specs), which
-- bypass RLS entirely. The RPC-only model is real; this migration makes it
-- EXPLICIT instead of incidental.
--
-- ── SOLUTION ────────────────────────────────────────────────────────────────
--
-- 1. NEW helper `public.belongs_to_organization(org uuid)` — mirrors the
--    existing `manages_organization()` (0013 line 109) exactly, minus the
--    role filter: TRUE when the caller holds ANY ACTIVE engagement in the org.
--    Membership, not authority — an employee must be able to see the org they
--    work for without being able to manage it. `status = 'active'` means W9
--    slice 1 revocation (20260802160000) removes org visibility through the
--    canonical path, with no special case here.
--
-- 2. REPLACE `organizations_select` with owner / active-member / admin.
--
--    DELIBERATELY NOT INCLUDED: `or public_profile_enabled = true`. A row-level
--    policy cannot hide individual COLUMNS, so that arm would hand every
--    authenticated user the `legal_name`, `vat_number`, `owner_profile_id` and
--    `trust_score` of every PUBLISHED org — strictly worse than the existing
--    public path. The public contract already exists and already returns an
--    allowlisted projection: `get_public_business_profile_v1` /
--    `_services_v1` / `_listings_v1` (20260719120000), callable by anon and
--    authenticated. This migration makes those functions the ONLY public read
--    path, which is what their own header always claimed. No second public
--    organization system is created.
--
-- 3. NEW `public.search_organizations_directory_v1(p_term text)` — the one
--    genuinely cross-organization product surface, re-opened at minimum width.
--    `searchPeopleAndCompanies` (apps/web/lib/invitations/network.ts:185,
--    rendered at /dashboard/network) must be able to find an organization you
--    are NOT a member of — that is the point of an invitation directory. It
--    previously did so by leaning on `using (true)`.
--    The RPC returns EXACTLY the four fields that function already maps into
--    its `NetworkCompany` type: id, display name, organization_type, country.
--    `legal_name` is consumed ONLY as a display fallback and is coalesced
--    server-side, so it is never returned as its own field. No owner id, no
--    VAT, no contact details, no trust internals — none of which the caller
--    could ask for any more, because the projection is now fixed by the
--    function signature instead of chosen by the client.
--    Grant: `authenticated` only. NOT anon — this is a logged-in directory.
--
--    Every OTHER direct reader of `organizations` was checked and needs no
--    change, because each is already owner-, member-, or admin-scoped:
--      owned-organizations.ts:58 ........ .eq owner_profile_id = self
--      team-brigades.ts:343 ............. .eq owner_profile_id = self
--      planning.ts:255 .................. .eq owner_profile_id = self
--      workforce.ts:160 ................. .eq owner_profile_id = self
--      contact-disclosure-actions.ts:89 . .eq owner_profile_id = self
--      resolve-organization-id.ts:23 .... own company (companies.profile_id
--                                         is UNIQUE 1:1) → owner arm
--      org-members.ts:63 ................ own company (getOrgMembersData is
--                                         called with ownCompany.id) → owner
--      employer-company-context.ts:167 .. runs AFTER a workspace membership
--                                         gate → member arm
--      public-profile.ts:120 ............ owner/manager settings panel → owner
--                                         or member arm (this one was ALSO a
--                                         live contact-detail leak: it reads
--                                         public_contact_email/phone by org id)
--      matching-workbench.ts:578 ........ requireSuperadmin page → admin arm
--      team-match-input.ts:93 ........... only caller is matching-workbench
--                                         (admin) → admin arm
--
-- 4. HARDEN `engagement_contexts_write` to admin-only and REVOKE the DML
--    privileges explicitly. Belt and braces on purpose: after this, a future
--    stray `grant insert` can no longer create the escalation, because the
--    policy no longer permits a self-write either. `engagement_contexts_select`
--    is UNTOUCHED — reading your own memberships is not the problem.
--
-- ── WHAT IS DELIBERATELY NOT TOUCHED (W9 slice 2 scope) ─────────────────────
--   NO new table, NO new column, NO multi-org schema change;
--   NO change to `companies` 1:1, workspace executors, customer_requests /
--   booking / demand_shortlist organization_id, invitation role, team hierarchy;
--   NO W9 slice 3 UI; NO change to `engagement_contexts_select`;
--   NO change to `organizations_write_admin`; NO change to the mirror triggers
--   (`mirror_company_to_org` / `mirror_agency_to_org` / `ensure_org_owner_
--   engagement`) — all SECURITY DEFINER, owned by `postgres`, and neither table
--   sets FORCE ROW LEVEL SECURITY (verified in production), so no definer RPC
--   is subject to these policies;
--   NO DML of any kind — this migration changes zero rows.
--
-- ── W9 SLICE 1 (20260802160000) INTERACTION ────────────────────────────────
-- Slice 1 is merged but NOT applied to production. This migration must not
-- weaken it, and does not: `end_org_membership_v1`, the `status='ended'`
-- terminal state, the active-only rule inside `manages_organization()`, the
-- last-owner protection and the audit trail are all untouched. The new
-- `belongs_to_organization()` filters `status = 'active'` for the same reason,
-- so ending a membership now also ends that person's ability to read the
-- organization row — revocation gets STRONGER, never weaker. The two
-- migrations are order-independent (170000 adds no dependency on 160000), but
-- the tests exercise them together.
--
-- ROLLBACK: supabase/rollbacks/20260802170000_organization_rls_hardening_v1.down.sql
-- (restores the 0013 policies VERBATIM — including `using (true)`. That is a
-- deliberate, documented RE-OPENING of the P0 and must only ever be run as an
-- emergency measure.)
--
-- POST-APPLY VERIFICATION:
--   select qual from pg_policies
--    where tablename='organizations' and policyname='organizations_select';
--     -- expect owner / belongs_to_organization / is_admin, NOT `true`
--   select has_function_privilege('anon',
--     'public.search_organizations_directory_v1(text)','execute');   -- false
--   select has_function_privilege('authenticated',
--     'public.search_organizations_directory_v1(text)','execute');   -- true
--   select privilege_type from information_schema.role_table_grants
--    where table_name='engagement_contexts' and grantee='authenticated';
--     -- expect SELECT only
--   As an unrelated authenticated user:
--     GET /rest/v1/organizations?select=*        → 0 rows (not 403)
--   As the org owner:      same request          → own row only
--   As an active employee: same request          → that org visible
--   After end_org_membership_v1 on that employee → 0 rows
--   + APPLIED_LEDGER.md row.
-- ============================================================================

begin;

-- ── 1. Membership helper (mirrors manages_organization, without the role filter)
-- SECURITY DEFINER so the RLS policy below does not recurse into
-- engagement_contexts' own policies. Same shape, owner and hygiene as
-- `manages_organization()` (0013) — deliberately not a new pattern.
create or replace function public.belongs_to_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
  )
$$;

-- Standard SECURITY DEFINER hygiene (mirrors applied 20260722160000).
revoke all    on function public.belongs_to_organization(org uuid) from public;
revoke all    on function public.belongs_to_organization(org uuid) from anon;
grant  execute on function public.belongs_to_organization(org uuid) to authenticated;

-- ── 2. organizations SELECT: owner / active member / admin ───────────────────
-- Replaces 0013's `using (true)`. Note `organizations_write_admin` (0013, FOR
-- ALL) already gives admins SELECT; `is_admin()` is repeated here so that
-- narrowing the write policy later cannot silently remove admin read.
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select
  using (
    owner_profile_id = auth.uid()
    or public.belongs_to_organization(id)
    or public.is_admin()
  );

-- ── 3. Invitation directory: the one legitimate cross-org read ───────────────
-- Fixed, allowlisted projection. `legal_name` is coalesced into the display
-- name server-side and never returned as its own column.
create or replace function public.search_organizations_directory_v1(p_term text)
returns table (
  id                uuid,
  display_name      text,
  organization_type text,
  country           text
) language sql security definer set search_path = public stable as $$
  with t as (
    -- Strip PostgREST/LIKE metacharacters and bound the term, so the caller
    -- cannot turn the directory into a wildcard dump of every organization.
    select nullif(trim(regexp_replace(left(coalesce(p_term, ''), 80),
                                      '[%_,()\\]', ' ', 'g')), '') as term
  )
  select o.id,
         btrim(coalesce(nullif(btrim(o.display_name), ''),
                        nullif(btrim(o.legal_name), ''), '')) as display_name,
         o.organization_type,
         o.country
    from public.organizations o, t
   where t.term is not null
     and char_length(t.term) >= 2
     and (o.display_name ilike '%' || t.term || '%'
       or o.legal_name   ilike '%' || t.term || '%')
     and btrim(coalesce(o.display_name, o.legal_name, '')) <> ''
   order by o.display_name nulls last, o.legal_name nulls last, o.id
   limit 20;
$$;

revoke all    on function public.search_organizations_directory_v1(text) from public;
revoke all    on function public.search_organizations_directory_v1(text) from anon;
grant  execute on function public.search_organizations_directory_v1(text) to authenticated;

-- ── 4. engagement_contexts: RPC-only writes, stated explicitly ───────────────
-- The self-write arm is removed from the policy AND the DML privileges are
-- revoked. Either alone would close the hole today; both together mean a
-- future stray GRANT cannot re-open it.
drop policy if exists engagement_contexts_write on public.engagement_contexts;
create policy engagement_contexts_write on public.engagement_contexts for all
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, update, delete on public.engagement_contexts from authenticated;
revoke insert, update, delete on public.engagement_contexts from anon;

commit;
