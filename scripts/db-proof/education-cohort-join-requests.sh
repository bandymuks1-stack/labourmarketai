#!/usr/bin/env bash
# ============================================================================
# J-12 learner join requests (migration 20261102160000): RUNTIME proof on a
# scratch PostgreSQL 16.
#
# The prelude stands in for the production objects; the two APPLIED education
# migrations (20260903120000 programmes/cohorts, 20260903150000 RLS recursion
# fix) and the J-12 migration are then applied VERBATIM. Every probe runs as
# `authenticated` / `anon` with a JWT subject (never as the superuser), so the
# RLS policies, grants and function bodies genuinely decide. Ends with the
# guarded rollback (refused with request rows; clean on an empty set; re-apply).
#
# Usage (scratch cluster, no Docker):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54396 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54396 bash scripts/db-proof/education-cohort-join-requests.sh
# Throwaway only. Never point this at production or a shared local stack.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-54396}"
ADMIN="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
MIGS=(
  "$REPO/supabase/migrations/20260903120000_education_programs_cohorts_v1.sql"
  "$REPO/supabase/migrations/20260903150000_education_rls_recursion_fix_v1.sql"
)
MIG="$REPO/supabase/migrations/20261102160000_education_cohort_join_requests_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261102160000_education_cohort_join_requests_v1.down.sql"

MGR=a0000000-0000-0000-0000-00000000000a
LEARNER=b0000000-0000-0000-0000-00000000000b
OTHER=c0000000-0000-0000-0000-00000000000c
OUTSIDER=d0000000-0000-0000-0000-00000000000d
ORG=f0000000-0000-0000-0000-0000000000f1
PROG=a1000000-0000-0000-0000-0000000000a1
COH=c1000000-0000-0000-0000-0000000000c1

PASS=0; FAIL=0
fresh() {
  local db="$1"
  $ADMIN -c "drop database if exists $db" >/dev/null 2>&1
  $ADMIN -c "create database $db" >/dev/null
  PSQL="psql -h $HOST -p $PORT -U postgres -d $db -v ON_ERROR_STOP=1 -q"
  $PSQL -f "$HERE/education-cohort-join-requests.prelude.sql" >/dev/null
  for m in "${MIGS[@]}"; do $PSQL -f "$m" >/dev/null; done
}
# as <uid|''> <role> <sql>  -> prints the result or the error message
as() {
  psql -h $HOST -p $PORT -U postgres -d "$DB" -tA -q 2>&1 <<SQL | grep -v '^SET$' | sed -E 's/^psql:.*:[0-9]+: //; s/^ERROR: +//' | head -1
set role $2;
set request.jwt.claim.sub = '$1';
$3
SQL
}
check() { # name expected actual
  if [ "$3" = "$2" ]; then PASS=$((PASS+1)); echo "  ok   $1";
  else FAIL=$((FAIL+1)); echo "  FAIL $1 — expected [$2] got [$3]"; fi
}
q() { as "$1" "$2" "$3" | tail -1; }

DB=j12proof; fresh $DB
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q"
$PSQL >/dev/null <<SQL
insert into profiles values ('$MGR'), ('$LEARNER'), ('$OTHER'), ('$OUTSIDER');
insert into organizations values ('$ORG', 'QA Institution', null, null);
insert into organization_roles values ('$ORG', 'training_provider');
insert into engagement_contexts (profile_id, organization_id, relationship_slug, hash_self) values ('$MGR', '$ORG', 'manager', 'x');
insert into education_programs (id, organization_id, name) values ('$PROG', '$ORG', 'Tiling programme');
insert into education_cohorts (id, program_id, organization_id, name) values ('$COH', '$PROG', '$ORG', 'Group A');
SQL
$PSQL -f "$MIG" >/dev/null || { echo "J-12 migration failed to apply"; exit 1; }

echo "== discovery"
check "closed group is not findable"            "0" "$(q $LEARNER authenticated "select count(*) from list_open_education_cohorts_v1();")"
check "request to a closed group refused"       "join_requests_closed" "$(q $LEARNER authenticated "select request_education_cohort_join_v1('$COH','Jonas J.');")"
check "a learner cannot open a group"           "not_manager" "$(q $LEARNER authenticated "select set_education_cohort_join_requests_v1('$COH', true);")"
q $MGR authenticated "select set_education_cohort_join_requests_v1('$COH', true);" >/dev/null
check "open group is findable, with institution" "Group A|Tiling programme|QA Institution|t|" "$(q $LEARNER authenticated "select cohort_name, program_name, institution_name, join_requests_open, my_status from list_open_education_cohorts_v1();")"
check "anon cannot list"                        "permission denied for function list_open_education_cohorts_v1" "$(q '' anon "select count(*) from list_open_education_cohorts_v1();")"

echo "== request"
check "label under 2 chars refused"             "invalid_request" "$(q $LEARNER authenticated "select request_education_cohort_join_v1('$COH','J');")"
check "learner asks to join"                    "requested" "$(q $LEARNER authenticated "select request_education_cohort_join_v1('$COH','Jonas J.','Second year');")"
check "own status reads requested"              "requested" "$(q $LEARNER authenticated "select my_status from list_open_education_cohorts_v1();")"
check "a request grants no cohort read (RLS)"   "0" "$(q $LEARNER authenticated "select count(*) from education_cohorts;")"
check "a request grants no programme read (RLS)" "0" "$(q $LEARNER authenticated "select count(*) from education_programs;")"
check "learner reads own request row (RLS)"     "requested" "$(q $LEARNER authenticated "select status from education_cohort_members;")"
check "direct insert refused (no grant)"        "permission denied for table education_cohort_members" "$(q $OTHER authenticated "insert into education_cohort_members (cohort_id, profile_id, status) values ('$COH','$OTHER','active');")"
check "direct self-activate refused (no grant)" "permission denied for table education_cohort_members" "$(q $LEARNER authenticated "update education_cohort_members set status='active';")"
check "outsider sees no request rows (RLS)"     "0" "$(q $OUTSIDER authenticated "select count(*) from education_cohort_members;")"
check "manager sees the request and its label"  "requested|Jonas J.|Second year" "$(q $MGR authenticated "select status, request_label, request_note from education_cohort_members where profile_id='$LEARNER';")"
check "no student relationship yet"             "0" "$(q '' postgres "select count(*) from engagement_contexts where profile_id='$LEARNER';")"

echo "== decision"
check "learner cannot decide"                   "not_manager" "$(q $LEARNER authenticated "select decide_education_cohort_join_v1('$COH','$LEARNER','accept');")"
q $MGR authenticated "select request_education_cohort_join_v1('$COH','The manager');" >/dev/null
check "nobody decides their own request"        "self_decision_not_allowed" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$MGR','accept');")"
check "no request, nothing to decide"           "no_pending_request" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$OTHER','decline');")"
check "bad decision word refused"               "invalid_decision" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$LEARNER','maybe');")"
check "manager accepts"                         "accepted" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$LEARNER','accept');")"
check "membership active, decided"              "active|t" "$(q '' postgres "select status, decided_at is not null from education_cohort_members where profile_id='$LEARNER';")"
check "learner's own row carries no decider id" "t" "$(q $LEARNER authenticated "select added_by is null from education_cohort_members;")"
check "decider recorded in the audit log"        "1" "$(q '' postgres "select count(*) from audit_logs where actor_id='$MGR' and action='education_cohort_join_accepted_v1';")"
check "student relationship created once"       "1|student|active" "$(q '' postgres "select count(*) over (), relationship_slug, status from engagement_contexts where profile_id='$LEARNER';")"
check "member now reads the cohort (RLS)"       "1" "$(q $LEARNER authenticated "select count(*) from education_cohorts;")"
check "member now reads the programme (RLS)"    "1" "$(q $LEARNER authenticated "select count(*) from education_programs;")"
check "deciding twice refused"                  "no_pending_request" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$LEARNER','accept');")"
check "asking again as a member is a no-op"     "already_member" "$(q $LEARNER authenticated "select request_education_cohort_join_v1('$COH','Jonas J.');")"
check "a member's own group is not in the finder" "0" "$(q $LEARNER authenticated "select count(*) from list_open_education_cohorts_v1();")"

echo "== withdraw / decline / close"
check "other learner asks"                      "requested" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
check "and withdraws"                           "" "$(q $OTHER authenticated "select withdraw_education_cohort_join_v1('$COH');")"
check "withdrawing twice refused"               "no_pending_request" "$(q $OTHER authenticated "select withdraw_education_cohort_join_v1('$COH');")"
check "asks again after withdrawing"            "requested" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
check "manager declines"                        "declined" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$OTHER','decline');")"
check "decline creates no relationship"         "0" "$(q '' postgres "select count(*) from engagement_contexts where profile_id='$OTHER';")"
check "declined row carries no decider id"      "t" "$(q $OTHER authenticated "select added_by is null from education_cohort_members;")"
check "re-asking right after a decline refused" "request_cooldown" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
check "refused re-ask left the decline in place" "declined" "$(q '' postgres "select status from education_cohort_members where profile_id='$OTHER';")"
q '' postgres "update education_cohort_members set decided_at = now() - interval '29 days' where profile_id='$OTHER';" >/dev/null
check "still refused at 29 days"                "request_cooldown" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
q '' postgres "update education_cohort_members set decided_at = now() - interval '31 days' where profile_id='$OTHER';" >/dev/null
check "may ask again after 30 days"             "requested" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
check "manager declines again"                  "declined" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$OTHER','decline');")"
q '' postgres "update organizations set archived_at = now() where id='$ORG';" >/dev/null
check "archived institution takes no request"   "cohort_not_found" "$(q $OUTSIDER authenticated "select request_education_cohort_join_v1('$COH','Petras');")"
check "archived institution is not findable"    "0" "$(q $OUTSIDER authenticated "select count(*) from list_open_education_cohorts_v1();")"
check "no row written for the refused request"  "0" "$(q '' postgres "select count(*) from education_cohort_members where profile_id='$OUTSIDER';")"
q '' postgres "update organizations set archived_at = null where id='$ORG';" >/dev/null
q $MGR authenticated "select set_education_cohort_join_requests_v1('$COH', false);" >/dev/null
check "declined learner still sees the outcome" "declined|f" "$(q $OTHER authenticated "select my_status, join_requests_open from list_open_education_cohorts_v1();")"
check "closed group takes no new request"       "join_requests_closed" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
check "outsider finds nothing once closed"      "0" "$(q $OUTSIDER authenticated "select count(*) from list_open_education_cohorts_v1();")"

echo "== archive"
q $MGR authenticated "select set_education_cohort_join_requests_v1('$COH', true);" >/dev/null
check "outsider asks before the archive"        "requested" "$(q $OUTSIDER authenticated "select request_education_cohort_join_v1('$COH','Petras');")"
check "a learner cannot archive"                "not_manager" "$(q $LEARNER authenticated "select archive_education_cohort_v1('$COH');")"
check "manager archives the group"              "" "$(q $MGR authenticated "select archive_education_cohort_v1('$COH');")"
check "archive closed it and declined the pending request" "t|f|declined" "$(q '' postgres "select c.archived_at is not null, c.join_requests_open, m.status from education_cohorts c join education_cohort_members m on m.cohort_id=c.id and m.profile_id='$OUTSIDER' where c.id='$COH';")"
check "member history kept"                     "active" "$(q '' postgres "select status from education_cohort_members where profile_id='$LEARNER';")"
check "archived group takes no request"         "cohort_not_found" "$(q $OTHER authenticated "select request_education_cohort_join_v1('$COH','Ona');")"
check "archiving twice refused"                 "cohort_not_found" "$(q $MGR authenticated "select archive_education_cohort_v1('$COH');")"
check "anon cannot archive"                     "permission denied for function archive_education_cohort_v1" "$(q '' anon "select archive_education_cohort_v1('$COH');")"

echo "== rollback"
check "rollback refused while request rows exist" "rollback refused: cohort join-request rows exist. Decide or export them first." \
  "$(psql -h $HOST -p $PORT -U postgres -d $DB -tA -q -f "$DOWN" 2>&1 | sed -E 's/^psql:.*:[0-9]+: //; s/^ERROR: +//' | head -1)"
check "refused rollback changed nothing"        "5" "$(q '' postgres "select count(*) from information_schema.columns where column_name in ('join_requests_open','requested_at','request_label','request_note','decided_at');")"

DB=j12proofclean; fresh $DB
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q"
$PSQL -f "$MIG" >/dev/null
check "clean rollback applies"                  "ok" "$($PSQL -f "$DOWN" >/dev/null 2>&1 && echo ok)"
check "two-state CHECK restored"                "CHECK ((status = ANY (ARRAY['active'::text, 'left'::text])))" "$(q '' postgres "select pg_get_constraintdef(oid) from pg_constraint where conname='education_cohort_members_status_check';")"
check "all six functions dropped"              "0" "$(q '' postgres "select count(*) from pg_proc where proname in ('set_education_cohort_join_requests_v1','archive_education_cohort_v1','list_open_education_cohorts_v1','request_education_cohort_join_v1','withdraw_education_cohort_join_v1','decide_education_cohort_join_v1');")"
check "migration re-applies after rollback"     "ok" "$($PSQL -f "$MIG" >/dev/null 2>&1 && echo ok)"

echo "== $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
