-- ============================================================================
-- @human-gate-approved — TIER: owner-gated. The owner reviewed the W11 human-
-- gate package on PR #1007 at head 40385f65 (2026-08-04) and explicitly
-- approved these three migration-safety findings, and ONLY these, for THIS
-- file:
--
--   1. `security-definer-function` — set_project_status_v1 must read and write
--      across RLS to enforce can_manage_project() and end the project's roster
--      atomically in one transaction.
--   2. `grant-or-revoke` — PUBLIC + anon REVOKE, `authenticated` EXECUTE only
--      (mirrors applied 20260722160000 / 20260802160000 hygiene).
--   3. `data-dml` — the UPDATE statements live in the FUNCTION BODY. This
--      migration performs ZERO DML at apply time: applying it changes no
--      project row, no assignment row and writes no audit row.
--
-- The approval is NARROW. It does not weaken, suppress, delete, bypass or
-- globally disable the migration-safety gate; it does not cover any other
-- migration; and it is not approval to merge or deploy PR #1007.
--
-- Scope of the approved change: ONE constraint swap ('closed' → 'completed',
-- and production held zero rows using either), ONE new SECURITY DEFINER
-- function, and ONE guard added to the existing assign_worker_to_project.
-- ============================================================================
-- W11 — PROJECT EXECUTION AND COMPLETION SPINE (slice 1)
--
-- PROBLEM. The `projects` row is INSERT-ONLY in the entire product. `status` is
-- written exactly once, to 'draft' (apps/web/lib/projects/create-project-core.ts),
-- and there is no update path anywhere: no app write, no RPC, no migration that
-- updates public.projects. The CHECK has allowed 'live' and 'paused' since
-- 0001_initial_schema.sql:149 and neither value has ever been written. So the
-- product can create a project and can never start, pause or finish one.
--
-- Production preflight (read-only, 2026-08-04):
--   projects                     5 rows, ALL 'draft'    (0 live / 0 paused / 0 closed)
--   project_worker_assignments   1 row,  'active'
-- Therefore the constraint swap below needs NO data rewrite. That is a measured
-- fact, not an assumption — a status value outside the new closed set would have
-- made this migration a data-mapping decision instead of a constraint change.
--
-- WHAT THIS MIGRATION DOES
--   1. replaces the status CHECK: 'closed' → 'completed'
--   2. adds ONE lifecycle RPC: set_project_status_v1(uuid, text)
--   3. teaches assign_worker_to_project to refuse a completed project
--
-- WHAT IT DELIBERATELY DOES NOT DO (owner decisions D2 + D3, 2026-08-04)
--   - it does NOT touch `engagement_contexts` or `end_org_membership_v1`.
--     W6's `completed_engagement` reads `engagement_contexts.ended_at`, whose
--     canonical writer already exists, is applied in production (2026-08-02) and
--     is already called by the app (lib/operations/org-membership.ts). Finishing
--     a PROJECT must not end a person's membership of an ORGANIZATION — they are
--     different events about different things.
--   - it does NOT touch `company_worker_engagements` or
--     `end_company_worker_engagement_v1`. That table's provenance is
--     source_booking_id → booking_requests → customer_requests; there is no
--     project_id anywhere in that chain, so no deterministic project→engagement
--     link exists to complete.
--   - it therefore does NOT activate W6. It creates a project lifecycle and a
--     project-assignment completion path, and claims nothing beyond that.
--
-- WHY THE ASSIGNMENT ENDING LIVES INSIDE THIS RPC RATHER THAN REUSING
-- `end_worker_project_assignment`. That function (20260609120000:102) is
-- per-worker: it takes a worker profile id, ends one pair, takes no row lock and
-- writes no audit row. Completing a project must end EVERY active assignment on
-- that project in ONE transaction, exactly once, with an audit trail. Calling it
-- in a loop would be N transactions with no lock and no audit. So the
-- project-scoped logic lives here — and it stays PRIVATE to this function: no
-- second public assignment-ending API is created, and the existing per-worker
-- RPC is left exactly as it is.
--
-- SECURITY POSTURE (mirrors applied 20260722160000 / 20260802160000):
--   SECURITY DEFINER + pinned search_path; PUBLIC and anon REVOKEd; only
--   `authenticated` may execute. Authority is the EXISTING can_manage_project()
--   — no second authorization model. Anti-oracle: a caller with no readable
--   relationship to the project gets `not_found`, never `not_authorized`.
--
-- MANUAL VERIFICATION (post-apply, local):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.projects'::regclass and conname like '%status%';
--     -- CHECK (status = ANY (ARRAY['draft','live','paused','completed']))
--   select has_function_privilege('anon',
--     'public.set_project_status_v1(uuid,text)','execute');            -- false
--   select has_function_privilege('authenticated',
--     'public.set_project_status_v1(uuid,text)','execute');            -- true
--   as owner: set_project_status_v1('<draft>','live')      → {"outcome":"transitioned"}
--   repeat the same call                                   → {"outcome":"already_in_state"}
--   set_project_status_v1('<live>','draft')                → {"outcome":"invalid_transition"}
--   set_project_status_v1('<live>','completed')            → {"outcome":"transitioned","assignments_ended":N}
--   set_project_status_v1('<completed>','live')            → {"outcome":"invalid_transition"}
--   as an unrelated caller                                 → {"outcome":"not_found"}
--
-- ROLLBACK — supabase/rollbacks/20260804120000_project_lifecycle_v1.down.sql
--
-- The paired file is the authoritative one; this block states what it does and,
-- more importantly, WHEN IT REFUSES:
--
--   drop function if exists public.set_project_status_v1(uuid, text);
--   create or replace function public.assign_worker_to_project(text, text) …
--     -- restored byte-for-byte from 20260609120000:55-99, i.e. WITHOUT the
--     -- completed-project guard added below
--   alter table public.projects drop constraint projects_status_check;
--   alter table public.projects add constraint projects_status_check
--     check (status in ('draft','live','paused','closed'));
--
-- TWO ZERO-ROW GUARDS ABORT IT, and they are the point of the file:
--   1. any project already in 'completed' — reverting the CHECK would either
--      fail or silently reopen finished work with no audit of the reopening;
--   2. any assignment ended BY a completion (`audit_logs.action =
--      'end_project_assignment'` with `cause = 'project_completed'`) — those
--      people really did stop on that date, and clearing `ended_at` would
--      falsify history.
-- After the first real completion the correct move is a FORWARD FIX or a
-- separate owner data decision, never this rollback. Proven in
-- scripts/db-proof/w11-project-lifecycle.sh §F (refusal) and §G (clean path).
--
-- UNAPPLIED / OWNER-GATED. No `-- @human-gate-approved` marker: SECURITY
-- DEFINER + GRANT classify this RED by design and it ships unapplied.
-- ============================================================================

begin;

-- ── 1. The canonical status vocabulary ──────────────────────────────────────
-- 'closed' was in the CHECK since 0001 and was NEVER written by anything (the
-- reports hub does not even model it — lib/reports/reports-hub.ts). It is
-- replaced rather than joined by 'completed' so the domain has exactly ONE
-- terminal word; two synonyms for "finished" is how a vocabulary rots.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'live', 'paused', 'completed'));

-- ── 2. The one lifecycle write ──────────────────────────────────────────────
create or replace function public.set_project_status_v1(
  p_project_id uuid,
  p_status     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_from       text;
  v_company    uuid;
  v_to         text := nullif(trim(coalesce(p_status, '')), '');
  v_ended      int  := 0;
  r            record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Unknown target status is rejected BEFORE anything is read or locked, so an
  -- invented value can never reach the matrix or the constraint.
  if v_to is null or v_to not in ('draft', 'live', 'paused', 'completed') then
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  -- ROW LOCK. Two managers completing the same project concurrently must
  -- serialize here, or both could pass the matrix check and both could end the
  -- same assignments — double audit rows for one real change.
  select p.status, p.company_id
    into v_from, v_company
    from public.projects p
   where p.id = p_project_id
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Authority: the EXISTING helper, not a second model ────────────────────
  -- Anti-oracle: only a caller who can already SEE the project (owner, admin, or
  -- an assigned worker under the applied projects_select) learns that it exists.
  -- Everyone else gets `not_found` — the same shape 20260802160000:185 uses.
  if not (public.can_manage_project(p_project_id) or public.is_admin()) then
    if public.is_assigned_to_project(p_project_id) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Idempotency: same state is a deterministic no-op ──────────────────────
  -- No write, no audit row, and — critically — no second pass over the
  -- assignments. Completing an already-completed project must not re-end
  -- anything or stamp a fresh ended_at over a real historical one.
  if v_from is not distinct from v_to then
    return jsonb_build_object(
      'outcome', 'already_in_state',
      'project_id', p_project_id,
      'status', v_to);
  end if;

  -- ── The transition matrix, stated once ────────────────────────────────────
  -- draft → live | live ⇄ paused | live → completed | paused → completed.
  -- `completed` is terminal: it is absent from every left-hand side below, so
  -- no path returns from it. A null/unknown stored status matches nothing and
  -- falls through to invalid_transition (default-closed).
  if not (
       (v_from = 'draft'  and v_to = 'live')
    or (v_from = 'live'   and v_to = 'paused')
    or (v_from = 'paused' and v_to = 'live')
    or (v_from = 'live'   and v_to = 'completed')
    or (v_from = 'paused' and v_to = 'completed')
  ) then
    return jsonb_build_object(
      'outcome', 'invalid_transition',
      'from_status', v_from,
      'to_status', v_to);
  end if;

  -- ── The state change ──────────────────────────────────────────────────────
  -- Guarded on the status we actually read under the lock: if anything changed
  -- underneath us the update matches zero rows and we report a conflict rather
  -- than writing over a decision we never saw.
  update public.projects
     set status = v_to,
         updated_at = now()
   where id = p_project_id
     and status is not distinct from v_from;

  if not found then
    return jsonb_build_object('outcome', 'conflict');
  end if;

  -- ── Completion ends this project's active roster. NOTHING ELSE. ───────────
  -- Scoped to `project_id = p_project_id` and nothing else: never
  -- company+worker, never "every assignment between these two parties", never
  -- another project of the same company. Rows are locked before they are read
  -- so a concurrent assignment cannot slip past the count.
  if v_to = 'completed' then
    for r in
      select pwa.id, pwa.worker_id
        from public.project_worker_assignments pwa
       where pwa.project_id = p_project_id
         and pwa.status = 'active'
       for update
    loop
      update public.project_worker_assignments
         set status = 'ended',
             ended_at = coalesce(ended_at, now())
       where id = r.id
         and status = 'active';

      if found then
        v_ended := v_ended + 1;
        -- One audit row per REAL change (the brief's rule). A no-op update
        -- writes nothing, so a repeated completion cannot inflate the trail.
        insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
        values (
          uid,
          'end_project_assignment',
          'project_worker_assignments',
          r.id,
          jsonb_build_object(
            'project_id',  p_project_id,
            'worker_id',   r.worker_id,
            'from_status', 'active',
            'to_status',   'ended',
            'cause',       'project_completed'
          ));
      end if;
    end loop;
  end if;

  -- ── Audit: one row per real transition ────────────────────────────────────
  -- No project body, no worker PII, no client payload — ids and states only.
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'set_project_status',
    'projects',
    p_project_id,
    jsonb_build_object(
      'company_id',        v_company,
      'from_status',       v_from,
      'to_status',         v_to,
      'assignments_ended', v_ended,
      'actor_capacity',    case when public.is_admin() then 'admin' else 'manager' end
    ));

  return jsonb_build_object(
    'outcome', 'transitioned',
    'project_id', p_project_id,
    'from_status', v_from,
    'to_status', v_to,
    'assignments_ended', v_ended);
end $$;

revoke all on function public.set_project_status_v1(uuid, text) from public;
revoke all on function public.set_project_status_v1(uuid, text) from anon;
grant execute on function public.set_project_status_v1(uuid, text) to authenticated;

-- ── 3. A completed project accepts no new work ──────────────────────────────
-- REPLACED IN FULL, byte-for-byte identical to 20260609120000:55-99 apart from
-- the one added guard, so the diff is the guard and nothing else. Without this
-- an employer could complete a project and still assign someone to it through
-- the RPC the chat now reaches — a terminal state that is not terminal.
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

  -- BOTH gates: caller manages THIS project AND the worker is on the caller's
  -- active roster (or admin). Neither alone is sufficient.
  if not (
    (public.can_manage_project(pid) and public.caller_manages_worker(w_id))
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
