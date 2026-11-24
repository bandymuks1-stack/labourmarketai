-- Rollback for 20260718150000_workforce_leave_absence.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.cancel_worker_absence_v1(uuid);
drop function if exists public.review_worker_absence_v1(uuid, text);
drop function if exists public.request_worker_absence_v1(uuid, text, date, date, boolean, text);

drop table if exists public.worker_absences cascade;
