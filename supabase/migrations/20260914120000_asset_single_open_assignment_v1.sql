-- @human-gate-approved
-- MKT-3 — an asset is in exactly ONE pair of hands at a time.
--
-- THE DEFECT, TRACED END TO END. `issue_asset_v1` (20260718170000) inserted an
-- `issued` row and set `assets.availability = 'assigned'` without ever asking
-- whether the asset was already out. No availability test, no open-assignment
-- test, no row lock. So two managers of the same organization — or one manager
-- double-clicking — could each be told "issued", and the same drill was then
-- owed by two people.
--
-- WHY IT WAS INVISIBLE, WHICH IS THE WORSE HALF. `lib/assets/assets.ts` builds
-- `activeByAsset` with `if (!activeByAsset.has(r.asset_id))` — it keeps the
-- FIRST open assignment per asset and silently drops the rest. The manager's
-- own screen would therefore show ONE holder while `getMyAssignedAssets`
-- showed the tool to BOTH workers. The product would have stated something
-- false to three people at once, and the surface that could have revealed it
-- was the surface that hid it.
--
-- THE FIX, IN TWO LAYERS.
--   1. A partial unique index: at most one `issued`/`acknowledged` assignment
--      per asset, enforced by the database itself. This holds no matter who
--      writes — a future RPC, a repair script, a service-role job. It is the
--      real guarantee; the function checks below only make the refusal legible.
--   2. `select … for update` on the asset row at the top of every lifecycle
--      RPC (issue / transfer / return), before any decision is taken. Two
--      concurrent issues now serialize: the second waits, then sees the first
--      one's row and refuses with a sentence a person can act on, instead of
--      failing on a unique-violation the UI would report as an unknown error.
--
-- Lock ordering is identical in all three functions (asset row first, then
-- assignment rows), so they cannot deadlock against one another.
--
-- WHAT IS DELIBERATELY NOT CHANGED. Authority is untouched: issue / transfer /
-- return stay `caller_manages_asset`, acknowledge stays the assigned worker.
-- No policy, no grant, no column, no table. `create or replace function`
-- preserves the existing EXECUTE grants, so the signatures pinned in
-- `lib/security/secdef-revoke-scope.ts` are unchanged.
--
-- RED class: SECURITY DEFINER function replacement (migration-safety rule (g)).
-- Reviewed and human-gated; the PR carries `needs-human-gate` and the full SQL.
-- Production exposure at authoring time: 0 assets, 0 asset_assignments — so
-- the index cannot fail on existing data and no live row changes meaning.
-- Rollback: supabase/rollbacks/20260914120000_asset_single_open_assignment_v1.down.sql

-- ── 1. The structural guarantee ─────────────────────────────────────────────
-- `transferred` and `returned` are closed states and are intentionally outside
-- the predicate: an asset accumulates history, it just cannot be OPEN twice.
create unique index if not exists asset_assignments_one_open_per_asset
  on public.asset_assignments (asset_id)
  where status in ('issued', 'acknowledged');

-- ── 2. issue: refuse when the asset is already out, or not issuable ──────────
create or replace function public.issue_asset_v1(
  p_asset_id uuid,
  p_project_id uuid default null,
  p_worker_id uuid default null,
  p_condition_at_issue text default 'unknown',
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_availability text; v_open uuid;
begin
  if not public.caller_manages_asset(p_asset_id) then
    raise exception 'not authorized to manage this asset';
  end if;
  if p_project_id is null and p_worker_id is null then
    raise exception 'assignment target required (project or worker)';
  end if;
  if p_condition_at_issue not in ('new','good','fair','poor','damaged','unknown') then
    raise exception 'invalid condition';
  end if;

  -- Serialize every lifecycle write for THIS asset behind one row lock, taken
  -- before any decision is read. A concurrent issue blocks here and then sees
  -- the assignment the first one wrote.
  select availability into v_availability
    from public.assets where id = p_asset_id for update;
  if v_availability is null then
    raise exception 'asset not found';
  end if;
  if v_availability in ('maintenance','retired') then
    raise exception 'asset is not issuable while it is %', v_availability;
  end if;

  select id into v_open
    from public.asset_assignments
   where asset_id = p_asset_id and status in ('issued','acknowledged')
   limit 1;
  if v_open is not null then
    raise exception 'asset is already issued and must be returned before it can be issued again';
  end if;

  insert into public.asset_assignments (asset_id, project_id, worker_id, status, condition_at_issue, note, issued_by)
  values (p_asset_id, p_project_id, p_worker_id, 'issued', p_condition_at_issue, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_id;
  update public.assets set availability = 'assigned', updated_at = now() where id = p_asset_id;
  return v_id;
end; $$;

-- ── 3. transfer: same lock, so it cannot interleave with an issue ────────────
-- The order below matters and is load-bearing: the outgoing assignment leaves
-- the open set BEFORE the incoming one is inserted, so the unique index sees
-- one open row throughout. Reversing these two statements would make every
-- transfer fail.
create or replace function public.transfer_asset_assignment_v1(
  p_assignment_id uuid,
  p_new_project_id uuid default null,
  p_new_worker_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_status text; v_cond text; v_new uuid;
begin
  select asset_id into v_asset from public.asset_assignments where id = p_assignment_id;
  if v_asset is null then raise exception 'assignment not found'; end if;
  if not public.caller_manages_asset(v_asset) then raise exception 'not authorized to manage this asset'; end if;

  perform 1 from public.assets where id = v_asset for update;

  -- Re-read the status AFTER the lock: a concurrent return may have closed
  -- this assignment while we waited, and transferring it then would resurrect
  -- an assignment the other transaction had already ended.
  select status, condition_at_issue into v_status, v_cond
    from public.asset_assignments where id = p_assignment_id;
  if v_status not in ('issued','acknowledged') then raise exception 'only an active assignment can be transferred'; end if;
  if p_new_project_id is null and p_new_worker_id is null then raise exception 'transfer target required'; end if;

  update public.asset_assignments set status = 'transferred', updated_at = now() where id = p_assignment_id;
  insert into public.asset_assignments (asset_id, project_id, worker_id, status, condition_at_issue, note, issued_by)
  values (v_asset, p_new_project_id, p_new_worker_id, 'issued', v_cond, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_new;
  return v_new;
end; $$;

-- ── 4. return: same lock; and do not invent an availability ──────────────────
create or replace function public.return_asset_v1(
  p_assignment_id uuid,
  p_condition_at_return text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_status text;
begin
  select asset_id into v_asset from public.asset_assignments where id = p_assignment_id;
  if v_asset is null then raise exception 'assignment not found'; end if;
  if not public.caller_manages_asset(v_asset) then raise exception 'not authorized to manage this asset'; end if;
  if p_condition_at_return not in ('new','good','fair','poor','damaged','unknown') then raise exception 'invalid condition'; end if;

  perform 1 from public.assets where id = v_asset for update;

  select status into v_status from public.asset_assignments where id = p_assignment_id;
  if v_status not in ('issued','acknowledged') then raise exception 'only an active assignment can be returned'; end if;

  update public.asset_assignments
     set status = 'returned', returned_at = now(), condition_at_return = p_condition_at_return,
         note = coalesce(nullif(left(coalesce(p_note,''),500),''), note), updated_at = now()
   where id = p_assignment_id;

  -- The condition is always recorded. Availability flips to 'available' ONLY
  -- from 'assigned': an asset withdrawn to 'maintenance' or 'retired' while it
  -- was out must not be silently made issuable again by the act of handing it
  -- back — that would re-open the very door the issue guard above closes.
  update public.assets
     set condition = p_condition_at_return,
         availability = case when availability = 'assigned' then 'available' else availability end,
         updated_at = now()
   where id = v_asset;
end; $$;

-- ── 5. keep anon out, explicitly ────────────────────────────────────────────
-- `create or replace` preserves the existing privileges, so on production
-- these three keep the direct `authenticated` grant from 20260718170000 and
-- stay revoked from anon by the 20260722160000 closure. That is true of the
-- database we have — it is NOT true of a database rebuilt from the migration
-- chain, where the Supabase bootstrap's ALTER DEFAULT PRIVILEGES hands anon an
-- explicit EXECUTE on every function created after the closure ran. Restating
-- the revoke costs nothing on production (idempotent) and is the difference
-- between a reproducible chain and one that quietly reopens three
-- manager-gated write RPCs to anonymous callers on a fresh reset.
-- `authenticated` is deliberately NOT named: it is not being changed.
revoke execute on function public.issue_asset_v1(uuid, uuid, uuid, text, text) from anon, public;
revoke execute on function public.transfer_asset_assignment_v1(uuid, uuid, uuid, text) from anon, public;
revoke execute on function public.return_asset_v1(uuid, text, text) from anon, public;

-- ROLLBACK: see supabase/rollbacks/20260914120000_asset_single_open_assignment_v1.down.sql
