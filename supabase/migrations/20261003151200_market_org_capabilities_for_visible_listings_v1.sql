-- ============================================================================
-- 20261003151200 — org_capabilities_for_visible_listings_v1
--
-- RED by rule (new SECURITY DEFINER function + GRANT). needs-human-gate.
-- Apply only via Supabase MCP apply_migration after owner approval. Never db push.
-- @human-gate-approved
--
-- WHY. The universal marketplace shows the ACTOR kind of every row (person,
-- company, institution, agency, supplier ...). An organisation's kind is a
-- CAPABILITY (organization_roles, ORG-2) — and organization_roles is RLS-
-- scoped to members, so a foreign viewer could never see that "this listing
-- belongs to a training provider". Browser QA showed every organisation
-- listing as "type not stated" cross-organisation.
--
-- WHAT. ONE narrow, read-only function, keyed by LISTING ids the caller names:
--
--   org_capabilities_for_visible_listings_v1(p_listing_ids uuid[])
--     -> (listing_id uuid, role_slug text)
--
-- It returns the capability SLUGS of the organisation that owns a listing, and
-- ONLY for a listing that is itself discoverable to every signed-in member
-- today: status = 'active' and not expired — exactly the predicate of
-- marketplace_listings_select / market_index_v1. So an organisation is
-- reachable only through something it has already published; there is no
-- enumeration by organisation id, no listing of organisations, and an
-- organisation with only draft / paused / closed / expired listings yields
-- nothing.
--
-- DISCLOSED: listing_id (the caller supplied it) + a slug from the closed
-- vocabulary the UI maps (13 slugs of organization_role_types). NOT disclosed:
-- organisation id, name, members, owner, contacts, or any other column.
-- The organization_roles table policy is NOT touched.
--
-- ACL: authenticated only. anon cannot see market_index_v1, so it gets no
-- capability read either (explicit revoke; Supabase default privileges would
-- otherwise grant EXECUTE). auth.uid() NULL -> empty set.
--
-- ROLLBACK: supabase/rollbacks/20261003151200_market_org_capabilities_for_visible_listings_v1.down.sql
-- ============================================================================

begin;

create or replace function public.org_capabilities_for_visible_listings_v1(p_listing_ids uuid[])
returns table (listing_id uuid, role_slug text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, r.role_slug
    from public.marketplace_listings m
    join public.organization_roles r on r.organization_id = m.organization_id
   where auth.uid() is not null
     and m.id = any ((coalesce(p_listing_ids, '{}'::uuid[]))[1:200])
     and m.organization_id is not null
     -- the SAME visibility as marketplace_listings_select for a foreign viewer
     and m.status = 'active'
     and (m.expires_at is null or m.expires_at > now())
     -- the closed capability vocabulary the marketplace maps; nothing else
     and r.role_slug in (
       'training_provider',
       'workforce_provider', 'talent_provider', 'recruitment_partner',
       'supplier', 'logistics_provider', 'payroll_provider', 'verification_provider',
       'employer', 'client', 'contractor', 'subcontractor', 'project_operator'
     );
$$;

comment on function public.org_capabilities_for_visible_listings_v1(uuid[]) is
  'Capability slugs of the organisation owning each ACTIVE, non-expired listing named by the caller (max 200). Signed-in only; no org id, member or contact is returned; organization_roles RLS is unchanged.';

revoke all on function public.org_capabilities_for_visible_listings_v1(uuid[]) from public;
revoke all on function public.org_capabilities_for_visible_listings_v1(uuid[]) from anon;
grant execute on function public.org_capabilities_for_visible_listings_v1(uuid[]) to authenticated;

commit;
