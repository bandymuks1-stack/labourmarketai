-- @human-gate-approved
-- 20261011160000_absence_authority_engagement_v1
--
-- RED (needs-human-gate): a new SECURITY DEFINER predicate + one RLS policy
-- and one view re-expressed with it + one SECURITY DEFINER RPC replaced.
-- Apply via Supabase MCP `apply_migration` after owner approval; never
-- `supabase db push`.
--
-- DEFECT (walk 2026-10-11, NL owner + PL worker who joined by invitation):
--   A "join as employee" invitation writes ONLY engagement_contexts. Since
--   #2187 / #2270 / #2272 that person is on the People page, in the planner
--   and in their own calendar — but the employer can still neither SEE their
--   absence requests nor approve them, and never sees their approved leave in
--   scheduling: all three ask `caller_manages_worker(worker)`, which knows the
--   legacy rosters (company_workers / agency_workers) and booking engagements
--   only. The employer plans a person whose leave is invisible to them.
--
-- WHY NOT WIDEN caller_manages_worker ITSELF: it is also the unbound third
--   branch of work_task_assignee_eligible_v1 and set_project_responsible_v1.
--   An org-unbound engagement branch there would let a caller who manages
--   organizations A and B treat A's employee as eligible in B — the
--   sibling-organization leak 20260808150000 refused. Task eligibility and
--   project-responsible ALREADY have their own org-bound engagement_contexts
--   branch, so they need nothing. Only the absence surfaces are blind.
--
-- FIX: `caller_manages_worker_absence(worker)` =
--      caller_manages_worker(worker)                       -- unchanged truth
--   OR an ACTIVE employee / collaborator / freelancer engagement of that
--      worker's profile in an organization the caller manages
--      (manages_organization — the same authority and the same three slugs as
--      work_plan_worker_in_scope_v1, 20261007140000).
--   An absence belongs to the worker, not to one organization, so an employer
--   who actually employs the person may know when they are away. Nothing else
--   is disclosed: the policy still admits managers to status='requested' rows
--   only, the scheduling view still projects no reason/type columns.
--
-- Touches exactly: worker_absences_select (policy), worker_absence_scheduling
-- (view, same columns/order), review_worker_absence_v1 (same signature, one
-- call swapped). caller_manages_worker and its other callers are untouched.
--
-- Rollback: supabase/rollbacks/20261011160000_absence_authority_engagement_v1.down.sql

begin;

create or replace function public.caller_manages_worker_absence(p_worker_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.caller_manages_worker(p_worker_id)
      or exists (
    select 1
      from public.engagement_contexts ec
      join public.workers w on w.profile_id = ec.profile_id
     where w.id = p_worker_id
       and ec.status = 'active'
       and ec.relationship_slug in ('employee', 'collaborator', 'freelancer')
       and public.manages_organization(ec.organization_id)
  );
$function$;

revoke all on function public.caller_manages_worker_absence(uuid) from public;
revoke all on function public.caller_manages_worker_absence(uuid) from anon;
grant execute on function public.caller_manages_worker_absence(uuid) to authenticated;

alter policy worker_absences_select on public.worker_absences
  using (
    (exists (
      select 1 from public.workers w
       where w.id = worker_absences.worker_id and w.profile_id = auth.uid()))
    or (public.caller_manages_worker_absence(worker_id) and status = 'requested')
    or public.is_admin()
  );

create or replace view public.worker_absence_scheduling as
  select a.id,
         a.worker_id,
         a.start_date,
         a.end_date,
         a.half_day,
         a.status
    from public.worker_absences a
   where a.status = 'approved'
     and (public.caller_manages_worker_absence(a.worker_id)
          or public.is_admin()
          or exists (
            select 1 from public.workers w
             where w.id = a.worker_id and w.profile_id = auth.uid()));

create or replace function public.review_worker_absence_v1(p_absence_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_worker uuid;
  v_status text;
begin
  select worker_id, status into v_worker, v_status from public.worker_absences where id = p_absence_id;
  if v_worker is null then
    raise exception 'absence not found';
  end if;
  if not public.caller_manages_worker_absence(v_worker) then
    raise exception 'not authorized to review this absence';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;
  if v_status <> 'requested' then
    raise exception 'only a requested absence can be reviewed';
  end if;
  update public.worker_absences
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_absence_id;
end;
$function$;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261011160000_absence_authority_engagement_v1.down.sql
