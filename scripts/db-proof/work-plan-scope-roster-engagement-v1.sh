#!/usr/bin/env bash
# work_plan_worker_in_scope_v1 roster + v2 engagement branches — REAL PostgreSQL proof on a THROWAWAY local cluster.
# Usage: initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#        pg_ctl -D $DIR/data -o "-p 54301 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#        PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/work-plan-scope-roster-engagement-v1.sh
# Never point at production: it DROPs schema public.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
LFD="$(mktemp -d)"
for f in supabase/migrations/20260817150000_work_objects_v1.sql supabase/migrations/20261003150200_work_plan_entries_v2.sql supabase/migrations/20261007140000_work_plan_scope_roster_engagement_v1.sql supabase/rollbacks/20261007140000_work_plan_scope_roster_engagement_v1.down.sql; do tr -d '\r' < "$REPO/$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-plan-entries-v2.prelude.sql" "$LFD/20260817150000_work_objects_v1.sql" "$LFD/20261003150200_work_plan_entries_v2.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASELINE FAILED: $f"; exit 1; }
done
M_=33333333-3333-3333-3333-333333333333; MB=66666666-6666-6666-6666-666666666666
WR=11111111-1111-1111-1111-111111111111; WE=22222222-2222-2222-2222-222222222222; WX=44444444-4444-4444-4444-444444444444
WPAUSED=55555555-5555-5555-5555-555555555555; WMGR=77777777-7777-7777-7777-777777777777; WOTHER=88888888-8888-8888-8888-888888888888
PR=a1111111-0000-0000-0000-000000000001; PE=a2222222-0000-0000-0000-000000000002; PX=a4444444-0000-0000-0000-000000000004
PP=a5555555-0000-0000-0000-000000000005; PM=a7777777-0000-0000-0000-000000000007; PO=a8888888-0000-0000-0000-000000000008
OA=aaaaaaaa-0000-0000-0000-00000000000a; OB=bbbbbbbb-0000-0000-0000-00000000000b; CA=ca000000-0000-0000-0000-00000000000a
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
create table public.company_workers (company_id uuid, worker_id uuid, status text check (status in ('active','paused','removed')), primary key (company_id, worker_id));
insert into profiles(id) values ('$M_'),('$MB'),('$PR'),('$PE'),('$PX'),('$PP'),('$PM'),('$PO');
insert into companies(id,owner_profile_id) values ('$CA','$M_');
insert into organizations(id,legacy_company_id) values ('$OA','$CA'),('$OB',null);
insert into company_memberships(profile_id,organization_id,status,role) values ('$M_','$OA','active','manager'),('$MB','$OB','active','manager');
insert into workers(id,profile_id) values ('$WR','$PR'),('$WE','$PE'),('$WX','$PX'),('$WPAUSED','$PP'),('$WMGR','$PM'),('$WOTHER','$PO');
insert into company_workers values ('$CA','$WR','active'),('$CA','$WPAUSED','paused');
insert into engagement_contexts(profile_id,organization_id,status,relationship_slug) values
  ('$PE','$OA','active','employee'),('$PM','$OA','active','manager'),('$PO','$OB','active','employee');
SQL
pass=0; fail=0
as() { printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$1'; $2" | $PSQL -f - 2>&1 | tr -d '\r'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
sc() { as $M_ "select public.work_plan_worker_in_scope_v1('$OA','$1');"; }
echo "BEFORE - proven failure reproduced on the previous body"
check "roster worker NOT in scope (before)" f "$(sc $WR)"
check "v2 employee NOT in scope (before)" f "$(sc $WE)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261007140000_work_plan_scope_roster_engagement_v1.sql" >/dev/null 2>&1 || { echo "MIGRATION FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261007140000_work_plan_scope_roster_engagement_v1.sql" >/dev/null 2>&1 && { echo "  PASS  re-applies idempotently"; pass=$((pass+1)); }
echo "AFTER"
check "roster worker in scope" t "$(sc $WR)"
check "v2 employee in scope" t "$(sc $WE)"
check "paused roster worker NOT in scope" f "$(sc $WPAUSED)"
check "unrelated worker NOT in scope" f "$(sc $WX)"
check "manager-relationship profile NOT worker scope" f "$(sc $WMGR)"
check "employee of ANOTHER org NOT in scope" f "$(sc $WOTHER)"
echo "AUTHORITY unchanged (fail-closed)"
has "roster worker plannable by manager" '^[0-9a-f-]{36}$' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$WR','2026-10-05','2026-10-06');")"
has "v2 employee plannable by manager" '^[0-9a-f-]{36}$' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$WE','2026-10-05','2026-10-06');")"
has "other-org manager still refused" 'not_allowed' "$(as $MB "select public.create_work_plan_entry_v1('$OA','$WE','2026-10-05','2026-10-06');")"
has "worker themself cannot plan" 'not_allowed' "$(as $PE "select public.create_work_plan_entry_v1('$OA','$WE','2026-10-05','2026-10-06');")"
has "unrelated worker still refused" 'worker_not_in_scope' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$WX','2026-10-05','2026-10-06');")"
check "no grants to public/anon; secdef + search_path" 0 "$($PSQL -c "select count(*) from pg_proc where proname='work_plan_worker_in_scope_v1' and (proacl is null or proacl::text ~ '(^|[{,])=|anon=' or not prosecdef or proconfig::text not like '%search_path%');" | tr -d '\r')"
echo "ROLLBACK restores previous behaviour"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261007140000_work_plan_scope_roster_engagement_v1.down.sql" >/dev/null 2>&1 && { echo "  PASS  rollback applies"; pass=$((pass+1)); } || { echo "  FAIL  rollback"; fail=$((fail+1)); }
check "roster worker out of scope after rollback" f "$(sc $WR)"
echo; echo "RESULT: $pass pass, $fail fail"; [ $fail -eq 0 ]
