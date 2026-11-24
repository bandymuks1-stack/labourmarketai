-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 20260829140000_work_hour_allocations_v1
--
-- The forward migration is purely additive, so this reverses cleanly: it drops
-- only what that file created and touches nothing that existed before.
--
-- DATA WARNING, stated plainly: dropping `work_hour_allocations` destroys every
-- recorded work-hour fact. Those rows are the canonical record — timesheets
-- hold only aggregated snapshots of them. Export or archive before running
-- this on any database where an operator has entered real hours.
--
-- `work_objects.color_hex` is UX-only, so dropping it loses nothing but tints.
-- ════════════════════════════════════════════════════════════════════════════

drop trigger if exists work_hour_allocations_set_updated_at on public.work_hour_allocations;

drop index if exists public.work_hour_allocations_org_date_idx;
drop index if exists public.work_hour_allocations_worker_date_idx;
drop index if exists public.work_hour_allocations_object_date_idx;

drop policy if exists work_hour_allocations_select on public.work_hour_allocations;
drop policy if exists work_hour_allocations_insert on public.work_hour_allocations;
drop policy if exists work_hour_allocations_update on public.work_hour_allocations;

drop table if exists public.work_hour_allocations;

alter table public.work_objects
  drop constraint if exists work_objects_color_hex_format;
alter table public.work_objects
  drop column if exists color_hex;
