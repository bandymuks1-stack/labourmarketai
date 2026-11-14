-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261111090000_search_organizations_directory_v2
--
-- Signed-in company search (owner decision 2026-11-11, option D2): companies that have not taken
-- over their profile are findable by signed-in users only, marked unconfirmed, and signing in never
-- opens private company data. No public page, no anon grant.
--
-- v2 replaces search_organizations_directory_v1 for the network search (/dashboard/network). Same
-- term rules (80 characters, at least 2, LIKE/PostgREST metacharacters stripped, no wildcard dump),
-- same 20-row cap. Differences:
--
--   * never an archived organization (v1 listed them);
--   * a claimed organization (company, agency, team, other) is listed as v1 lists it, as `confirmed`;
--   * an UNCLAIMED company is listed only when the name shown was recorded from a PUBLIC source
--     (public register, the company's own website, a published job ad), as not confirmed; its country
--     only when a public fact says the same; matched on that public name only, never on legal_name;
--   * it returns exactly id, display_name, organization_type, country, confirmed. No contact, no
--     identifier, no owner, no description, no slug.
--
-- v1 is CLOSED to clients here: it lists archived organizations and unclaimed companies under
-- privately sourced names without marking them, so a signed-in caller could still reach that wider
-- set by calling it directly. The app calls v2 and falls back to v1 only while v2 does not exist, so
-- deploying the app first and applying this file second leaves no gap.
--
-- SAFETY CLASS: RED (SECURITY DEFINER read + GRANT/REVOKE). Reads only; no row changes; no policy.
-- @plan-cache-proof: n/a — no index or extension is created
-- ROLLBACK: supabase/rollbacks/20261111090000_search_organizations_directory_v2.down.sql
-- ============================================================================

begin;

create or replace function public.search_organizations_directory_v2(p_term text)
returns table (
  id                uuid,
  display_name      text,
  organization_type text,
  country           text,
  confirmed         boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    -- The v1 term rules: strip LIKE/PostgREST metacharacters, bound the term.
    select nullif(trim(regexp_replace(left(coalesce(p_term, ''), 80), '[%_,()\\]', ' ', 'g')), '') as term
  )
  select o.id,
         case when o.claim_state = 'claimed'
              then btrim(coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), ''), ''))
              else btrim(o.display_name) end as display_name,
         o.organization_type,
         -- An unconfirmed company's country is shown only when a public fact says the same.
         case when o.claim_state = 'claimed' or exists (
                select 1 from public.organization_facts c
                 where c.organization_id = o.id and c.field = 'country'
                   and c.source_kind in ('public_register', 'company_website', 'job_posting')
                   and c.superseded_by is null
                   and lower(btrim(c.value #>> '{}')) = lower(btrim(o.country)))
              then o.country end as country,
         (o.claim_state = 'claimed') as confirmed
    from public.organizations o, t
   where t.term is not null
     and char_length(t.term) >= 2
     and o.archived_at is null
     and (
           (o.claim_state = 'claimed'
              and (o.display_name ilike '%' || t.term || '%' or o.legal_name ilike '%' || t.term || '%')
              and btrim(coalesce(o.display_name, o.legal_name, '')) <> '')
        or (o.claim_state <> 'claimed'
              and o.owner_profile_id is null
              and o.organization_type in ('company', 'agency', 'other')
              and o.display_name ilike '%' || t.term || '%'
              and btrim(coalesce(o.display_name, '')) <> ''
              and exists (
                select 1 from public.organization_facts f
                 where f.organization_id = o.id
                   and f.field in ('display_name', 'legal_name')
                   and f.source_kind in ('public_register', 'company_website', 'job_posting')
                   and f.superseded_by is null
                   -- The public fact must be the name actually shown: a later public
                   -- ingest never overwrites a privately sourced organizations column.
                   and lower(btrim(f.value #>> '{}')) = lower(btrim(o.display_name))))
     )
   order by (o.claim_state = 'claimed') desc, o.display_name nulls last, o.legal_name nulls last, o.id
   limit 20;
$$;

revoke all on function public.search_organizations_directory_v2(p_term text) from public, anon;
grant execute on function public.search_organizations_directory_v2(p_term text) to authenticated;

-- v1 closed to clients: v2 is the one signed-in directory read.
revoke execute on function public.search_organizations_directory_v1(p_term text) from public, anon, authenticated;

commit;
