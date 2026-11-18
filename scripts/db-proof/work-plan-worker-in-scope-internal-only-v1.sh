#!/usr/bin/env bash
# work_plan_worker_in_scope_v1 — EXECUTE revoked from clients (internal only).
# REAL PostgreSQL proof on a THROWAWAY local PG16 (no Docker, no Supabase).
# Usage: initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#        pg_ctl -D $DIR/data -o "-p 54301 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#        PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/work-plan-worker-in-scope-internal-only-v1.sh
# Never point at production: it DROPs schema public.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261103120000_work_plan_worker_in_scope_internal_only_v1
LFD="$(mktemp -d)"
for f in supabase/migrations/20260817150000_work_objects_v1.sql supabase/migrations/20261003150200_work_plan_entries_v2.sql supabase/migrations/20261007140000_work_plan_scope_roster_engagement_v1.sql supabase/migrations/20261023160000_work_plan_shift_patterns_v1.sql supabase/migrations/$NAME.sql supabase/rollbacks/$NAME.down.sql; do tr -d '\r' < "$REPO/$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-plan-entries-v2.prelude.sql" "$LFD/20260817150000_work_objects_v1.sql" "$LFD/20261003150200_work_plan_entries_v2.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASELINE FAILED: $f"; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -c "create table public.company_workers (company_id uuid, worker_id uuid, status text check (status in ('active','paused','removed')), primary key (company_id, worker_id));" >/dev/null 2>&1
for f in "$LFD/20261007140000_work_plan_scope_roster_engagement_v1.sql" "$LFD/20261023160000_work_plan_shift_patterns_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $f"; cat "$LFD/err"; exit 1; }
done
M_=33333333-3333-3333-3333-333333333333; MB=66666666-6666-6666-6666-666666666666
WR=11111111-1111-1111-1111-111111111111; WE=22222222-2222-2222-2222-222222222222; WX=44444444-4444-4444-4444-444444444444
PR=a1111111-0000-0000-0000-000000000001; PE=a2222222-0000-0000-0000-000000000002; PX=a4444444-0000-0000-0000-000000000004
OA=aaaaaaaa-0000-0000-0000-00000000000a; OB=bbbbbbbb-0000-0000-0000-00000000000b; CA=ca000000-0000-0000-0000-00000000000a
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
insert into profiles(id) values ('$M_'),('$MB'),('$PR'),('$PE'),('$PX');
insert into companies(id,owner_profile_id) values ('$CA','$M_');
insert into organizations(id,legacy_company_id) values ('$OA','$CA'),('$OB',null);
insert into company_memberships(profile_id,organization_id,status,role) values ('$M_','$OA','active','manager'),('$MB','$OB','active','manager');
insert into workers(id,profile_id) values ('$WR','$PR'),('$WE','$PE'),('$WX','$PX');
insert into company_workers values ('$CA','$WR','active');
insert into engagement_contexts(profile_id,organization_id,status,relationship_slug) values ('$PE','$OA','active','employee');
SQL
pass=0; fail=0
as() { local who="$1"; shift; if [ "$who" = anon ]; then printf '%s\n' "set role anon; $*"; else printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*"; fi | $PSQL -f - 2>&1 | tr -d '\r'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
sc() { as "$1" "select public.work_plan_worker_in_scope_v1('$OA','$2');"; }
v1() { as "$1" "select public.create_work_plan_entry_v1('$OA','$2','2026-11-05','2026-11-06');"; }
v2() { as "$1" "select public.create_work_plan_entry_v2('$OA','$2','2026-11-10','2026-11-12');"; }
src() { $PSQL -c "select md5(replace(prosrc, chr(13), ''))||'|'||prosecdef||'|'||proconfig::text from pg_proc where proname='work_plan_worker_in_scope_v1';" | tr -d '\r'; }
SRC0="$(src)"
echo "BEFORE — the exposure"
check "OTHER-org manager reads the cross-tenant bit (true)" t "$(sc $MB $WR)"
check "a plain worker reads the bit for someone else" t "$(sc $PX $WE)"
echo "APPLY"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1 && { echo "  PASS  migration applies"; pass=$((pass+1)); } || { echo "  FAIL  migration"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1 && { echo "  PASS  re-applies idempotently"; pass=$((pass+1)); }
echo "AFTER — direct calls refused (42501)"
has "signed-in other-org manager: permission denied" 'permission denied for function work_plan_worker_in_scope_v1' "$(sc $MB $WR)"
has "signed-in own manager: permission denied too (internal only)" 'permission denied' "$(sc $M_ $WR)"
has "anon: permission denied" 'permission denied' "$(as anon "select public.work_plan_worker_in_scope_v1('$OA','$WR');")"
check "SQLSTATE is 42501" 42501 "$(printf '%s\n' "\set VERBOSITY verbose" "set role authenticated; set request.jwt.claim.sub='$MB'; select public.work_plan_worker_in_scope_v1('$OA','$WR');" | $PSQL -f - 2>&1 | grep -oE '42501' | head -1)"
check "ACL = owner only" "{postgres=X/postgres}" "$($PSQL -c "select proacl::text from pg_proc where proname='work_plan_worker_in_scope_v1';" | tr -d '\r')"
check "body / SECURITY DEFINER / search_path unchanged" "$SRC0" "$(src)"
echo "AFTER — both definer callers still work"
has "v1: manager plans a roster worker" '^[0-9a-f-]{36}$' "$(v1 $M_ $WR)"
has "v1: manager plans a v2 employee" '^[0-9a-f-]{36}$' "$(v1 $M_ $WE)"
has "v1: unrelated worker still refused (scope still evaluated)" 'worker_not_in_scope' "$(v1 $M_ $WX)"
has "v1: other-org manager still refused" 'not_allowed' "$(v1 $MB $WE)"
has "v2: manager plans a roster worker" '^[0-9a-f-]{36}$' "$(v2 $M_ $WR)"
has "v2: unrelated worker still refused (scope still evaluated)" 'worker_not_in_scope' "$(v2 $M_ $WX)"
has "v2: other-org manager still refused" 'not_allowed' "$(v2 $MB $WR)"
echo "ROLLBACK"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>&1 && { echo "  PASS  rollback applies"; pass=$((pass+1)); } || { echo "  FAIL  rollback"; fail=$((fail+1)); }
check "grant restored (pre-image behaviour)" t "$(sc $MB $WR)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1; has "forward re-applies after rollback" 'permission denied' "$(sc $MB $WR)"
rm -rf "$LFD"
echo; echo "RESULT: $pass pass, $fail fail"; [ $fail -eq 0 ]
