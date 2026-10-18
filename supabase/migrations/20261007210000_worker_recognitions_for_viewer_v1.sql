-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT. OWNER DECISION (chat,
-- 2026-10-08): APPROVED with the NARROWER audience below - employer-side
-- visibility requires a CURRENT engagement / authorized organizational
-- relationship with the Person; the generic ability to view a Person
-- (discoverability alone) is NOT sufficient.
-- ============================================================================
-- 20261007210000 - worker_recognitions_for_viewer_v1 (SKL-9 downstream, company side)
--
-- WHY. `competency_recognitions` RLS lets only the subject, the managers of the
-- assessing organization and admin read a row (by design: an employer reads a
-- recognition only through what the subject chooses to show). Production proof
-- 2026-10-07 (rolled-back block): the employer that confirmed the learner's
-- work read 0 rows. So the company-side person page cannot show "recognised by
-- <institution>" without a new, narrow read.
--
-- WHAT. ONE read-only SECURITY DEFINER function. It returns, for a worker the
-- caller is the SUBJECT of, or that the caller's organization CURRENTLY
-- ENGAGES (the engagement branches of `can_view_worker`, reused one for one,
-- WITHOUT its discoverability branch), only the CURRENT, POSITIVE, UN-REVOKED
-- skill and profession recognitions, with the assessing institution's name
-- and validity. Engagement branches: active company_workers (company owner),
-- active agency_workers (agency owner), active company_worker_engagements
-- (owns_company), active engagement_contexts whose relationship grants worker
-- visibility (manages_organization), active project_worker_assignments
-- (can_manage_project). An ENDED engagement matches none of them.
-- It returns NO note, NO evidence entry ids, NO assessor person, NO
-- document_type rows (those answer formal requirements, not a profile).
-- Evidence class `assessor_recognition`: not worker-verified, not a score.
--
-- OWNER DECISION (resolved): audience = subject + current engagement. A viewer
-- whose only link is discoverability / generic can_view_worker sees 0 rows.
--
-- RLS on the table is UNCHANGED. anon: no execute. Not an admin override.
-- RISK / REVERSIBILITY. Additive function only. Rollback:
-- supabase/rollbacks/20261007210000_worker_recognitions_for_viewer_v1.down.sql
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.competency_recognitions') is null then raise exception 'competency_recognitions missing'; end if;
  if to_regprocedure('public.owns_worker(uuid)') is null or to_regprocedure('public.owns_company(uuid)') is null
     or to_regprocedure('public.manages_organization(uuid)') is null or to_regprocedure('public.can_manage_project(uuid)') is null
     or to_regprocedure('public.is_admin()') is null then raise exception 'engagement helpers missing'; end if;
end $$;

create or replace function public.worker_recognitions_for_viewer_v1(p_worker_id uuid)
returns table (
  id                       uuid,
  requirement_kind         text,
  requirement_key          text,
  requirement_country      text,
  assessor_organization_id uuid,
  assessor_name            text,
  valid_until              date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_worker_id is null then return; end if;
  -- Audience (owner decision 2026-10-08): the subject, an admin, or a viewer
  -- with a CURRENT engagement / authorized organizational relationship with the
  -- Person. NOT can_view_worker alone: its discoverability branch is excluded.
  if not (
    public.owns_worker(p_worker_id)
    or public.is_admin()
    or exists (
      select 1 from public.company_workers cw
        join public.companies c on c.id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.agency_workers aw
        join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.company_worker_engagements e
       where e.worker_id = p_worker_id and e.status = 'active' and public.owns_company(e.company_id)
    )
    or exists (
      select 1 from public.engagement_contexts ec
        join public.relationship_types rt on rt.slug = ec.relationship_slug and rt.grants_worker_visibility
        join public.workers x on x.id = p_worker_id and x.profile_id = ec.profile_id
       where ec.status = 'active' and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = p_worker_id and pwa.status = 'active' and pwa.ended_at is null
         and public.can_manage_project(pwa.project_id)
    )
  ) then
    return;
  end if;
  return query
    select r.id, r.requirement_kind, r.requirement_key, r.requirement_country,
           r.assessor_organization_id,
           coalesce(o.display_name, o.legal_name),
           r.valid_until
      from public.competency_recognitions r
      join public.workers w on w.profile_id = r.subject_profile_id and w.id = p_worker_id
      left join public.organizations o on o.id = r.assessor_organization_id
     where r.decision = 'recognised'
       and r.revoked_at is null
       and r.requirement_kind in ('skill', 'profession')
       and (r.valid_from is null or r.valid_from <= current_date)
       and (r.valid_until is null or r.valid_until >= current_date)
     order by r.requirement_kind, r.requirement_key
     limit 100;
end $$;

revoke all on function public.worker_recognitions_for_viewer_v1(uuid) from public, anon;
grant execute on function public.worker_recognitions_for_viewer_v1(uuid) to authenticated;

commit;

-- ROLLBACK
-- drop function if exists public.worker_recognitions_for_viewer_v1(uuid);
