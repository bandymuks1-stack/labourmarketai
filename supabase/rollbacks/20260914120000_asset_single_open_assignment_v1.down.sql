-- Rollback for 20260914120000_asset_single_open_assignment_v1.sql
--
-- Restores the pre-MKT-3 lifecycle RPCs verbatim from 20260718170000 and drops
-- the one-open-assignment index.
--
-- READ BEFORE APPLYING. This reverse RE-OPENS the defect it closed: after it,
-- `issue_asset_v1` can hand the same asset to two people, and the manager's
-- overview will show only the first of them. Nothing here loses data — the
-- index drop keeps every row and the function bodies are pure logic — so the
-- reverse is complete and safe in the data sense. It is only unsafe in the
-- truth sense, which is why it exists for a clean reverse and not for normal
-- operation.
--
-- If the index drop is being considered because a legitimate case needs two
-- open assignments on one asset (e.g. a divisible consumable), that is a model
-- change, not a rollback: the assignment would need a quantity, and `assets`
-- currently describes one indivisible thing.

drop index if exists public.asset_assignments_one_open_per_asset;

create or replace function public.issue_asset_v1(
  p_asset_id uuid,
  p_project_id uuid default null,
  p_worker_id uuid default null,
  p_condition_at_issue text default 'unknown',
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
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
  insert into public.asset_assignments (asset_id, project_id, worker_id, status, condition_at_issue, note, issued_by)
  values (p_asset_id, p_project_id, p_worker_id, 'issued', p_condition_at_issue, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_id;
  update public.assets set availability = 'assigned', updated_at = now() where id = p_asset_id;
  return v_id;
end; $$;

create or replace function public.transfer_asset_assignment_v1(
  p_assignment_id uuid,
  p_new_project_id uuid default null,
  p_new_worker_id uuid default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_status text; v_cond text; v_new uuid;
begin
  select asset_id, status, condition_at_issue into v_asset, v_status, v_cond
    from public.asset_assignments where id = p_assignment_id;
  if v_asset is null then raise exception 'assignment not found'; end if;
  if not public.caller_manages_asset(v_asset) then raise exception 'not authorized to manage this asset'; end if;
  if v_status not in ('issued','acknowledged') then raise exception 'only an active assignment can be transferred'; end if;
  if p_new_project_id is null and p_new_worker_id is null then raise exception 'transfer target required'; end if;
  update public.asset_assignments set status = 'transferred', updated_at = now() where id = p_assignment_id;
  insert into public.asset_assignments (asset_id, project_id, worker_id, status, condition_at_issue, note, issued_by)
  values (v_asset, p_new_project_id, p_new_worker_id, 'issued', v_cond, nullif(left(coalesce(p_note,''),500),''), auth.uid())
  returning id into v_new;
  return v_new;
end; $$;

create or replace function public.return_asset_v1(
  p_assignment_id uuid,
  p_condition_at_return text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_asset uuid; v_status text;
begin
  select asset_id, status into v_asset, v_status from public.asset_assignments where id = p_assignment_id;
  if v_asset is null then raise exception 'assignment not found'; end if;
  if not public.caller_manages_asset(v_asset) then raise exception 'not authorized to manage this asset'; end if;
  if v_status not in ('issued','acknowledged') then raise exception 'only an active assignment can be returned'; end if;
  if p_condition_at_return not in ('new','good','fair','poor','damaged','unknown') then raise exception 'invalid condition'; end if;
  update public.asset_assignments
     set status = 'returned', returned_at = now(), condition_at_return = p_condition_at_return,
         note = coalesce(nullif(left(coalesce(p_note,''),500),''), note), updated_at = now()
   where id = p_assignment_id;
  update public.assets set availability = 'available', condition = p_condition_at_return, updated_at = now()
   where id = v_asset;
end; $$;
