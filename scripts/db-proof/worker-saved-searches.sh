#!/usr/bin/env bash
# ============================================================================
# DEM-8 — the saved-search store, proven on a real PostgreSQL server.
#
# Runs supabase/migrations/20260914140000_worker_saved_searches_v1.sql
# VERBATIM against a faithful harness, then measures the four properties the
# migration claims: the criteria column is CLOSED, the store is PRIVATE
# (exercised as the `authenticated` role, because a superuser bypasses RLS and
# would prove nothing), the write bounds hold, and the notification widening
# is a strict superset. Finally it applies the paired rollback and checks that
# its data guard really refuses to destroy saved searches.
#
# Usage — native cluster:
#   /usr/lib/postgresql/16/bin/initdb -D /tmp/pgproof/data -U postgres --auth=trust
#   /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgproof/data \
#       -o '-p 55432 -k /tmp/pgproof' -l /tmp/pgproof/pg.log start
#   bash scripts/db-proof/worker-saved-searches.sh
#
# Never point this at production or a shared local Supabase stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260914140000_worker_saved_searches_v1.sql"
DOWN="$REPO/supabase/rollbacks/20260914140000_worker_saved_searches_v1.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-/tmp/pgproof}
PGPROOF_PORT=${PGPROOF_PORT:-55432}
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

W1=11111111-1111-4111-8111-111111111111   # worker one's profile
W2=22222222-2222-4222-8222-222222222222   # worker two's profile

# psql prints BEGIN / SET / SET before the result inside as_worker, so a
# positional `sed -n 3p` breaks the moment the preamble changes length. Take
# the first line that is actually a number.
num() { printf '%s' "$1" | grep -E '^[0-9]+$' | head -1; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
          else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi }
contains() { if printf '%s' "$3" | grep -qi -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
          else echo "  FAIL  $1 (no [$2] in [$3])"; fail=$((fail+1)); fi }

# Act as a signed-in worker: the `authenticated` ROLE (so RLS applies) plus the
# app.uid the auth.uid() shim reads. The transaction is not optional — `set
# local` outside one is a no-op and every RPC would refuse as unauthenticated,
# which reads exactly like a passing authorization check.
as_worker() { # $1=profile uuid  $2=sql
  psql -h "$PGPROOF_HOST" -p "$PGPROOF_PORT" -U postgres -d postgres -tA 2>&1 <<SQL
begin;
set local role authenticated;
set local app.uid = '$1';
$2
commit;
SQL
}

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/worker-saved-searches.prelude.sql" >/dev/null || { echo "prelude FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/worker-saved-searches.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }

echo ""
echo "=============================================================="
echo " APPLY the migration, verbatim"
echo "=============================================================="
APPLY=$($PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)
if [ $? -ne 0 ]; then echo "  MIGRATION FAILED:"; printf '%s\n' "$APPLY" | sed 's/^/    /'; exit 1; fi
echo "  applied."

echo ""
echo "-- a worker can save a question, and re-saving refines it --"
OUT=$(as_worker "$W1" "select 'ID:'||public.save_worker_search_v1('NL welding', '{\"profession\":\"welder\",\"country\":\"NL\"}'::jsonb, true);")
contains "the save returns an id" "ID:" "$OUT"
check "exactly one row exists" "1" "$($PSQL -c "select count(*) from public.worker_saved_searches;")"
as_worker "$W1" "select public.mark_worker_search_seen_v1((select id from public.worker_saved_searches where label='NL welding'));" >/dev/null
check "marking it seen records when the worker looked" "1" \
  "$($PSQL -c "select count(*) from public.worker_saved_searches where last_seen_at is not null;")"
as_worker "$W1" "select public.save_worker_search_v1('NL welding', '{\"profession\":\"welder\",\"country\":\"BE\"}'::jsonb, true);" >/dev/null
check "re-saving the same label updates rather than duplicating" "1" \
  "$($PSQL -c "select count(*) from public.worker_saved_searches;")"
check "  and the criteria really changed" "BE" \
  "$($PSQL -c "select criteria->>'country' from public.worker_saved_searches where label='NL welding';")"
check "  and 'seen' is cleared — the answers to a changed question are unseen" "1" \
  "$($PSQL -c "select count(*) from public.worker_saved_searches where last_seen_at is null;")"

echo ""
echo "-- the criteria column is CLOSED --"
BAD=$(as_worker "$W1" "select public.save_worker_search_v1('notes', '{\"note\":\"call me on 555\"}'::jsonb, true);")
contains "an eighth key is refused by the database itself" "criteria_keys" "$BAD"
LONG=$(as_worker "$W1" "select public.save_worker_search_v1('long', jsonb_build_object('country', repeat('x', 100)), true);")
contains "an over-long value is refused" "short strings" "$LONG"
NUM=$(as_worker "$W1" "select public.save_worker_search_v1('numeric', '{\"country\":42}'::jsonb, true);")
contains "a non-string value is refused" "short strings" "$NUM"
check "none of the three was written" "1" "$($PSQL -c "select count(*) from public.worker_saved_searches;")"

echo ""
echo "-- a saved question is PRIVATE --"
check "worker one sees their own row" "1" \
  "$(num "$(as_worker "$W1" "select count(*) from public.worker_saved_searches;")")"
check "worker two sees NOTHING of it" "0" \
  "$(num "$(as_worker "$W2" "select count(*) from public.worker_saved_searches;")")"
DEL=$(as_worker "$W2" "select public.delete_worker_search_v1((select id from public.worker_saved_searches where label='NL welding'));")
check "  and cannot delete it either" "1" \
  "$($PSQL -c "select count(*) from public.worker_saved_searches;")"
SEEN=$(as_worker "$W2" "select public.mark_worker_search_seen_v1((select id from public.worker_saved_searches where label='NL welding'));")
check "  and cannot mark it seen" "1" \
  "$($PSQL -c "select count(*) from public.worker_saved_searches where last_seen_at is null;")"

echo ""
echo "-- direct writes are impossible: the RPCs are the only door --"
RAW=$(as_worker "$W1" "insert into public.worker_saved_searches (worker_id, label, criteria) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','sneaky','{}'::jsonb);")
contains "a direct INSERT is denied" "denied\|permission" "$RAW"
RAWU=$(as_worker "$W1" "update public.worker_saved_searches set label='renamed';")
contains "a direct UPDATE is denied" "denied\|permission" "$RAWU"

echo ""
echo "-- the write bounds hold --"
for i in $(seq 2 20); do
  as_worker "$W1" "select public.save_worker_search_v1('q$i', '{\"country\":\"NL\"}'::jsonb, true);" >/dev/null
done
check "twenty saved searches is the cap" "20" "$($PSQL -c "select count(*) from public.worker_saved_searches;")"
CAP=$(as_worker "$W1" "select public.save_worker_search_v1('one too many', '{\"country\":\"NL\"}'::jsonb, true);")
contains "the twenty-first is refused, in words" "limit reached" "$CAP"
EMPTY=$(as_worker "$W1" "select public.save_worker_search_v1('   ', '{}'::jsonb, true);")
contains "a blank label is refused" "Label required" "$EMPTY"

echo ""
echo "-- the notification widening is a strict superset --"
$PSQL -c "insert into public.notification_events (recipient_profile_id, event_type, entity_type, dedupe_key)
          values ('$W1','saved_search_match','saved_search','saved_search:1');" >/dev/null 2>&1
check "the new alert type is accepted" "1" \
  "$($PSQL -c "select count(*) from public.notification_events where event_type='saved_search_match';")"
$PSQL -c "insert into public.notification_events (recipient_profile_id, event_type, entity_type, dedupe_key)
          values ('$W1','weekly_digest','weekly_digest','weekly_digest:1');" >/dev/null 2>&1
check "every previously valid type is still accepted" "1" \
  "$($PSQL -c "select count(*) from public.notification_events where event_type='weekly_digest';")"
INVALID=$($PSQL -c "insert into public.notification_events (recipient_profile_id, event_type, entity_type, dedupe_key)
          values ('$W1','invented_type','saved_search','x');" 2>&1)
contains "an invented type is still refused" "type_check" "$INVALID"

echo ""
echo "=============================================================="
echo " ROLLBACK — the data guard is real, not decorative"
echo "=============================================================="
GUARD=$($PSQL -f "$DOWN" 2>&1)
contains "it REFUSES while saved searches exist" "still holds" "$GUARD"
check "  and the table is untouched" "20" "$($PSQL -c "select count(*) from public.worker_saved_searches;")"

$PSQL -c "delete from public.worker_saved_searches; delete from public.notification_events where event_type='saved_search_match';" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 || { echo "  FAIL  the rollback did not apply on an empty table"; fail=$((fail+1)); }
check "a deliberate teardown removes the table" "0" \
  "$($PSQL -c "select count(*) from information_schema.tables where table_name='worker_saved_searches';")"
check "  and the old notification types still work afterwards" "1" \
  "$($PSQL -c "select count(*) from public.notification_events where event_type='weekly_digest';")"

echo ""
echo "=============================================================="
echo " $pass passed, $fail failed"
echo "=============================================================="
[ "$fail" -eq 0 ]
