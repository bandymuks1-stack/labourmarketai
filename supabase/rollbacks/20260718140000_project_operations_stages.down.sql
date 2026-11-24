-- Rollback for 20260718140000_project_operations_stages.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.delete_project_stage_v1(uuid);
drop function if exists public.update_project_stage_v1(uuid, text, text, integer, date, date, date, date, text, text);
drop function if exists public.add_project_stage_v1(uuid, text, integer, date, date, text);

drop table if exists public.project_stages cascade;
