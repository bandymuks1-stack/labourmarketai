-- Rollback 20260928181000: drop the reopen-close trigger and restore
-- expire_stale_booking_requests_v1 exactly as production had it (read back
-- 2026-09-28: staleness from created_at). Engagements already ended by the
-- trigger stay ended (they record a real event).
drop trigger if exists booking_reopened_close_ends_engagement on public.booking_requests;
drop function if exists public.booking_reopened_close_ends_engagement();

create or replace function public.expire_stale_booking_requests_v1(p_stale_days integer default 14)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  expired_count integer := 0;
  r record;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select id from public.booking_requests br
     where br.status = 'proposed'
       and (
         (br.response_deadline_date is not null and br.response_deadline_date < current_date)
         or (br.response_deadline_date is null
             and br.created_at < now() - make_interval(days => p_stale_days))
       )
     limit 500
  loop
    update public.booking_requests
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'proposed';
    if found then
      insert into public.booking_request_events
          (booking_request_id, actor_id, event_type, from_status, to_status,
           reason_kind, reason_note)
        values (r.id, uid, 'expired', 'proposed', 'expired', 'no_response', null);
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$function$;
revoke all on function public.expire_stale_booking_requests_v1(integer) from public, anon;
grant execute on function public.expire_stale_booking_requests_v1(integer) to authenticated;
