-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval: NO OWNER
-- APPROVAL EXISTS FOR THIS FILE. The PR is draft + needs-human-gate and this
-- migration is NOT applied to production.
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
-- caller may ALREADY VIEW (`can_view_worker` - the same rule that gates the
-- person page and its skills; self, admin, discoverable-to-employer, active
-- work relationship), only the CURRENT, POSITIVE, UN-REVOKED skill and
-- profession recognitions, with the assessing institution's name and validity.
-- It returns NO note, NO evidence entry ids, NO assessor person, NO
-- document_type rows (those answer formal requirements, not a profile).
-- Evidence class `assessor_recognition`: not worker-verified, not a score.
--
-- DECISIONS FOR THE OWNER (why this is RED):
--   1. Is "can view the person" the right audience? The alternative is the
--      narrower "currently engages the person" (engagement_contexts) rule.
--   2. Recognition is a legally significant statement; showing it to a
--      discoverability-based viewer is a visibility decision.
--
-- RLS on the table is UNCHANGED. anon: no execute. Not an admin override.
-- RISK / REVERSIBILITY. Additive function only. Rollback:
-- supabase/rollbacks/20261007210000_worker_recognitions_for_viewer_v1.down.sql
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.competency_recognitions') is null then raise exception 'competency_recognitions missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'can_view_worker') then raise exception 'can_view_worker missing'; end if;
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
  -- the caller must already be allowed to see this person
  if p_worker_id is null or not public.can_view_worker(p_worker_id) then
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
