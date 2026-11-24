-- Rollback 20260928200000: the trigger function as 20260928181000 defined it
-- (ends on close only; no restore on re-accept).
create or replace function public.booking_reopened_close_ends_engagement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status = 'proposed'
     and new.status in ('declined', 'withdrawn', 'expired')
     and exists (select 1 from public.booking_request_events e
                  where e.booking_request_id = new.id
                    and e.from_status = 'accepted'
                    and e.to_status = 'proposed') then
    update public.company_worker_engagements
       set status = 'ended', ended_at = now(), ended_by = auth.uid()
     where source_booking_id = new.id
       and status = 'active';
  end if;
  return new;
end;
$function$;
revoke all on function public.booking_reopened_close_ends_engagement() from public, anon, authenticated;
