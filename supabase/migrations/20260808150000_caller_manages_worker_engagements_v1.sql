-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`. Ships UNAPPLIED and deliberately WITHOUT
-- `@human-gate-approved` — RED in migration-safety CI is the intended state
-- until the owner reviews (SECURITY DEFINER function bodies + grants =
-- RED-class). The agent must never add that marker on its own initiative.
--
-- 20260808150000 — caller_manages_worker learns about booking engagements
-- (beta foundation audit P1 defect A1) + restores the project-assign
-- engagement bridge that W11 silently reverted.
--
-- ── PROBLEM 1 (defect A1, the reported one) ─────────────────────────────────
-- `public.caller_manages_worker(p_worker_id)` (20260609120000) answers "is the
-- caller a real manager of this worker?" by checking exactly TWO rosters:
-- `company_workers` and `agency_workers`. It does NOT check
-- `company_worker_engagements` — the canonical row minted when a worker
-- ACCEPTS a booking (20260723120000, org-first resolution 20260807140000).
--
-- The 2026-08-08 beta foundation audit proved the consequence locally: an
-- ACTIVE engagement exists (`source_booking_id` set), the worker files an
-- absence request, and the employer's "Requests to review" list at
-- /dashboard/absences stays EMPTY. Two surfaces are blind at once, because
-- both are gated on this one function:
--   * the `worker_absences_select` RLS policy (20260718150000, narrowed to
--     `status='requested'` for managers by 20260808120000) — the employer
--     cannot SEE the request; and
--   * `review_worker_absence_v1` (20260718150000) — even handed the id, the
--     employer cannot APPROVE it ("not authorized to review this absence").
-- The §14 approval chain therefore terminates for the canonical booking path.
--
-- The app needs NO change: `getManagerPendingAbsences()`
-- (apps/web/lib/leave/absences.ts) is a plain
-- `.from("worker_absences").eq("status","requested")` read with NO roster
-- filter in TypeScript — RLS alone decides the result. Fixing the predicate
-- fixes the surface.
--
-- ── PROBLEM 2 (found while scoping this fix; NOT in the audit) ──────────────
-- 20260723120000 widened `assign_worker_to_project` by exactly one OR-branch
-- (`caller_has_booking_engagement_for_project`) so an engaged worker could be
-- assigned to that company's own projects. W11's `20260804120000`
-- (project_lifecycle_v1, APPLIED TO PROD 2026-08-04) then re-issued
-- `create or replace function public.assign_worker_to_project` from the
-- PRE-ENGAGEMENT 20260609120000 body plus its completed-project guard — and
-- SILENTLY DROPPED the OR-branch. Confirmed by catalog read on both the local
-- stack and PRODUCTION 2026-08-08: `assign_worker_to_project.prosrc` does not
-- mention `caller_has_booking_engagement_for_project` at all, and that helper
-- currently has ZERO callers in the database — a live, orphaned SECURITY
-- DEFINER function. So the booking→engagement bridge is broken in BOTH
-- directions today, not just the absence one.
--
-- ── WHY THIS IS ONE MIGRATION, NOT TWO ──────────────────────────────────────
-- They are not merely related — fixing A1 alone would make Problem 2 WORSE.
-- `assign_worker_to_project` calls `caller_manages_worker`. If that predicate
-- simply learned about engagements, the assign gate would become
-- `can_manage_project(pid) AND <engaged with ANY company I own>` — and
-- `can_manage_project` admits every project of every company the caller owns
-- (plus `manages_organization`). A caller owning companies C1 and C2, engaged
-- with the worker only through C1, could then assign that worker to a C2
-- project. That silently breaks the explicit owner product decision of
-- 2026-07-23 recorded in 20260723120000's header — an engagement "makes the
-- worker assignable ONLY to that company's own projects" — the very
-- sibling-company isolation `scripts/db-proof/booking-engagement-org-
-- resolution.sh` check S9 exists to defend. Touching the assign gate here is
-- therefore REQUIRED to keep this migration honest, not scope creep.
--
-- ── WHAT THIS MIGRATION DOES (three objects, no schema change) ──────────────
--   1. NEW `caller_manages_worker_by_roster(uuid)` — the CURRENT
--      `caller_manages_worker` body, verbatim, under a name that says what it
--      means. Nothing is lost: "roster only" stays expressible for call sites
--      whose semantics must not widen.
--   2. REPLACE `caller_manages_worker(uuid)` — now `by_roster` OR an ACTIVE
--      `company_worker_engagements` row for a company the caller owns. This
--      is the A1 fix, and it reaches every roster-gated surface at once
--      (absence policy, absence review RPC, the W12 scheduling view).
--   3. REPLACE `assign_worker_to_project(text, text)` — body byte-preserved
--      from the APPLIED 20260804120000 (completed-project guard included),
--      with its authorization line changed to
--        can_manage_project(pid)
--          AND (caller_manages_worker_by_roster(w_id)
--               OR caller_has_booking_engagement_for_project(w_id, pid))
--      This RESTORES the reverted bridge AND pins the per-project company
--      binding, so the widening in (2) cannot leak into project assignment.
--      Net authorization change for assign: strictly a RESTORE of the
--      2026-07-23 decision. It grants nothing that decision did not grant.
--
-- ── AUTHORIZATION MODEL OF THE NEW BRANCH (deliberately narrow) ─────────────
--   * `public.owns_company(e.company_id)` — the SAME caller-bound predicate
--     the existing roster branch uses, and the same authority level as the
--     engagement helper's `c.profile_id is not distinct from auth.uid()`.
--   * `e.status = 'active'` — an ENDED engagement grants nothing, matching
--     `end_company_worker_engagement_v1` (20260804160000) semantics.
--   * `e.worker_id is not null` — the GDPR model-A detach rule from
--     20260723120000: a DETACHED audit row must grant NOTHING. Without this
--     the predicate would be `null = null` (never true) anyway, but it is
--     stated explicitly so the intent survives a future refactor.
--   * `manages_organization` is deliberately NOT admitted here. Org-manager
--     authority over engagements would be a NEW authority widening needing
--     its own owner decision; this migration only closes the gap the audit
--     found. Company OWNERS only.
--
-- SELF-REVIEW EDGE CASE (pre-existing, NOT introduced here, stated so the
-- reviewer does not have to derive it): 20260718150000's header notes that
-- "worker self-review is impossible: caller_manages_worker is false for the
-- worker themselves". That holds for an ordinary worker before and after this
-- change. It has always had one structural exception — a person who is BOTH a
-- worker and a company owner can already reach themselves through the ROSTER
-- branch by adding their own worker row to their own company. The engagement
-- branch adds a second route to the SAME pre-existing exception (self-propose
-- a booking, self-accept), not a new class of one. Closing it properly means
-- an actor-identity rule (`worker.profile_id <> auth.uid()`) applied to BOTH
-- branches, which would change existing roster behaviour and therefore needs
-- its own owner decision — deliberately out of scope for an A1 fix. Related
-- known self-dealing item: audit P2 "S1 self-shell in scouting pool".
--
-- ── BLAST RADIUS (every call site of caller_manages_worker, enumerated) ─────
--   a) `worker_absences_select` RLS policy — WIDENS as intended. Managers
--      still only reach `status='requested'` rows (20260808120000 narrowing
--      is untouched); the private reason on approved rows stays unreachable.
--   b) `review_worker_absence_v1` — WIDENS as intended. This IS the fix.
--   c) `worker_absence_scheduling` view (20260808120000) — WIDENS as
--      intended: an engaged worker's APPROVED unavailability becomes visible
--      to the engaging employer, scheduling columns only. The view carries no
--      `note` and no `absence_type` BY CONSTRUCTION, so no private reason is
--      disclosed by this widening.
--   d) `assign_worker_to_project` — DOES NOT WIDEN. Switched to `by_roster`
--      + the project-bound helper (see 3 above).
-- No RLS policy is created or dropped. No table, column, index, constraint,
-- trigger or grant is added or changed. No DML at apply time. The three
-- functions keep their exact signatures, SECURITY DEFINER, `search_path`
-- pinning and existing EXECUTE posture (authenticated only; PUBLIC and anon
-- revoked). `caller_manages_worker_by_roster` ships with the same posture.
--
-- ── PRE-APPLY CHECK (read-only; expect exactly this) ────────────────────────
--   select proname, prosrc like '%company_worker_engagements%'
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname='caller_manages_worker';
--     -- 1 row, false  (the defect)
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname='caller_manages_worker_by_roster';
--     -- 0            (name is free)
--   select prosrc like '%caller_has_booking_engagement_for_project%'
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname='assign_worker_to_project';
--     -- false        (Problem 2: the bridge is reverted)
--   select count(*) from public.company_worker_engagements;  -- note the number
--
-- ── POST-APPLY VERIFICATION ────────────────────────────────────────────────
--   As an employer holding an ACTIVE engagement with a worker who has a
--   REQUESTED absence:
--     select count(*) from public.worker_absences where status='requested';
--       -- >= 1 (was 0 — the A1 fix)
--     select public.review_worker_absence_v1('<absence id>','approved');  -- ok
--   As an UNRELATED employer: the same reads still return 0 rows.
--   As the worker: own rows unchanged, including every note.
--   Assign binding (the isolation that must NOT regress):
--     select public.assign_worker_to_project('<project of the ENGAGING company>',
--                                            '<worker profile id>');  -- uuid
--     select public.assign_worker_to_project('<project of a SIBLING company>',
--                                            '<worker profile id>');  -- 42501
--   + APPLIED_LEDGER.md row.
--
-- ── DB PROOF ───────────────────────────────────────────────────────────────
-- `scripts/db-proof/a1-caller-manages-worker-engagements.sh` executes THIS
-- FILE and its rollback VERBATIM against a throwaway Postgres and measures
-- per-role behaviour BEFORE / AFTER / ROLLBACK / RE-APPLY, including the
-- sibling-company assign isolation above.
--
-- ROLLBACK: supabase/rollbacks/
-- 20260808150000_caller_manages_worker_engagements_v1.down.sql — restores the
-- 20260609120000 `caller_manages_worker` body and the APPLIED 20260804120000
-- `assign_worker_to_project` body verbatim, and drops the new roster helper.
-- Running it restores BOTH known defects (A1 blindness and the orphaned
-- engagement bridge).
-- ============================================================================

begin;

-- 1. The roster-only predicate, preserved under an honest name ---------------

-- Body copied VERBATIM from 20260609120000_project_worker_assignment_gate.sql.
-- This is what `caller_manages_worker` means TODAY. It is extracted so that
-- call sites which must NOT gain engagement authority (project assignment)
-- can keep their exact current semantics after step 2 widens the general
-- predicate.
create or replace function public.caller_manages_worker_by_roster(p_worker_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_workers cw
     where cw.worker_id = p_worker_id and cw.status = 'active'
       and public.owns_company(cw.company_id)
  ) or exists (
    select 1 from public.agency_workers aw
     where aw.worker_id = p_worker_id and aw.status = 'active'
       and public.owns_agency(aw.agency_id)
  );
$$;
revoke all on function public.caller_manages_worker_by_roster(uuid) from public;
revoke all on function public.caller_manages_worker_by_roster(uuid) from anon;
grant execute on function public.caller_manages_worker_by_roster(uuid) to authenticated;

-- 2. caller_manages_worker — the A1 fix -------------------------------------

-- "Is the caller a real manager of this worker?" now has THREE honest ways to
-- be true, not two: the company roster, the agency roster, or an ACTIVE
-- accepted-booking engagement held by a company the caller owns. The first
-- two are delegated to the extracted helper so there is exactly ONE copy of
-- the roster rule in the database.
create or replace function public.caller_manages_worker(p_worker_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.caller_manages_worker_by_roster(p_worker_id)
      or exists (
    select 1 from public.company_worker_engagements e
     where e.worker_id is not null            -- a GDPR-detached row grants nothing
       and e.worker_id = p_worker_id
       and e.status = 'active'                -- an ended engagement grants nothing
       and public.owns_company(e.company_id)  -- caller-bound, same authority as the roster branch
  );
$$;
revoke all on function public.caller_manages_worker(uuid) from public;
revoke all on function public.caller_manages_worker(uuid) from anon;
grant execute on function public.caller_manages_worker(uuid) to authenticated;

-- 3. assign_worker_to_project — restore the bridge, pin the binding ---------

-- Body is the APPLIED 20260804120000 body (W11 completed-project guard
-- included) with ONE line changed: the roster clause is `by_roster` plus the
-- PROJECT-BOUND engagement helper, exactly as 20260723120000 intended before
-- W11 overwrote it. Using `by_roster` here is what stops step 2's widening
-- from dissolving the one-company-one-project binding.
create or replace function public.assign_worker_to_project(
  p_project_id        text,
  p_worker_profile_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  pid     uuid := nullif(p_project_id, '')::uuid;
  w_pid   uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id    uuid;
  row_id  uuid;
  v_status text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  -- BOTH gates: the caller manages THIS project AND the worker is on the
  -- caller's active ROSTER, or holds an active accepted-booking engagement
  -- with the company that canonically owns THIS EXACT project (or admin).
  -- Neither gate alone is sufficient. `by_roster` (not the widened
  -- `caller_manages_worker`) keeps engagement authority bound to the
  -- engaging company's own projects — a sibling company of the same owner
  -- must still be refused.
  if not (
    (public.can_manage_project(pid)
      and (public.caller_manages_worker_by_roster(w_id)
           or public.caller_has_booking_engagement_for_project(w_id, pid)))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;

  -- W11: a completed project is terminal. Checked AFTER authorization so the
  -- refusal cannot be used to probe the status of a project the caller may not
  -- manage. `22023` is the same invalid-argument class the guards above use, so
  -- the app layer maps it through its existing error path.
  select status into v_status from public.projects where id = pid;
  if v_status = 'completed' then
    raise exception 'Project is completed' using errcode = '22023';
  end if;

  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  return row_id;
end;
$$;
revoke all on function public.assign_worker_to_project(text, text) from public;
revoke all on function public.assign_worker_to_project(text, text) from anon;
grant execute on function public.assign_worker_to_project(text, text) to authenticated;

commit;
