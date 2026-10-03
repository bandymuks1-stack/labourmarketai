#!/usr/bin/env bash
# Marketplace index v1 - REAL PostgreSQL proof on a THROWAWAY cluster (never prod).
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/marketplace-index-v1.sh
# DROPs schema public. Real prior migrations (service_offerings, marketplace_listings) build the baseline.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
LFD="$(mktemp -d)"
for f in "$REPO"/supabase/migrations/20260627*.sql "$REPO"/supabase/migrations/20260718210000*.sql "$REPO"/supabase/migrations/2026100217*.sql "$REPO"/supabase/rollbacks/2026100217*.sql; do
  tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
FAIL=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1 :: $2"; FAIL=1; }
chk() { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1" "expected [$2] got [$3]"; fi; }
# as ROLE UID SQL  -> last non-empty line of output (errors included)
as() { $PSQL -c "set role $1" -c "set request.jwt.claim.sub = '$2'" -c "$3" 2>&1 | grep -v '^SET$' | grep -v -e '^CONTEXT' -e '^PL/pgSQL' -e '^SQL statement' | tail -1 | sed 's/^ERROR:  /ERROR: /'; }
rebuild_base() {
  $PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
  for f in "$HERE/marketplace-index-v1.prelude.sql" "$LFD/20260627121713_service_offerings.sql" "$LFD/20260627145318_service_offering_requests.sql" "$LFD/20260718210000_marketplace_listings.sql"; do
    $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED $f"; cat "$LFD/err"; exit 1; }
  done
  $PSQL -v ON_ERROR_STOP=1 -f "$HERE/marketplace-index-v1.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
}
U1=11111111-1111-1111-1111-111111111111; U2=22222222-2222-2222-2222-222222222222
ORG=aaaaaaaa-0000-0000-0000-000000000001; PRJ=99999999-0000-0000-0000-000000000001

echo "== baseline + 170000 + 170100"
rebuild_base
FN_BEFORE=$($PSQL -c "select md5(pg_get_functiondef(oid)) from pg_proc where proname='create_marketplace_listing_v1'")
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170000_marketplace_index_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 170000" "$(cat "$LFD/err")"
chk "170000 idempotent re-run" "0" "$($PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170000_marketplace_index_v1.sql" 2>&1 | grep -ci error)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170100_marketplace_public_business_expiry_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 170100" "$(cat "$LFD/err")"
chk "v1 create fn untouched" "$FN_BEFORE" "$($PSQL -c "select md5(pg_get_functiondef(oid)) from pg_proc where proname='create_marketplace_listing_v1'")"
chk "existing rows survive (2 listings, 1 offering)" "2|1" "$($PSQL -c "select (select count(*) from marketplace_listings)||'|'||(select count(*) from service_offerings)")"
chk "subject registry seeded (17)" "17" "$($PSQL -c "select count(*) from market_subject_types")"
chk "old closed category CHECK gone" "0" "$($PSQL -c "select count(*) from pg_constraint where conrelid='marketplace_listings'::regclass and pg_get_constraintdef(oid) like '%safety_equipment%'")"

echo "== view / grants per actor"
chk "authenticated sees index (1 listing + 1 offering)" "2" "$(as authenticated $U1 "select count(*) from market_index_v1")"
chk "anon cannot select index" "ERROR: permission denied for view market_index_v1" "$(as anon $U1 "select count(*) from market_index_v1")"
chk "anon cannot select registry" "ERROR: permission denied for table market_subject_types" "$(as anon $U1 "select 1 from market_subject_types limit 1")"
chk "anon cannot execute policy hook" "ERROR: permission denied for function market_publish_policy_v1" "$(as anon $U1 "select * from market_publish_policy_v1(null,null,'goods','goods_other','offer')")"
chk "anon cannot execute create v2" "ERROR: permission denied for function create_marketplace_listing_v2" "$(as anon $U1 "select create_marketplace_listing_v2('sale','goods_other','Jam jars')")"

echo "== policy hook"
H() { $PSQL -c "select allowed||':'||reason_key from market_publish_policy_v1(null,null,'$1','$2','$3')"; }
chk "ok goods offer" "true:ok" "$(H goods goods_other offer)"
chk "unknown subject" "false:unknown_subject" "$(H goods nope offer)"
chk "bad direction" "false:invalid_direction" "$(H goods goods_other swap)"
chk "service need must be need" "false:direction_not_allowed" "$(H service_need service_trade offer)"
chk "service need as need ok" "true:ok" "$(H service_need service_trade need)"
$PSQL -c "update market_subject_types set active=false where subject='goods_other'" >/dev/null
chk "inactive subject refused" "false:inactive_subject" "$(H goods goods_other offer)"
$PSQL -c "update market_subject_types set active=true where subject='goods_other'" >/dev/null

echo "== write RPCs v2"
NEW=$(as authenticated $U1 "select create_marketplace_listing_v2('sale','goods_handmade','Handmade bench',null,'LT','Vilnius','200 EUR',null,null,200,'eur',1,'pcs',now()+interval '30 days')")
if [ ${#NEW} -eq 36 ]; then ok "create v2 goods listing"; else bad "create v2" "$NEW"; fi
as authenticated $U1 "select set_marketplace_listing_status_v2('$NEW','active')" >/dev/null
chk "currency upper-cased, direction/domain derived" "EUR|offer|goods" "$($PSQL -c "select currency||'|'||direction||'|'||domain from market_index_v1 where source_id='$NEW'")"
chk "price w/o currency refused" "ERROR: currency required" "$(as authenticated $U1 "select create_marketplace_listing_v2('sale','goods_other','Jam jars',null,null,null,null,null,null,5)")"
chk "unknown category refused" "ERROR: invalid category" "$(as authenticated $U1 "select create_marketplace_listing_v2('sale','weapons','Something here')")"
chk "past expiry refused" "ERROR: expires_at must be in the future" "$(as authenticated $U1 "select create_marketplace_listing_v2('sale','goods_other','Jam jars',null,null,null,null,null,null,null,null,null,null,now()-interval '1 day')")"
chk "foreign org refused" "ERROR: not authorized for organization" "$(as authenticated $U2 "select create_marketplace_listing_v2('sale','goods_other','Jam jars',null,null,null,null,'$ORG')")"
PW=$(as authenticated $U1 "select create_marketplace_listing_v2('wanted','project_work','Need roofing crew',null,null,null,null,'$ORG','$PRJ')")
chk "project need by manager ok" "36" "${#PW}"
chk "project need is direction need / domain project_work" "need|project_work" "$($PSQL -c "update marketplace_listings set status='active' where id='$PW'" >/dev/null; $PSQL -c "select direction||'|'||domain from market_index_v1 where source_id='$PW'")"
chk "non-owner cannot update" "ERROR: not authorized" "$(as authenticated $U2 "select update_marketplace_listing_v2('$NEW','Hacked title','goods_other','sale')")"
as authenticated $U1 "select set_marketplace_listing_status_v2('$NEW','paused')" >/dev/null
chk "paused leaves index" "0" "$($PSQL -c "select count(*) from market_index_v1 where source_id='$NEW'")"
$PSQL -c "update market_subject_types set active=false where subject='goods_handmade'" >/dev/null
chk "backstop: v1 set_status cannot bypass hook" "ERROR: invalid category" "$(as authenticated $U1 "select set_marketplace_listing_status_v1('$NEW','active')")"
$PSQL -c "update market_subject_types set active=true where subject='goods_handmade'" >/dev/null

echo "== expiry"
$PSQL -c "update marketplace_listings set status='active', expires_at=now()-interval '1 minute', organization_id='$ORG' where id='$NEW'" >/dev/null 2>&1
chk "expired excluded from index" "0" "$($PSQL -c "select count(*) from market_index_v1 where source_id='$NEW'")"
chk "owner still reads own expired row" "1" "$(as authenticated $U1 "select count(*) from marketplace_listings where id='$NEW'")"
chk "other user cannot read expired row" "0" "$(as authenticated $U2 "select count(*) from marketplace_listings where id='$NEW'")"
chk "anon public business fn hides expired (shows 2 non-expired active)" "2" "$(as anon $U2 "select count(*) from get_public_business_listings_v1('$ORG')")"
$PSQL -c "update service_offerings set expires_at=now()-interval '1 day'" >/dev/null
chk "expired service offering excluded" "0" "$($PSQL -c "select count(*) from market_index_v1 where source_table='service_offerings'")"

echo "== rollback"
chk "rollback guarded when data present" "1" "$($PSQL -f "$LFD/20261002170000_marketplace_index_v1.down.sql" 2>&1 | grep -c 'rollback refused')"
rebuild_base
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170000_marketplace_index_v1.sql" >/dev/null 2>&1
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170100_marketplace_public_business_expiry_v1.sql" >/dev/null 2>&1
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170100_marketplace_public_business_expiry_v1.down.sql" >/dev/null 2>"$LFD/err" || bad "down 170100" "$(cat "$LFD/err")"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170000_marketplace_index_v1.down.sql" >/dev/null 2>"$LFD/err" || bad "down 170000" "$(cat "$LFD/err")"
chk "after rollback: view/registry gone, old CHECK back" "0|1" "$($PSQL -c "select (select count(*) from pg_class where relname in ('market_index_v1','market_subject_types'))||'|'||(select count(*) from pg_constraint where conname='marketplace_listings_category_check')")"
chk "after rollback: rows intact" "2|1" "$($PSQL -c "select (select count(*) from marketplace_listings)||'|'||(select count(*) from service_offerings)")"
if $PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261002170000_marketplace_index_v1.sql" >/dev/null 2>"$LFD/err"; then ok "re-apply after rollback"; else bad "re-apply" "$(cat "$LFD/err")"; fi
if [ $FAIL -eq 0 ]; then echo "ALL PASS"; else echo "FAILURES"; exit 1; fi
