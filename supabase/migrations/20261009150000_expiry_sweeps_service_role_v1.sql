-- RED (human gate): two SECURITY DEFINER functions + GRANT. NOT APPLIED.
-- Owner approval required before apply (Supabase MCP apply_migration only).
--
-- WHY. `expire_stale_booking_requests_v1` and `expire_contact_disclosure_requests_v1`
-- read auth.uid() and require is_admin(); a machine (cron) has no uid, so stale
-- booking proposals and stale contact-disclosure requests never expire in the
-- database (the UI only DISPLAYS past-due rows as expired).
--
-- WHAT THIS ADDS. Two service_role-ONLY wrappers with the SAME predicates, run
-- as a DEDICATED SYSTEM IDENTITY — never a person's profile, never an admin.
-- The admin-facing functions are untouched.
--
-- THE SYSTEM IDENTITY (owner decision 2026-10-09: not the owner's admin profile).
--   id  1fb04546-50e6-4214-b579-656d34a3bc9e  (fixed, generated once; not the nil UUID, which the
--   schema already uses as a COALESCE sentinel).
--   Audit tables require a real profile: booking_request_events.actor_id and
--   contact_disclosure_request_events.actor_profile_id are NOT NULL FKs to
--   profiles(id), and profiles.id is an FK to auth.users(id). The identity is
--   therefore one auth user (banned, no credentials, no role metadata) + its
--   profile row (active_role NULL, NO profile_roles row, so is_admin() is false).
--   Creating an auth user is NOT done in SQL: it is an owner-run step with
--   apps/web/scripts/provision-system-actor.ts (Admin API). Until it has run, the
--   wrappers refuse with 'system actor not provisioned' and change nothing.
--
-- MINIMUM PRIVILEGE. The wrappers take no actor argument (no caller can
-- impersonate), execute only for service_role, and refuse to run if the system
-- profile ever holds ANY profile_roles row.
--
-- ROLLBACK: supabase/rollbacks/20261009150000_expiry_sweeps_service_role_v1.down.sql
-- (drops the functions; rows already expired stay expired; the system identity is
-- kept once audit events reference it — ban it instead of deleting it).
-- @human-gate-approved
begin;

create or replace function public.expiry_sweep_actor_id_v1()
returns uuid
language sql
immutable
set search_path = public
as $$ select '1fb04546-50e6-4214-b579-656d34a3bc9e'::uuid $$;

create or replace function public._expiry_sweep_assert_actor_v1()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a uuid := public.expiry_sweep_actor_id_v1();
begin
  if not exists (select 1 from public.profiles where id = a) then
    raise exception 'system actor not provisioned' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profile_roles where profile_id = a)
     or exists (select 1 from public.profiles where id = a and active_role is not null) then
    raise exception 'system actor must hold no role' using errcode = '42501';
  end if;
  return a;
end
$$;

create or replace function public.sweep_expire_stale_booking_requests_v1(
  p_stale_days integer default 14
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public._expiry_sweep_assert_actor_v1();
  n integer := 0;
  r record;
begin
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
      values (r.id, actor, 'expired', 'proposed', 'expired', 'no_response', null);
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

create or replace function public.sweep_expire_contact_disclosure_requests_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public._expiry_sweep_assert_actor_v1();
  n integer := 0;
  r record;
begin
  for r in
    select id from public.contact_disclosure_requests
    where status = 'created' and expires_at <= now()
    for update
  loop
    update public.contact_disclosure_requests
       set status = 'expired', updated_at = now()
     where id = r.id;
    perform public.contact_disclosure_log_change(
      r.id, actor, 'expired', 'created', 'expired',
      'sweep_expire_contact_disclosure_requests_v1'
    );
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'expired_count', n);
end
$$;

revoke all on function public.expiry_sweep_actor_id_v1() from public, anon, authenticated;
revoke all on function public._expiry_sweep_assert_actor_v1() from public, anon, authenticated;
revoke all on function public.sweep_expire_stale_booking_requests_v1(integer) from public, anon, authenticated;
revoke all on function public.sweep_expire_contact_disclosure_requests_v1() from public, anon, authenticated;
grant execute on function public.sweep_expire_stale_booking_requests_v1(integer) to service_role;
grant execute on function public.sweep_expire_contact_disclosure_requests_v1() to service_role;

commit;
