#!/usr/bin/env bash
# Marketplace v1 write RPCs closed - REAL PostgreSQL proof on a THROWAWAY cluster (never prod).
#   initdb -D <wt>/.tmp/pg/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D <wt>/.tmp/pg/data -o "-p 58739 -c listen_addresses=127.0.0.1" -l <wt>/.tmp/pg/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58739 bash scripts/db-proof/marketplace-v1-write-rpcs-closed-v1.sh
# DROPs schema public. Reuses the marketplace-index-v1 prelude/seed and the real prior migrations.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
mkdir -p "$REPO/.tmp"; LFD="$(mktemp -d -p "$REPO/.tmp")"
for f in "$REPO"/supabase/migrations/20260627*.sql "$REPO"/supabase/migrations/20260718210000*.sql \
         "$REPO"/supabase/migrations/20261003150300*.sql "$REPO"/supabase/migrations/20261003150400*.sql \
         "$REPO"/supabase/migrations/20261003151400*.sql "$REPO"/supabase/rollbacks/20261003151400*.sql; do
  [ -f "$f" ] && tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58739}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
FAIL=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1 :: $2"; FAIL=1; }
chk() { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1" "expected [$2] got [$3]"; fi; }
as() { $PSQL -c "set role $1" -c "set request.jwt.claim.sub = '$2'" -c "$3" 2>&1 | grep -v '^SET$' | grep -v -e '^CONTEXT' -e '^PL/pgSQL' -e '^SQL statement' | tail -1 | sed 's/^ERROR:  /ERROR: /'; }
asnull() { $PSQL -c "set role $1" -c "reset request.jwt.claim.sub" -c "$2" 2>&1 | grep -v '^SET$' | grep -v '^RESET$' | grep -v -e '^CONTEXT' -e '^PL/pgSQL' | tail -1 | sed 's/^ERROR:  /ERROR: /'; }
U1=11111111-1111-1111-1111-111111111111; U2=22222222-2222-2222-2222-222222222222
EXP=cccccccc-0000-0000-0000-0000000000e1   # owned by U1, expired, status draft
OK1=cccccccc-0000-0000-0000-0000000000e2   # owned by U1, not expired, draft
V1C="create_marketplace_listing_v1('sale','tools','Cordless drill')"

echo "== baseline + 150300 + 150400 (BEFORE the fix)"
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/marketplace-index-v1.prelude.sql" "$LFD/20260627121713_service_offerings.sql" "$LFD/20260627145318_service_offering_requests.sql" "$LFD/20260718210000_marketplace_listings.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED $f"; cat "$LFD/err"; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/marketplace-index-v1.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003150300_marketplace_index_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 150300" "$(cat "$LFD/err")"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003150400_marketplace_public_business_expiry_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 150400" "$(cat "$LFD/err")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into marketplace_listings(id,owner_id,listing_kind,category,title,status,expires_at) values
 ('$EXP','$U1','sale','tools','Expired drill','draft', now() - interval '2 days'),
 ('$OK1','$U1','sale','tools','Fresh drill','draft', now() + interval '10 days');
SQL
V2_BEFORE=$($PSQL -c "select md5(string_agg(pg_get_functiondef(oid), '' order by proname)) from pg_proc where proname in ('create_marketplace_listing_v2','update_marketplace_listing_v2','set_marketplace_listing_status_v2')")

echo "== BEFORE: defect reproduced"
chk "v2 refuses to activate an expired listing" "ERROR: listing expired" "$(as authenticated $U1 "select set_marketplace_listing_status_v2('$EXP','active')")"
as authenticated $U1 "select set_marketplace_listing_status_v1('$EXP','active')" >/dev/null
chk "DEFECT: v1 activates the expired listing" "active" "$($PSQL -c "select status from marketplace_listings where id='$EXP'")"
$PSQL -c "update marketplace_listings set status='draft' where id='$EXP'" >/dev/null
$PSQL -c "update market_subject_types set active=false where subject='tools'" >/dev/null
chk "policy half already closed by the 150300 backstop trigger (v1 cannot activate a policy-refused subject)" "ERROR: invalid category" "$(as authenticated $U1 "select set_marketplace_listing_status_v1('$OK1','active')")"
$PSQL -c "update market_subject_types set active=true where subject='tools'" >/dev/null
chk "v1 create works before the fix" "36" "$(as authenticated $U1 "select $V1C" | awk '{print length($0)}')"

echo "== apply 151400 (AFTER)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151400_marketplace_v1_write_rpcs_closed_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 151400" "$(cat "$LFD/err")"
chk "151400 idempotent re-run" "0" "$($PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151400_marketplace_v1_write_rpcs_closed_v1.sql" 2>&1 | grep -ci error)"
chk "v2 definitions byte-unchanged" "$V2_BEFORE" "$($PSQL -c "select md5(string_agg(pg_get_functiondef(oid), '' order by proname)) from pg_proc where proname in ('create_marketplace_listing_v2','update_marketplace_listing_v2','set_marketplace_listing_status_v2')")"

for fn in "create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid)" \
          "update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text)" \
          "set_marketplace_listing_status_v1(uuid, text)"; do
  for r in authenticated anon public; do
    chk "ACL: $r cannot execute ${fn%%(*}" "false" "$($PSQL -c "select has_function_privilege('$r','public.$fn','execute')::text")"
  done
done
chk "delete_v1 keeps its ACL for authenticated" "true" "$($PSQL -c "select has_function_privilege('authenticated','public.delete_marketplace_listing_v1(uuid)','execute')::text")"

echo "== AFTER: v1 doors denied for every caller"
D="ERROR: permission denied for function"
chk "owner: v1 set_status denied (expired listing stays draft)" "$D set_marketplace_listing_status_v1" "$(as authenticated $U1 "select set_marketplace_listing_status_v1('$EXP','active')")"
chk "expired listing still draft" "draft" "$($PSQL -c "select status from marketplace_listings where id='$EXP'")"
chk "owner: v1 create denied" "$D create_marketplace_listing_v1" "$(as authenticated $U1 "select $V1C")"
chk "owner: v1 update denied" "$D update_marketplace_listing_v1" "$(as authenticated $U1 "select update_marketplace_listing_v1('$OK1','Hacked','tools','sale')")"
chk "non-owner: v1 set_status denied" "$D set_marketplace_listing_status_v1" "$(as authenticated $U2 "select set_marketplace_listing_status_v1('$OK1','active')")"
chk "anon: v1 set_status denied" "$D set_marketplace_listing_status_v1" "$(as anon $U1 "select set_marketplace_listing_status_v1('$OK1','active')")"
chk "anon: v1 create denied" "$D create_marketplace_listing_v1" "$(as anon $U1 "select $V1C")"
chk "NULL uid (authenticated, no sub): v1 denied" "$D set_marketplace_listing_status_v1" "$(asnull authenticated "select set_marketplace_listing_status_v1('$OK1','active')")"
chk "wrong-org: v1 create with a foreign org denied before any org check" "$D create_marketplace_listing_v1" "$(as authenticated $U2 "select create_marketplace_listing_v1('sale','tools','Cordless drill',null,null,null,null,'aaaaaaaa-0000-0000-0000-000000000001')")"
chk "no row was touched by the denied calls" "draft|draft" "$($PSQL -c "select string_agg(status,'|' order by id) from marketplace_listings where id in ('$EXP','$OK1')")"

echo "== AFTER: v2 and owner flows unchanged"
NEW=$(as authenticated $U1 "select create_marketplace_listing_v2('sale','tools','Cordless drill',null,'LT','Vilnius','30 EUR')")
if [ ${#NEW} -eq 36 ]; then ok "v2 create (draft)"; else bad "v2 create" "$NEW"; fi
chk "v2 edit" "" "$(as authenticated $U1 "select update_marketplace_listing_v2('$NEW','Cordless drill 18V','tools','sale','Good condition')" | tr -d ' ')"
chk "v2 activate" "" "$(as authenticated $U1 "select set_marketplace_listing_status_v2('$NEW','active')" | tr -d ' ')"
chk "listing is discoverable" "1" "$($PSQL -c "select count(*) from market_index_v1 where origin_id='$NEW'")"
chk "v2 pause" "" "$(as authenticated $U1 "select set_marketplace_listing_status_v2('$NEW','paused')" | tr -d ' ')"
chk "v2 close" "" "$(as authenticated $U1 "select set_marketplace_listing_status_v2('$NEW','closed')" | tr -d ' ')"
chk "v2 still refuses an expired listing" "ERROR: listing expired" "$(as authenticated $U1 "select set_marketplace_listing_status_v2('$EXP','active')")"
chk "v2 non-owner denied" "ERROR: not authorized" "$(as authenticated $U2 "select set_marketplace_listing_status_v2('$NEW','active')")"
chk "v2 anon denied" "ERROR: permission denied for function set_marketplace_listing_status_v2" "$(as anon $U1 "select set_marketplace_listing_status_v2('$NEW','active')")"
chk "owner delete (v1 delete door kept)" "0" "$(as authenticated $U1 "select delete_marketplace_listing_v1('$NEW')" >/dev/null; $PSQL -c "select count(*) from marketplace_listings where id='$NEW'")"

echo "== rollback"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151400_marketplace_v1_write_rpcs_closed_v1.down.sql" >/dev/null 2>"$LFD/err" || bad "down 151400" "$(cat "$LFD/err")"
chk "after rollback: authenticated can execute v1 set_status again" "true" "$($PSQL -c "select has_function_privilege('authenticated','public.set_marketplace_listing_status_v1(uuid,text)','execute')::text")"
chk "after rollback: anon / public still cannot" "false|false" "$($PSQL -c "select has_function_privilege('anon','public.set_marketplace_listing_status_v1(uuid,text)','execute')::text||'|'||has_function_privilege('public','public.set_marketplace_listing_status_v1(uuid,text)','execute')::text")"
if $PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151400_marketplace_v1_write_rpcs_closed_v1.sql" >/dev/null 2>"$LFD/err"; then ok "re-apply after rollback"; else bad "re-apply" "$(cat "$LFD/err")"; fi
if [ $FAIL -eq 0 ]; then echo "ALL PASS"; else echo "FAILURES"; exit 1; fi
