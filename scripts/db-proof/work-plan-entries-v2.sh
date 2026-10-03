#!/usr/bin/env bash
# work_plan_entries_v2 — REAL PostgreSQL proof on a THROWAWAY local cluster (no Docker, no Supabase).
# Replays the real work_objects migration, applies the migration, probes under set role with real JWT sub.
# Usage: initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#        pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#        PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/work-plan-entries-v2.sh
# Never point at production: it DROPs schema public.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
LFD="$(mktemp -d)"
for f in "$REPO/supabase/migrations/20260817150000_work_objects_v1.sql" "$REPO/supabase/migrations/20261001220000_work_plan_entries_v2.sql" "$REPO/supabase/rollbacks/20261001220000_work_plan_entries_v2.down.sql"; do tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
MIG="$LFD/20261001220000_work_plan_entries_v2.sql"; DOWN="$LFD/20261001220000_work_plan_entries_v2.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-plan-entries-v2.prelude.sql" "$LFD/20260817150000_work_objects_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "BASELINE FAILED: $f"; $PSQL -v ON_ERROR_STOP=1 -f "$f" 2>&1 | tail -3; exit 1; }
done
M_=33333333-3333-3333-3333-333333333333; MB=66666666-6666-6666-6666-666666666666
W1=11111111-1111-1111-1111-111111111111; W2=22222222-2222-2222-2222-222222222222; W3=44444444-4444-4444-4444-444444444444; W4=77777777-7777-7777-7777-777777777777
WP1=a1111111-0000-0000-0000-000000000001; WP2=a2222222-0000-0000-0000-000000000002; WP3=a4444444-0000-0000-0000-000000000004; WP4=a7777777-0000-0000-0000-000000000007
OA=aaaaaaaa-0000-0000-0000-00000000000a; OB=bbbbbbbb-0000-0000-0000-00000000000b
CA=ca000000-0000-0000-0000-00000000000a; AG=ac000000-0000-0000-0000-00000000000a
PA=99999999-0000-0000-0000-00000000000a; PB=99999999-0000-0000-0000-00000000000b
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
insert into profiles(id) values ('$M_'),('$MB'),('$WP1'),('$WP2'),('$WP3'),('$WP4');
insert into companies(id,owner_profile_id) values ('$CA','$M_'); insert into agencies(id) values ('$AG');
insert into organizations(id,legacy_company_id,legacy_agency_id) values ('$OA','$CA','$AG'),('$OB',null,null);
insert into company_memberships(profile_id,organization_id,status,role) values ('$M_','$OA','active','manager'),('$MB','$OB','active','manager');
insert into workers(id,profile_id) values ('$W1','$WP1'),('$W2','$WP2'),('$W3','$WP3'),('$W4','$WP4');
insert into company_worker_engagements(company_id,worker_id,status) values ('$CA','$W1','active'),('$CA','$W4','ended');
insert into agency_workers(agency_id,worker_id,status) values ('$AG','$W2','active');
insert into projects(id,company_id,organization_id) values ('$PA','$CA','$OA'),('$PB',null,'$OB');
SQL
pass=0; fail=0
as() { local who="$1"; shift; local pre="set role authenticated; set request.jwt.claim.sub='$who';"; [ "$who" = "anon" ] && pre="set role anon;"
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>/tmp/_wp_err || { echo "PROOF 1 FAILED"; cat /tmp/_wp_err; exit 1; }
echo "PROOF 1 - migration applies on real PG16: PASS"; pass=$((pass+1))
if $PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "  PASS  re-applies idempotently"; pass=$((pass+1)); else echo "  FAIL  not idempotent"; fail=$((fail+1)); fi
echo "PROOF 2 - scope (bridge via organizations.legacy_*; companies.organization_id does not exist)"
check "company engagement in scope" t "$(as $M_ "select public.work_plan_worker_in_scope_v1('$OA','$W1');")"
check "agency worker in scope" t "$(as $M_ "select public.work_plan_worker_in_scope_v1('$OA','$W2');")"
check "ended engagement NOT in scope" f "$(as $M_ "select public.work_plan_worker_in_scope_v1('$OA','$W4');")"
check "unrelated worker NOT in scope" f "$(as $M_ "select public.work_plan_worker_in_scope_v1('$OA','$W3');")"
echo "PROOF 3 - create command authority"
E1=$(as $M_ "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-09','$PA');")
has "manager plans in-scope worker (uuid)" '^[0-9a-f-]{36}$' "$E1"
has "worker not in scope refused" 'worker_not_in_scope' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$W3','2026-10-05','2026-10-06');")"
has "other-org project refused" 'project_not_in_organization' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06','$PB');")"
has "other-org manager refused" 'not_allowed' "$(as $MB "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06');")"
has "worker themself cannot plan" 'not_allowed' "$(as $WP1 "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06');")"
has "anon cannot execute" 'permission denied' "$(as anon "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06');")"
has "end before start refused" 'work_plan_entries_window_ordered' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-09','2026-10-05');")"
has "window over 366 days refused" 'work_plan_entries_window_bounded' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$W1','2026-01-01','2027-06-01');")"
has "no uid -> not_authenticated" 'not_authenticated' "$(printf '%s\n' "set role authenticated; select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06');" | $PSQL -f - 2>&1)"
echo "PROOF 4 - RLS read + direct-write block"
check "planning-org manager reads" 1 "$(as $M_ "select count(*) from public.work_plan_entries;")"
check "planned worker reads own" 1 "$(as $WP1 "select count(*) from public.work_plan_entries;")"
check "other worker sees none" 0 "$(as $WP2 "select count(*) from public.work_plan_entries;")"
check "other org manager sees none" 0 "$(as $MB "select count(*) from public.work_plan_entries;")"
has "anon has no grant" 'permission denied' "$(as anon "select count(*) from public.work_plan_entries;")"
has "direct insert blocked" 'permission denied' "$(as $M_ "insert into public.work_plan_entries(organization_id,worker_id,start_date,end_date,created_by) values ('$OA','$W1','2026-10-05','2026-10-06','$M_');")"
has "direct update blocked" 'permission denied' "$(as $M_ "update public.work_plan_entries set note='x';")"
has "direct delete blocked" 'permission denied' "$(as $M_ "delete from public.work_plan_entries;")"
echo "PROOF 5 - cancel (append, never delete)"
has "other-org manager cancel refused" 'not_allowed' "$(as $MB "select public.cancel_work_plan_entry_v1('$E1');")"
has "unknown id -> not_found" 'not_found' "$(as $M_ "select public.cancel_work_plan_entry_v1('00000000-0000-0000-0000-000000000000');")"
as $M_ "select public.cancel_work_plan_entry_v1('$E1');" >/dev/null
check "row kept, status cancelled, cancelled_by set" "cancelled|true" "$(su "select status||'|'||(cancelled_by is not null) from public.work_plan_entries where id='$E1';")"
echo "PROOF 6 - ACLs"
check "no function grants to public/anon" 0 "$(su "select count(*) from pg_proc p where proname in ('create_work_plan_entry_v1','cancel_work_plan_entry_v1','work_plan_worker_in_scope_v1') and (proacl is null or proacl::text ~ '(^|[{,])=|anon=');")"
check "all three SECURITY DEFINER with search_path" 3 "$(su "select count(*) from pg_proc where proname in ('create_work_plan_entry_v1','cancel_work_plan_entry_v1','work_plan_worker_in_scope_v1') and prosecdef and proconfig::text like '%search_path%';")"
echo "PROOF 7 - NULL-safe guard: a NULL manages_organization result must refuse, not allow"
su "create or replace function public.manages_organization(org uuid) returns boolean language sql stable as 'select null::boolean';" >/dev/null
has "NULL authority -> not_allowed (create)" 'not_allowed' "$(as $M_ "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06');")"
has "NULL authority -> not_allowed (cancel)" 'not_allowed' "$(as $M_ "select public.cancel_work_plan_entry_v1('$E1');")"
echo "PROOF 8 - rollback"
su "create or replace function public.manages_organization(org uuid) returns boolean language sql stable security definer as 'select true';" >/dev/null
as $M_ "select public.create_work_plan_entry_v1('$OA','$W1','2026-10-05','2026-10-06');" >/dev/null
has "rollback refused while planned rows exist" 'rollback refused' "$($PSQL -v ON_ERROR_STOP=1 -f "$DOWN" 2>&1)"
su "delete from public.work_plan_entries;" >/dev/null
if $PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1; then echo "  PASS  rollback applies on empty table"; pass=$((pass+1)); else echo "  FAIL  rollback"; fail=$((fail+1)); fi
check "objects gone after rollback" "0|0" "$(su "select (select count(*) from pg_proc where proname like '%work_plan%')||'|'||(select count(*) from pg_class where relname='work_plan_entries');")"
echo; echo "RESULT: $pass pass, $fail fail"; [ $fail -eq 0 ]
