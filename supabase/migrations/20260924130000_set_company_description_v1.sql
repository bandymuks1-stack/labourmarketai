-- ============================================================================
-- 20260924130000 — set_company_description_v1
--
-- The public business page's description save. The app action
-- (apps/web/lib/company/description-actions.ts) wrote `companies.description`
-- with a direct UPDATE, a write path production's authorization model does not
-- grant, so every save ended in the generic error. This adds the ONE write path
-- the capability needs; nothing else changes.
--
-- RED by rule (SECURITY DEFINER + GRANT/REVOKE). Owner-approved 2026-09-24 to be
-- PREPARED as a draft; NOT to be applied until this concrete draft is reviewed.
--
-- @human-gate-approved
--   Acknowledged RED by route (SECURITY DEFINER + GRANT/REVOKE). NOT an
--   approval to apply. Changes no data by itself.
--
-- ----------------------------------------------------------------------------
-- THE BOUNDARY (owner decision 2026-09-24)
-- ----------------------------------------------------------------------------
--   * authenticated only; anon has no EXECUTE.
--   * the existing company-governance boundary: `owns_company(p_company_id)`
--     = the creator OR an ACTIVE owner/admin membership of the bound
--     organization — the same set the app's `manage-company-profile`
--     capability admits (lib/company/role-capabilities.ts: owner, admin).
--   * description only; at most 2000 characters (ORG_DESCRIPTION_MAX); an
--     empty value clears it.
--   * no broader companies UPDATE permission is granted to anyone.
--   * the existing SECURITY DEFINER trigger `mirror_company_to_org` carries
--     the value to `organizations.description` (the public page's source);
--     `enforce_company_verification_guard` is untouched by a description-only
--     update.
--   * the app keeps its stale-workspace refusal and capability check; it calls
--     this function first and falls back to its old direct UPDATE only while
--     the function is absent (42883 / PGRST202), so the app half can deploy
--     before this is applied.
--
-- ROLLBACK: supabase/rollbacks/20260924130000_set_company_description_v1.down.sql
--   (drops the function; the app falls back to today's behaviour).
-- ============================================================================

create or replace function public.set_company_description_v1(
  p_company_id uuid,
  p_description text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_company_id is null or not public.owns_company(p_company_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'description_too_long' using errcode = '22001';
  end if;

  update public.companies
     set description = nullif(p_description, '')
   where id = p_company_id;
end;
$$;

revoke all on function public.set_company_description_v1(uuid, text) from public;
revoke all on function public.set_company_description_v1(uuid, text) from anon;
grant execute on function public.set_company_description_v1(uuid, text) to authenticated;

comment on function public.set_company_description_v1(uuid, text) is
  'Company description save (public business page): owns_company (creator + active owner/admin) only, description only, max 2000; mirrored to organizations by mirror_company_to_org.';

-- ROLLBACK
--   drop function if exists public.set_company_description_v1(uuid, text);
