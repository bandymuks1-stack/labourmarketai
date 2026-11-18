-- @human-gate-approved — RED draft (replaces a SECURITY DEFINER read over worker documents); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261103130000_agency_pool_docs_readiness_live_roster_v1
--
-- ██ RED CLASS — human gate (SECURITY DEFINER body change on a consent-gated
-- ██ worker-documents aggregate). Draft; owner-channel apply only.
--
-- DEFECT: agency_pool_docs_readiness() (s6, 20260611170000) finds the
-- caller's pool only through the retired Model A tables — agencies.profile_id
-- and agency_workers (0 rows in production). Every real agency is a company
-- (Model B: company_type = 'staffing_agency' or a declared workforce role,
-- the ONE rule company_acts_as_agency) whose people are on company_workers,
-- so the document centre and the reports hub always counted 0 consented
-- workers for every real agency.
--
-- CHANGE: the pool is now the UNION of
--   (a) the active company_workers roster of the caller's agency company,
--       resolved by the canonical gate caller_agency_company_id()
--       (owns_company: profile owner or active owner/admin member, AND
--       company_acts_as_agency) — the same gate every other agency read uses;
--   (b) the legacy agency_workers pool, kept verbatim so nothing narrows.
-- Unchanged: signature, return columns, SECURITY DEFINER, STABLE,
-- search_path, grants (authenticated only), the worker's consent switch
-- (docs_aggregate_consent is true) and COUNTS ONLY — never a document row.
-- A non-agency caller still gets an empty set. No data change.
-- Rollback: supabase/rollbacks/20261103130000_agency_pool_docs_readiness_live_roster_v1.down.sql

create or replace function public.agency_pool_docs_readiness()
returns table (
  worker_id     uuid,
  docs_total    int,
  docs_valid    int,
  docs_expiring int,
  docs_attention int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_company uuid;
  v_agency  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_company := public.caller_agency_company_id();
  select a.id into v_agency from public.agencies a where a.profile_id = uid;
  if v_company is null and v_agency is null then
    return; -- not an agency → empty, never an error surface
  end if;

  return query
  with pool as (
    select cw.worker_id
      from public.company_workers cw
     where v_company is not null
       and cw.company_id = v_company
       and cw.status = 'active'
    union
    select aw.worker_id
      from public.agency_workers aw
     where v_agency is not null
       and aw.agency_id = v_agency
  )
  select w.id,
         count(d.id)::int,
         count(d.id) filter (
           where d.valid_until is not null and d.valid_until > now() + interval '30 days'
         )::int,
         count(d.id) filter (
           where d.valid_until is not null
             and d.valid_until > now()
             and d.valid_until <= now() + interval '30 days'
         )::int,
         count(d.id) filter (
           where d.valid_until is null or d.valid_until <= now()
         )::int
    from pool p
    join public.workers w on w.id = p.worker_id
    left join public.worker_documents d on d.worker_id = w.id
   where w.docs_aggregate_consent is true
   group by w.id;
end $$;

revoke all on function public.agency_pool_docs_readiness() from public;
revoke all on function public.agency_pool_docs_readiness() from anon;
grant execute on function public.agency_pool_docs_readiness() to authenticated;
