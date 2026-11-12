#!/usr/bin/env bash
# save_customer_request_v2 - REAL PostgreSQL proof on a THROWAWAY local PG16
# (no Docker, no Supabase). Schema = the REAL 0028 migration + the two columns
# 20260530150000 added + the forward migration; then the rollback.
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54301 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/save-customer-request-v2.sh
# Uses database `scr2` (dropped and rebuilt). Refuses non-local hosts.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261112120000_save_customer_request_v2
LFD="$(mktemp -d)"
for f in supabase/migrations/0028_customer_requests.sql supabase/migrations/$NAME.sql supabase/rollbacks/$NAME.down.sql; do tr -d '\r' < "$REPO/$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d scr2 -tA -q"
$ADMINP -c "drop database if exists scr2" -c "create database scr2" >/dev/null 2>&1
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/save-customer-request-v2.prelude.sql" >/dev/null 2>"$LFD/err" || { echo "PRELUDE FAILED"; cat "$LFD/err"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/0028_customer_requests.sql" >/dev/null 2>"$LFD/err" || { echo "0028 FAILED"; cat "$LFD/err"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"$LFD/err" <<'SQL' || { echo "COLUMNS FAILED"; cat "$LFD/err"; exit 1; }
alter table public.customer_requests add column if not exists kind text
  check (kind in ('company_request','agency_offer','buyer_request','customer_request'));
alter table public.customer_requests add column if not exists original_language text;
SQL
U=a0000000-0000-0000-0000-000000000001; O=a0000000-0000-0000-0000-000000000002
$PSQL -c "insert into profiles (id) values ('$U'),('$O')" >/dev/null
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok   $1"; else FAIL=$((FAIL+1)); echo "FAIL $1: expected [$3] got [$2]"; fi; }
as_user() { $PSQL -c "set role authenticated; select set_config('request.jwt.claim.sub', '$1', false);" -c "$2" 2>&1 | tail -1; }

# Before: v1 writes neither column (the defect).
id1=$(as_user $U "select public.save_customer_request(null, 'Two welders', null, 'SE')")
check "v1 (unchanged) leaves kind and language NULL" "$($PSQL -c "select coalesce(kind,'-')||'/'||coalesce(original_language,'-') from customer_requests where id='$id1'")" "-/-"

$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>"$LFD/err" || { echo "FORWARD FAILED"; cat "$LFD/err"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>"$LFD/err" || { echo "FORWARD (re-run) FAILED"; cat "$LFD/err"; exit 1; }
check "forward migration re-runs cleanly" "ok" "ok"

id2=$(as_user $U "select public.save_customer_request_v2(null, 'Two welders', null, 'SE', null, null, null, null, null, null, null, 'draft', 'sv')")
check "v2 insert: kind buyer_request, language sv, country kept" "$($PSQL -c "select kind||'/'||original_language||'/'||country from customer_requests where id='$id2'")" "buyer_request/sv/SE"
id3=$(as_user $U "select public.save_customer_request_v2(null, 'Crew', null, 'SE', null, null, null, null, null, null, null, 'draft', 'Klingon')")
check "v2: a language outside the app's set is NULL, never guessed" "$($PSQL -c "select kind||'/'||coalesce(original_language,'-') from customer_requests where id='$id3'")" "buyer_request/-"
as_user $U "select public.save_customer_request_v2('$id1', 'Two welders edited', null, 'SE', null, null, null, null, null, null, null, 'draft', 'en')" >/dev/null
check "v2 update never rewrites an existing row's kind or language" "$($PSQL -c "select coalesce(kind,'-')||'/'||coalesce(original_language,'-')||'/'||title from customer_requests where id='$id1'")" "-/-/Two welders edited"
as_user $O "select public.save_customer_request_v2('$id2', 'Taken over', null, 'SE')" >/dev/null 2>&1
check "v2 update of another person's row is refused (row unchanged)" "$($PSQL -c "select title from customer_requests where id='$id2'")" "Two welders"
check "anon cannot execute v2" "$($PSQL -c "select has_function_privilege('anon', 'public.save_customer_request_v2(uuid, text, text, text, text, text, integer, text, text, text, text, text, text)', 'execute')")" "f"
check "authenticated can execute v2" "$($PSQL -c "select has_function_privilege('authenticated', 'public.save_customer_request_v2(uuid, text, text, text, text, text, integer, text, text, text, text, text, text)', 'execute')")" "t"
check "v1 still exists, unchanged signature" "$($PSQL -c "select count(*) from pg_proc where proname='save_customer_request'")" "1"

$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err" || { echo "ROLLBACK FAILED"; cat "$LFD/err"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err" || { echo "ROLLBACK (re-run) FAILED"; cat "$LFD/err"; exit 1; }
check "rollback drops v2 (re-runnable)" "$($PSQL -c "select count(*) from pg_proc where proname='save_customer_request_v2'")" "0"
check "rollback keeps v1 and the rows" "$($PSQL -c "select count(*) from pg_proc where proname='save_customer_request'")/$($PSQL -c "select count(*) from customer_requests")" "1/3"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
