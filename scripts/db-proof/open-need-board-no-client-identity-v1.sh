#!/usr/bin/env bash
# ============================================================================
# 20261122140000_open_need_board_no_client_identity_v1 — access proof.
#
# Runs against a LOCAL Supabase stack (`supabase start`, every migration
# replayed): the two readers depend on the whole demand/organization model
# (demand_company_id_v1, has_org_demand_access, manages_organization, the
# synthetic-fixture helpers, skills), so a stub prelude would prove a model,
# not the schema. Refuses any non-local host.
#
#   supabase start            # in the repo, migrations replayed
#   bash scripts/db-proof/open-need-board-no-client-identity-v1.sh
#
# Order: rollback (prior bodies) -> seed -> BEFORE checks (the leak exists)
#        -> migration -> AFTER checks -> rollback -> ROLLBACK checks
#        -> migration again -> cleanup of the seeded rows (fixed ids).
# Leaves the stack with the migration applied. Synthetic rows only.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261122140000_open_need_board_no_client_identity_v1
UP="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54322}
case "$PGPROOF_HOST" in 127.0.0.1|localhost) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
export PGPASSWORD=${PGPASSWORD:-postgres}
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q -v ON_ERROR_STOP=1"

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
# A superuser write (triggers off) that must change exactly one row, or the proof stops.
write1() { local out; out=$($PSQL -c "set session_replication_role = replica; $1" 2>&1); case "$out" in *"UPDATE 1"*|"") ;; *) echo "WRITE FAILED: $1 -> $out"; exit 1;; esac
  [ "$($PSQL -c "select count(*) from ($2) x")" = "1" ] || { echo "WRITE NOT APPLIED: $1"; exit 1; }; }
# as <uid|anon|nojwt> <sql>: one statement in a role-switched transaction.
as() { local who="$1"; shift
  case "$who" in
    anon)  pre="set local role anon;";;
    nojwt) pre="set local role authenticated;";;
    *)     pre="select set_config('request.jwt.claims', json_build_object('sub','$who','role','authenticated')::text, true); set local role authenticated;";;
  esac
  printf 'begin;\n%s\n%s\nrollback;\n' "$pre" "$*" | $PSQL -f - 2>&1 | tr -d '\r' | grep -v '^$' | sed 's/^psql:<stdin>:[0-9]*: //' | grep -v '^CONTEXT:' | tail -1; }
apply() { $PSQL -f "$1" >/dev/null 2>/tmp/_onb_err_$$ || { echo "APPLY FAILED: $1"; cat /tmp/_onb_err_$$; rm -f /tmp/_onb_err_$$; exit 1; }; rm -f /tmp/_onb_err_$$; }

AG=f1000000-0000-4000-8000-000000000001    # agency owner
CL=f1000000-0000-4000-8000-000000000002    # client owner (the need's poster)
OUT=f1000000-0000-4000-8000-000000000003   # signed-in outsider, manages nothing
AGORG=f2000000-0000-4000-8000-000000000001; CLORG=f2000000-0000-4000-8000-000000000002
CLC=f3000000-0000-4000-8000-000000000002
REQ=f4000000-0000-4000-8000-000000000001; OF=f5000000-0000-4000-8000-000000000001
CLIENT="Proof Client Builders"

cleanup() {
  su "set session_replication_role = replica;
      delete from public.team_demand_offers where id = '$OF';
      delete from public.customer_requests where id = '$REQ';
      delete from public.organizations where id in ('$AGORG','$CLORG');
      delete from public.companies where id = '$CLC';
      delete from auth.users where id in ('$AG','$CL','$OUT');" >/dev/null
}
seed() {
  cleanup
  # Superuser seed with triggers off (session_replication_role): the company
  # verification guard admits only an admin's act, which is not under test here.
  $PSQL -c "set session_replication_role = replica;
      insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000','$AG','authenticated','authenticated','proof-ag@example.test',now(),now()),
               ('00000000-0000-0000-0000-000000000000','$CL','authenticated','authenticated','proof-cl@example.test',now(),now()),
               ('00000000-0000-0000-0000-000000000000','$OUT','authenticated','authenticated','proof-out@example.test',now(),now());
      insert into public.profiles (id) values ('$AG'),('$CL'),('$OUT') on conflict (id) do nothing;
      insert into public.companies (id, profile_id, legal_name, display_name, country, verification_status, company_type)
        values ('$CLC','$CL','$CLIENT UAB','$CLIENT','LT','verified','construction');
      insert into public.organizations (id, owner_profile_id, organization_type, legal_name, display_name, country, legacy_company_id)
        values ('$AGORG','$AG','agency','Proof Staffing UAB','Proof Staffing','LT',null),
               ('$CLORG','$CL','company','$CLIENT UAB','$CLIENT','LT','$CLC');
      insert into public.customer_requests (id, profile_id, title, role_or_work_type, country, team_size, start_period, duration,
                                            language_requirement, notes, need_summary, status, kind, organization_id, payload)
        values ('$REQ','$CL','Tiler','tiler','LT',2,'flexible','3 weeks','LT','Call $CLIENT on +370 600 00000',
                '$CLIENT needs two tilers','submitted','company_request','$CLORG',
                '{\"need_skills\":{\"slugs\":[\"tiling\"],\"source\":\"recognized_from_text\",\"contract\":1},\"required_tools\":[\"hand-tools\",\"not-a-tool\"]}'::jsonb);
      insert into public.team_demand_offers (id, team_org_id, request_id, status, member_count_at_offer, offered_by, offer_kind)
        values ('$OF','$AGORG','$REQ','offered',0,'$AG','organization');" > /tmp/_onb_seed_$$ 2>&1 || { echo "SEED FAILED"; cat /tmp/_onb_seed_$$; rm -f /tmp/_onb_seed_$$; exit 1; }
  rm -f /tmp/_onb_seed_$$
}
# Moves the seeded offer to a status with the columns its CHECKs require
# (an answered offer has responded_at; only an assigned one has handed_off_at).
setstatus() {
  local resp="null" hand="null"
  case "$1" in accepted|declined|assigned) resp="now()";; esac
  [ "$1" = assigned ] && hand="now()"
  write1 "update public.team_demand_offers set status = '$1', responded_at = $resp, responded_by = case when $resp is null then null else '$CL'::uuid end, handed_off_at = $hand where id = '$OF'" \
         "select 1 from public.team_demand_offers where id = '$OF' and status = '$1'"; }

V1="select coalesce(company_name,'<null>') from public.list_open_demand_for_team_offer_v1('$AGORG') where request_id = '$REQ';"
SENT="select coalesce(company_name,'<null>') from public.list_team_demand_offers_for_team_v1('$AGORG') where offer_id = '$OF';"
V2="select concat_ws('|', team_size, start_period, duration, language_requirement, array_to_string(need_skill_slugs, ','), array_to_string(required_tools, ','), open_offer_status) from public.list_open_needs_for_offer_v2('$AGORG') where request_id = '$REQ';"
V2TEXT="select (row_to_json(r)::text ilike '%Proof Client%' or row_to_json(r)::text ilike '%+370%')::text from public.list_open_needs_for_offer_v2('$AGORG') r where r.request_id = '$REQ';"

echo "== BEFORE (prior bodies): the leak exists"
apply "$DOWN"
seed
check "v1 open reader returns the client name" "$CLIENT" "$(as $AG "$V1")"
check "offerer's own list names the client while unanswered" "$CLIENT" "$(as $AG "$SENT")"
check "v2 does not exist" "true" "$(su "select (to_regprocedure('public.list_open_needs_for_offer_v2(uuid)') is null)::text")"

echo "== AFTER (migration)"
apply "$UP"
check "v1 open reader: name is NULL" "<null>" "$(as $AG "$V1")"
check "v1 still lists the need (same filters)" "1" "$(as $AG "select count(*) from public.list_open_demand_for_team_offer_v1('$AGORG') where request_id = '$REQ';")"
check "v2: facts (size|start|duration|language|skills|tools|offer)" "2|flexible|3 weeks|LT|tiling|hand-tools|offered" "$(as $AG "$V2")"
check "v2 row carries no client name and no free text" "false" "$(as $AG "$V2TEXT")"
check "offered: the offerer's list names no client" "<null>" "$(as $AG "$SENT")"
setstatus accepted
check "accepted: the client is named" "$CLIENT" "$(as $AG "$SENT")"
setstatus assigned
check "assigned: the client is named" "$CLIENT" "$(as $AG "$SENT")"
setstatus declined
check "declined: anonymous again" "<null>" "$(as $AG "$SENT")"
setstatus withdrawn
check "withdrawn: anonymous" "<null>" "$(as $AG "$SENT")"
setstatus offered
check "outsider (manages nothing): v2 zero rows" "0" "$(as $OUT "select count(*) from public.list_open_needs_for_offer_v2('$AGORG');")"
check "outsider: v1 zero rows" "0" "$(as $OUT "select count(*) from public.list_open_demand_for_team_offer_v1('$AGORG');")"
check "outsider: offerer list zero rows" "0" "$(as $OUT "select count(*) from public.list_team_demand_offers_for_team_v1('$AGORG');")"
check "the need's own client never sees its need on the board" "0" "$(as $CL "select count(*) from public.list_open_needs_for_offer_v2('$CLORG') where request_id = '$REQ';")"
check "no JWT: refused" "ERROR:  Not authenticated" "$(as nojwt "select count(*) from public.list_open_needs_for_offer_v2('$AGORG');")"
check "anon: no EXECUTE on v2" "false" "$(su "select has_function_privilege('anon','public.list_open_needs_for_offer_v2(uuid)','execute')::text")"
check "anon: no EXECUTE on v1 open reader" "false" "$(su "select has_function_privilege('anon','public.list_open_demand_for_team_offer_v1(uuid)','execute')::text")"
check "anon: no EXECUTE on offerer list" "false" "$(su "select has_function_privilege('anon','public.list_team_demand_offers_for_team_v1(uuid)','execute')::text")"
check "authenticated: EXECUTE on v2" "true" "$(su "select has_function_privilege('authenticated','public.list_open_needs_for_offer_v2(uuid)','execute')::text")"
check "v2 is SECURITY DEFINER with a pinned search_path" "true|search_path=public" "$(su "select p.prosecdef::text || '|' || array_to_string(p.proconfig, ',') from pg_proc p where p.oid = 'public.list_open_needs_for_offer_v2(uuid)'::regprocedure")"
write1 "update public.companies set verification_status = 'unverified' where id = '$CLC'" "select 1 from public.companies where id = '$CLC' and verification_status = 'unverified'"
check "unverified client: the need is not on the board" "0" "$(as $AG "select count(*) from public.list_open_needs_for_offer_v2('$AGORG') where request_id = '$REQ';")"
write1 "update public.companies set verification_status = 'verified' where id = '$CLC'" "select 1 from public.companies where id = '$CLC' and verification_status = 'verified'"

echo "== ROLLBACK"
apply "$DOWN"
check "rollback: v1 names the client again (prior body)" "$CLIENT" "$(as $AG "$V1")"
check "rollback: v2 dropped" "true" "$(su "select (to_regprocedure('public.list_open_needs_for_offer_v2(uuid)') is null)::text")"
check "rollback: anon still has no EXECUTE on v1" "false" "$(su "select has_function_privilege('anon','public.list_open_demand_for_team_offer_v1(uuid)','execute')::text")"

echo "== RE-APPLY"
apply "$UP"
check "re-apply: v1 name NULL again" "<null>" "$(as $AG "$V1")"
cleanup
check "cleanup: no seeded row left" "0" "$(su "select count(*) from public.customer_requests where id = '$REQ'")"

echo
echo "open-need-board-no-client-identity-v1: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
