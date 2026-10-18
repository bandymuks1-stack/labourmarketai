-- Faithful minimal harness for the DEM-8 saved-search proof.
--
-- Creates ONLY what the real migration needs so it can run VERBATIM:
--   * roles `authenticated` / `anon` (the migration GRANTs and REVOKEs)
--   * an `auth.uid()` shim reading `app.uid`, as every other db-proof here does
--   * profiles / workers — the spine the table references
--   * `is_admin()`, the second arm of the SELECT policy
--   * `notification_events` with the v6 type constraints, so the widening in
--     the same migration is exercised against the real prior state rather
--     than against an empty table
--
-- Nothing here re-implements worker_saved_searches or any of its RPCs.
--
-- RLS IS THE POINT of half this proof, so the harness is careful about roles:
-- the migration's policy is exercised by `set role authenticated`, because a
-- superuser bypasses RLS entirely and would prove nothing.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create table public.profiles (id uuid primary key, display_name text);
create table public.workers (
  id uuid primary key,
  profile_id uuid references public.profiles(id),
  display_name text
);

-- The SELECT policy's subquery runs with the QUERYING role's privileges, not
-- the table owner's, so `authenticated` must be able to read the spine or the
-- policy fails with a permission error that looks exactly like "no rows".
-- Production grants these; the harness must too, or the privacy proof below
-- would pass for the wrong reason.
grant select on public.workers, public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select false;
$$;
grant execute on function public.is_admin() to authenticated;

-- The v6 state of the notification store: enough shape for the widening in
-- the migration under test to be a real ALTER of a real constraint.
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  constraint notification_events_type_check check (event_type in (
    'booking_proposed','booking_accepted','booking_declined','booking_withdrawn',
    'absence_requested','absence_approved','absence_rejected',
    'engagement_created','engagement_ended',
    'workflow_step_pending','workflow_decided','workflow_delegated','workflow_escalated',
    'document_ack_assigned','document_ack_completed','document_expiring',
    'work_task_assigned',
    'demand_interest_expressed','demand_interest_reviewed',
    'weekly_digest'
  )),
  constraint notification_events_entity_type_check check (entity_type in (
    'booking_request','worker_absence','engagement','workflow_instance',
    'worker_document','org_document','document_acknowledgement','work_task',
    'demand_interest_signal','demand_interest_response','weekly_digest'
  ))
);
