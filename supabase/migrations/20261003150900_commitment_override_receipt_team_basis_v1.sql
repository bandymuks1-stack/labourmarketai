-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. Replaces one SECURITY DEFINER writer, drops one NOT NULL,
-- adds one column / CHECK / unique constraint on an append-only table. Draft PR
-- + `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval. Never `supabase db push`. NO OWNER APPROVAL EXISTS
-- FOR THIS FILE: the marker above is the risk acknowledgement the static gate
-- reads, not an approval.
--
-- 20261003150900 — a manager's knowing override of a clash also holds for a
-- member of an actively assigned TEAM.  (J-TIME-FREEDOM: CONFLICT -> authorized
-- OVERRIDE -> immutable RECEIPT, for teams too.)
--
-- ── DEPENDENCIES (must already be applied, in this order) ──────────────────
--   20261003150100_commitment_override_receipts_v1   (#2146) - the table and
--       record_commitment_override_v1 this file extends. NOT applied on prod.
--   20261003150600_brigade_work_assignment_v1        (#2149) - team_assignments
--       and team_member_at_v1. NOT applied on prod.
--   This file sorts after both and before 20261003151000. The guard below
--   raises if either is missing, so a wrong order fails loudly, never silently.
--
-- ── THE GAP ────────────────────────────────────────────────────────────────
-- #2146's writer requires an ACTIVE project_worker_assignments row. #2149 made
-- a team assignment ONE canonical relationship and deliberately writes NO
-- per-person rows (no fan-out). So for a member of an actively assigned team
-- with a known calendar clash, no receipt could be written.
--
-- ── WHAT THIS CHANGES (smallest canonical extension) ───────────────────────
--   * commitment_override_receipts.team_assignment_id uuid NULL, FK
--     team_assignments(id) ON DELETE CASCADE (same lifecycle as assignment_id).
--   * assignment_id becomes NULLABLE; CHECK num_nonnulls(assignment_id,
--     team_assignment_id) = 1 - exactly ONE basis. Existing rows all carry
--     assignment_id, so they stay valid and untouched.
--   * unique (team_assignment_id, fingerprint): idempotency per team basis.
--   * record_commitment_override_v1 keeps its signature, authority (NULL-safe
--     can_manage_project), whitelist, closed reason_code, window snapshot and
--     privacy rules. Basis resolution: an ACTIVE person assignment wins; else
--     the oldest ACTIVE team assignment on the project of which the worker is
--     a member AS OF NOW (team_member_at_v1; a member who left, or has not yet
--     joined, is NOT covered); else 22023. The fingerprint includes the basis
--     (person formula byte-identical to before); the 50-receipt cap is counted
--     per basis. No row is ever written to project_worker_assignments.
--   * RLS read rule is unchanged (project managers + the affected worker); no
--     new grant, no new policy, nothing for anon.
--
-- NOT BUILT: no fan-out, no per-person assignment rows, no change to #2149.
-- ROLLBACK: supabase/rollbacks/20261003150900_commitment_override_receipt_team_basis_v1.down.sql
-- (refuses while any team-basis receipt exists; restores the first function).

do $$
begin
  if to_regclass('public.commitment_override_receipts') is null then
    raise exception 'commitment_override_receipts missing (apply 20261003150100 first)';
  end if;
  if to_regclass('public.team_assignments') is null then
    raise exception 'team_assignments missing (apply 20261003150600 first)';
  end if;
  if to_regprocedure('public.team_member_at_v1(uuid,uuid,timestamptz)') is null then
    raise exception 'team_member_at_v1 missing (apply 20261003150600 first)';
  end if;
  if to_regprocedure('public.can_manage_project(uuid)') is null then
    raise exception 'can_manage_project missing';
  end if;
end $$;

alter table public.commitment_override_receipts
  add column if not exists team_assignment_id uuid
    references public.team_assignments(id) on delete cascade;

alter table public.commitment_override_receipts
  alter column assignment_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.commitment_override_receipts'::regclass
                    and conname = 'commitment_override_receipts_one_basis') then
    alter table public.commitment_override_receipts
      add constraint commitment_override_receipts_one_basis
      check (num_nonnulls(assignment_id, team_assignment_id) = 1);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.commitment_override_receipts'::regclass
                    and conname = 'commitment_override_receipts_team_fingerprint_uq') then
    alter table public.commitment_override_receipts
      add constraint commitment_override_receipts_team_fingerprint_uq
      unique (team_assignment_id, fingerprint);
  end if;
end $$;

create index if not exists commitment_override_receipts_team_assignment_idx
  on public.commitment_override_receipts (team_assignment_id)
  where team_assignment_id is not null;

comment on table public.commitment_override_receipts is
  'J-TIME-FREEDOM step 5. APPEND-ONLY receipt that a manager kept an assignment knowing a calendar clash. The basis is exactly one of a person assignment (assignment_id) or a team assignment (team_assignment_id) - a team assignment writes no per-person row. Window snapshot, closed collisions list (kind + overlap dates; sourceId only for non-absence kinds; absence never carries an id, category or reason), closed reason_code, no free text. The collisions list is supplied by the application (recomputed server-side at decision time); the database validates shape and authority, it cannot recompute the calendar. Written only by record_commitment_override_v1. Never updated, never deleted except by the cascades of its owning project / worker / assignment.';

-- ── The one writer, replaced: person OR team basis ─────────────────────────
create or replace function public.record_commitment_override_v1(
  p_project_id        uuid,
  p_worker_profile_id uuid,
  p_collisions        jsonb,
  p_reason_code       text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_worker  uuid;
  v_assign  uuid;
  v_team    uuid;
  v_start   date;
  v_end     date;
  v_item    jsonb;
  v_kind    text;
  v_os      date;
  v_oe      date;
  v_sid     text;
  v_clean   jsonb := '[]'::jsonb;
  v_reason  text := nullif(btrim(coalesce(p_reason_code, '')), '');
  v_fp      text;
  v_id      uuid;
  v_n       integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null or p_worker_profile_id is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;
  -- Authority first, so a refusal cannot be used to probe another
  -- organization's project or roster. NULL operand => denied.
  if not coalesce(public.can_manage_project(p_project_id), false) then
    raise exception 'Not authorized to record an override on this project'
      using errcode = '42501';
  end if;
  if v_reason is not null
     and v_reason not in ('agreed_with_worker', 'agreed_with_client', 'partial_overlap',
                          'urgent_need', 'other') then
    raise exception 'Unknown reason code' using errcode = '22023';
  end if;

  select w.id into v_worker from public.workers w where w.id is not null and w.profile_id = p_worker_profile_id;
  if v_worker is null then
    raise exception 'Unknown worker' using errcode = '22023';
  end if;
  select a.id into v_assign
    from public.project_worker_assignments a
   where a.project_id = p_project_id and a.worker_id = v_worker and a.status = 'active';
  if v_assign is null then
    -- No person assignment: the TEAM basis. A team assignment is one canonical
    -- relationship (team_assignments, #2149) that writes no per-person rows, so
    -- the worker must be a member of an ACTIVE team assignment on this project
    -- AS OF NOW (team_member_at_v1 - a member who has left is not covered).
    select ta.id into v_team
      from public.team_assignments ta
     where ta.project_id = p_project_id
       and ta.status = 'active' and ta.ended_at is null
       and public.team_member_at_v1(ta.team_org_id, p_worker_profile_id, now())
     order by ta.assigned_at, ta.id
     limit 1;
    if v_team is null then
      raise exception 'No active assignment or active team membership for this worker on this project'
        using errcode = '22023';
    end if;
  end if;

  if p_collisions is null or jsonb_typeof(p_collisions) <> 'array'
     or jsonb_array_length(p_collisions) < 1 or jsonb_array_length(p_collisions) > 20 then
    raise exception 'collisions must be an array of 1..20 entries' using errcode = '22023';
  end if;

  -- Whitelist rebuild: nothing the caller adds beyond these fields is stored.
  for v_item in select e from jsonb_array_elements(p_collisions) e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid collision entry' using errcode = '22023';
    end if;
    v_kind := v_item->>'kind';
    if v_kind is null or v_kind not in ('project', 'booking', 'trip', 'absence', 'plan') then
      raise exception 'invalid collision kind' using errcode = '22023';
    end if;
    begin
      v_os := (v_item->>'overlapStart')::date;
      v_oe := (v_item->>'overlapEnd')::date;
    exception when others then
      raise exception 'invalid collision dates' using errcode = '22023';
    end;
    if v_os is null or v_oe is null or v_oe < v_os then
      raise exception 'invalid collision dates' using errcode = '22023';
    end if;
    if v_kind = 'absence' then
      -- kind + dates ONLY. No id, no category, no reason, no label.
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'kind', v_kind, 'overlapStart', v_os, 'overlapEnd', v_oe));
    else
      v_sid := v_item->>'sourceId';
      if v_sid is null or v_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid collision source' using errcode = '22023';
      end if;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'kind', v_kind, 'sourceId', lower(v_sid), 'overlapStart', v_os, 'overlapEnd', v_oe));
    end if;
  end loop;

  -- Deterministic order, so a replay with the same facts has the same fingerprint.
  select jsonb_agg(x order by x->>'kind', x->>'overlapStart', x->>'overlapEnd', coalesce(x->>'sourceId', ''))
    into v_clean
    from jsonb_array_elements(v_clean) x;

  -- The window is the PROJECT's, read here, never taken from the caller.
  select p.start_date, p.end_date into v_start, v_end from public.projects p where p.id = p_project_id;

  -- The basis (and, for a team, the worker - one team basis covers many members) is part of the fingerprint. The person basis keeps the exact
  -- formula of 20261003150100, so its fingerprints are unchanged.
  if v_assign is not null then
    v_fp := md5(v_assign::text || '|' || v_uid::text || '|kept|' || coalesce(v_reason, '') || '|' || v_clean::text);
  else
    v_fp := md5('team:' || v_team::text || '|' || v_worker::text || '|' || v_uid::text || '|kept|' || coalesce(v_reason, '') || '|' || v_clean::text);
  end if;

  select r.id into v_id from public.commitment_override_receipts r
   where r.assignment_id is not distinct from v_assign
     and r.team_assignment_id is not distinct from v_team
     and r.fingerprint = v_fp;
  if v_id is not null then
    return v_id;  -- idempotent replay: nothing written
  end if;

  select count(*) into v_n from public.commitment_override_receipts r
   where r.assignment_id is not distinct from v_assign
     and r.team_assignment_id is not distinct from v_team;
  if v_n >= 50 then
    raise exception 'Receipt limit reached for this assignment' using errcode = '22023';
  end if;

  insert into public.commitment_override_receipts
    (assignment_id, team_assignment_id, project_id, worker_id, decided_by, decision,
     window_start, window_end, collisions, reason_code, fingerprint)
  values
    (v_assign, v_team, p_project_id, v_worker, v_uid, 'kept', v_start, v_end, v_clean, v_reason, v_fp)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.commitment_override_receipts r
     where r.assignment_id is not distinct from v_assign
       and r.team_assignment_id is not distinct from v_team
       and r.fingerprint = v_fp;
  end if;
  return v_id;
end
$$;

revoke all on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) to authenticated;

comment on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) is
  'J-TIME-FREEDOM step 5. The ONLY writer of commitment_override_receipts. Caller must manage the project and the worker must hold an ACTIVE person assignment OR be a member (as of now) of an ACTIVE team assignment on it (basis stored on the receipt). Rebuilds the collisions list from a field whitelist (absence = kind + dates only), snapshots the window from projects, stores a closed reason_code, no free text. Idempotent. Authenticated only.';
