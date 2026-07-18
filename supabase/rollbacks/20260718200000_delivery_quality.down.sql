-- Rollback for 20260718200000_delivery_quality.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.delete_defect_v1(uuid);
drop function if exists public.add_defect_correction_v1(uuid, text, text, text, date);
drop function if exists public.set_defect_status_v1(uuid, text, uuid);
drop function if exists public.report_defect_v1(uuid, text, text, text, uuid, text, date);
drop function if exists public.caller_manages_defect(uuid);

drop table if exists public.defect_corrections cascade;
drop table if exists public.defects cascade;
