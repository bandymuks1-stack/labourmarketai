#!/usr/bin/env bash
# ============================================================================
# MKT-3 — REAL two-session concurrency proof that one asset cannot be issued
# twice.
#
# Measures the SAME race BEFORE and AFTER applying the actual migration file
#   supabase/migrations/20260914120000_asset_single_open_assignment_v1.sql
# which is executed VERBATIM — nothing here re-implements it. The baseline is
# likewise the real 20260718170000 + 20260718180000, so the defect being
# measured is the one that shipped, not a reconstruction of it.
#
# The race is two genuinely concurrent psql sessions, not a simulation:
# manager one opens a transaction, issues the drill to worker A and HOLDS the
# transaction open; manager two — equally authorized, same organization —
# issues the same drill to worker B while it is held.
#
# Usage — native cluster:
#   /usr/lib/postgresql/16/bin/initdb -D /tmp/pgproof/data -U postgres --auth=trust
#   /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgproof/data \
#       -o '-p 55432 -k /tmp/pgproof' -l /tmp/pgproof/pg.log start
#   bash scripts/db-proof/asset-single-open-assignment.sh
#
# Never point this at production or a shared local Supabase stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
BASE1="$REPO/supabase/migrations/20260718170000_assets_logistics.sql"
BASE2="$REPO/supabase/migrations/20260718180000_assets_rls_recursion_fix.sql"
FIX="$REPO/supabase/migrations/20260914120000_asset_single_open_assignment_v1.sql"
DOWN="$REPO/supabase/rollbacks/20260914120000_asset_single_open_assignment_v1.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-/tmp/pgproof}
PGPROOF_PORT=${PGPROOF_PORT:-55432}
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

M1=11111111-1111-4111-8111-111111111111   # manager one
M2=22222222-2222-4222-8222-222222222222   # manager two, same organization
WA=dddddddd-dddd-4ddd-8ddd-dddddddddddd   # worker A
WB=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee   # worker B
OUT=55555555-5555-4555-8555-555555555555  # outsider, manages nothing
DRILL=a5000000-0000-4000-8000-000000000001
HOIST=a5000000-0000-4000-8000-000000000002

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1));
          else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi }
contains() { if printf '%s' "$3" | grep -qi -- "$2"; then echo "  PASS  $1"; pass=$((pass+1));
          else echo "  FAIL  $1 (no [$2] in [$3])"; fail=$((fail+1)); fi }

open_count() { $PSQL -c "select count(*) from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');"; }
availability_of() { $PSQL -c "select availability from public.assets where id='$1';"; }

# Issue in its OWN transaction, holding it open for $3 seconds before commit.
issue_hold() { # $1=actor $2=worker $3=hold_seconds
  psql -h "$PGPROOF_HOST" -p "$PGPROOF_PORT" -U postgres -d postgres -tA 2>&1 <<SQL
begin;
set local app.uid = '$1';
select 'RESULT:'||coalesce((select public.issue_asset_v1('$DRILL', null, '$2'))::text,'null');
select pg_sleep($3);
commit;
SQL
}
issue_now() { # $1=actor $2=worker
  psql -h "$PGPROOF_HOST" -p "$PGPROOF_PORT" -U postgres -d postgres -tA 2>&1 <<SQL
begin;
set local app.uid = '$1';
select 'RESULT:'||coalesce((select public.issue_asset_v1('$DRILL', null, '$2'))::text,'null');
commit;
SQL
}
# Run SQL as a given actor. The transaction is NOT optional: `set local`
# outside one is a no-op, `auth.uid()` then returns null, and every RPC refuses
# with "not authorized" — which looks exactly like a passing authority check
# and silently voids whatever the step was really trying to prove.
as_uid() { # $1=actor $2=sql
  psql -h "$PGPROOF_HOST" -p "$PGPROOF_PORT" -U postgres -d postgres -tA 2>&1 <<SQL
begin;
set local app.uid = '$1';
$2
commit;
SQL
}

race() { # prints "B_OUTPUT|||ELAPSED_MS"
  $PSQL -c "delete from public.asset_assignments; update public.assets set availability='available' where id='$DRILL';" >/dev/null
  issue_hold "$M1" "$WA" 3 >/tmp/pgproof_a.out 2>&1 &
  local apid=$!
  sleep 1
  local t0 t1
  t0=$(date +%s%3N)
  local bout
  bout=$(issue_now "$M2" "$WB")
  t1=$(date +%s%3N)
  wait $apid
  printf '%s|||%s' "$bout" "$((t1 - t0))"
}

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/asset-single-open-assignment.prelude.sql" >/dev/null || { echo "prelude FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$BASE1" >/dev/null || { echo "20260718170000 FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$BASE2" >/dev/null || { echo "20260718180000 FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/asset-single-open-assignment.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }

echo ""
echo "=============================================================="
echo " BASELINE — the RPCs exactly as they shipped (20260718170000)"
echo "=============================================================="
B=$(race); BOUT=${B%%|||*}; BMS=${B##*|||}
echo "  manager two's call returned after ${BMS}ms:"
printf '%s\n' "$BOUT" | sed 's/^/    /'
check "TWO open assignments exist for one drill — the defect, measured" "2" "$(open_count)"
check "and the manager overview would show only the FIRST of them" "1" \
  "$($PSQL -c "select count(*) from (select distinct on (asset_id) id from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged') order by asset_id, id) t;")"
check "while BOTH workers are told the drill is theirs" "2" \
  "$($PSQL -c "select count(distinct worker_id) from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');")"
check "a retired asset can still be issued" "0" \
  "$($PSQL -c "update public.assets set availability='retired' where id='$HOIST'; select 0;")"
RET=$(as_uid "$M1" "select 'ISSUED_OK:'||coalesce((select public.issue_asset_v1('$HOIST', null, '$WA'))::text,'null');")
contains "  → it was issued despite being retired" "ISSUED_OK:" "$RET"

echo ""
echo "=============================================================="
echo " APPLY the fix — 20260914120000, verbatim"
echo "=============================================================="
$PSQL -c "delete from public.asset_assignments; update public.assets set availability='available' where id='$DRILL'; update public.assets set availability='maintenance' where id='$HOIST';" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$FIX" >/dev/null || { echo "  fix FAILED to apply"; exit 1; }
echo "  applied."

B=$(race); BOUT=${B%%|||*}; BMS=${B##*|||}
echo ""
echo "  manager two's call returned after ${BMS}ms:"
printf '%s\n' "$BOUT" | sed 's/^/    /'
check "exactly ONE open assignment survives the race" "1" "$(open_count)"
contains "manager two is refused in words a person can act on" "already issued" "$BOUT"
check "the winner is worker A — the transaction that got there first" "$WA" \
  "$($PSQL -c "select worker_id from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');")"
if [ "$BMS" -ge 1500 ]; then echo "  PASS  manager two BLOCKED on the row lock (${BMS}ms) rather than racing past it"; pass=$((pass+1));
else echo "  FAIL  manager two did not block — expected >=1500ms, got ${BMS}ms"; fail=$((fail+1)); fi

echo ""
echo "-- the index holds even when the RPC is bypassed entirely --"
RAW=$(as_uid "$M1" "insert into public.asset_assignments (asset_id, worker_id, status, issued_by) values ('$DRILL','$WB','issued','$M1');")
contains "a direct INSERT is refused by asset_assignments_one_open_per_asset" "one_open_per_asset" "$RAW"

echo ""
echo "-- a maintenance or retired asset is not issuable --"
MNT=$(as_uid "$M1" "select public.issue_asset_v1('$HOIST', null, '$WA');")
contains "maintenance is refused, and says which state it is in" "not issuable while it is maintenance" "$MNT"
$PSQL -c "update public.assets set availability='retired' where id='$HOIST';" >/dev/null
RTD=$(as_uid "$M1" "select public.issue_asset_v1('$HOIST', null, '$WA');")
contains "retired is refused too" "not issuable while it is retired" "$RTD"

echo ""
echo "-- returning does not invent an availability --"
$PSQL -c "update public.assets set availability='retired' where id='$DRILL';" >/dev/null
AID=$($PSQL -c "select id from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');")
as_uid "$M1" "select public.return_asset_v1('$AID','good',null);" >/dev/null
check "an asset retired while it was out stays retired after the return" "retired" "$(availability_of "$DRILL")"
check "the condition at return is still recorded" "good" "$($PSQL -c "select condition from public.assets where id='$DRILL';")"
check "and the assignment is closed" "returned" "$($PSQL -c "select status from public.asset_assignments where id='$AID';")"

echo ""
echo "-- the normal lifecycle still works, in the right order --"
$PSQL -c "delete from public.asset_assignments; update public.assets set availability='available' where id='$DRILL';" >/dev/null
as_uid "$M1" "select public.issue_asset_v1('$DRILL', null, '$WA');" >/dev/null
A1=$($PSQL -c "select id from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');")
check "issue makes the asset assigned" "assigned" "$(availability_of "$DRILL")"
TR=$(as_uid "$M1" "select public.transfer_asset_assignment_v1('$A1', null, '$WB', null);")
check "transfer leaves exactly one open assignment (close-then-open ordering)" "1" "$(open_count)"
check "and it is now worker B's" "$WB" \
  "$($PSQL -c "select worker_id from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');")"
A2=$($PSQL -c "select id from public.asset_assignments where asset_id='$DRILL' and status in ('issued','acknowledged');")
as_uid "$M1" "select public.return_asset_v1('$A2','fair',null);" >/dev/null
check "return releases it" "available" "$(availability_of "$DRILL")"

echo ""
echo "-- authority is unchanged --"
$PSQL -c "update public.assets set availability='available' where id='$DRILL';" >/dev/null
OUTR=$(as_uid "$OUT" "select public.issue_asset_v1('$DRILL', null, '$WA');")
contains "an outsider still cannot issue" "not authorized to manage this asset" "$OUTR"
check "and nothing was written" "0" "$(open_count)"

echo ""
echo "=============================================================="
echo " ROLLBACK — the down file really restores the old behaviour"
echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null || { echo "  rollback FAILED to apply"; exit 1; }
B=$(race); BOUT=${B%%|||*}
check "the race is open again, which is what makes this a real reverse" "2" "$(open_count)"

echo ""
echo "=============================================================="
echo " $pass passed, $fail failed"
echo "=============================================================="
[ "$fail" -eq 0 ]
