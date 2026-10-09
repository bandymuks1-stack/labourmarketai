-- RED (human gate): two SECURITY DEFINER functions + GRANT. NOT APPLIED.
-- Owner approval required before apply (Supabase MCP apply_migration only).
--
-- WHY. `expire_stale_booking_requests_v1` and `expire_contact_disclosure_requests_v1`
-- both read auth.uid() and require is_admin(); a machine (cron) has no uid, so
-- stale booking proposals and stale contact-disclosure requests never expire in
-- the database (the UI only DISPLAYS past-due rows as expired).
--
-- WHAT THIS ADDS. Two service_role-ONLY wrappers with the SAME predicates. The
-- admin-facing functions are untouched.
--
-- ACTOR (pre-apply finding, 2026-10-09, production catalogs):
--   booking_request_events.actor_id               uuid NOT NULL -> profiles(id)
--   contact_disclosure_request_events.actor_profile_id uuid NOT NULL -> profiles(id)
-- A NULL "system" actor is therefore impossible without relaxing audit columns,
-- which this migration does NOT do. The caller supplies an existing admin
-- profile as `p_actor` (the route reads EXPIRY_SWEEP_ACTOR_PROFILE_ID; unset =
-- the route refuses and nothing runs). The function verifies that profile holds
-- the admin role. WHICH profile acts as the system actor is an OWNER DECISION.
--
-- ROLLBACK: supabase/rollbacks/20261009150000_expiry_sweeps_service_role_v1.down.sql
-- (drops both functions; rows already expired stay expired, as intended).
-- @human-gate-approved
begin;

create or replace function public.sweep_expire_stale_booking_requests_v1(
  p_actor uuid,
  p_stale_days integer default 14
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  if p_actor is null or not exists (
    select 1 from public.profile_roles
    where profile_id = p_actor and role = 'admin'
  ) then
    raise exception 'Sweep actor must be an existing admin profile' using errcode = '42501';
  end if;
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select br.id
    from public.booking_requests br
    where br.status = 'proposed'
      and (
        (br.response_deadline_date is not null and br.response_deadline_date < current_date)
        or (
          br.response_deadline_date is null
          and coalesce(
                (select max(e.created_at) from public.booking_request_events e
                  where e.booking_request_id = br.id and e.to_status = 'proposed'),
                br.created_at
              ) < now() - make_interval(days => p_stale_days)
        )
      )
    limit 500
  loop
    update public.booking_requests
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'proposed';
    if found then
      insert into public.booking_request_events
        (booking_request_id, actor_id, event_type, from_status, to_status, reason_kind, reason_note)
      values (r.id, p_actor, 'expired', 'proposed', 'expired', 'no_response', null);
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

create or replace function public.sweep_expire_contact_disclosure_requests_v1(
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  if p_actor is null or not exists (
    select 1 from public.profile_roles
    where profile_id = p_actor and role = 'admin'
  ) then
    raise exception 'Sweep actor must be an existing admin profile' using errcode = '42501';
  end if;

  for r in
    select id from public.contact_disclosure_requests
    where status = 'created' and expires_at <= now()
    for update
  loop
    update public.contact_disclosure_requests
       set status = 'expired', updated_at = now()
     where id = r.id;
    perform public.contact_disclosure_log_change(
      r.id, p_actor, 'expired', 'created', 'expired',
      'sweep_expire_contact_disclosure_requests_v1'
    );
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'expired_count', n);
end
$$;

revoke all on function public.sweep_expire_stale_booking_requests_v1(uuid, integer) from public, anon, authenticated;
revoke all on function public.sweep_expire_contact_disclosure_requests_v1(uuid) from public, anon, authenticated;
grant execute on function public.sweep_expire_stale_booking_requests_v1(uuid, integer) to service_role;
grant execute on function public.sweep_expire_contact_disclosure_requests_v1(uuid) to service_role;

commit;
