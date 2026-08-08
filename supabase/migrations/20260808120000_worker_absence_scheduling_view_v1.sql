-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260808120000 — worker absence scheduling view v1 (W12 employer privacy,
-- defence in depth).
--
-- PROBLEM. #1087 shipped the employer "who is unavailable" projection and kept
-- the private fields out of it by NOT SELECTING them: the application asks for
-- `id, worker_id, start_date, end_date, status` and never for `note` (500
-- chars of the worker's own free text) or `absence_type` (whose allowed values
-- include `sickness` — health information).
--
-- That is correct application-level minimisation and it is guard-tested. It is
-- not a database guarantee. `worker_absences` RLS is ROW-level: an employer
-- admitted by `caller_manages_worker()` is admitted to the WHOLE ROW, so any
-- future query — a `select *`, a new feature, a hand-written report — reaches
-- the reason. Proven against a real database, not inferred:
--
--     authorized employer, real JWT claim:
--       select note, absence_type from worker_absences where status='approved'
--       -> 'PRIVATE-REASON do not disclose to employer' / 'sickness'
--
-- OWNER DIRECTION. General employer planning access must not expose private
-- absence details; an appropriately authorized role may still see what it
-- needs to REVIEW/APPROVE a request.
--
-- ── WHY NOT THE SIMPLER OPTIONS ────────────────────────────────────────────
--
-- A. COLUMN-LEVEL REVOKE — rejected on correctness, not preference.
--    `revoke select (note, absence_type) on worker_absences from authenticated`
--    is ROLE-level. Supabase has ONE `authenticated` role covering both the
--    worker and the employer, so it would also block a worker from reading
--    their own note on /dashboard/absences. Column privileges cannot express
--    "the worker may, the employer may not".
--
-- B. `security_invoker = true` VIEW — adds no guarantee. Such a view inherits
--    the base table's RLS, so an employer who can read the row through the view
--    can still read the base table directly, with every column. It is
--    ergonomics, not a boundary.
--
-- D. SECURITY DEFINER RPC — same guarantee as C below, worse shape: no
--    PostgREST filtering/ordering, a hand-rolled argument surface, and the
--    repo treats new SECDEF functions as RED class anyway.
--
-- ── THE CHANGE (option C) ──────────────────────────────────────────────────
--
--   1. NARROW the base policy so a manager reaches the full row only while the
--      request is PENDING REVIEW — the window in which the note is the thing
--      they are being asked to act on. `getManagerPendingAbsences` already
--      queries exactly `status = 'requested'`, so the approval workflow is
--      unaffected.
--   2. ADD a definer view exposing ONLY scheduling columns for APPROVED
--      absences, with `caller_manages_worker()` as its own predicate.
--
-- Net effect, and it is a real improvement rather than a formality: a manager
-- can no longer read the free-text reason of every approved absence
-- indefinitely — only while it is awaiting their decision. Scheduling
-- information stays fully available, through a relation that has no reason
-- column to leak.
--
-- The view is deliberately NOT `security_invoker`: it must return rows the
-- narrowed base policy no longer admits, and it carries its own authorization
-- predicate instead. That predicate is the SAME function the policy used, so
-- there is one authorization rule, not two.
--
-- COMPATIBILITY. `getMyAbsences` (worker self) unchanged — the self branch of
-- the policy is untouched. `getManagerPendingAbsences` unchanged — it reads
-- `status='requested'` only. `getEmployerWorkerAvailability` must be pointed at
-- the view in the same PR that applies this (its current base-table read would
-- return zero rows afterwards) — that application change is included in the
-- PR and is inert until this migration is applied, because the app's read is
-- switched behind a relation-missing fallback.
--
-- ROLLBACK: supabase/rollbacks/20260808120000_worker_absence_scheduling_view_v1.down.sql
-- ============================================================================

begin;

-- ── 1. Narrow the base-table policy ─────────────────────────────────────────
-- Was: self OR caller_manages_worker(worker_id) OR is_admin()
-- Now: self OR (caller_manages_worker(worker_id) AND status = 'requested')
--      OR is_admin()
drop policy if exists worker_absences_select on public.worker_absences;
create policy worker_absences_select on public.worker_absences
  for select
  using (
    exists (
      select 1 from public.workers w
       where w.id = worker_absences.worker_id
         and w.profile_id = auth.uid()
    )
    -- A manager sees the FULL row only while the request awaits their
    -- decision; the note is what they are being asked to act on. Once
    -- approved, scheduling facts remain available through the view below and
    -- the reason stops being reachable.
    or (public.caller_manages_worker(worker_id) and status = 'requested')
    or public.is_admin()
  );

-- ── 2. Scheduling-only view for approved absences ──────────────────────────
-- No `note`. No `absence_type`. There is nothing private to fail to filter.
drop view if exists public.worker_absence_scheduling;
create view public.worker_absence_scheduling as
  select
    a.id,
    a.worker_id,
    a.start_date,
    a.end_date,
    a.half_day,
    a.status
  from public.worker_absences a
  where a.status = 'approved'
    and (
      public.caller_manages_worker(a.worker_id)
      or public.is_admin()
      or exists (
        select 1 from public.workers w
         where w.id = a.worker_id and w.profile_id = auth.uid()
      )
    );

comment on view public.worker_absence_scheduling is
  'W12 employer planning: approved unavailability, scheduling columns only. Carries no absence reason or type by construction. Authorization mirrors caller_manages_worker / self / admin.';

revoke all on public.worker_absence_scheduling from anon;
grant select on public.worker_absence_scheduling to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/)
--
--   begin;
--   drop view if exists public.worker_absence_scheduling;
--   drop policy if exists worker_absences_select on public.worker_absences;
--   create policy worker_absences_select on public.worker_absences
--     for select
--     using (
--       exists (select 1 from public.workers w
--                where w.id = worker_absences.worker_id
--                  and w.profile_id = auth.uid())
--       or public.caller_manages_worker(worker_id)
--       or public.is_admin()
--     );
--   commit;
-- ════════════════════════════════════════════════════════════════════════════
