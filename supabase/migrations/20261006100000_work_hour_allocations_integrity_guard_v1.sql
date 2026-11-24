-- @human-gate-approved
-- ============================================================================
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. RED by construction (ALTER POLICY on
-- two live policies, a new trigger on a live table). The annotation above states
-- the ROUTE (draft PR + needs-human-gate, owner-channel apply via Supabase MCP
-- apply_migration). NO OWNER APPROVAL EXISTS FOR THIS FILE YET. It must not be
-- applied to production and CI must not auto-merge it.
--
-- 20261006100000 - work_hour_allocations INTEGRITY GUARD v1
--
-- THE DEFECT (audit 2026-10-06, finding A1; reproduced on the repo's replayed
-- schema, production state UNKNOWN until the owner runs the read-only check in
-- the PR body). public.work_hour_allocations is the organization's hour ledger.
-- Its policies let an end user write ANY column of a row they are allowed to
-- touch:
--
--   insert  : entered_by = auth.uid()
--             AND (manages_organization(organization_id) OR owns_worker(worker_id))
--   update  : (manages_organization(organization_id) OR owns_worker(worker_id)),
--             and the same predicate as WITH CHECK
--
-- Consequences, each a PostgREST call away (the application never does them, a
-- direct client can):
--   1. status: the CHECK admits 'approved'/'rejected'/'submitted' and nothing
--      stops an end user choosing them. The readers ship 'approved' as
--      approvedHours (work-intelligence.ts, verified-cv.ts), so a self-written
--      'approved' row is presented as an approved fact in the CV ledger.
--      Approval is NOT a property of the row: 20260829140000 says "APPROVAL stays
--      timesheets + timesheet_events ... no approved_by/approved_at columns". The
--      status values exist for a future privileged approval pipeline.
--   2. tenant forgery: the worker branch is `owns_worker(worker_id)` with NO
--      relation to the organization named in organization_id, so a worker can
--      insert hours into ANY organization's ledger.
--   3. tenant move: 20260829140000's own comment on the update policy says "the
--      row must stay inside the same organization - an update may never move a
--      fact into another tenant". The policy does not say that (a worker owning
--      the row can rewrite organization_id) - the stated intent was never
--      enforced.
--
-- INTENT RECOVERED (not invented): who may record = a manager of the
-- organization (the operator entering for the crew) OR the worker for their OWN
-- hours; entered_by is forced to the caller; no approval columns; a fact never
-- moves tenant. This migration enforces exactly that, using the repo's own
-- closure pattern (20261003151300 integrity doors: a SECURITY INVOKER BEFORE
-- trigger that restricts only the END-USER roles) and the repo's own relation
-- predicate (is_org_member_or_engaged_v1, the work_objects RLS predicate).
--
-- WHAT CHANGES
--   * ALTER POLICY work_hour_allocations_insert / _update: the WORKER branch now
--     additionally requires the caller to be an active member of, or engaged
--     with, the organization (is_org_member_or_engaged_v1). The MANAGER branch is
--     unchanged.
--   * work_hour_allocations_integrity_guard_v1 (BEFORE INSERT OR UPDATE):
--     for the end-user roles `authenticated`/`anon` only -
--       INSERT: status must be 'recorded'.
--       UPDATE: status, organization_id, worker_id, entered_by are immutable.
--     Superseding a row (correction_of / superseded_by) and every other column
--     stay writable exactly as before, so recordCorrectionAction is untouched.
--     The service role, owner-run SECURITY DEFINER pipelines and migrations
--     (current_user not in authenticated/anon, or auth.uid() null) are untouched
--     - the legitimate place for a future approval pipeline.
--
-- WHAT DOES NOT CHANGE (preserved workflows, each proven in the db-proof):
--   * recordAllocationAction and confirmTimesheetImportAction (manager path, no
--     status sent -> default 'recorded');
--   * recordCorrectionAction (insert recorded + set correction_of/superseded_by);
--   * timesheet_compute_lines_v1 and every reader (read path untouched);
--   * existing rows (no data migration; the check below is owner-run, read-only).
--
-- HONEST LIMITS
--   * The MANAGER branch still lets a manager of organization O record hours for
--     any worker_id on an object of O. 20261003150700's header records this as a
--     known gap ("work_hour_allocations (no assignment precondition exists)").
--     Adding a roster/assignment precondition belongs to the roster-store
--     consolidation (the booked-worker engagement gap makes any single store a
--     wrong predicate today); it is deliberately NOT guessed here.
--   * work_object_id is not required to belong to organization_id at the row
--     level; timesheet_compute_lines_v1 already filters on wo.organization_id.
--   * Rows ALREADY in production with status <> 'recorded' (if any) are not
--     touched; read-only audit for the owner:
--       select status, count(*) from public.work_hour_allocations group by 1;
--       select count(*) from public.work_hour_allocations a
--        where not exists (select 1 from public.work_objects o
--                           where o.id = a.work_object_id
--                             and o.organization_id = a.organization_id);
--
-- ROLLBACK: supabase/rollbacks/20261006100000_work_hour_allocations_integrity_guard_v1.down.sql
-- ============================================================================

begin;

-- 1. Worker branch tied to the organization the hours are written into.
alter policy work_hour_allocations_insert
  on public.work_hour_allocations
  with check (
    entered_by = auth.uid()
    and (
      public.manages_organization(organization_id)
      or (
        public.owns_worker(worker_id)
        and public.is_org_member_or_engaged_v1(organization_id)
      )
    )
  );

alter policy work_hour_allocations_update
  on public.work_hour_allocations
  using (
    public.manages_organization(organization_id)
    or public.owns_worker(worker_id)
  )
  with check (
    public.manages_organization(organization_id)
    or (
      public.owns_worker(worker_id)
      and public.is_org_member_or_engaged_v1(organization_id)
    )
  );

-- 2. The integrity guard (SECURITY INVOKER on purpose: current_user is the real
--    caller, so definer pipelines and the service role pass through untouched).
create or replace function public.work_hour_allocations_integrity_guard_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'recorded' then
      raise exception
        'work_hour_allocations: an end-user write may only record hours (status recorded); approval belongs to the timesheet decision'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'work_hour_allocations: status is not an end-user field'
      using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'work_hour_allocations: a fact may never move into another organization'
      using errcode = '42501';
  end if;
  if new.worker_id is distinct from old.worker_id then
    raise exception 'work_hour_allocations: the worker a fact is about is immutable'
      using errcode = '42501';
  end if;
  if new.entered_by is distinct from old.entered_by then
    raise exception 'work_hour_allocations: entered_by is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.work_hour_allocations_integrity_guard_v1() from public, anon, authenticated;

drop trigger if exists work_hour_allocations_integrity_guard on public.work_hour_allocations;
create trigger work_hour_allocations_integrity_guard
  before insert or update on public.work_hour_allocations
  for each row execute function public.work_hour_allocations_integrity_guard_v1();

commit;
