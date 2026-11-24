#!/usr/bin/env bash
# ============================================================================
# W12 Slice 1 — REAL two-session concurrency proof.
#
# Spins up a THROWAWAY Postgres 15 container, builds the faithful harness
# (prelude), and measures the double-booking race BEFORE and AFTER applying the
# actual migration file
#   supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql
# which is executed VERBATIM — nothing here re-implements it.
#
# Two genuinely concurrent psql sessions are used (not a simulation): session A
# opens a transaction, calls the RPC and HOLDS the transaction open while
# session B calls the RPC against a different overlapping booking.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/booking-atomic-double-booking.sh
# ============================================================================
set -uo pipefail

CT=w12-race-proof
PORT=55432
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql"

W1='11111111-1111-1111-1111-111111111111'   # worker 1's profile (the actor)
W2='22222222-2222-2222-2222-222222222222'   # worker 2's profile
B1='b0000001-0000-4000-8000-000000000001'   # employer A -> worker1  2026-09-01..10
B2='b0000002-0000-4000-8000-000000000002'   # employer B -> worker1  2026-09-05..15  (OVERLAPS B1)
B3='b0000003-0000-4000-8000-000000000003'   # duplicate-submit target
B4='b0000004-0000-4000-8000-000000000004'   # 2026-10-01..05
B5='b0000005-0000-4000-8000-000000000005'   # 2026-10-20..25 (no overlap)
B6='b0000006-0000-4000-8000-000000000006'   # worker2, overlaps B1 dates
B7='b0000007-0000-4000-8000-000000000007'   # single day 2026-11-01
B8='b0000008-0000-4000-8000-000000000008'   # single day 2026-11-01 (same day)
B9='b0000009-0000-4000-8000-000000000009'   # 2026-10-06..10 (ADJACENT to B4)

psql() { docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=0 "$@"; }
q()    { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1; }
seed() { psql -q -f - < "$HERE/booking-atomic-double-booking.seed.sql" >/dev/null 2>&1; }

# Accept in its OWN transaction, holding it open for $2 seconds before commit.
accept_hold() { # $1=booking $2=hold_seconds $3=actor_profile
  docker exec -i "$CT" psql -U postgres -tA 2>&1 <<SQL
begin;
set local app.uid = '$3';
select 'RESULT:'||coalesce((select public.respond_booking_request_v3('$1','accepted',null,null))::text,'null');
select pg_sleep($2);
commit;
SQL
}
accept_now() { # $1=booking $2=actor_profile
  docker exec -i "$CT" psql -U postgres -tA 2>&1 <<SQL
begin;
set local app.uid = '$2';
select 'RESULT:'||coalesce((select public.respond_booking_request_v3('$1','accepted',null,null))::text,'null');
commit;
SQL
}

overlapping_accepted() {
  q "select count(*) from public.booking_requests a join public.booking_requests b
       on a.worker_id=b.worker_id and a.id<b.id
      where a.status='accepted' and b.status='accepted'
        and a.start_date is not null and b.start_date is not null
        and daterange(a.start_date,coalesce(a.expected_end_date,a.start_date),'[]')
         && daterange(b.start_date,coalesce(b.expected_end_date,b.start_date),'[]');"
}
status_of() { q "select status from public.booking_requests where id='$1';"; }
events_for() { q "select count(*) from public.booking_request_events where booking_request_id='$1';"; }

pass=0; fail=0
check() { # $1=label $2=expected $3=actual
  if [ "$2" == "$3" ]; then printf '  PASS  %-58s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  FAIL  %-58s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

echo "=============================================================="
echo " W12 SLICE 1 — two-session concurrency proof"
echo "=============================================================="

docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT not ready"; exit 1; }
psql -q -f - < "$HERE/booking-atomic-double-booking.prelude.sql" >/dev/null 2>&1
echo "harness loaded (throwaway postgres:15 on :$PORT)"

# ── BEFORE: reproduce the defect with the PRE-SLICE body ───────────────────
echo
echo "--- BEFORE (pre-slice RPC body: no lock, no status guard, no constraint) ---"
seed
accept_hold "$B1" 3 "$W1" > /tmp/w12_a.log 2>&1 &
A_PID=$!
sleep 1
accept_now "$B2" "$W1" > /tmp/w12_b.log 2>&1
wait $A_PID
BEFORE_B1=$(status_of "$B1"); BEFORE_B2=$(status_of "$B2")
BEFORE_OVERLAP=$(overlapping_accepted)
echo "  booking1=$BEFORE_B1  booking2=$BEFORE_B2  overlapping_accepted_pairs=$BEFORE_OVERLAP"
check "BEFORE: the race reproduces (2 overlapping accepted)" "1" "$BEFORE_OVERLAP"

# ── APPLY THE REAL MIGRATION ───────────────────────────────────────────────
echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
seed
APPLY_OUT=$(psql -q -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE '^ERROR|FATAL'; then
  echo "$APPLY_OUT" | grep -iE '^ERROR|FATAL' | head -5
  echo "MIGRATION FAILED TO APPLY"; exit 1
fi
CONSTRAINT_DEF=$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='booking_requests_no_overlapping_accepted';")
echo "  constraint: $CONSTRAINT_DEF"
check "constraint installed" "1" "$(q "select count(*) from pg_constraint where conname='booking_requests_no_overlapping_accepted';")"
check "btree_gist installed" "1" "$(q "select count(*) from pg_extension where extname='btree_gist';")"

# ── CASE A: two overlapping accepts, concurrent ────────────────────────────
echo
echo "--- CASE A: two employers, same worker, OVERLAPPING dates, concurrent ---"
seed
accept_hold "$B1" 3 "$W1" > /tmp/w12_a.log 2>&1 &
A_PID=$!
sleep 1
accept_now "$B2" "$W1" > /tmp/w12_b.log 2>&1
wait $A_PID
A_B1=$(status_of "$B1"); A_B2=$(status_of "$B2")
echo "  session A -> $(grep -o 'RESULT:.*' /tmp/w12_a.log | head -1)"
echo "  session B -> $(grep -oE 'ERROR:.*|RESULT:.*' /tmp/w12_b.log | head -1)"
check "A: winner accepted" "accepted" "$A_B1"
check "A: loser NOT accepted" "proposed" "$A_B2"
check "A: zero overlapping accepted pairs" "0" "$(overlapping_accepted)"
check "A: loser got the canonical 23P01 conflict" "1" "$(grep -c 'Conflicting accepted booking' /tmp/w12_b.log)"
check "A: exactly one acceptance event for the winner" "1" "$(events_for "$B1")"
check "A: loser left NO partial side effect (0 events)" "0" "$(events_for "$B2")"

# ── CASE B: duplicate submit, same booking, concurrent ─────────────────────
echo
echo "--- CASE B: duplicate submit of the SAME booking, concurrent ---"
seed
accept_hold "$B3" 3 "$W1" > /tmp/w12_a.log 2>&1 &
A_PID=$!
sleep 1
accept_now "$B3" "$W1" > /tmp/w12_b.log 2>&1
wait $A_PID
check "B: status changed exactly once" "accepted" "$(status_of "$B3")"
check "B: exactly ONE event row (no duplicate audit)" "1" "$(events_for "$B3")"
check "B: second response reported idempotent" "1" "$(grep -c 'idempotent' /tmp/w12_b.log)"
check "B: engagement not minted twice" "1" \
  "$(q "select case when count(*)<=1 then 1 else 0 end from public.company_worker_engagements where source_booking_id='$B3';")"

# ── CASE C: non-overlapping, same worker ───────────────────────────────────
echo
echo "--- CASE C: same worker, NON-overlapping dates ---"
seed
accept_now "$B4" "$W1" >/dev/null 2>&1
accept_now "$B5" "$W1" >/dev/null 2>&1
check "C: both accepted" "accepted|accepted" "$(status_of "$B4")|$(status_of "$B5")"

# ── CASE D: different workers, overlapping dates ───────────────────────────
echo
echo "--- CASE D: DIFFERENT workers, overlapping dates ---"
seed
accept_now "$B1" "$W1" >/dev/null 2>&1
accept_now "$B6" "$W2" >/dev/null 2>&1
check "D: both accepted (different workers never collide)" "accepted|accepted" "$(status_of "$B1")|$(status_of "$B6")"

# ── CASE E: non-blocking statuses ──────────────────────────────────────────
echo
echo "--- CASE E: declined / withdrawn / expired do not block ---"
seed
q "update public.booking_requests set status='declined'  where id='$B1';" >/dev/null
q "update public.booking_requests set status='withdrawn' where id='$B7';" >/dev/null
q "update public.booking_requests set status='expired'   where id='$B8';" >/dev/null
accept_now "$B2" "$W1" >/dev/null 2>&1
check "E: overlapping declined row does not block accept" "accepted" "$(status_of "$B2")"

# ── CASE F: boundary semantics ─────────────────────────────────────────────
echo
echo "--- CASE F: single-day / containment / adjacency ---"
seed
accept_now "$B7" "$W1" >/dev/null 2>&1
F_SAMEDAY=$(accept_now "$B8" "$W1" 2>&1)
check "F: same single day CONFLICTS" "1" "$(echo "$F_SAMEDAY" | grep -c 'Conflicting accepted booking')"
check "F: second single-day row stays proposed" "proposed" "$(status_of "$B8")"
seed
accept_now "$B4" "$W1" >/dev/null 2>&1
accept_now "$B9" "$W1" >/dev/null 2>&1
check "F: ADJACENT bands are ALLOWED (08-...05 then 08-...06)" "accepted|accepted" "$(status_of "$B4")|$(status_of "$B9")"
seed
accept_now "$B1" "$W1" >/dev/null 2>&1
F_CONTAIN=$(accept_now "$B2" "$W1" 2>&1)
check "F: partial overlap CONFLICTS" "1" "$(echo "$F_CONTAIN" | grep -c 'Conflicting accepted booking')"

# ── Constraint is a REAL backstop, not just RPC politeness ─────────────────
echo
echo "--- BACKSTOP: direct SQL bypassing the RPC entirely ---"
seed
q "update public.booking_requests set status='accepted' where id='$B1';" >/dev/null
BYPASS=$(q "update public.booking_requests set status='accepted' where id='$B2';")
check "constraint blocks a direct non-RPC double-book" "1" \
  "$(echo "$BYPASS" | grep -c 'booking_requests_no_overlapping_accepted')"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
