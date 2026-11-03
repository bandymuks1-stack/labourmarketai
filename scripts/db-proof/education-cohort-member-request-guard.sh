#!/usr/bin/env bash
# ============================================================================
# J-12 follow-up (migration 20261103090000): RUNTIME proof that the member
# command never flips a request row and never leaves request text on a member
# row. Scratch PostgreSQL 16 only. Reuses the J-12 prelude (production
# manages_organization, which admits external_manager), applies the two applied
# education migrations, the applied J-12 migration and this one VERBATIM, and
# probes as `authenticated` with a JWT subject.
#
# Usage: as scripts/db-proof/education-cohort-join-requests.sh (port 54396).
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
  "$REPO/supabase/migrations/20261102160000_education_cohort_join_requests_v1.sql"
)
MIG="$REPO/supabase/migrations/20261103090000_education_cohort_member_request_guard_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261103090000_education_cohort_member_request_guard_v1.down.sql"

MGR=a0000000-0000-0000-0000-00000000000a
REQ=b0000000-0000-0000-0000-00000000000b
DEC=c0000000-0000-0000-0000-00000000000c
WD=d0000000-0000-0000-0000-00000000000d
PLAIN=d1000000-0000-0000-0000-00000000000d
EXTENG=e0000000-0000-0000-0000-00000000000e
EXTMEM=e1000000-0000-0000-0000-00000000000e
ORG=f0000000-0000-0000-0000-0000000000f1
PROG=a1000000-0000-0000-0000-0000000000a1
COH=c1000000-0000-0000-0000-0000000000c1

PASS=0; FAIL=0
DB=j12guard
$ADMIN -c "drop database if exists $DB" >/dev/null 2>&1
$ADMIN -c "create database $DB" >/dev/null
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q"
$PSQL -f "$HERE/education-cohort-join-requests.prelude.sql" >/dev/null
for m in "${MIGS[@]}"; do $PSQL -f "$m" >/dev/null || { echo "failed: $m"; exit 1; }; done

as() {
  psql -h $HOST -p $PORT -U postgres -d "$DB" -tA -q 2>&1 <<SQL | grep -v '^SET$' | sed -E 's/^psql:.*:[0-9]+: //; s/^ERROR: +//' | head -1
set role $2;
set request.jwt.claim.sub = '$1';
$3
SQL
}
q() { as "$1" "$2" "$3" | tail -1; }
check() {
  if [ "$3" = "$2" ]; then PASS=$((PASS+1)); echo "  ok   $1";
  else FAIL=$((FAIL+1)); echo "  FAIL $1 — expected [$2] got [$3]"; fi
}
FN="select md5(pg_get_functiondef('public.set_education_cohort_member_v1(uuid,uuid,text)'::regprocedure));"
ORIGINAL="$(q '' postgres "$FN")"

$PSQL >/dev/null <<SQL
insert into profiles values ('$MGR'), ('$REQ'), ('$DEC'), ('$WD'), ('$PLAIN'), ('$EXTENG'), ('$EXTMEM');
insert into organizations values ('$ORG', 'QA Institution', null, null);
insert into engagement_contexts (profile_id, organization_id, relationship_slug, hash_self) values
  ('$MGR', '$ORG', 'manager', 'x'), ('$EXTENG', '$ORG', 'external_manager', 'x');
insert into company_memberships (profile_id, organization_id, role) values ('$EXTMEM', '$ORG', 'external_manager');
-- every learner is ALREADY a linked student (the case the gap needs)
insert into engagement_contexts (profile_id, organization_id, relationship_slug, hash_self) values
  ('$REQ', '$ORG', 'student', 'x'), ('$DEC', '$ORG', 'student', 'x'), ('$WD', '$ORG', 'student', 'x'), ('$PLAIN', '$ORG', 'student', 'x');
insert into education_programs (id, organization_id, name) values ('$PROG', '$ORG', 'Tiling programme');
insert into education_cohorts (id, program_id, organization_id, name, join_requests_open) values ('$COH', '$PROG', '$ORG', 'Group A', true);
insert into education_cohort_members (cohort_id, profile_id, status, requested_at, request_label, request_note) values
  ('$COH', '$REQ', 'requested', now(), 'Typed Req', 'note req'),
  ('$COH', '$DEC', 'declined',  now(), 'Typed Dec', 'note dec'),
  ('$COH', '$WD',  'withdrawn', now(), 'Typed Wd',  'note wd');
SQL

echo "== BEFORE the fix (the gap, reproduced)"
check "external manager flips a requested row to active (gap)" "" "$(q $EXTENG authenticated "select set_education_cohort_member_v1('$COH','$REQ','active');")"
check "... and the typed label stays on the active row (gap)" "active|Typed Req" "$(q '' postgres "select status, request_label from education_cohort_members where profile_id='$REQ';")"
$PSQL -c "update education_cohort_members set status='requested' where profile_id='$REQ';" >/dev/null

$PSQL -f "$MIG" >/dev/null || { echo "migration failed to apply"; exit 1; }

echo "== request rows are never flipped"
for X in $EXTENG $EXTMEM $MGR; do
  for P in $REQ $DEC $WD; do
    for S in active left; do
      check "$X cannot set $P to $S" "request_row_use_decide" "$(q $X authenticated "select set_education_cohort_member_v1('$COH','$P','$S');")"
    done
  done
done
check "request rows unchanged after all refusals" "declined|requested|withdrawn" "$(q '' postgres "select string_agg(status, '|' order by status) from education_cohort_members;")"
check "the J-12 decide path still accepts (internal manager)" "accepted" "$(q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$REQ','accept');")"
check "external manager still cannot decide" "not_manager" "$(q $EXTENG authenticated "select decide_education_cohort_join_v1('$COH','$WD','accept');")"

echo "== the member path for linked learners is unchanged"
check "internal manager adds a linked learner" "" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','active');")"
check "... active, decider recorded" "active|t" "$(q '' postgres "select status, added_by = '$MGR' from education_cohort_members where profile_id='$PLAIN';")"
check "internal manager ends it" "" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','left');")"
check "... left, left_at set" "left|t" "$(q '' postgres "select status, left_at is not null from education_cohort_members where profile_id='$PLAIN';")"
check "and re-activates it" "active|t" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','active');" >/dev/null; q '' postgres "select status, left_at is null from education_cohort_members where profile_id='$PLAIN';")"
check "unlinked learner still refused" "not_a_linked_learner" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$MGR','active');")"
check "invalid status still refused" "invalid_status" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','requested');")"

echo "== no request text on active / left rows"
$PSQL -c "update education_cohort_members set request_label='Legacy Typed', request_note='legacy note' where profile_id='$PLAIN';" >/dev/null
check "ending a member clears legacy request text" "left||" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','left');" >/dev/null; q '' postgres "select status, request_label, request_note from education_cohort_members where profile_id='$PLAIN';")"
check "the accepted request row carries no request text" "active||" "$(q '' postgres "select status, request_label, request_note from education_cohort_members where profile_id='$REQ';")"
check "ending the accepted member keeps it clean" "left||" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$REQ','left');" >/dev/null; q '' postgres "select status, request_label, request_note from education_cohort_members where profile_id='$REQ';")"
check "no active/left row anywhere holds request text" "0" "$(q '' postgres "select count(*) from education_cohort_members where status in ('active','left') and (request_label is not null or request_note is not null);")"

echo "== rollback"
check "rollback applies" "ok" "$($PSQL -f "$DOWN" >/dev/null 2>&1 && echo ok)"
check "function text restored exactly (md5 of pg_get_functiondef)" "$ORIGINAL" "$(q '' postgres "$FN")"
check "grants restored: authenticated may execute, anon may not" "t|f" "$(q '' postgres "select has_function_privilege('authenticated','public.set_education_cohort_member_v1(uuid,uuid,text)','execute'), has_function_privilege('anon','public.set_education_cohort_member_v1(uuid,uuid,text)','execute');")"
check "migration re-applies after rollback" "ok" "$($PSQL -f "$MIG" >/dev/null 2>&1 && echo ok)"

echo "== $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
