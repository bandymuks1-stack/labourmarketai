#!/usr/bin/env bash
# =====================================================================
# Concurrency test for 20261114100000_booking_refuses_closed_need_v1.
#
# Throwaway local database ONLY (the isolated CI job). Two real sessions race
# a need being CLOSED against a proposal on it being ACCEPTED, in both orders:
#
#   R1 close first : the accept must WAIT for the close, then be refused
#                    ('demand_closed'); the booking stays 'proposed'.
#   R2 accept first: the close must WAIT for the accept, then succeed; the
#                    booking stays 'accepted' (it was accepted while open).
#
# The "must wait" half is measured: the second session has to take at least
# HOLD-1 seconds, which proves it blocked on the first one's lock instead of
# slipping past it. Synthetic rows only (fixed test ids, @local.test); they are
# deleted on exit. Never point this at production.
# =====================================================================
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_labourmarketai}"
HOLD=4
# PSQL_CMD overrides the connection (e.g. a scratch cluster); default is the stack's container.
psql_q() {
  if [ -n "${PSQL_CMD:-}" ]; then $PSQL_CMD -X -q -v ON_ERROR_STOP=1 -tA "$@";
  else docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 -tA "$@"; fi
}

E='c1053d01-0000-4000-8000-0000000000e1'   # employer profile
W='c1053d01-0000-4000-8000-0000000000a1'   # worker profile
N1='c1053d01-0000-4000-8000-000000000101'  # need for R1
N2='c1053d01-0000-4000-8000-000000000102'  # need for R2

cleanup() {
  psql_q -c "delete from public.customer_requests where id in ('$N1','$N2');
             delete from auth.users where id in ('$E','$W');" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

psql_q >/dev/null <<SQL
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change,
   email_change_token_new, email_change_token_current, phone_change, phone_change_token,
   reauthentication_token, email_change_confirm_status, is_sso_user)
values
  ('00000000-0000-0000-0000-000000000000', '$E', 'authenticated', 'authenticated',
   'closed-need-race.employer@local.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"company","locale":"en"}',
   '', '', '', '', '', '', '', '', 0, false),
  ('00000000-0000-0000-0000-000000000000', '$W', 'authenticated', 'authenticated',
   'closed-need-race.worker@local.test', '', now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"worker","locale":"en"}',
   '', '', '', '', '', '', '', '', 0, false);
insert into public.workers (profile_id, display_name) values ('$W', 'Closed-need race worker')
  on conflict (profile_id) do nothing;
insert into public.customer_requests (id, profile_id, title, status) values
  ('$N1', '$E', 'Closed-need race 1', 'submitted'),
  ('$N2', '$E', 'Closed-need race 2', 'submitted');
insert into public.booking_requests (owner_id, request_id, worker_id, status)
select '$E', n, (select id from public.workers where profile_id = '$W'), 'proposed'
  from unnest(array['$N1','$N2']::uuid[]) as n;
SQL

booking_status() { psql_q -c "select status from public.booking_requests where request_id = '$1'"; }
need_status()    { psql_q -c "select status from public.customer_requests where id = '$1'"; }
fail() { echo "::error::$*"; exit 1; }

# ── R1: close first, accept second ─────────────────────────────────────
psql_q -c "begin;
  update public.customer_requests set status = 'closed', closed_outcome = 'completed' where id = '$N1';
  select pg_sleep($HOLD);
  commit;" >/dev/null &
CLOSER=$!
sleep 1
start=$(date +%s)
set +e
out=$(psql_q -c "update public.booking_requests set status = 'accepted' where request_id = '$N1'" 2>&1)
rc=$?
set -e
waited=$(( $(date +%s) - start ))
wait "$CLOSER"
echo "R1 accept: rc=$rc waited=${waited}s output=$(echo "$out" | tr '\n' ' ')"
[ "$rc" -ne 0 ] || fail "R1: the accept after a concurrent close was stored"
echo "$out" | grep -q 'demand_closed' || fail "R1: refused for another reason: $out"
[ "$waited" -ge $((HOLD - 1)) ] || fail "R1: the accept did not wait for the close (${waited}s)"
[ "$(booking_status "$N1")" = "proposed" ] || fail "R1: booking is $(booking_status "$N1"), expected proposed"
[ "$(need_status "$N1")" = "closed" ] || fail "R1: need is not closed"
echo "PASS R1 close first: accept waited, then refused; booking still proposed"

# ── R2: accept first, close second ─────────────────────────────────────
psql_q -c "begin;
  update public.booking_requests set status = 'accepted' where request_id = '$N2';
  select pg_sleep($HOLD);
  commit;" >/dev/null &
ACCEPTER=$!
sleep 1
start=$(date +%s)
psql_q -c "update public.customer_requests set status = 'closed', closed_outcome = 'completed' where id = '$N2'" >/dev/null \
  || fail "R2: the close after a concurrent accept failed"
waited=$(( $(date +%s) - start ))
wait "$ACCEPTER" || fail "R2: the accept itself failed"
echo "R2 close: waited=${waited}s"
[ "$waited" -ge $((HOLD - 1)) ] || fail "R2: the close did not wait for the accept (${waited}s)"
[ "$(booking_status "$N2")" = "accepted" ] || fail "R2: booking is $(booking_status "$N2"), expected accepted"
[ "$(need_status "$N2")" = "closed" ] || fail "R2: need is not closed"
echo "PASS R2 accept first: close waited, then closed; booking accepted while the need was open"
