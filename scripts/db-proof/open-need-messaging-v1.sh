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
# The question the owner set (2026-11-22, option 1): the provider must not
# RECEIVE the client's profile id from the server — not only not see a name.
# Every read the provider holds is asked for the client's id.
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
N2=0e0e0000-0000-4000-8000-0000000000d2      # a second open need (the cap)
CLIENT_TOKEN=$(echo "$CLIENT" | tr -d "-" | cut -c1-12)
# The open-need thread is opened BY THE DOOR; every probe finds it by its need.
T="(select id from public.conversations where source_type = 'open_need' and source_id = '$N1' order by created_at limit 1)"
LABEL="Client $(echo "$N1" | tr -d '-' | cut -c1-6 | tr a-z A-Z)"

as() { # as <uid|anon> <sql returning one text>
  if [ "$1" = postgres ]; then :
  elif [ "$1" = anon ]; then echo "set local role anon;"
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
grant execute on function public._onm_try(text) to anon, authenticated, service_role;
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
       and p2.proname not in ('open_need_message_party_v1','open_need_conversation_open_v1','disclose_open_need_identity_v1','open_need_viewer_blinded_v1','open_need_caller_hidden_v1','conversation_live_recipients_v1','conversation_id_of_path_v1','conversation_attachment_hidden_uploader_guard_v1','conversation_counterpart_identities','conversation_source_context','list_open_demand_for_team_offer_v1')) s
  union all
  select p, 'policies', md5(string_agg(x, '|' order by x)) from (
    select schemaname || tablename || policyname || coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ',') || cmd as x
      from pg_policies where schemaname in ('public', 'storage')) s
  union all
  select p, 'policies_other', md5(string_agg(x, '|' order by x)) from (
    select schemaname || tablename || policyname || coalesce(qual, '') || coalesce(with_check, '') || array_to_string(roles, ',') || cmd as x
      from pg_policies where schemaname in ('public', 'storage')
       and tablename <> 'open_need_identity_disclosures'
       and policyname not in ('conversation_participants_select', 'conversation_messages_select',
                              'conversation-attachments participant insert')) s
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
insert into public.customer_requests(id, profile_id, organization_id, title, role_or_work_type, country, status, kind) values
  ('$N1','$CLIENT','$OC','Welders for Client Co','Welder','LT','submitted','company_request'),
  ('$N2','$CLIENT','$OC','Fitters for Client Co','Fitter','LT','submitted','company_request');
set session_replication_role = origin;

select public._onm_take('before');
\\echo __PHASE|BEFORE
SQL
check "control: before, the board names the client" "Client Co,Client Co" "$AGENT" "select coalesce(string_agg(company_name, ',' order by company_name), '') from public.list_open_demand_for_team_offer_v1('$OA') where request_id in ('$N1','$N2')"
cat <<SQL
insert into public.conversations(id, subject, kind, created_by) values ('0e0e0000-0000-4000-8000-0000000000e9', 'control', 'direct', '$AGENT');
insert into public.conversation_participants(conversation_id, profile_id) values ('0e0e0000-0000-4000-8000-0000000000e9','$AGENT'), ('0e0e0000-0000-4000-8000-0000000000e9','$CLIENT');
SQL
check "control: in an ordinary thread a co-participant reads the other profile id (the leak the rule closes)" "1" "$AGENT" "select count(*)::text from public.conversation_participants where conversation_id = '0e0e0000-0000-4000-8000-0000000000e9' and profile_id = '$CLIENT'"
check "control: and that id names the company to any signed-in user" "Client Co UAB" "$AGENT" "select legal_name from public.companies where profile_id = '$CLIENT'"
cat <<SQL
delete from public.conversations where id = '0e0e0000-0000-4000-8000-0000000000e9';
SQL
echo "\\echo __PHASE|APPLY"
body "$UP"
body "$UP"   # idempotent re-apply
cat <<SQL
select public._onm_take('applied');
SQL
# ── the door ──────────────────────────────────────────────────────────────
check "door: anon cannot execute" "ERROR: permission denied for function open_need_conversation_open_v1" anon "select public.open_need_conversation_open_v1('$N1','$OA')::text"
check "door: a stranger is refused" "ERROR: not allowed" "$STRANGER" "select public.open_need_conversation_open_v1('$N1','$OA')::text"
check "door: not through an org the caller does not manage" "ERROR: not allowed" "$AGENT" "select public.open_need_conversation_open_v1('$N1','$OB')::text"
check "door: the client cannot open its own need" "ERROR: not allowed" "$CLIENT" "select public.open_need_conversation_open_v1('$N1','$OC')::text"
check "door: nothing was created by a refusal" "0" "$AGENT" "select count(*)::text from public.conversations where source_type = 'open_need'"
check "door: the agency opens a thread and gets ONLY its id" "uuid" "$AGENT" "select pg_typeof(public.open_need_conversation_open_v1('$N1','$OA'))::text"
check "door: a second call returns the same thread" "1|true" "$AGENT" "select (select count(*) from public.conversations where source_type = 'open_need' and source_id = '$N1')::text || '|' || (public.open_need_conversation_open_v1('$N1','$OA') = $T)::text"
check "door: the function returns one uuid, no table, no owner column" "uuid" postgres "select pg_get_function_result('public.open_need_conversation_open_v1(uuid,uuid)'::regprocedure)"
cat <<SQL
\\echo __N|the thread: direct, two live participants, stamped open_need, audited~direct|2|1
select '__R|' || c.kind || '|' || (select count(*) from public.conversation_participants p where p.conversation_id = c.id and p.revoked_at is null)::text
       || '|' || (select count(*) from public.audit_logs a where a.action = 'open_need_conversation_opened_v1' and a.entity_id = c.id)::text
  from public.conversations c where c.id = $T;
SQL
# messages from both sides (written as each person, under RLS)
check "the agency writes" "ok" "$AGENT" "insert into public.conversation_messages(conversation_id, author_id, body) values ($T, '$AGENT', 'question from the agency') returning 'ok'"
check "the client answers" "ok" "$CLIENT" "insert into public.conversation_messages(conversation_id, author_id, body) values ($T, '$CLIENT', 'answer from the client') returning 'ok'"
# ── what the agency can RECEIVE ───────────────────────────────────────────
check "agency: is blinded in this thread" "true" "$AGENT" "select public.open_need_viewer_blinded_v1($T)::text"
check "client: is not blinded" "false" "$CLIENT" "select public.open_need_viewer_blinded_v1($T)::text"
check "agency: participant rows — only its own" "1|0" "$AGENT" "select count(*)::text || '|' || count(*) filter (where profile_id = '$CLIENT')::text from public.conversation_participants where conversation_id = $T"
check "agency: messages TABLE — only its own" "1|0" "$AGENT" "select count(*)::text || '|' || count(*) filter (where author_id = '$CLIENT')::text from public.conversation_messages where conversation_id = $T"
check "agency: the messages VIEW — both, the client as a pseudonymous author" "2|1|0" "$AGENT" "select count(*)::text || '|' || count(*) filter (where author_id = '$AGENT')::text || '|' || count(*) filter (where author_id = '$CLIENT')::text from public.conversation_messages_visible_v1 where conversation_id = $T"
check "agency: the pseudonymous author is stable per thread" "1" "$AGENT" "select count(distinct author_id)::text from public.conversation_messages_visible_v1 where conversation_id = $T and author_id <> '$AGENT'"
check "agency: unread-style filter (author <> me) still counts the answer" "1" "$AGENT" "select count(*)::text from public.conversation_messages_visible_v1 where conversation_id = $T and author_id <> '$AGENT'"
check "agency: the clients id is in NO row it can read" "0" "$AGENT" "select ((select count(*) from public.conversation_participants where profile_id = '$CLIENT' or added_by = '$CLIENT')
   + (select count(*) from public.conversation_messages where author_id = '$CLIENT')
   + (select count(*) from public.conversation_messages_visible_v1 where author_id = '$CLIENT')
   + (select count(*) from public.conversation_message_attachments where uploader_id = '$CLIENT')
   + (select count(*) from public.profiles where id = '$CLIENT')
   + (select count(*) from public.customer_requests where profile_id = '$CLIENT')
   + (select count(*) from public.open_need_identity_disclosures where disclosed_by = '$CLIENT')
   + (select count(*) from storage.objects where name like '%$CLIENT%'))::text"
check "agency: no readable text anywhere in the thread carries the client id" "0" "$AGENT" "select count(*)::text from (select row_to_json(x)::text j from public.conversation_participants x where conversation_id = $T
   union all select row_to_json(x)::text from public.conversation_messages_visible_v1 x where conversation_id = $T
   union all select row_to_json(x)::text from public.conversations x where id = $T) r where j like '%$CLIENT%'"
check "agency: the name is a pseudonym" "$LABEL" "$AGENT" "select display_name from public.conversation_counterpart_identities(array[$T])"
check "agency: the context has the need, no route" "Welder|" "$AGENT" "select source_title || '|' || coalesce(source_route_hint, '') from public.conversation_source_context(array[$T])"
check "agency: the board does not name the client" "" "$AGENT" "select coalesce(string_agg(company_name, ','), '') from public.list_open_demand_for_team_offer_v1('$OA') where request_id = '$N1'"
check "agency: the server-only recipient list is not callable" "ERROR: permission denied for function conversation_live_recipients_v1" "$AGENT" "select count(*)::text from public.conversation_live_recipients_v1($T, '$AGENT')"
# ── the client and the others ────────────────────────────────────────────
check "client: both participant rows" "2" "$CLIENT" "select count(*)::text from public.conversation_participants where conversation_id = $T"
check "client: both messages with their real authors" "2|1|1" "$CLIENT" "select count(*)::text || '|' || count(*) filter (where author_id = '$AGENT')::text || '|' || count(*) filter (where author_id = '$CLIENT')::text from public.conversation_messages_visible_v1 where conversation_id = $T"
check "client: names the agency person" "Agnes Agent" "$CLIENT" "select display_name from public.conversation_counterpart_identities(array[$T])"
check "client: its context routes to its needs" "Welder|company_needs" "$CLIENT" "select source_title || '|' || coalesce(source_route_hint, '') from public.conversation_source_context(array[$T])"
check "stranger: reads nothing of the thread" "0|0|0|0|0" "$STRANGER" "select (select count(*) from public.conversations where id = $T)::text || '|' || (select count(*) from public.conversation_participants where conversation_id = $T)::text || '|' || (select count(*) from public.conversation_messages where conversation_id = $T)::text || '|' || (select count(*) from public.conversation_messages_visible_v1 where conversation_id = $T)::text || '|' || (select count(*) from public.conversation_counterpart_identities(array[$T]))::text"
check "another agency: reads nothing of the thread" "0|0|0" "$AGENT2" "select (select count(*) from public.conversation_participants where conversation_id = $T)::text || '|' || (select count(*) from public.conversation_messages_visible_v1 where conversation_id = $T)::text || '|' || (select count(*) from public.conversation_source_context(array[$T]))::text"
check "anon: reads nothing through the view" "ERROR: permission denied for view conversation_messages_visible_v1" anon "select count(*)::text from public.conversation_messages_visible_v1"
cat <<SQL
\\echo __N|server (service_role): the recipients of the agencys message are the client~$CLIENT
set local role service_role;
select '__R|' || coalesce(string_agg(r::text, ','), '') from public.conversation_live_recipients_v1($T, '$AGENT') r;
reset role;
\\echo __N|server: a non-participant author gets no recipients~0
set local role service_role;
select '__R|' || count(*)::text from public.conversation_live_recipients_v1($T, '$STRANGER');
reset role;
SQL
# ── attachments: the client cannot upload while hidden ───────────────────
check "client: a storage upload while hidden is refused" "ERROR: new row violates row-level security policy for table \"objects\"" "$CLIENT" "insert into storage.objects(bucket_id, name) values ('conversation-attachments', $T::text || '/$CLIENT/0e0e0000-0000-4000-8000-0000000000f1/a.pdf') returning 'x'"
check "client: registering an attachment while hidden is refused" "ERROR: attachments wait until the name is shown" "$CLIENT" "select public.register_conversation_message_attachment('0e0e0000-0000-4000-8000-0000000000f2', (select id from public.conversation_messages where author_id = '$CLIENT' limit 1), 'a.pdf', 'application/pdf', 10, $T::text || '/$CLIENT/0e0e0000-0000-4000-8000-0000000000f2/a.pdf')::text"
check "agency: its own upload still works" "x" "$AGENT" "insert into storage.objects(bucket_id, name) values ('conversation-attachments', $T::text || '/$AGENT/0e0e0000-0000-4000-8000-0000000000f3/a.pdf') returning 'x'"
# ── disclosure ───────────────────────────────────────────────────────────
check "the agency cannot disclose for the client" "ERROR: not allowed" "$AGENT" "select public.disclose_open_need_identity_v1($T)::text"
check "a stranger cannot disclose" "ERROR: not allowed" "$STRANGER" "select public.disclose_open_need_identity_v1($T)::text"
check "anon cannot disclose" "ERROR: permission denied for function disclose_open_need_identity_v1" anon "select public.disclose_open_need_identity_v1('0e0e0000-0000-4000-8000-0000000000e1')::text"
check "nobody writes a disclosure directly (no table privilege)" "ERROR: permission denied for table open_need_identity_disclosures" "$AGENT" "insert into public.open_need_identity_disclosures(conversation_id, disclosed_by) select $T, '$AGENT' returning 'x'"
check "still hidden after every refusal" "1|$LABEL" "$AGENT" "select (select count(*) from public.conversation_participants where conversation_id = $T)::text || '|' || (select display_name from public.conversation_counterpart_identities(array[$T]))"
check "the client chooses to show its name" "true" "$CLIENT" "select public.disclose_open_need_identity_v1($T)::text"
check "disclosing twice keeps one row" "true|1" "$CLIENT" "select public.disclose_open_need_identity_v1($T)::text || '|' || (select count(*) from public.open_need_identity_disclosures where conversation_id = $T)::text"
check "after disclosure the agency reads the name, both rows and both authors" "Clara Client|2|1" "$AGENT" "select (select display_name from public.conversation_counterpart_identities(array[$T])) || '|' || (select count(*) from public.conversation_participants where conversation_id = $T)::text || '|' || (select count(*) from public.conversation_messages where conversation_id = $T and author_id = '$CLIENT')::text"
check "after disclosure the client may attach files" "x" "$CLIENT" "insert into storage.objects(bucket_id, name) values ('conversation-attachments', $T::text || '/$CLIENT/0e0e0000-0000-4000-8000-0000000000f4/a.pdf') returning 'x'"
check "a stranger reads no disclosure row" "0" "$STRANGER" "select count(*)::text from public.open_need_identity_disclosures"
check "the CHECK still refuses an unknown source" "ERROR: new row for relation \"conversations\" violates check constraint \"conversations_source_type_check\"" "$AGENT" "insert into public.conversations(subject, kind, created_by, source_type, source_id) values ('x','direct','$AGENT','made_up','$N1') returning 'x'"
# ── the cap ──────────────────────────────────────────────────────────────
cat <<SQL
insert into public.conversations(subject, kind, created_by) select 'cap', 'direct', '$AGENT' from generate_series(1, 19);
SQL
check "door: the 24 h cap of 20 new conversations holds" "ERROR: rate limited" "$AGENT" "select public.open_need_conversation_open_v1('$N2','$OA')::text"
cat <<SQL
delete from public.conversations where created_by = '$AGENT' and subject = 'cap';
\\echo __N|every audit row is there (opened 1, disclosed 1)~1|1
select '__R|' || (select count(*) from public.audit_logs where action = 'open_need_conversation_opened_v1' and entity_id = $T)::text || '|' || (select count(*) from public.audit_logs where action = 'open_need_identity_disclosed_v1' and entity_id = $T)::text;
\\echo __N|every other function body and ACL unchanged~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='procs_other')
                         = (select digest from public._onm_snap where phase='applied' and what='procs_other') then 'same' else 'differs' end;
\\echo __N|every other policy (public + storage) unchanged~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='policies_other')
                         = (select digest from public._onm_snap where phase='applied' and what='policies_other') then 'same' else 'differs' end;
\\echo __PHASE|ROLLBACK
SQL
echo "\\echo __N|rollback refuses while an open-need thread exists~refused"
GUARD=$(awk '/^do \$\$/{f=1} f{print} f&&/^end \$\$;/{exit}' "$DOWN" | sed 's/\$\$/$x$/g; $ s/;$//' | tr '\n' ' ')
echo "select '__R|' || case when public._onm_exec(\$q\$$GUARD\$q\$) like 'ERROR: open_need conversations exist%' then 'refused' else 'ran' end;"
cat <<SQL
delete from public.conversations where source_type = 'open_need';
SQL
body "$DOWN"
cat <<SQL
select public._onm_take('rolled_back');
\\echo __N|rollback restores every function body and ACL~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='procs')
                         = (select digest from public._onm_snap where phase='rolled_back' and what='procs') then 'same' else 'differs' end;
\\echo __N|rollback restores every policy (public + storage)~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='policies')
                         = (select digest from public._onm_snap where phase='rolled_back' and what='policies') then 'same' else 'differs' end;
\\echo __N|rollback restores the CHECK~same
select '__R|' || case when (select digest from public._onm_snap where phase='before' and what='check')
                         = (select digest from public._onm_snap where phase='rolled_back' and what='check') then 'same' else 'differs' end;
\\echo __N|rollback leaves no view behind~0
select '__R|' || count(*)::text from pg_views where viewname = 'conversation_messages_visible_v1';
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
