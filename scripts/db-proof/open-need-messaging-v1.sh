#!/usr/bin/env bash
# ============================================================================
# OPEN NEED MESSAGING v1 — proof on the LOCAL Supabase stack (every migration
# replayed), in ONE transaction that is rolled back: the database is left as it
# was.
#
#   BEFORE  snapshot every function body + ACL and every policy;
#   APPLY   the migration (twice: idempotent), then probe every actor under
#           `set local role authenticated|anon` with a real jwt sub;
#   ROLLBACK refused while an open-need thread exists; applied once it is gone;
#           every function and policy back to the BEFORE snapshot;
#   RE-APPLY the migration.
#
# Usage: bash scripts/db-proof/open-need-messaging-v1.sh
#   (PSQL defaults to the local stack container; never point it elsewhere).
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."
N=20261122160000_open_need_messaging_v1
UP="supabase/migrations/${N}.sql"; DOWN="supabase/rollbacks/${N}.down.sql"
PSQL=${PSQL:-"docker exec -i supabase_db_labourmarketai psql -U postgres -X -q -tA"}
case "$PSQL" in *supabase_db_labourmarketai*|*127.0.0.1*|*localhost*) ;; *) echo "refusing a non-local target"; exit 2;; esac
body() { grep -viE '^\s*(begin|commit);\s*$' "$1"; }

CLIENT=0e0e0000-0000-4000-8000-0000000000a1
AGENT=0e0e0000-0000-4000-8000-0000000000a2
AGENT2=0e0e0000-0000-4000-8000-0000000000a3
STRANGER=0e0e0000-0000-4000-8000-0000000000a4
CC=0e0e0000-0000-4000-8000-0000000000c1      # client's company (verified)
OC=0e0e0000-0000-4000-8000-0000000000c2      # client's organization
AG=0e0e0000-0000-4000-8000-0000000000c3      # agency row
OA=0e0e0000-0000-4000-8000-0000000000c4      # agency organization (AGENT owns)
AG2=0e0e0000-0000-4000-8000-0000000000c5
OB=0e0e0000-0000-4000-8000-0000000000c6      # second agency (AGENT2 owns)
N1=0e0e0000-0000-4000-8000-0000000000d1      # the open need
T1=0e0e0000-0000-4000-8000-0000000000e1      # the open-need thread
LABEL="Client $(echo "$N1" | tr -d '-' | cut -c1-6 | tr a-z A-Z)"

as() { # as <uid|anon> <sql returning one text>
  if [ "$1" = anon ]; then echo "set local role anon;"
  else echo "set local role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$1\",\"role\":\"authenticated\"}', true) \\gset _"; fi
  echo "select '__R|' || coalesce(public._onm_try(\$q\$$2\$q\$), '');"
  echo "reset role;"
}
check() { # check <name> <expected> <uid|anon> <sql>
  echo "\\echo __N|$1~$2"; as "$3" "$4"; }

{
cat <<SQL
begin;
create function public._onm_try(q text) returns text language plpgsql as \$f\$
declare r text;
begin
  execute q into r;
  return coalesce(r, '');
exception when others then
  return 'ERROR: ' || sqlerrm;
end \$f\$;
grant execute on function public._onm_try(text) to anon, authenticated;
create function public._onm_exec(q text) returns text language plpgsql as \$f\$
begin
  execute q;
  return 'ok';
exception when others then
  return 'ERROR: ' || sqlerrm;
end \$f\$;
create table public._onm_snap(phase text, what text, digest text);
create function public._onm_take(p text) returns void language sql as \$f\$
  insert into public._onm_snap
  select p, 'procs', md5(string_agg(x, '|' order by x)) from (
    select p2.oid::regprocedure::text || pg_get_functiondef(p2.oid) || coalesce(p2.proacl::text, '') as x
      from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.prokind = 'f' and p2.proname not like '\_onm\_%') s
  union all
  select p, 'procs_other', md5(string_agg(x, '|' order by x)) from (
    select p2.oid::regprocedure::text || pg_get_functiondef(p2.oid) || coalesce(p2.proacl::text, '') as x
      from pg_proc p2 join pg_namespace n on n.oid = p2.pronamespace
     where n.nspname = 'public' and p2.prokind = 'f' and p2.proname not like '\_onm\_%'
       and p2.proname not in ('open_need_message_party_v1','disclose_open_need_identity_v1',
         'conversation_counterpart_identities','conversation_source_context','list_open_demand_for_team_offer_v1')) s
  union all
  select p, 'policies_other', md5(string_agg(x, '|' order by x)) from (
    select tablename || policyname || coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ',') || cmd as x
      from pg_policies where schemaname = 'public' and tablename <> 'open_need_identity_disclosures') s
  union all
  select p, 'policies', md5(string_agg(x, '|' order by x)) from (
    select tablename || policyname || coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ',') || cmd as x
      from pg_policies where schemaname = 'public') s
  union all
  select p, 'check', pg_get_constraintdef(oid) from pg_constraint where conname = 'conversations_source_type_check';
\$f\$;

set session_replication_role = replica;
insert into public.profiles(id, full_name) values
  ('$CLIENT','Clara Client'), ('$AGENT','Agnes Agent'), ('$AGENT2','Otto Other'), ('$STRANGER','Sam Stranger');
insert into public.companies(id, profile_id, display_name, legal_name, verification_status)
  values ('$CC','$CLIENT','Client Co','Client Co UAB','verified');
insert into public.organizations(id, organization_type, legacy_company_id, display_name, owner_profile_id)
  values ('$OC','company','$CC','Client Co','$CLIENT');
insert into public.agencies(id, profile_id) values ('$AG','$AGENT'), ('$AG2','$AGENT2');
insert into public.organizations(id, organization_type, legacy_agency_id, display_name, owner_profile_id) values
  ('$OA','agency','$AG','Agency A','$AGENT'), ('$OB','agency','$AG2','Agency B','$AGENT2');
insert into public.company_memberships(organization_id, profile_id, role, status, accepted_at) values
  ('$OC','$CLIENT','owner','active',now()), ('$OA','$AGENT','owner','active',now()), ('$OB','$AGENT2','owner','active',now());
insert into public.customer_requests(id, profile_id, organization_id, title, role_or_work_type, country, status, kind)
  values ('$N1','$CLIENT','$OC','Welders for Client Co','Welder','LT','submitted','company_request');
set session_replication_role = origin;

select public._onm_take('before');
\\echo __PHASE|BEFORE
SQL
check "control: before the migration the board names the client" "Client Co" "$AGENT" "select coalesce(string_agg(company_name, ','), '') from public.list_open_demand_for_team_offer_v1('$OA') where request_id = '$N1'"
check "control: before the migration there is no provider door" "ERROR: function public.open_need_message_party_v1(unknown, unknown) does not exist" "$AGENT" "select count(*)::text from public.open_need_message_party_v1('$N1','$OA')"
echo "\\echo __PHASE|APPLY"
body "$UP"
body "$UP"   # idempotent re-apply
cat <<SQL
select public._onm_take('applied');
-- The thread the server opens (communication core, admin participant insert).
insert into public.conversations(id, subject, kind, created_by, source_type, source_id)
  values ('$T1','Welder','direct','$AGENT','open_need','$N1');
insert into public.conversation_participants(conversation_id, profile_id) values ('$T1','$AGENT'), ('$T1','$CLIENT');
SQL
check "the board lists the need to the agency" "1" "$AGENT" "select count(*)::text from public.list_open_demand_for_team_offer_v1('$OA') where request_id = '$N1'"
check "the board does not name the client" "" "$AGENT" "select coalesce(string_agg(company_name, ','), '') from public.list_open_demand_for_team_offer_v1('$OA') where request_id = '$N1'"
check "provider door: the agency gets the owner and a neutral subject" "$CLIENT|Welder" "$AGENT" "select owner_profile_id::text || '|' || subject from public.open_need_message_party_v1('$N1','$OA')"
check "provider door: not through an org the caller does not manage" "0" "$AGENT" "select count(*)::text from public.open_need_message_party_v1('$N1','$OB')"
check "provider door: a stranger gets nothing" "0" "$STRANGER" "select count(*)::text from public.open_need_message_party_v1('$N1','$OA')"
check "provider door: the client cannot open its own need" "0" "$CLIENT" "select count(*)::text from public.open_need_message_party_v1('$N1','$OC')"
check "provider door: anon cannot execute" "ERROR: permission denied for function open_need_message_party_v1" anon "select count(*)::text from public.open_need_message_party_v1('$N1','$OA')"
check "the agency sees the client only as a pseudonym" "$LABEL" "$AGENT" "select display_name from public.conversation_counterpart_identities(array['$T1']::uuid[])"
check "the client sees the agency person by name" "Agnes Agent" "$CLIENT" "select display_name from public.conversation_counterpart_identities(array['$T1']::uuid[])"
check "a stranger gets no name" "0" "$STRANGER" "select count(*)::text from public.conversation_counterpart_identities(array['$T1']::uuid[])"
check "another agency gets no name" "0" "$AGENT2" "select count(*)::text from public.conversation_counterpart_identities(array['$T1']::uuid[])"
check "the agency context: the need, no route" "Welder|" "$AGENT" "select source_title || '|' || coalesce(source_route_hint, '') from public.conversation_source_context(array['$T1']::uuid[])"
check "the client context: the need, its route" "Welder|company_needs" "$CLIENT" "select source_title || '|' || coalesce(source_route_hint, '') from public.conversation_source_context(array['$T1']::uuid[])"
check "a stranger gets no context" "0" "$STRANGER" "select count(*)::text from public.conversation_source_context(array['$T1']::uuid[])"
check "a stranger reads no participant row" "0" "$STRANGER" "select count(*)::text from public.conversation_participants where conversation_id = '$T1'"
check "a stranger reads no conversation" "0" "$STRANGER" "select count(*)::text from public.conversations where id = '$T1'"
check "the agency cannot read the client profile" "0" "$AGENT" "select count(*)::text from public.profiles where id = '$CLIENT'"
check "the agency cannot read the need row" "0" "$AGENT" "select count(*)::text from public.customer_requests where id = '$N1'"
check "the agency cannot disclose for the client" "ERROR: not allowed" "$AGENT" "select public.disclose_open_need_identity_v1('$T1')::text"
check "a stranger cannot disclose" "ERROR: not allowed" "$STRANGER" "select public.disclose_open_need_identity_v1('$T1')::text"
check "anon cannot disclose" "ERROR: permission denied for function disclose_open_need_identity_v1" anon "select public.disclose_open_need_identity_v1('$T1')::text"
check "nobody writes a disclosure directly (no table privilege)" "ERROR: permission denied for table open_need_identity_disclosures" "$AGENT" "insert into public.open_need_identity_disclosures(conversation_id, disclosed_by) values ('$T1','$AGENT') returning 'x'"
check "still hidden after every refusal" "$LABEL" "$AGENT" "select display_name from public.conversation_counterpart_identities(array['$T1']::uuid[])"
check "the client chooses to show its name" "true" "$CLIENT" "select public.disclose_open_need_identity_v1('$T1')::text"
check "the agency now sees the client name" "Clara Client" "$AGENT" "select display_name from public.conversation_counterpart_identities(array['$T1']::uuid[])"
check "disclosing twice keeps one row" "true|1" "$CLIENT" "select public.disclose_open_need_identity_v1('$T1')::text || '|' || (select count(*) from public.open_need_identity_disclosures where conversation_id = '$T1')::text"
check "the agency reads the disclosure row" "1" "$AGENT" "select count(*)::text from public.open_need_identity_disclosures"
check "a stranger reads no disclosure row" "0" "$STRANGER" "select count(*)::text from public.open_need_identity_disclosures"
check "the CHECK still refuses an unknown source" "ERROR: new row for relation \"conversations\" violates check constraint \"conversations_source_type_check\"" "$AGENT" "insert into public.conversations(subject, kind, created_by, source_type, source_id) values ('x','direct','$AGENT','made_up','$N1') returning 'x'"
cat <<SQL
\\echo __N|the disclosure is audited~1
select '__R|' || count(*)::text from public.audit_logs where action = 'open_need_identity_disclosed_v1' and entity_id = '$T1';
\\echo __N|every other function body and ACL unchanged~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='procs_other')
                         = (select digest from public._onm_snap where phase='applied' and what='procs_other') then 'same' else 'differs' end;
\\echo __N|every existing policy unchanged~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='policies_other')
                         = (select digest from public._onm_snap where phase='applied' and what='policies_other') then 'same' else 'differs' end;
\\echo __N|one new policy, on the disclosure table, for participants~1
select '__R|' || count(*)::text from pg_policies where schemaname='public' and tablename='open_need_identity_disclosures'
   and cmd = 'SELECT' and qual like '%is_conversation_participant%';
\\echo __PHASE|ROLLBACK
savepoint before_down;
SQL
echo "\\echo __N|rollback refuses while an open-need thread exists~refused"
GUARD=$(awk '/^do \$\$/{f=1} f{print} f&&/^end \$\$;/{exit}' "$DOWN" | sed 's/\$\$/$x$/g; $ s/;$//' | tr '\n' ' ')
echo "select '__R|' || case when public._onm_exec(\$q\$$GUARD\$q\$) like 'ERROR: open_need conversations exist%' then 'refused' else 'ran' end;"
cat <<SQL
delete from public.conversations where id = '$T1';
SQL
body "$DOWN"
cat <<SQL
select public._onm_take('rolled_back');
\\echo __N|rollback restores every function body and ACL~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='procs')
                         = (select digest from public._onm_snap where phase='rolled_back' and what='procs') then 'same' else 'differs' end;
\\echo __N|rollback restores every policy~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='policies')
                         = (select digest from public._onm_snap where phase='rolled_back' and what='policies') then 'same' else 'differs' end;
\\echo __N|rollback restores the CHECK~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='check')
                         = (select digest from public._onm_snap where phase='rolled_back' and what='check') then 'same' else 'differs' end;
\\echo __N|the migration changed function bodies (the snapshot sees it)~differs
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='procs')
                         = (select digest from public._onm_snap where phase='applied' and what='procs') then 'same' else 'differs' end;
\\echo __PHASE|RE-APPLY
SQL
body "$UP"
cat <<SQL
\\echo __N|forward re-applies after rollback~open_need
select '__R|' || case when pg_get_constraintdef(oid) like '%open_need%' then 'open_need' else 'missing' end
  from pg_constraint where conname = 'conversations_source_type_check';
rollback;
SQL
} > /tmp/onm_proof.sql

$PSQL -v ON_ERROR_STOP=1 -f - < /tmp/onm_proof.sql 2>/tmp/onm_err.txt | tr -d '\r' > /tmp/onm_out.txt || { echo "the run itself failed"; cat /tmp/onm_err.txt | head -20; exit 1; }
pass=0; fail=0; name=""; exp=""
while IFS= read -r line; do
  case "$line" in
    __PHASE\|*) echo "${line#__PHASE|}";;
    __N\|*) rest="${line#__N|}"; name="${rest%%~*}"; exp="${rest#*~}";;
    __R\|*) got="${line#__R|}"
      if [ "$got" = "$exp" ]; then echo "  PASS  $name"; pass=$((pass+1)); else echo "  FAIL  $name (expected [$exp], got [$got])"; fail=$((fail+1)); fi;;
  esac
done < /tmp/onm_out.txt
echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
