-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. One new append-only table, one immutability trigger pair,
-- one SECURITY DEFINER writer, RLS + GRANT/REVOKE. Draft PR + `needs-human-gate`;
-- apply ONLY via Supabase MCP `apply_migration` after explicit owner approval.
-- Never `supabase db push`. NO OWNER APPROVAL EXISTS FOR THIS FILE YET: the
-- marker above is the risk acknowledgement the static gate reads, not an
-- approval.
--
-- 20261003150100 — a manager's explicit override of a known calendar clash
-- leaves an IMMUTABLE, PRIVACY-MINIMAL receipt.  (J-TIME-FREEDOM step 5, CAL-7.)
--
-- ── WHAT EXISTS (read on production 2026-10-03, SELECT-only) ───────────────
-- record_assignment_decision (20261001100000) appends kept / undone / swapped
-- to audit_logs. audit_logs is admin-read, so neither the manager nor the
-- worker the decision concerns can read it; the call is best-effort from the
-- client, carries no window and no collision context, and takes a free-text
-- reason (<= 500 chars). Production: 3 such rows, 0 with a reason.
-- commitment_override_receipts / project_team_assignments do not exist.
-- project_worker_assignments: UNIQUE(project_id, worker_id), RLS select =
-- owns_worker OR can_manage_project; workers.profile_id is UNIQUE.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────
-- commitment_override_receipts — "this manager kept this assignment knowing
-- these collisions, on this window, for this classified reason".
--   * append-only: UPDATE and DELETE are refused by trigger. The only
--     exceptions are the two referential cascades that already define the
--     lifecycle of the row's owners (pg_trigger_depth() > 1): the project or
--     the worker being erased removes the receipt with them, and deleting the
--     deciding profile nulls `decided_by` (nothing else may change). Direct
--     DML by any caller, including the table owner, is refused. TRUNCATE is
--     refused.
--   * the WINDOW is snapshotted from projects by the writer, never taken from
--     the caller — the project can be re-dated later; the receipt keeps what
--     was known.
--   * PRIVACY: there is NO free-text column. The context is a CLOSED
--     reason_code (5 values) and a closed `collisions` shape, built by the
--     writer from a whitelist of fields:
--         kind in (project, booking, trip, absence, plan),
--         overlapStart / overlapEnd (dates),
--         sourceId (uuid) ONLY for kinds other than absence.
--     An absence collision is stored as kind + overlap dates and NOTHING else:
--     no id, no category, no reason, no label. Any other key the caller
--     supplies is dropped, never stored. Titles, destinations, client names
--     are not stored for any kind.
--   * the collision list is supplied by the application, which recomputes it
--     server-side at the moment of the decision (lib/projects/actions.ts); the
--     database validates the shape and the authority but cannot recompute the
--     calendar. The table comment says so.
--   * idempotent: a deterministic fingerprint (assignment, decider, collisions,
--     reason_code, decision) is unique per assignment; a replay returns the
--     existing receipt id and writes nothing.
--   * bound: at most 50 receipts per assignment.
--
-- record_commitment_override_v1(project, worker_profile, collisions, reason_code)
--   SECURITY DEFINER, search_path = public, authenticated only. Fail-loud:
--   every refusal raises (42501 authority / 22023 input / 23505-free).
--   Authority: can_manage_project(project) (admin included inside it), wrapped
--   in coalesce so a NULL operand denies. Requires an ACTIVE assignment — a
--   receipt is about a commitment that exists.
--
-- ── RLS ────────────────────────────────────────────────────────────────────
--   anon / PUBLIC: nothing (no grant, no policy).
--   authenticated: SELECT where the caller manages the project (can_manage_
--   project) OR is the affected worker (owns_worker). Both operands coalesced.
--   No INSERT / UPDATE / DELETE policy and no such grant: the RPC is the only
--   writer. service_role keeps the platform default (privacy export / erasure).
--
-- WHAT IS DELIBERATELY NOT BUILT: no approval workflow, no notification, no
-- team fan-out table (a team assignment calls the same per-member writer), no
-- change to assign_worker_to_project / record_assignment_decision.
--
-- ROLLBACK: supabase/rollbacks/20261003150100_commitment_override_receipts_v1.down.sql
-- (guarded: refuses while any receipt exists - a receipt is evidence).

do $$
begin
  if to_regclass('public.project_worker_assignments') is null then
    raise exception 'project_worker_assignments missing';
  end if;
  if to_regprocedure('public.can_manage_project(uuid)') is null then
    raise exception 'can_manage_project missing';
  end if;
  if to_regprocedure('public.owns_worker(uuid)') is null then
    raise exception 'owns_worker missing';
  end if;
end $$;

create table if not exists public.commitment_override_receipts (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.project_worker_assignments(id) on delete cascade,
  project_id     uuid not null references public.projects(id) on delete cascade,
  worker_id      uuid not null references public.workers(id) on delete cascade,
  decided_by     uuid references public.profiles(id) on delete set null,
  decision       text not null default 'kept' check (decision in ('kept')),
  -- The project's dates AT THE MOMENT, read by the writer.
  window_start   date,
  window_end     date,
  -- Closed, whitelisted shape built by the writer; see header.
  collisions     jsonb not null,
  reason_code    text check (reason_code is null or reason_code in
                   ('agreed_with_worker', 'agreed_with_client', 'partial_overlap',
                    'urgent_need', 'other')),
  fingerprint    text not null,
  created_at     timestamptz not null default now(),
  constraint commitment_override_receipts_collisions_shape check (
    jsonb_typeof(collisions) = 'array'
    and jsonb_array_length(collisions) between 1 and 20
  ),
  constraint commitment_override_receipts_fingerprint_uq unique (assignment_id, fingerprint)
);

comment on table public.commitment_override_receipts is
  'J-TIME-FREEDOM step 5. APPEND-ONLY receipt that a manager kept an assignment knowing a calendar clash: window snapshot, closed collisions list (kind + overlap dates; sourceId only for non-absence kinds; absence never carries an id, category or reason), closed reason_code, no free text. The collisions list is supplied by the application (recomputed server-side at decision time); the database validates shape and authority, it cannot recompute the calendar. Written only by record_commitment_override_v1. Never updated, never deleted except by the cascades of its owning project / worker.';

create index if not exists commitment_override_receipts_project_idx
  on public.commitment_override_receipts (project_id, created_at desc);
create index if not exists commitment_override_receipts_worker_idx
  on public.commitment_override_receipts (worker_id, created_at desc);
create index if not exists commitment_override_receipts_assignment_idx
  on public.commitment_override_receipts (assignment_id);

-- ── Append-only ────────────────────────────────────────────────────────────
create or replace function public.commitment_override_receipts_immutable_v1()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- pg_trigger_depth() > 1 means this DML was fired by a referential action
  -- (the ON DELETE CASCADE / SET NULL of an owning row), never by a caller.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and new.decided_by is null
     and (to_jsonb(new) - 'decided_by') = (to_jsonb(old) - 'decided_by') then
    return new;
  end if;
  raise exception 'commitment_override_receipts is append-only (% refused)', tg_op
    using errcode = '42501';
end
$$;

drop trigger if exists commitment_override_receipts_immutable on public.commitment_override_receipts;
create trigger commitment_override_receipts_immutable
  before update or delete on public.commitment_override_receipts
  for each row execute function public.commitment_override_receipts_immutable_v1();

create or replace function public.commitment_override_receipts_no_truncate_v1()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  raise exception 'commitment_override_receipts is append-only (TRUNCATE refused)'
    using errcode = '42501';
end
$$;

drop trigger if exists commitment_override_receipts_no_truncate on public.commitment_override_receipts;
create trigger commitment_override_receipts_no_truncate
  before truncate on public.commitment_override_receipts
  for each statement execute function public.commitment_override_receipts_no_truncate_v1();

-- ── RLS / ACL ──────────────────────────────────────────────────────────────
alter table public.commitment_override_receipts enable row level security;
alter table public.commitment_override_receipts force row level security;

revoke all on public.commitment_override_receipts from public, anon, authenticated;
grant select on public.commitment_override_receipts to authenticated;

drop policy if exists commitment_override_receipts_select on public.commitment_override_receipts;
create policy commitment_override_receipts_select
  on public.commitment_override_receipts
  for select
  to authenticated
  using (
    coalesce(public.can_manage_project(project_id), false)
    or coalesce(public.owns_worker(worker_id), false)
  );

-- ── The one writer ─────────────────────────────────────────────────────────
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
    raise exception 'No active assignment for this worker on this project' using errcode = '22023';
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

  v_fp := md5(v_assign::text || '|' || v_uid::text || '|kept|' || coalesce(v_reason, '') || '|' || v_clean::text);

  select r.id into v_id from public.commitment_override_receipts r
   where r.assignment_id = v_assign and r.fingerprint = v_fp;
  if v_id is not null then
    return v_id;  -- idempotent replay: nothing written
  end if;

  select count(*) into v_n from public.commitment_override_receipts r where r.assignment_id = v_assign;
  if v_n >= 50 then
    raise exception 'Receipt limit reached for this assignment' using errcode = '22023';
  end if;

  insert into public.commitment_override_receipts
    (assignment_id, project_id, worker_id, decided_by, decision, window_start, window_end,
     collisions, reason_code, fingerprint)
  values
    (v_assign, p_project_id, v_worker, v_uid, 'kept', v_start, v_end, v_clean, v_reason, v_fp)
  on conflict (assignment_id, fingerprint) do nothing
  returning id into v_id;
  if v_id is null then
    select r.id into v_id from public.commitment_override_receipts r
     where r.assignment_id = v_assign and r.fingerprint = v_fp;
  end if;
  return v_id;
end
$$;

revoke all on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) to authenticated;

comment on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) is
  'J-TIME-FREEDOM step 5. The ONLY writer of commitment_override_receipts. Caller must manage the project and the worker must hold an ACTIVE assignment. Rebuilds the collisions list from a field whitelist (absence = kind + dates only), snapshots the window from projects, stores a closed reason_code, no free text. Idempotent. Authenticated only.';
