#!/usr/bin/env bash
# ============================================================================
# TEAM OFFER COUNTERPART v1 — REAL PostgreSQL party-matrix proof (R2 P2-2, #3231).
#
# Builds the same throwaway base as team-demand-offer.sh (real migrations
# 20260817150000 / 20260711210000 / 20261003150600 / 20261007150000 + its
# preludes and seeds), then applies 20261112213100_team_offer_counterpart_v1
# and asks every party, for every event and offer state, what it gets.
#
# Decision 0033: no signed-in user may call the function at all; only
# service_role (the server action) may, with the caller id it verified.
#
# Usage:
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/team-offer-counterpart-v1.sh
# Never point this at production or at a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
LFD="$(mktemp -d)"
for f in "$M"/20260817150000_work_objects_v1.sql "$M"/20260711210000_work_tasks_v1.sql \
         "$M"/20261003150600_brigade_work_assignment_v1.sql "$M"/20261007150000_team_demand_offer_v1.sql \
         "$M"/20261112213100_team_offer_counterpart_v1.sql; do
  tr -d '\r' < "$f" > "$LFD/$(basename "$f")"
done
tr -d '\r' < "$REPO/supabase/rollbacks/20261112213100_team_offer_counterpart_v1.down.sql" > "$LFD/rollback.down.sql"
MIGRATION="$LFD/20261112213100_team_offer_counterpart_v1.sql"; ROLLBACK="$LFD/rollback.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-tasks-stage-subtask.prelude.sql" \
         "$HERE/team-assignment-canonical.prelude2.sql" \
         "$HERE/team-demand-offer.prelude.sql" \
         "$LFD/20260817150000_work_objects_v1.sql" \
         "$LFD/20260711210000_work_tasks_v1.sql" \
         "$LFD/20261003150600_brigade_work_assignment_v1.sql" \
         "$LFD/20261007150000_team_demand_offer_v1.sql"; do
  tr -d '\r' < "$f" | $PSQL -v ON_ERROR_STOP=1 -f - >/dev/null 2>/tmp/_base_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_base_err_$$; exit 1; }
done
rm -f /tmp/_base_err_$$
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-assignment-canonical.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-demand-offer.seed.sql" >/dev/null || { echo "seed2 FAILED"; exit 1; }

OWN=c0c00000-0000-0000-0000-0000000000a1   # owner/manager of brigade C (the TEAM side)
MB=66666666-6666-6666-6666-666666666666    # owner of the need R1 (the DEMAND side)
MBM=c0c30000-0000-0000-0000-000000000001   # org B manager by membership: demand access, not the need's owner
MA=33333333-3333-3333-3333-333333333333    # manager of another org and team: no party to R1
M1=c0c10000-0000-0000-0000-000000000001    # a plain member of brigade C
ADM=55555555-5555-5555-5555-555555555555
STRANGER=00000000-0000-0000-0000-0000000000ff
TC=7ea00000-0000-0000-0000-0000000000c1
R1=d0d00000-0000-0000-0000-000000000001
GHOST=d0d00000-0000-0000-0000-0000000000ee

pass=0; fail=0
as() { local who="$1"; shift
  local pre="set role authenticated; set request.jwt.claim.sub='$who';"
  [ "$who" = "anon" ] && pre="set role anon;"
  [ "$who" = "service_role" ] && pre="set role service_role; set request.jwt.claim.sub='';"
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
oid() { printf '%s' "$1" | sed -n 's/.*"offer_id": *"\([0-9a-f-]*\)".*/\1/p'; }
cp() { as service_role "select coalesce(public.team_offer_counterpart_v1('$1','$2','$3')::text, 'NULL');"; }

$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>/tmp/_mig_err_$$ || { echo "PROOF 1 FAILED — migration did not apply:"; cat /tmp/_mig_err_$$; exit 1; }
rm -f /tmp/_mig_err_$$
echo "PROOF 1 — migration applies on a real PostgreSQL server: PASS"; pass=$((pass+1))
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  migration re-applies"; pass=$((pass+1)); else echo "  FAIL  migration is not re-runnable"; fail=$((fail+1)); fi

R=$(as $OWN "select public.offer_team_to_demand_v1('$TC','$R1','synthetic offer');"); O1=$(oid "$R")
check "fixture: brigade C offered to R1" "offered" "$(q "select status from public.team_demand_offers where id='$O1';")"

echo; echo "== PROOF 2 — no signed-in user can call it (decision 0033: the id never reaches a party)"
for who in $OWN $MB $MBM $M1 $STRANGER $ADM; do
  has "authenticated ($who) is refused" 'permission denied' "$(as $who "select public.team_offer_counterpart_v1('$O1','$who','offered');")"
done
has "anon is refused" 'permission denied' "$(as anon "select public.team_offer_counterpart_v1('$O1','$OWN','offered');")"
check "EXECUTE: authenticated false, anon false, service_role true" "f|f|t" \
  "$(q "select has_function_privilege('authenticated','public.team_offer_counterpart_v1(uuid,uuid,text)','execute')||'|'||has_function_privilege('anon','public.team_offer_counterpart_v1(uuid,uuid,text)','execute')||'|'||has_function_privilege('service_role','public.team_offer_counterpart_v1(uuid,uuid,text)','execute');" | sed 's/true/t/g; s/false/f/g')"

echo; echo "== PROOF 3 — party matrix, offer state 'offered'"
check "team manager, event offered -> the need's owner" "$MB" "$(cp $O1 $OWN offered)"
check "plain team member -> NULL" "NULL" "$(cp $O1 $M1 offered)"
check "need owner asking 'offered' (wrong side) -> NULL" "NULL" "$(cp $O1 $MB offered)"
check "demand-access colleague asking 'offered' -> NULL" "NULL" "$(cp $O1 $MBM offered)"
check "unrelated manager -> NULL" "NULL" "$(cp $O1 $MA offered)"
check "outsider -> NULL" "NULL" "$(cp $O1 $STRANGER offered)"
check "admin is not a party -> NULL" "NULL" "$(cp $O1 $ADM offered)"
check "team manager asking 'accepted' while still offered -> NULL" "NULL" "$(cp $O1 $OWN accepted)"
check "need owner asking 'accepted' while still offered -> NULL" "NULL" "$(cp $O1 $MB accepted)"
check "team manager asking 'withdrawn' while still offered -> NULL" "NULL" "$(cp $O1 $OWN withdrawn)"
check "unknown event -> NULL" "NULL" "$(cp $O1 $OWN assigned)"
check "unknown offer -> NULL (no oracle)" "NULL" "$(cp $GHOST $OWN offered)"
check "NULL caller -> NULL" "NULL" "$(as service_role "select coalesce(public.team_offer_counterpart_v1('$O1',null,'offered')::text,'NULL');")"

echo; echo "== PROOF 4 — party matrix, offer state 'accepted'"
$PSQL -c "update public.team_demand_offers set status='accepted', responded_at=now() where id='$O1';" >/dev/null
check "need owner, event accepted -> the offerer" "$OWN" "$(cp $O1 $MB accepted)"
check "demand-access colleague, event accepted -> the offerer" "$OWN" "$(cp $O1 $MBM accepted)"
check "team manager asking 'accepted' (wrong side) -> NULL" "NULL" "$(cp $O1 $OWN accepted)"
check "plain team member -> NULL" "NULL" "$(cp $O1 $M1 accepted)"
check "outsider -> NULL" "NULL" "$(cp $O1 $STRANGER accepted)"
check "team manager asking 'offered' after acceptance -> NULL" "NULL" "$(cp $O1 $OWN offered)"
check "need owner asking 'declined' while accepted -> NULL" "NULL" "$(cp $O1 $MB declined)"

echo; echo "== PROOF 5 — 'declined' and 'withdrawn'"
$PSQL -c "update public.team_demand_offers set status='declined' where id='$O1';" >/dev/null
check "need owner, event declined -> the offerer" "$OWN" "$(cp $O1 $MB declined)"
check "outsider, declined -> NULL" "NULL" "$(cp $O1 $STRANGER declined)"
$PSQL -c "update public.team_demand_offers set status='withdrawn', responded_at=null where id='$O1';" >/dev/null
check "team manager, event withdrawn -> the need's owner" "$MB" "$(cp $O1 $OWN withdrawn)"
check "need owner asking 'withdrawn' (wrong side) -> NULL" "NULL" "$(cp $O1 $MB withdrawn)"
check "plain team member, withdrawn -> NULL" "NULL" "$(cp $O1 $M1 withdrawn)"

echo; echo "== PROOF 6 — the caller's claims are put back"
check "claims after a call are the caller's own (empty for service_role)" "" \
  "$(as service_role "select public.team_offer_counterpart_v1('$O1','$OWN','withdrawn'); select coalesce(current_setting('request.jwt.claim.sub', true), '');" | tail -1)"

echo; echo "== PROOF 7 — rollback"
if $PSQL -v ON_ERROR_STOP=1 -f "$ROLLBACK" >/dev/null 2>&1; then echo "  PASS  rollback applies"; pass=$((pass+1)); else echo "  FAIL  rollback"; fail=$((fail+1)); fi
check "no team_offer_counterpart_v1 left" "0" "$(q "select count(*) from pg_proc where proname='team_offer_counterpart_v1';")"

echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
