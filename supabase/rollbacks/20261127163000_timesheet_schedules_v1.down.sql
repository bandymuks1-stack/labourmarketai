-- Disable execution while preserving opt-ins and every generated document/event.
begin;
revoke execute on function public.save_timesheet_schedule_v1(uuid,uuid,text,text,text,smallint,boolean) from authenticated;
revoke execute on function public.run_due_timesheet_schedules_v1() from service_role;
revoke execute on function public.pending_timesheet_schedule_notifications_v1() from service_role;
revoke execute on function public.ack_timesheet_schedule_notification_v1(uuid,uuid,boolean) from service_role;
-- Remove only an entirely unused extension. Otherwise retain the private settings
-- for an explicit reviewed recovery; no timesheet/workflow history is deleted.
do $$ begin
  if not exists(select 1 from public.timesheet_schedules) then
    drop function public.ack_timesheet_schedule_notification_v1(uuid,uuid,boolean);
    drop function public.pending_timesheet_schedule_notifications_v1();
    drop function public.run_due_timesheet_schedules_v1();
    drop function public.save_timesheet_schedule_v1(uuid,uuid,text,text,text,smallint,boolean);
    drop function public.timesheet_schedule_next_v1(text,time,text,smallint,timestamptz);
    drop table public.timesheet_schedules;
  end if;
end $$;
commit;
