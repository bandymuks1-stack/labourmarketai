-- @human-gate-approved — owner approved PR #2621 (2026-10-21, issue #2628): the system-only booking expiry function and its daily DB job, nothing else.
-- Conditions: expired proposals handled correctly; accepted agreements and history untouched; verified in a rolled-back production test before apply. Scope: this SQL only.
--
-- SAFETY CLASS: RED (new SECURITY DEFINER function + REVOKE + a pg_cron job).
-- Draft PR + needs-human-gate; apply ONLY via Supabase MCP apply_migration
-- after the owner approves this exact file. The marker is the risk
-- acknowledgement the static gate reads, not an approval.
--
-- 20261021130000 — BOOKING EXPIRY RUNS ON ITS OWN (CAL-6)
--
-- WHY: `expire_stale_booking_requests_v1` (20260928181000) is the only way a
-- stale `proposed` booking becomes `expired`, and it raises 'Admin only'
-- unless `auth.uid()` is a dual-signal admin. A scheduler has no identity, so
-- nothing has ever run it: production on 2026-10-21 had 4 `proposed` bookings,
-- 2 of them past their response window, and no booking job in pg_cron or in
-- the VPS cron. A worker who never answered keeps the employer's proposal open
-- forever, and the employer's planning reads keep counting it.
--
-- WHAT THIS ADDS (nothing else changes):
--   * `expire_stale_booking_requests_system_v1(p_stale_days)` — the SAME
--     selection and the SAME per-row update as the admin function (only
--     `proposed` rows; deadline passed, or no deadline and the latest move into
--     `proposed` older than the window; 500 rows per run). The engagement side
--     stays with the existing `booking_reopened_close_ends_engagement` trigger.
--   * EXECUTE is revoked from public, anon, authenticated and service_role.
--     Only the database owner — pg_cron runs jobs as that role — can call it.
--     No HTTP route, no API key and no signed-in user can reach it.
--   * The event row keeps `actor_id NOT NULL`: the actor is the booking's
--     proposer (`owner_id`), the person whose proposal lapsed, with
--     reason_kind 'no_response' and reason_note 'system_expiry', so an audit
--     tells a scheduled expiry apart from an admin's (whose uid is the actor).
--   * pg_cron job `booking-expiry-daily` at 04:11 UTC.
--
-- The admin function is untouched and still works for an admin.
--
-- UNDO: supabase/rollbacks/20261021130000_booking_expiry_system_schedule_v1.down.sql

begin;

create or replace function public.expire_stale_booking_requests_system_v1(p_stale_days integer default 14)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  expired_count integer := 0;
  r record;
begin
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select id, owner_id from public.booking_requests br
     where br.status = 'proposed'
       and (
         (br.response_deadline_date is not null and br.response_deadline_date < current_date)
         or (br.response_deadline_date is null
             and coalesce(
                   (select max(e.created_at) from public.booking_request_events e
                     where e.booking_request_id = br.id and e.to_status = 'proposed'),
                   br.created_at)
                 < now() - make_interval(days => p_stale_days))
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
        values (r.id, r.owner_id, 'expired', 'proposed', 'expired', 'no_response', 'system_expiry');
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$function$;

revoke all on function public.expire_stale_booking_requests_system_v1(integer)
  from public, anon, authenticated, service_role;

do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'booking-expiry-daily') then
      perform cron.unschedule('booking-expiry-daily');
    end if;
    perform cron.schedule(
      'booking-expiry-daily',
      '11 4 * * *',
      $job$select public.expire_stale_booking_requests_system_v1(14)$job$
    );
  end if;
end $$;

commit;
