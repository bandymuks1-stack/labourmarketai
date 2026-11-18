-- =====================================================================
-- Regression test for 20261114100000_booking_refuses_closed_need_v1.
--
-- Runs ONLY on a throwaway local database (the isolated CI job,
-- .github/workflows/signup-isolated.yml): `psql -v ON_ERROR_STOP=1 -f`.
-- Every row it writes is synthetic (fixed test ids, `@local.test` addresses)
-- and the whole run is one transaction that is ROLLED BACK at the end, so
-- nothing it writes survives. Never point this at production.
--
-- Each case raises 'FAIL <case>: …' when the database behaves wrongly; the
-- first failure stops the run (ON_ERROR_STOP) and fails the CI step.
-- The concurrent cases need two sessions and live in the companion
-- 20261114100000_booking_refuses_closed_need_race.sh.
-- =====================================================================

begin;

-- ── Synthetic people: one employer, one worker ────────────────────────
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data,
   confirmation_token, recovery_token, email_change,
   email_change_token_new, email_change_token_current,
   phone_change, phone_change_token, reauthentication_token,
   email_change_confirm_status, is_sso_user)
values
  ('00000000-0000-0000-0000-000000000000', 'c1053d00-0000-4000-8000-0000000000e1',
   'authenticated', 'authenticated', 'closed-need.employer@local.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"company","locale":"en"}'::jsonb, '', '', '', '', '', '', '', '', 0, false),
  ('00000000-0000-0000-0000-000000000000', 'c1053d00-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'closed-need.worker@local.test', '',
   now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"role":"worker","locale":"en"}'::jsonb, '', '', '', '', '', '', '', '', 0, false);

-- The sign-up trigger may already have created the worker row; either way
-- there is exactly one, found by profile below.
insert into public.workers (profile_id, display_name)
values ('c1053d00-0000-4000-8000-0000000000a1', 'Closed-need test worker')
on conflict (profile_id) do nothing;

-- One need per case (a booking is unique per owner + need + worker).
insert into public.customer_requests (id, profile_id, title, status)
select ('c1053d00-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       'c1053d00-0000-4000-8000-0000000000e1', 'Closed-need regression ' || n, 'submitted'
  from generate_series(1, 7) as n;

-- ── C1. Open need: propose and accept both work (no regression) ───────
do $$
declare v_id uuid; v_status text;
begin
  insert into public.booking_requests (owner_id, request_id, worker_id, status)
  values ('c1053d00-0000-4000-8000-0000000000e1', 'c1053d00-0000-4000-8000-000000000101',
          (select w.id from public.workers w where w.profile_id = 'c1053d00-0000-4000-8000-0000000000a1'), 'proposed')
  returning id into v_id;
  update public.booking_requests set status = 'accepted' where id = v_id;
  select status into v_status from public.booking_requests where id = v_id;
  if v_status <> 'accepted' then raise exception 'FAIL C1: accept on an open need was not stored'; end if;
  raise notice 'PASS C1 open need: propose + accept';
end $$;

-- ── C2. Closed need: a NEW proposal is refused ─────────────────────────
do $$
begin
  update public.customer_requests set status = 'closed', closed_outcome = 'completed'
   where id = 'c1053d00-0000-4000-8000-000000000102';
  begin
    insert into public.booking_requests (owner_id, request_id, worker_id, status)
    values ('c1053d00-0000-4000-8000-0000000000e1', 'c1053d00-0000-4000-8000-000000000102',
            (select w.id from public.workers w where w.profile_id = 'c1053d00-0000-4000-8000-0000000000a1'), 'proposed');
    raise exception 'FAIL C2: a proposal on a closed need was stored';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'demand_closed' then raise; end if;
  end;
  raise notice 'PASS C2 closed need: new proposal refused (demand_closed)';
end $$;

-- ── C3. Proposed while open, need closed, THEN accepted: refused ───────
do $$
declare v_id uuid; v_status text;
begin
  insert into public.booking_requests (owner_id, request_id, worker_id, status)
  values ('c1053d00-0000-4000-8000-0000000000e1', 'c1053d00-0000-4000-8000-000000000103',
          (select w.id from public.workers w where w.profile_id = 'c1053d00-0000-4000-8000-0000000000a1'), 'proposed')
  returning id into v_id;
  update public.customer_requests set status = 'closed', closed_outcome = 'completed'
   where id = 'c1053d00-0000-4000-8000-000000000103';
  begin
    update public.booking_requests set status = 'accepted' where id = v_id;
    raise exception 'FAIL C3: an accept after the need closed was stored';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'demand_closed' then raise; end if;
  end;
  select status into v_status from public.booking_requests where id = v_id;
  if v_status <> 'proposed' then raise exception 'FAIL C3: booking left in %', v_status; end if;
  raise notice 'PASS C3 accept after close refused, booking still proposed';

  -- C4. Leaving the open state is never refused: the worker can decline.
  update public.booking_requests set status = 'declined' where id = v_id;
  select status into v_status from public.booking_requests where id = v_id;
  if v_status <> 'declined' then raise exception 'FAIL C4: decline on a closed need was refused'; end if;
  raise notice 'PASS C4 decline on a closed need allowed';
end $$;

-- ── C5. Withdraw allowed; re-opening a withdrawn proposal is refused ───
do $$
declare v_id uuid;
begin
  insert into public.booking_requests (owner_id, request_id, worker_id, status)
  values ('c1053d00-0000-4000-8000-0000000000e1', 'c1053d00-0000-4000-8000-000000000104',
          (select w.id from public.workers w where w.profile_id = 'c1053d00-0000-4000-8000-0000000000a1'), 'proposed')
  returning id into v_id;
  update public.customer_requests set status = 'closed', closed_outcome = 'withdrawn'
   where id = 'c1053d00-0000-4000-8000-000000000104';
  update public.booking_requests set status = 'withdrawn' where id = v_id;
  begin
    update public.booking_requests set status = 'proposed' where id = v_id;
    raise exception 'FAIL C5: a withdrawn proposal was re-opened on a closed need';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'demand_closed' then raise; end if;
  end;
  raise notice 'PASS C5 withdraw allowed, re-open refused';
end $$;

-- ── C6. An EXISTING hire on a closed need: changed dates can be confirmed
do $$
declare v_id uuid; v_status text;
begin
  insert into public.booking_requests (owner_id, request_id, worker_id, status)
  values ('c1053d00-0000-4000-8000-0000000000e1', 'c1053d00-0000-4000-8000-000000000105',
          (select w.id from public.workers w where w.profile_id = 'c1053d00-0000-4000-8000-0000000000a1'), 'proposed')
  returning id into v_id;
  update public.booking_requests set status = 'accepted' where id = v_id;
  -- What the respond functions log after the status update.
  insert into public.booking_request_events (booking_request_id, actor_id, event_type, from_status, to_status)
  values (v_id, 'c1053d00-0000-4000-8000-0000000000a1', 'accepted', 'proposed', 'accepted');
  update public.customer_requests set status = 'closed', closed_outcome = 'completed'
   where id = 'c1053d00-0000-4000-8000-000000000105';
  -- Employer changes the dates: accepted -> proposed (20260928140000).
  update public.booking_requests set status = 'proposed', start_date = current_date + 7 where id = v_id;
  -- Worker confirms the new dates.
  update public.booking_requests set status = 'accepted' where id = v_id;
  select status into v_status from public.booking_requests where id = v_id;
  if v_status <> 'accepted' then raise exception 'FAIL C6: a re-confirmed hire was refused'; end if;
  raise notice 'PASS C6 existing hire: date change and re-confirmation allowed';
end $$;

-- ── C7. Reopening a closed need lets the accept through again ──────────
do $$
declare v_id uuid; v_status text;
begin
  insert into public.booking_requests (owner_id, request_id, worker_id, status)
  values ('c1053d00-0000-4000-8000-0000000000e1', 'c1053d00-0000-4000-8000-000000000106',
          (select w.id from public.workers w where w.profile_id = 'c1053d00-0000-4000-8000-0000000000a1'), 'proposed')
  returning id into v_id;
  update public.customer_requests set status = 'closed', closed_outcome = 'completed'
   where id = 'c1053d00-0000-4000-8000-000000000106';
  update public.customer_requests set status = 'submitted', closed_outcome = null
   where id = 'c1053d00-0000-4000-8000-000000000106';
  update public.booking_requests set status = 'accepted' where id = v_id;
  select status into v_status from public.booking_requests where id = v_id;
  if v_status <> 'accepted' then raise exception 'FAIL C7: accept after reopening was refused'; end if;
  raise notice 'PASS C7 reopened need: accept allowed';
end $$;

-- ── C8. The guard cannot be called directly by any client role ─────────
do $$
begin
  if has_function_privilege('authenticated', 'public.booking_requests_open_need_guard()', 'execute')
     or has_function_privilege('anon', 'public.booking_requests_open_need_guard()', 'execute') then
    raise exception 'FAIL C8: the guard function is executable by a client role';
  end if;
  raise notice 'PASS C8 guard not executable by anon / authenticated';
end $$;

rollback;
