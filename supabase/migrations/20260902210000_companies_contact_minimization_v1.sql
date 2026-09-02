-- ============================================================================
-- 20260902210000 — companies_contact_minimization_v1
--
-- FINAL COMPLETION Train K2, finding K2-1 (P1, 2026-09-02). RED by rule
-- (privilege change + SECURITY DEFINER). Ships DRAFT + needs-human-gate; the
-- app-side reads in the same PR fall back to today's behaviour until applied.
--
-- @human-gate-approved
--   Acknowledged RED by route (GRANT/REVOKE + SECURITY DEFINER). NOT an
--   approval. Changes no data; narrows what a signed-in person can SELECT.
--
-- ----------------------------------------------------------------------------
-- THE FINDING (production probe, three bounded identities)
-- ----------------------------------------------------------------------------
--   companies_select is `auth.uid() is not null`: every signed-in person can
--   read every company row, including contact_email, contact_phone, address,
--   registration_code, requester_role, verification_note, requested_at. The
--   product's contact model discloses contacts only by consent
--   (contact_disclosure_requests); this policy sidestepped it for companies.
--   Not reachable anonymously (no anon grant — K1 PASS).
--
-- ----------------------------------------------------------------------------
-- THE FIX — column-level, additive in behaviour for everyone legitimate
-- ----------------------------------------------------------------------------
--   • Row visibility for discovery is unchanged (a worker may still see a
--     company's name, country, type, verification status, website,
--     description — the columns the joins `companies(display_name, legal_name)`
--     and the public profile need).
--   • The PRIVATE columns leave the authenticated table grant. Two SECURITY
--     DEFINER readers return full rows to exactly the people who could
--     already act on them: the OWNER (profile_id = auth.uid()) and an ADMIN.
--   • Writes are untouched: the setup RPCs are already SECURITY DEFINER; the
--     owner/admin UPDATE + DELETE policies stay as they are.
--
-- ROLLBACK: supabase/rollbacks/20260902210000_companies_contact_minimization_v1.down.sql
--   (restores the full table SELECT grant, drops the two readers).
-- ============================================================================

-- 1. Narrow the authenticated SELECT grant to the discovery columns.
revoke select on public.companies from authenticated;
grant select (
  id, profile_id, legal_name, display_name, company_type, country, website,
  description, verification_status, trust_score, vat_number, created_at, updated_at
) on public.companies to authenticated;

-- 2. Owner reader — the caller's own companies, every column.
create or replace function public.list_own_companies_private_v1()
returns setof public.companies
language sql stable security definer set search_path = public, pg_temp as $$
  select c.*
    from public.companies c
   where c.profile_id = auth.uid()
   order by c.created_at asc;
$$;
revoke all on function public.list_own_companies_private_v1() from public;
revoke all on function public.list_own_companies_private_v1() from anon;
grant execute on function public.list_own_companies_private_v1() to authenticated;

-- 3. Admin reader — every company, every column, admins only (refuses otherwise).
create or replace function public.admin_list_companies_private_v1()
returns setof public.companies
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return query
    select c.* from public.companies c
     order by c.requested_at desc nulls last, c.created_at desc;
end;
$$;
revoke all on function public.admin_list_companies_private_v1() from public;
revoke all on function public.admin_list_companies_private_v1() from anon;
grant execute on function public.admin_list_companies_private_v1() to authenticated;

comment on function public.list_own_companies_private_v1() is
  'K2-1: the owner''s own company rows with the private contact columns (column grant to authenticated no longer includes them).';
comment on function public.admin_list_companies_private_v1() is
  'K2-1: every company row with private columns, admins only.';

-- ROLLBACK
--   grant select on public.companies to authenticated;
--   drop function if exists public.admin_list_companies_private_v1();
--   drop function if exists public.list_own_companies_private_v1();
