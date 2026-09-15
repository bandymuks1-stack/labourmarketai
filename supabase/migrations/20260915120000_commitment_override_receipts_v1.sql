-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY. PREPARED FOR REVIEW ONLY.
--
-- This file carries NO approval annotation on purpose: the owner
-- has not approved it, and the annotation would assert an approval that does
-- not exist. migration-safety is RED on this file BY DESIGN.
--
-- 20260915120000 — commitment_override_receipts v1
-- J-TIME-FREEDOM step 5: "The authorized actor decides, and an explicit
-- override is recorded with a receipt." (CAL-7, the missing half.)
--
-- THE GAP, MEASURED. Since the approved wave of 2026-09-14 a manager who
-- assigns someone is told, at the moment of commitment, what that person is
-- already committed to (`lib/workforce/commitment-reservation.ts`), and the
-- warning cannot block (SEP-2). Since 2026-09-15 they are also shown what
-- they could do instead (step 4). DETECT → WARN → ALTERNATIVES → DECIDE is
-- real, and the decision is the actor's. What does not exist is the RECEIPT:
-- nothing records, afterwards, that a KNOWN clash was accepted deliberately,
-- by whom, knowing what. The assignment row cannot carry it — it has no
-- column for it, it is UPDATE-able, and it would conflate "assigned" with
-- "assigned knowing X". `audit_logs` cannot carry it either: it is admin-only
-- on both INSERT and SELECT, carries a modification timestamp with a trigger, and the one
-- person the receipt exists to protect — the worker whose calendar now holds
-- two things — could never read it there.
--
-- WHAT THIS ADDS. ONE append-only table and ONE writer.
--
--   commitment_override_receipts
--     the assignment it is about (project + worker), the actor who accepted
--     the clash, the window they were shown (the project's dates AT THAT
--     MOMENT — a snapshot, because the project can be re-dated later and the
--     receipt must keep saying what was known), the collisions they were
--     shown (a closed jsonb shape, ≤ 20 entries, each naming a source, a row
--     id and the shared days), an optional bounded reason, and when.
--     No modification timestamp. An UPDATE or DELETE raises — a receipt that can be
--     edited is not a receipt.
--
--   record_commitment_override_v1(p_project_id, p_worker_id, p_collisions, p_reason)
--     SECURITY DEFINER. Admits ONLY a caller who `can_manage_project` AND only
--     while the worker holds an ACTIVE assignment to that project: a receipt
--     can be written for a commitment that exists, never for one imagined.
--     Snapshots the window from `projects` itself, not from the caller.
--     Validates the collisions shape; refuses anything else with 22023.
--     Abuse bound: at most 20 receipts per (project, worker).
--
-- RLS, STATED EXPLICITLY.
--   anon:          nothing — no grant, no policy.
--   authenticated: SELECT for the project's managers (`can_manage_project`)
--                  AND for the worker themselves (`owns_worker`). The second
--                  arm is the point: the subject of the decision can see that
--                  it was made knowingly. Nobody else. Admin via is_admin().
--                  No INSERT / UPDATE / DELETE policy — the RPC is the only
--                  writer, and the trigger refuses the other two verbs even
--                  to the table owner.
--
-- WHAT IS DELIBERATELY NOT BUILT. No approval workflow (this is not a
-- management decision — it is one manager's explicit acceptance of a warning
-- they were given); no notification (a later slice may emit the existing
-- notification type to the worker; this migration creates no event type); no
-- "cancel the clash" path (ending the assignment already exists, and a
-- receipt for an ended assignment remains true history).
--
-- RISK / REVERSIBILITY. Additive: one table, one function, one trigger, two
-- grants to authenticated on the function only. Nothing existing is altered.
-- ROLLBACK: supabase/rollbacks/20260915120000_commitment_override_receipts_v1.down.sql
-- (guarded — refuses while receipts exist, because a receipt is evidence).
--
-- POST-APPLY VERIFICATION (rolled-back walk, scripts/db-proof pattern):
--   As a project manager with an active assignment for worker W on project P:
--     select record_commitment_override_v1(P, W,
--       '[{"source":"booking","sourceId":"<uuid>","overlapStart":"2026-10-05","overlapEnd":"2026-10-07"}]'::jsonb,
--       'Half-day handover, agreed with the client');
--     select count(*) from commitment_override_receipts;   -- 1
--   As worker W:  select count(*) from commitment_override_receipts;  -- 1
--   As a manager of another company: -- 0, and the RPC raises 42501
--   update commitment_override_receipts set reason = 'x';  -- raises
--   + APPLIED_LEDGER.md row.
-- ============================================================================

begin;

-- ── 0. Safety assertions ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.project_worker_assignments') is null then
    raise exception 'project_worker_assignments missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_manage_project'
  ) then
    raise exception 'can_manage_project missing';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'owns_worker'
  ) then
    raise exception 'owns_worker missing';
  end if;
end $$;

-- ── 1. The receipt ─────────────────────────────────────────────────────────
create table if not exists public.commitment_override_receipts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  worker_id     uuid not null references public.workers(id) on delete cascade,
  decided_by    uuid not null references public.profiles(id) on delete cascade,
  -- The window the actor was shown: the project's dates at that moment.
  window_start  date,
  window_end    date,
  -- The collisions the actor was shown. Closed shape, validated by the RPC.
  collisions    jsonb not null,
  reason        text check (reason is null or char_length(reason) <= 1000),
  created_at    timestamptz not null default now(),
  constraint commitment_override_receipts_collisions_shape check (
    jsonb_typeof(collisions) = 'array'
    and jsonb_array_length(collisions) between 1 and 20
  )
);

comment on table public.commitment_override_receipts is
  'J-TIME-FREEDOM step 5. An APPEND-ONLY receipt that a project manager accepted a known calendar clash for one assignment, knowing these collisions, on this window, for this reason. Written only by record_commitment_override_v1; readable by the project''s managers and by the worker it concerns. Never updated, never deleted.';

create index if not exists commitment_override_receipts_project_worker_idx
  on public.commitment_override_receipts (project_id, worker_id, created_at desc);
create index if not exists commitment_override_receipts_worker_idx
  on public.commitment_override_receipts (worker_id, created_at desc);

-- ── 2. Append-only: no verb but INSERT, for anyone ─────────────────────────
create or replace function public.commitment_override_receipts_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'commitment_override_receipts is append-only (% refused)', tg_op
    using errcode = '42501';
end $$;

drop trigger if exists commitment_override_receipts_immutable on public.commitment_override_receipts;
create trigger commitment_override_receipts_immutable
  before update or delete on public.commitment_override_receipts
  for each row execute function public.commitment_override_receipts_immutable();

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.commitment_override_receipts enable row level security;
alter table public.commitment_override_receipts force row level security;

revoke all on public.commitment_override_receipts from public, anon;
grant select on public.commitment_override_receipts to authenticated;

drop policy if exists commitment_override_receipts_select on public.commitment_override_receipts;
create policy commitment_override_receipts_select
  on public.commitment_override_receipts
  for select
  to authenticated
  using (
    public.can_manage_project(project_id)
    or public.owns_worker(worker_id)
    or public.is_admin()
  );
-- No insert / update / delete policy: the RPC is the only writer.

-- ── 4. The one writer ──────────────────────────────────────────────────────
create or replace function public.record_commitment_override_v1(
  p_project_id uuid,
  p_worker_id  uuid,
  p_collisions jsonb,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_start date;
  v_end   date;
  v_id    uuid;
  v_item  jsonb;
  v_n     integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null or p_worker_id is null then
    raise exception 'project and worker are required' using errcode = '22023';
  end if;

  -- Authority: the caller manages THIS project. Checked before anything is
  -- read so a refusal cannot be used to probe another company's project.
  if not (public.can_manage_project(p_project_id) or public.is_admin()) then
    raise exception 'Not authorized to record an override on this project'
      using errcode = '42501';
  end if;

  -- A receipt is about a commitment that EXISTS: an active assignment.
  if not exists (
    select 1 from public.project_worker_assignments a
     where a.project_id = p_project_id
       and a.worker_id  = p_worker_id
       and a.status     = 'active'
  ) then
    raise exception 'no active assignment for this worker on this project'
      using errcode = '22023';
  end if;

  -- The collisions shape is CLOSED: an array of 1..20 objects, each with a
  -- known source, a source id and the shared days. Nothing else is stored.
  if p_collisions is null
     or jsonb_typeof(p_collisions) <> 'array'
     or jsonb_array_length(p_collisions) < 1
     or jsonb_array_length(p_collisions) > 20 then
    raise exception 'collisions must be an array of 1..20 entries' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p_collisions) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'source','') not in ('project','booking','trip','absence')
       or coalesce(v_item->>'sourceId','') = ''
       or (v_item->>'overlapStart') is null
       or (v_item->>'overlapEnd') is null then
      raise exception 'invalid collision entry' using errcode = '22023';
    end if;
  end loop;

  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception 'reason too long' using errcode = '22023';
  end if;

  -- Abuse bound.
  select count(*) into v_n from public.commitment_override_receipts
   where project_id = p_project_id and worker_id = p_worker_id;
  if v_n >= 20 then
    raise exception 'receipt limit reached for this assignment' using errcode = '22023';
  end if;

  -- The window is the PROJECT's, read here — never taken from the caller.
  select start_date, end_date into v_start, v_end from public.projects where id = p_project_id;

  insert into public.commitment_override_receipts
    (project_id, worker_id, decided_by, window_start, window_end, collisions, reason)
  values
    (p_project_id, p_worker_id, v_uid, v_start, v_end,
     (select jsonb_agg(jsonb_build_object(
        'source',       e->>'source',
        'sourceId',     e->>'sourceId',
        'overlapStart', e->>'overlapStart',
        'overlapEnd',   e->>'overlapEnd'))
        from jsonb_array_elements(p_collisions) e),
     nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) to authenticated;

comment on function public.record_commitment_override_v1(uuid, uuid, jsonb, text) is
  'J-TIME-FREEDOM step 5. Records that the caller — a manager of the project — accepted a known calendar clash for an ACTIVE assignment, knowing these collisions. Append-only; the window is snapshotted from the project row. Authenticated callers only.';

commit;

-- ROLLBACK
-- (see supabase/rollbacks/20260915120000_commitment_override_receipts_v1.down.sql — guarded)
-- drop function if exists public.record_commitment_override_v1(uuid, uuid, jsonb, text);
-- drop trigger if exists commitment_override_receipts_immutable on public.commitment_override_receipts;
-- drop function if exists public.commitment_override_receipts_immutable();
-- drop table if exists public.commitment_override_receipts;
