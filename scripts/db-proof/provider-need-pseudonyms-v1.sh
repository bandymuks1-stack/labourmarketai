#!/usr/bin/env bash
# ============================================================================
# PROVIDER NEED PSEUDONYMS v1 — proof on the LOCAL Supabase stack (every
# migration replayed, 20261122214700 included), in ONE transaction that is
# rolled back: the database is left as it was.
#
# The question (owner, 2026-11-22): an agency / subcontractor / brigade must
# never RECEIVE a real need id or anything that links a need to its client —
# because workers see the employer's name next to the need id on the worker
# board, any held id names the client. Probed as a provider who ALSO has a
# worker row (the realistic attacker: brigade leaders are workers).
#
#   BEFORE  the 20261122214700 state: controls show the leak;
#   APPLY   (twice) — every provider read carries aliases only;
#   ROLLBACK every function, ACL and policy back to BEFORE;
#   RE-APPLY.
# Usage: bash scripts/db-proof/provider-need-pseudonyms-v1.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."
N=20261122223000_provider_need_pseudonyms_v1
UP="supabase/migrations/${N}.sql"; DOWN="supabase/rollbacks/${N}.down.sql"
PSQL=${PSQL:-"docker exec -i supabase_db_labourmarketai psql -U postgres -X -q -tA"}
case "$PSQL" in *supabase_db_labourmarketai*|*127.0.0.1*|*localhost*) ;; *) echo "refusing a non-local target"; exit 2;; esac
body() { grep -viE '^\s*(begin|commit);\s*$' "$1"; }

CLIENT=0d0d0000-0000-4000-8000-0000000000a1
AGENT=0d0d0000-0000-4000-8000-0000000000a2   # owns two provider orgs AND has a worker row
STRANGER=0d0d0000-0000-4000-8000-0000000000a4
CC=0d0d0000-0000-4000-8000-0000000000c1; OC=0d0d0000-0000-4000-8000-0000000000c2
AG=0d0d0000-0000-4000-8000-0000000000c3; OA=0d0d0000-0000-4000-8000-0000000000c4
AG2=0d0d0000-0000-4000-8000-0000000000c5; OA2=0d0d0000-0000-4000-8000-0000000000c6
WA=0d0d0000-0000-4000-8000-0000000000b2       # the agent's worker row
N1=0d0d0000-0000-4000-8000-0000000000d1
ALIAS="(select request_id from public.list_open_demand_for_team_offer_v1('$OA') where role_text = 'Pseudo welder' limit 1)"
T="(select id from public.conversations where source_type = 'open_need' and created_by = '$AGENT' order by created_at limit 1)"

as() {
  if [ "$1" = postgres ]; then :
  elif [ "$1" = anon ]; then echo "set local role anon;"
  else echo "set local role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true) \\gset _"; fi
  echo "select '__R|' || coalesce(public._pnp_try(\$q\$$2\$q\$), '');"
  echo "reset role;"
}
check() { echo "\\echo __N|$1~$2"; as "$3" "$4"; }

{
cat <<SQL
begin;
create function public._pnp_try(q text) returns text language plpgsql as \$f\$
declare r text;
begin
  execute q into r;
  return coalesce(r, '');
exception when others then
  return 'ERROR: ' || sqlerrm;
end \$f\$;
grant execute on function public._pnp_try(text) to anon, authenticated, service_role;
create table public._pnp_snap(phase text, what text, digest text);
create function public._pnp_take(p text) returns void language sql as \$f\$
  insert into public._pnp_snap
  select p, 'procs', md5(string_agg(x, '|' order by x)) from (
    select p2.oid::regprocedure::text || pg_get_functiondef(p2.oid) || coalesce(p2.proacl::text, '') as x
      from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.prokind = 'f' and p2.proname not like '\_pnp\_%') s
  union all
  select p, 'procs_other', md5(string_agg(x, '|' order by x)) from (
    select p2.oid::regprocedure::text || pg_get_functiondef(p2.oid) || coalesce(p2.proacl::text, '') as x
      from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.prokind = 'f' and p2.proname not like '\_pnp\_%'
       and p2.proname not in ('provider_need_alias_v1','provider_need_of_alias_v1','list_open_demand_for_team_offer_v1',
         'list_team_demand_offers_for_team_v1','offer_team_to_demand_v1','open_need_conversation_open_v1',
         'open_need_thread_ensure_v1','conversation_source_context','disclose_open_need_identity_v1',
         'list_open_demand_for_agencies','mark_agency_can_offer','list_open_needs_for_offer_v2')) s
  union all
  select p, 'policies', md5(string_agg(x, '|' order by x)) from (
    select schemaname || tablename || policyname || coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ',') || cmd as x
      from pg_policies where schemaname in ('public', 'storage')) s
  union all
  select p, 'columns', md5(string_agg(x, '|' order by x)) from (
    select table_name || column_name || grantee || privilege_type as x
      from information_schema.column_privileges where table_schema = 'public' and table_name = 'team_demand_offers') s;
\$f\$;

-- A stack that already carries this migration is rolled back first, INSIDE
-- this transaction, so BEFORE is the 20261122214700 state.
select (to_regprocedure('public.provider_need_alias_v1(uuid,uuid)') is not null) as pnp_applied \\gset
\\if :pnp_applied
SQL
body "$DOWN"
cat <<SQL
\\echo __NOTE|the stack had the migration: BEFORE is taken after its rollback
\\endif

set session_replication_role = replica;
insert into public.profiles(id, full_name) values ('$CLIENT','Clara Pseudo'), ('$AGENT','Agnes Pseudo'), ('$STRANGER','Sam Pseudo');
insert into public.companies(id, profile_id, display_name, legal_name, verification_status)
  values ('$CC','$CLIENT','Pseudo Client Co','Pseudo Client Co UAB','verified');
insert into public.organizations(id, organization_type, legacy_company_id, display_name, owner_profile_id)
  values ('$OC','company','$CC','Pseudo Client Co','$CLIENT');
insert into public.agencies(id, profile_id) values ('$AG','$AGENT'), ('$AG2','$AGENT');
insert into public.organizations(id, organization_type, legacy_agency_id, display_name, owner_profile_id) values
  ('$OA','agency','$AG','Pseudo Agency A','$AGENT'), ('$OA2','agency','$AG2','Pseudo Agency B','$AGENT');
insert into public.company_memberships(organization_id, profile_id, role, status, accepted_at) values
  ('$OC','$CLIENT','owner','active',now()), ('$OA','$AGENT','owner','active',now()), ('$OA2','$AGENT','owner','active',now());
insert into public.workers(id, profile_id) values ('$WA','$AGENT');
insert into public.customer_requests(id, profile_id, organization_id, title, role_or_work_type, country, status, kind)
  values ('$N1','$CLIENT','$OC','Pseudo need','Pseudo welder','LT','submitted','company_request');
set session_replication_role = origin;
select public._pnp_take('before');
\\echo __PHASE|BEFORE
SQL
check "control: the worker board names the company next to the need id" "Pseudo Client Co" "$AGENT" "select company_name from public.list_open_demand_for_workers() where id = '$N1'"
check "control: the provider board gives the same real need id (the join)" "true" "$AGENT" "select ($ALIAS = '$N1')::text"
echo "\\echo __PHASE|APPLY"
body "$UP"
body "$UP"   # idempotent
cat <<SQL
select public._pnp_take('applied');
-- The restore is checked here, before any open-need thread exists: the
-- rollback refuses once one does (R2 P3-1, checked at the end). A savepoint
-- keeps the applied state for the checks that follow.
\\echo __PHASE|ROLLBACK (savepoint, before any thread)
savepoint pnp_before_down;
-- Open-need threads committed on this local stack by earlier browser walks
-- would make the rollback refuse; inside this savepoint only they are set
-- aside (the savepoint is rolled back right after the checks).
update public.conversations set source_type = null where source_type = 'open_need';
select exists (select 1 from public.provider_need_aliases) as pnp_alias_rows \\gset
SQL
body "$DOWN"
cat <<SQL
select public._pnp_take('rolled_back');
\\echo __N|rollback restores every function body and ACL~same
select '__R|' || case when (select digest from public._pnp_snap where phase='before' and what='procs')
                         = (select digest from public._pnp_snap where phase='rolled_back' and what='procs') then 'same' else 'differs' end;
\\echo __N|rollback restores the offer column grants~same
select '__R|' || case when (select digest from public._pnp_snap where phase='before' and what='columns')
                         = (select digest from public._pnp_snap where phase='rolled_back' and what='columns') then 'same' else 'differs' end;
\\echo __N|rollback drops the alias table only when it is empty (no drop of rows)~true
select '__R|' || ((to_regclass('public.provider_need_aliases') is not null) = :'pnp_alias_rows'::boolean)::text;
rollback to savepoint pnp_before_down;
\\echo __PHASE|APPLIED (back from the savepoint)
SQL
check "the board gives an alias, never the need id" "false" "$AGENT" "select ($ALIAS = '$N1')::text"
check "the #3630 reader v2 gives the same alias, never the need id" "true|false" "$AGENT" "select ((select request_id from public.list_open_needs_for_offer_v2('$OA') where role_text = 'Pseudo welder' limit 1) = $ALIAS)::text || '|' || exists (select 1 from public.list_open_needs_for_offer_v2('$OA') where request_id = '$N1')::text"
check "the alias is stable across reads" "true" "$AGENT" "select ($ALIAS = (select request_id from public.list_open_demand_for_team_offer_v1('$OA') where role_text = 'Pseudo welder' limit 1))::text"
check "the alias differs per provider organization" "false" "$AGENT" "select ($ALIAS = (select request_id from public.list_open_demand_for_team_offer_v1('$OA2') where role_text = 'Pseudo welder' limit 1))::text"
check "the join is gone: no board id appears on the worker board" "0" "$AGENT" "select count(*)::text from public.list_open_demand_for_team_offer_v1('$OA') b where b.request_id in (select id from public.list_open_demand_for_workers())"
check "the exact time is gone: the board shows the day only" "00:00:00" "$AGENT" "select to_char((select created_at from public.list_open_demand_for_team_offer_v1('$OA') where role_text = 'Pseudo welder' limit 1) at time zone 'UTC', 'HH24:MI:SS')"
check "a real need id opens nothing (the door)" "ERROR: not allowed" "$AGENT" "select public.open_need_conversation_open_v1('$N1','$OA')::text"
check "a real need id offers nothing" "ERROR: demand_not_offerable" "$AGENT" "select public.offer_team_to_demand_v1('$OA', '$N1', null)::text"
check "an alias of ANOTHER organization offers nothing" "ERROR: demand_not_offerable" "$AGENT" "select public.offer_team_to_demand_v1('$OA', (select request_id from public.list_open_demand_for_team_offer_v1('$OA2') where role_text = 'Pseudo welder' limit 1), null)::text"
check "the alias opens the anonymous thread" "uuid" "$AGENT" "select pg_typeof(public.open_need_conversation_open_v1($ALIAS, '$OA'))::text"
check "the thread source is the alias, never the need id" "true|false" "$AGENT" "select ((select source_id from public.conversations where id = $T) = $ALIAS)::text || '|' || ((select source_id from public.conversations where id = $T) = '$N1')::text"
check "the client label derives from the alias, not the need id" "true" "$AGENT" "select ((select display_name from public.conversation_counterpart_identities(array[$T])) = 'Client ' || upper(left(replace($ALIAS::text, '-', ''), 6)))::text"
check "the agency context still names the role" "Pseudo welder|" "$AGENT" "select source_title || '|' || coalesce(source_route_hint, '') from public.conversation_source_context(array[$T])"
check "the alias offers the need" "created" "$AGENT" "select public.offer_team_to_demand_v1('$OA', $ALIAS, null)->>'outcome'"
check "the sent offer names the need by the alias" "true" "$AGENT" "select ((select request_id from public.list_team_demand_offers_for_team_v1('$OA') limit 1) = $ALIAS)::text"
check "the raw offer row no longer gives the need id" "ERROR: permission denied for table team_demand_offers" "$AGENT" "select request_id::text from public.team_demand_offers limit 1"
check "the raw offer row still gives its status" "offered" "$AGENT" "select status from public.team_demand_offers limit 1"
check "the retired all-needs reader is closed" "ERROR: permission denied for function list_open_demand_for_agencies" "$AGENT" "select count(*)::text from public.list_open_demand_for_agencies()"
check "the retired can-offer oracle is closed" "ERROR: permission denied for function mark_agency_can_offer" "$AGENT" "select public.mark_agency_can_offer('$N1', null)::text"
check "the alias ledger is not readable by any app role" "ERROR: permission denied for table provider_need_aliases" "$AGENT" "select count(*)::text from public.provider_need_aliases"
check "the resolver is not callable" "ERROR: permission denied for function provider_need_of_alias_v1" "$AGENT" "select public.provider_need_of_alias_v1('$OA', $ALIAS)::text"
check "nothing the agency reads as a PROVIDER carries the need id" "0" "$AGENT" "select count(*)::text from (
    select row_to_json(x)::text j from public.list_open_demand_for_team_offer_v1('$OA') x
    union all select row_to_json(x)::text from public.list_open_demand_for_team_offer_v1('$OA2') x
    union all select row_to_json(x)::text from public.list_team_demand_offers_for_team_v1('$OA') x
    union all select row_to_json(x)::text from public.conversations x where source_type = 'open_need'
    union all select row_to_json(x)::text from public.conversation_participants x where conversation_id = $T
    union all select row_to_json(x)::text from public.conversation_messages_visible_v1 x where conversation_id = $T
    union all select row_to_json(x)::text from public.conversation_source_context(array[$T]) x
    union all select row_to_json(x)::text from public.conversation_counterpart_identities(array[$T]) x
    union all select row_to_json(x)::text from public.team_offer_thread_party_v1((select offer_id from public.list_team_demand_offers_for_team_v1('$OA') limit 1)) x
  ) r where j like '%$N1%' or j like '%$CC%' or j like '%$OC%' or j like '%$CLIENT%' or j like '%Pseudo Client Co%'"
check "the client still works with its own need id" "1" "$CLIENT" "select count(*)::text from public.list_team_offers_for_request_v1('$N1')"
check "the client reaches the same thread from the offer" "true" "$CLIENT" "select (public.team_offer_thread_v1((select offer_id from public.list_team_offers_for_request_v1('$N1') limit 1)) = $T)::text"
check "the client context routes to its needs" "Pseudo welder|company_needs" "$CLIENT" "select source_title || '|' || coalesce(source_route_hint, '') from public.conversation_source_context(array[$T])"
check "the client can still show its name" "true" "$CLIENT" "select public.disclose_open_need_identity_v1($T)::text"
check "a stranger gets nothing from the board" "0" "$STRANGER" "select count(*)::text from public.list_open_demand_for_team_offer_v1('$OA')"
cat <<SQL
\\echo __N|every other function body and ACL unchanged~same
select '__R|' || case when (select digest from public._pnp_snap where phase='before' and what='procs_other')
                         = (select digest from public._pnp_snap where phase='applied' and what='procs_other') then 'same' else 'differs' end;
\\echo __N|no policy changed~same
select '__R|' || case when (select digest from public._pnp_snap where phase='before' and what='policies')
                         = (select digest from public._pnp_snap where phase='applied' and what='policies') then 'same' else 'differs' end;
\\echo __PHASE|ROLLBACK (with an open-need thread)
savepoint pnp_refuse;
\\set ON_ERROR_STOP off
SQL
# The rollback's own first block, its refusal (R2 P3-1): it never keys a
# thread back to the real need id.
awk '/^do \$\$/{f=1} f{print} /^end \$\$;/{if(f) exit}' "$DOWN"
cat <<SQL
\\set ON_ERROR_STOP on
rollback to savepoint pnp_refuse;
\\echo __N|rollback refuses while an open-need thread exists~open-need threads exist - forward-fix, do not roll back
\\echo __R|:LAST_ERROR_MESSAGE
\\echo __N|the thread still carries the alias afterwards~false
select '__R|' || ((select source_id from public.conversations where source_type = 'open_need' and created_by = '$AGENT' order by created_at limit 1) = '$N1')::text;
rollback;
SQL
} > /tmp/pnp_proof.sql

$PSQL -v ON_ERROR_STOP=1 -f - < /tmp/pnp_proof.sql 2>/tmp/pnp_err.txt | tr -d '\r' > /tmp/pnp_out.txt || { echo "the run itself failed"; head -20 /tmp/pnp_err.txt; exit 1; }
pass=0; fail=0; name=""; exp=""
while IFS= read -r line; do
  case "$line" in
    __PHASE\|*) echo "${line#__PHASE|}";;
    __NOTE\|*) echo "  NOTE  ${line#__NOTE|}";;
    __N\|*) rest="${line#__N|}"; name="${rest%%~*}"; exp="${rest#*~}";;
    __R\|*) got="${line#__R|}"
      if [ "$got" = "$exp" ]; then echo "  PASS  $name"; pass=$((pass+1)); else echo "  FAIL  $name (expected [$exp], got [$got])"; fail=$((fail+1)); fi;;
  esac
done < /tmp/pnp_out.txt
echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
