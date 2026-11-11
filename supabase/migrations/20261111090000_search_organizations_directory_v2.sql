-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261111090000_search_organizations_directory_v2
--
-- Public company search (owner decision 2026-11-11, partner registration). The same search as
-- search_organizations_directory_v1 (same term rules, same 20-row cap, no wildcard dump), for
-- visitors who are signed out too, with two differences that make it safe to publish:
--
--   * it lists a company only when it may be public:
--       - a CLAIMED company that opted in to its public profile (public_profile_enabled + public_slug,
--         the get_public_business_profile_v1 rule), shown as confirmed with its profile link;
--       - an UNCLAIMED company whose name was recorded from a PUBLIC source (public register, the
--         company's own website, a published job ad), shown as unconfirmed, with no link;
--     never an archived organization, never a team;
--   * it returns only id, name, type, country, the public slug and whether it is confirmed:
--     no contacts, no identifiers, no owner, no description.
--
-- v1 is unchanged: its signed-in callers keep their wider match.
--
-- SAFETY CLASS: RED (SECURITY DEFINER read granted to anon). Reads only; no row changes; no policy.
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
  public_slug       text,
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
         btrim(o.display_name) as display_name,
         o.organization_type,
         -- An unconfirmed company's country is shown only when a public fact says the same.
         case when o.claim_state = 'claimed' or exists (
                select 1 from public.organization_facts c
                 where c.organization_id = o.id and c.field = 'country'
                   and c.source_kind in ('public_register', 'company_website', 'job_posting')
                   and c.superseded_by is null
                   and lower(btrim(c.value #>> '{}')) = lower(btrim(o.country)))
              then o.country end as country,
         case when o.claim_state = 'claimed' then o.public_slug end as public_slug,
         (o.claim_state = 'claimed') as confirmed
    from public.organizations o, t
   where t.term is not null
     and char_length(t.term) >= 2
     and o.display_name ilike '%' || t.term || '%'
     and btrim(coalesce(o.display_name, '')) <> ''
     and o.archived_at is null
     and o.organization_type in ('company', 'agency', 'other')
     and (
           (o.claim_state = 'claimed' and o.public_profile_enabled = true and o.public_slug is not null)
        or (o.claim_state <> 'claimed' and o.owner_profile_id is null and exists (
              select 1 from public.organization_facts f
               where f.organization_id = o.id
                 and f.field in ('display_name', 'legal_name')
                 and f.source_kind in ('public_register', 'company_website', 'job_posting')
                 and f.superseded_by is null
                 -- The public fact must be the name actually shown: a later public
                 -- ingest never overwrites a privately sourced organizations column.
                 and lower(btrim(f.value #>> '{}')) = lower(btrim(o.display_name))))
     )
   order by (o.claim_state = 'claimed') desc, o.display_name, o.id
   limit 20;
$$;

revoke all on function public.search_organizations_directory_v2(p_term text) from public;
grant execute on function public.search_organizations_directory_v2(p_term text) to anon, authenticated;

commit;
