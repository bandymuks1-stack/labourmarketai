#!/usr/bin/env bash
# ============================================================================
# assign_training_v1 — THE FOUR OWNER-DECIDED GROUPS (owner decision
# 2026-11-18, registry 11.8; migration
# 20261118143000_training_assignment_engaged_groups_v1)
#
# Real behavioural proof on a THROWAWAY local PostgreSQL 16 cluster (initdb +
# pg_ctl; no Docker, no Supabase). Loads the stub harness
# (training-assignment-engaged-groups-v1.prelude.sql — every stub documented
# there), then executes the ACTUAL files, verbatim:
#   supabase/rollbacks/20261118143000_training_assignment_engaged_groups_v1.down.sql
#       (= the production body and policy today; loaded FIRST as the baseline)
#   supabase/migrations/20261118143000_training_assignment_engaged_groups_v1.sql
# and measures, under `set local role authenticated|anon` (never superuser):
#   1. BASELINE (production): only governance members are assignable.
#   2. FIXED: members (employee / manager / owner engagements), interns,
#      learners and invited external people (collaborator / consultant /
#      freelancer) are assignable while the link is ACTIVE; a PAUSED
#      non-learning link (employee, collaborator) is assignable too (owner
#      decision 2026-11-18, "a paused relationship is not an end"), a paused
#      intern / student link is not; ended, end-dated (also when paused),
#      not-yet-started, another organization's, volunteer, viewer,
#      self-declared, unknown, unverified and ambiguous are refused with ONE
#      answer; a profile id answers exactly like an e-mail.
#   3. CHAIN per group: the person receives, sees and completes; the
#      organization reads the completion; another organization sees nothing.
#   3b. PAUSED reads no more than ACTIVE: the pause opens nothing beyond the
#      assignment itself.
#   4. ENDED LINK: once the intern's link ends, a NEW assignment is refused,
#      the organization still reads the historical assignment, and the person
#      still reads their own record with its course title.
#   5. ROLLBACK restores md5(prosrc) = production's and the original policy.
#   6. RE-APPLY is idempotent.
#
# Never point this at production or a shared stack: it creates and deletes its
# own data directory and listens on localhost only.
# Usage:  bash scripts/db-proof/training-assignment-engaged-groups-v1.sh
#   PG_BIN=/path/to/pg16/bin  PORT=55441  DATA=/some/empty/dir  KEEP=1
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NAME=20261118143000_training_assignment_engaged_groups_v1
MIG="$ROOT/supabase/migrations/$NAME.sql"
DOWN="$ROOT/supabase/rollbacks/$NAME.down.sql"
PRELUDE="$HERE/training-assignment-engaged-groups-v1.prelude.sql"
PROD_MD5=74795f98243e2ce340c424cf3c0ee0a5   # production md5(prosrc), read 2026-10-26
PROD_ACL='{postgres=X/postgres,authenticated=X/postgres}'

PG_BIN=${PG_BIN:-"/c/Program Files/PostgreSQL/16/bin"}
PORT=${PORT:-55441}
DATA=${DATA:-"$(mktemp -d)/pgdata"}
export PGHOST=localhost PGPORT=$PORT PGUSER=postgres PGDATABASE=postgres

PSQL=("$PG_BIN/psql" -X -q -tA)

cleanup() {
  "$PG_BIN/pg_ctl" -D "$DATA" -m fast -w stop >/dev/null 2>&1
  [ "${KEEP:-0}" = "1" ] || rm -rf "$DATA" "$DATA.log"
}
trap cleanup EXIT

echo "== throwaway cluster: $("$PG_BIN/postgres" --version) on localhost:$PORT =="
rm -rf "$DATA"; mkdir -p "$(dirname "$DATA")"
"$PG_BIN/initdb" -D "$DATA" -U postgres -A trust -E UTF8 --no-locale >/dev/null || { echo "initdb failed"; exit 1; }
"$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=localhost -c unix_socket_directories=" -l "$DATA.log" -w start >/dev/null \
  || { echo "pg_ctl start failed"; cat "$DATA.log"; exit 1; }

q()   { "${PSQL[@]}" -v ON_ERROR_STOP=0 -c "$1" 2>&1; }
run() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" >/dev/null || { echo "FAILED: $1"; "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1"; exit 1; }; }

# Run SQL as a real role with a real actor. $1=role $2=uid $3=sql
as() {
  "${PSQL[@]}" -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
$3
commit;
SQL
}
tok() { local out; out=$(cat | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED:$(echo "$out" | grep -m1 -oE 'ERROR: +.*' | sed -E 's/ERROR: +//')";
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-78s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-78s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
section() { printf '\n== %s ==\n' "$1"; }

# ── identities ────────────────────────────────────────────────────────────
u() { printf '00000000-0000-4000-8000-%012d' "$1"; }
ORG_A=$(u 9001); ORG_B=$(u 9002); CO_A=$(u 9101); CO_B=$(u 9102)
OWNER_A=$(u 1001); MANAGER_A=$(u 1002); MEMBER_A=$(u 1003); EMP_A=$(u 1004); EMP_B=$(u 1005)
ENDED_A=$(u 1006); PAUSED_A=$(u 1007); ENDDATED_A=$(u 1008); FUTURE_A=$(u 1009); INVITED_A=$(u 1010)
COLLAB_A=$(u 1011); STUDENT_A=$(u 1012); FREELANCER_A=$(u 1013); MGRSLUG_A=$(u 1014); PERSONAL=$(u 1015)
REVOKED_A=$(u 1016); UNVERIFIED_A=$(u 1017); DUP1=$(u 1018); DUP2=$(u 1019); OWNER_B=$(u 1020)
EMP_A2=$(u 1021); EX_A_NOW_B=$(u 1022); ENDTODAY_A=$(u 1023)
INTERN_A=$(u 1024); CONSULT_A=$(u 1025); VOLUNTEER_A=$(u 1026); VIEWER_A=$(u 1027); ENDINTERN_A=$(u 1028)
PAUSEDSTU_A=$(u 1029); STUDENT_B=$(u 1030); PAUSEDCOL_A=$(u 1031); PAUSEDINT_A=$(u 1032); PAUSEDEND_A=$(u 1033)
GHOST=$(u 1099)
PROG_A1=$(u 8001); PROG_A2=$(u 8002); PROG_AOFF=$(u 8003); PROG_B=$(u 8004); PROG_A3=$(u 8005)

section "harness (stubs documented in the prelude)"
run "$PRELUDE"
"${PSQL[@]}" -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed failed"; exit 1; }
insert into public.organizations (id, display_name, legacy_company_id) values
  ('$ORG_A', 'Org A', '$CO_A'), ('$ORG_B', 'Org B (other organization)', '$CO_B');
insert into public.profiles (id, email) values
  ('$OWNER_A','owner@a.test'), ('$MANAGER_A','manager@a.test'), ('$MEMBER_A','member@a.test'),
  ('$EMP_A','emp@a.test'), ('$EMP_B','emp@b.test'), ('$ENDED_A','ended@a.test'),
  ('$PAUSED_A','paused@a.test'), ('$ENDDATED_A','enddated@a.test'), ('$FUTURE_A','future@a.test'),
  ('$INVITED_A','invited@a.test'), ('$COLLAB_A','collab@a.test'), ('$STUDENT_A','student@a.test'),
  ('$FREELANCER_A','freelancer@a.test'), ('$MGRSLUG_A','mgrslug@a.test'), ('$PERSONAL','personal@x.test'),
  ('$REVOKED_A','revoked@a.test'), ('$UNVERIFIED_A','unverified@a.test'),
  ('$DUP1','dup@a.test'), ('$DUP2','DUP@a.test'), ('$OWNER_B','owner@b.test'),
  ('$EMP_A2','emp2@a.test'), ('$EX_A_NOW_B','exa@b.test'), ('$ENDTODAY_A','endtoday@a.test'),
  ('$INTERN_A','intern@a.test'), ('$CONSULT_A','consult@a.test'), ('$VOLUNTEER_A','volunteer@a.test'),
  ('$VIEWER_A','viewer@a.test'), ('$ENDINTERN_A','endintern@a.test'), ('$PAUSEDSTU_A','pausedstu@a.test'),
  ('$STUDENT_B','student@b.test'), ('$PAUSEDCOL_A','pausedcol@a.test'), ('$PAUSEDINT_A','pausedint@a.test'),
  ('$PAUSEDEND_A','pausedend@a.test');
-- every mailbox verified EXCEPT unverified@a.test
insert into public.email_verifications_v1 (profile_id, email)
  select id, lower(email) from public.profiles where id <> '$UNVERIFIED_A';
-- governance
insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at, revoked_at) values
  ('$ORG_A','$OWNER_A','owner','active',now(),null),
  ('$ORG_A','$MANAGER_A','manager','active',now(),null),
  ('$ORG_A','$MEMBER_A','member','active',now(),null),
  ('$ORG_A','$INVITED_A','member','invited',null,null),
  ('$ORG_A','$REVOKED_A','member','revoked',now(),now()),
  ('$ORG_B','$OWNER_B','owner','active',now(),null);
insert into public.company_worker_invitations (company_id, invited_email, status) values ('$CO_A','invited@a.test','pending');
-- relationships
insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, started_at, ended_at) values
  ('$EMP_A',        '$ORG_A','employee','active', null, null),
  ('$EMP_A2',       '$ORG_A','employee','active', current_date - 30, null),
  ('$UNVERIFIED_A', '$ORG_A','employee','active', null, null),
  ('$EMP_B',        '$ORG_B','employee','active', null, null),
  ('$EX_A_NOW_B',   '$ORG_A','employee','ended',  current_date - 400, current_date - 10),
  ('$EX_A_NOW_B',   '$ORG_B','employee','active', current_date - 9, null),
  ('$ENDED_A',      '$ORG_A','employee','ended',  current_date - 400, current_date - 1),
  ('$PAUSED_A',     '$ORG_A','employee','paused', null, null),
  ('$ENDDATED_A',   '$ORG_A','employee','active', current_date - 400, current_date - 1),
  ('$ENDTODAY_A',   '$ORG_A','employee','active', current_date - 400, current_date),
  ('$FUTURE_A',     '$ORG_A','employee','active', current_date + 1, null),
  ('$COLLAB_A',     '$ORG_A','collaborator','active', null, null),
  ('$STUDENT_A',    '$ORG_A','student','active', null, null),
  ('$FREELANCER_A', '$ORG_A','freelancer','active', null, null),
  ('$MGRSLUG_A',    '$ORG_A','manager','active', null, null),
  ('$PERSONAL',     null,    'employee','active', null, null),
  ('$OWNER_A',      '$ORG_A','owner','active', null, null),
  ('$DUP1',         '$ORG_A','employee','active', null, null),
  ('$DUP2',         '$ORG_A','employee','active', null, null),
  ('$INTERN_A',     '$ORG_A','intern','active', current_date - 20, null),
  ('$CONSULT_A',    '$ORG_A','consultant','active', null, null),
  ('$VOLUNTEER_A',  '$ORG_A','volunteer','active', null, null),
  ('$VIEWER_A',     '$ORG_A','viewer','active', null, null),
  ('$ENDINTERN_A',  '$ORG_A','intern','ended', current_date - 90, current_date - 5),
  ('$PAUSEDSTU_A',  '$ORG_A','student','paused', null, null),
  ('$STUDENT_B',    '$ORG_B','student','active', null, null),
  ('$PAUSEDCOL_A',  '$ORG_A','collaborator','paused', null, null),
  ('$PAUSEDINT_A',  '$ORG_A','intern','paused', current_date - 20, null),
  ('$PAUSEDEND_A',  '$ORG_A','employee','paused', current_date - 400, current_date - 1);
insert into public.training_programs (id, organization_id, title, is_active) values
  ('$PROG_A1','$ORG_A','QA kursas A1',true), ('$PROG_A2','$ORG_A','QA kursas A2',true),
  ('$PROG_AOFF','$ORG_A','QA kursas A (retired)',false), ('$PROG_B','$ORG_B','QA kursas B',true),
  ('$PROG_A3','$ORG_A','QA kursas A3',true);
SQL
echo "  seeded: 2 organizations, 33 profiles, 5 programmes"

assign() { as authenticated "$1" "select public.assign_training_v1('$2', '$3', '2026-12-01');" | tok; }
reset_assignments() { q "truncate public.training_assignment_events, public.training_assignments;" >/dev/null; }
catalog() { q "select p.oid::regprocedure::text||'|'||p.prosecdef||'|'||array_to_string(p.proconfig,',')||'|'||p.proowner::regrole::text||'|'||coalesce(p.proacl::text,'')||'|'||pg_get_function_result(p.oid)||'|'||pg_get_function_arguments(p.oid) from pg_proc p where p.proname='assign_training_v1' and p.pronamespace='public'::regnamespace;"; }
srcmd5()  { q "select md5(prosrc) from pg_proc where proname='assign_training_v1' and pronamespace='public'::regnamespace;"; }
aclstr()  { q "select proacl::text from pg_proc where proname='assign_training_v1' and pronamespace='public'::regnamespace;"; }
policy()  { q "select pg_get_expr(polqual, polrelid) from pg_policy where polname='training_programs_select';"; }
aid()     { q "select id from public.training_assignments where program_id='$1' and assignee_profile_id='$2';"; }
title_of(){ as authenticated "$1" "select p.title from public.training_assignments a join public.training_programs p on p.id = a.program_id where a.id = '$2';" | tok; }

# One matrix, two expectations. $1 = baseline | fixed
matrix() {
  local P=$1
  pick() { if [ "$P" = baseline ]; then echo "$1"; else echo "$2"; fi; }
  #        label                                                             baseline / fixed
  check "governance member (role member) of the same org"                  "$(pick assigned assigned)"                 "$(assign "$OWNER_A" "$PROG_A1" member@a.test)"
  check "G1 member: ACTIVE employee engagement"                              "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" emp@a.test)"
  check "G1 member: employee, e-mail in other case + spaces"                 "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A2" '  EMP@A.TEST ')"
  check "G1 member: a manager (governance) assigns an active employee"       "$(pick invalid_assignee assigned)"         "$(assign "$MANAGER_A" "$PROG_A1" emp2@a.test)"
  check "G1 member: 'manager' engagement without governance membership"      "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" mgrslug@a.test)"
  check "G2 intern: ACTIVE intern engagement"                                "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" intern@a.test)"
  check "G3 learner: ACTIVE student engagement"                              "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" student@a.test)"
  check "G4 external: ACTIVE collaborator engagement"                        "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" collab@a.test)"
  check "G4 external: ACTIVE consultant engagement"                          "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" consult@a.test)"
  check "G4 external: ACTIVE freelancer engagement"                          "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" freelancer@a.test)"
  check "picker: profile id of an active intern"                             "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A2" "$INTERN_A")"
  check "picker: profile id in upper case"                                   "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A2" "$(echo "$CONSULT_A" | tr a-f A-F)")"
  check "duplicate (same programme, same person)"                            "$(pick invalid_assignee already_assigned)" "$(assign "$OWNER_A" "$PROG_A1" emp@a.test)"
  check "picker: profile id of ANOTHER org's learner"                        "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" "$STUDENT_B")"
  check "picker: profile id of an ENDED intern"                              "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" "$ENDINTERN_A")"
  check "picker: unknown profile id"                                         "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" "$GHOST")"
  check "picker: profile id of a self-declared (org NULL) row"               "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" "$PERSONAL")"
  check "employee of ANOTHER organization"                                   "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" emp@b.test)"
  check "learner of ANOTHER organization"                                    "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" student@b.test)"
  check "ex-employee of this org, now employee of another"                   "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" exa@b.test)"
  check "ended employment (status ended)"                                    "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" ended@a.test)"
  check "ended intern link (status ended)"                                   "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" endintern@a.test)"
  check "P3-1 paused employee (not ended)"                                  "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" paused@a.test)"
  check "P3-1 paused collaborator (not ended)"                              "$(pick invalid_assignee assigned)"         "$(assign "$OWNER_A" "$PROG_A1" pausedcol@a.test)"
  check "P3-1 paused intern (learning link must be active)"                 "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" pausedint@a.test)"
  check "P3-1 paused intern by profile id"                                  "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" "$PAUSEDINT_A")"
  check "P3-1 paused student (learning link must be active)"                "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" pausedstu@a.test)"
  check "P3-1 paused employee whose ended_at has passed"                    "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" pausedend@a.test)"
  check "status active but end date passed (ended_at = yesterday)"           "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" enddated@a.test)"
  check "status active, end date = today (end_roster_link stamp)"            "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" endtoday@a.test)"
  check "link not started yet (started_at = tomorrow)"                       "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" future@a.test)"
  check "invited, not accepted (membership invited + pending invitation)"    "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" invited@a.test)"
  check "revoked governance membership"                                      "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" revoked@a.test)"
  check "volunteer relation (not one of the four groups)"                    "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" volunteer@a.test)"
  check "viewer relation (not one of the four groups)"                       "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" viewer@a.test)"
  check "self-declared / personal employee row (organization NULL)"          "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" personal@x.test)"
  check "unknown e-mail (no account)"                                        "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" ghost@nowhere.test)"
  check "UNVERIFIED e-mail of an active employee"                            "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" unverified@a.test)"
  check "ambiguous e-mail (two verified profiles, same address)"             "invalid_assignee"                          "$(assign "$OWNER_A" "$PROG_A1" dup@a.test)"
  check "other org's owner -> Org A programme (no demand access)"            "not_found"                                 "$(assign "$OWNER_B" "$PROG_A1" intern@a.test)"
  check "other org's owner -> own programme, Org A's intern by id"           "invalid_assignee"                          "$(assign "$OWNER_B" "$PROG_B" "$INTERN_A")"
  check "an EMPLOYEE (no governance) tries to assign"                        "not_found"                                 "$(assign "$EMP_A" "$PROG_A3" emp2@a.test)"
  check "an INTERN tries to assign"                                          "not_found"                                 "$(assign "$INTERN_A" "$PROG_A3" emp2@a.test)"
  check "governance role 'member' tries to assign (not a demand role)"       "not_found"                                 "$(assign "$MEMBER_A" "$PROG_A3" emp2@a.test)"
  check "retired programme"                                                  "inactive_program"                          "$(assign "$OWNER_A" "$PROG_AOFF" emp@a.test)"
  check "anon has no EXECUTE"                                                "DENIED:permission denied for function assign_training_v1"   "$(as anon "" "select public.assign_training_v1('$PROG_A1','emp@a.test',null);" | tok)"
  check "authenticated without a uid -> Not authenticated"                   "DENIED:Not authenticated"                                   "$(as authenticated "" "select public.assign_training_v1('$PROG_A1','emp@a.test',null);" | tok)"
}

section "1. BASELINE — the production body and policy (loaded from the rollback file)"
run "$DOWN"
BASE_CAT=$(catalog); BASE_MD5=$(srcmd5); BASE_POL=$(policy)
check "baseline md5(prosrc) = production's" "$PROD_MD5" "$BASE_MD5"
check "baseline proacl = production's" "$PROD_ACL" "$(aclstr)"
matrix baseline
reset_assignments

section "2. FIXED — the migration applied verbatim"
run "$MIG"
FIX_CAT=$(catalog); FIX_MD5=$(srcmd5); FIX_POL=$(policy)
check "signature / definer / search_path / owner / acl / result unchanged" "$BASE_CAT" "$FIX_CAT"
check "the body changed (md5 differs)" "changed" "$([ "$FIX_MD5" != "$BASE_MD5" ] && echo changed || echo same)"
check "the programme policy changed" "changed" "$([ "$FIX_POL" != "$BASE_POL" ] && echo changed || echo same)"
check "exactly one assign_training_v1 overload" "1" "$(q "select count(*) from pg_proc where proname='assign_training_v1';")"
matrix fixed

section "3. CHAIN — each group receives, sees and completes; the organization reads it"
for who in "G1-member:$EMP_A" "G2-intern:$INTERN_A" "G3-learner:$STUDENT_A" "G4-external:$COLLAB_A"; do
  G=${who%%:*}; P=${who#*:}; A=$(aid "$PROG_A1" "$P")
  check "$G assignment row: org A, by the owner, due 2026-12-01" "$ORG_A|$OWNER_A|2026-12-01|assigned" \
    "$(q "select organization_id||'|'||assigned_by||'|'||required_by||'|'||status from public.training_assignments where id='$A';")"
  check "$G RECEIVES it (RLS read of own assignment)" "1" "$(as authenticated "$P" "select count(*) from public.training_assignments where id='$A';" | tok)"
  check "$G SEES the course title" "QA kursas A1" "$(title_of "$P" "$A")"
  check "$G the owner cannot complete it on their behalf" "not_found" "$(as authenticated "$OWNER_A" "select public.complete_training_assignment_v1('$A','x');" | tok)"
  check "$G COMPLETES it" "completed" "$(as authenticated "$P" "select public.complete_training_assignment_v1('$A','perskaičiau ir atlikau');" | tok)"
  check "$G the organization READS it completed" "completed" "$(as authenticated "$OWNER_A" "select status from public.training_assignments where id='$A';" | tok)"
done
check "another org's learner sees none of Org A's training" "0" "$(as authenticated "$STUDENT_B" "select count(*) from public.training_assignments;" | tok)"
check "another org's owner reads nothing of Org A" "0" "$(as authenticated "$OWNER_B" "select count(*) from public.training_assignments;" | tok)"
check "another org's learner cannot complete Org A's assignment" "not_found" \
  "$(as authenticated "$STUDENT_B" "select public.complete_training_assignment_v1('$(aid "$PROG_A2" "$INTERN_A")','x');" | tok)"
check "the organization reads only the training rows it created for the intern" "2" \
  "$(as authenticated "$OWNER_A" "select count(*) from public.training_assignments where assignee_profile_id='$INTERN_A';" | tok)"

section "3b. PAUSED reads no more than ACTIVE — the pause opens nothing beyond the assignment"
# EMP_A2 (active employee) and PAUSED_A (paused employee) each hold exactly one
# assignment (PROG_A1) at this point. Same probes, same role, each as themselves.
reads() { as authenticated "$1" "$2" | tok; }
check "paused employee holds the assignment (PROG_A1)" "1" "$(q "select count(*) from public.training_assignments where assignee_profile_id='$PAUSED_A' and program_id='$PROG_A1';")"
check "active employee holds the assignment (PROG_A1)" "1" "$(q "select count(*) from public.training_assignments where assignee_profile_id='$EMP_A2' and program_id='$PROG_A1';")"
for t in training_assignments training_assignment_events engagement_contexts company_memberships organizations profiles email_verifications_v1 company_worker_invitations; do
  A=$(reads "$EMP_A2" "select count(*) from public.$t;"); P=$(reads "$PAUSED_A" "select count(*) from public.$t;")
  check "$t: paused reads the same as active" "$A" "$P"
done
A=$(reads "$EMP_A2" "select count(*) from public.training_programs;"); P=$(reads "$PAUSED_A" "select count(*) from public.training_programs;")
check "training_programs: paused reads no more than active (active=$A)" "yes" "$([ "$P" -le "$A" ] 2>/dev/null && echo yes || echo "no:$P")"
check "training_programs: paused reads ONLY the programme assigned to them" "$PROG_A1" "$(reads "$PAUSED_A" "select id from public.training_programs;")"
check "training_assignments: paused reads ONLY their own assignment" "1" "$(reads "$PAUSED_A" "select count(*) from public.training_assignments where assignee_profile_id='$PAUSED_A';")"
check "paused employee cannot assign (no demand access)" "not_found" "$(assign "$PAUSED_A" "$PROG_A3" emp2@a.test)"
check "paused employee cannot complete another person's assignment" "not_found" \
  "$(as authenticated "$PAUSED_A" "select public.complete_training_assignment_v1('$(aid "$PROG_A1" "$EMP_A2")','x');" | tok)"

section "4. ENDED LINK — no new assignment; the history stays with the organization and the person"
HIST=$(aid "$PROG_A1" "$INTERN_A")
q "update public.engagement_contexts set status='ended', ended_at=current_date where profile_id='$INTERN_A' and organization_id='$ORG_A';" >/dev/null
check "ended intern: a NEW programme cannot be assigned (by e-mail)" "invalid_assignee" "$(assign "$OWNER_A" "$PROG_A3" intern@a.test)"
check "ended intern: a NEW programme cannot be assigned (by id)" "invalid_assignee" "$(assign "$OWNER_A" "$PROG_A3" "$INTERN_A")"
check "the organization still READS the historical assignment" "completed" "$(as authenticated "$OWNER_A" "select status from public.training_assignments where id='$HIST';" | tok)"
check "the person still reads their own record" "completed" "$(as authenticated "$INTERN_A" "select status from public.training_assignments where id='$HIST';" | tok)"
check "the person still reads the course title of their own record" "QA kursas A1" "$(title_of "$INTERN_A" "$HIST")"
check "the person reads no programme they were never assigned" "0" "$(as authenticated "$INTERN_A" "select count(*) from public.training_programs where id='$PROG_A3';" | tok)"
check "no row was deleted by ending the link" "1" "$(q "select count(*) from public.training_assignments where id='$HIST';")"

section "5. ROLLBACK — the production body and policy return, byte for byte"
run "$DOWN"
check "md5(prosrc) after rollback = production's" "$PROD_MD5" "$(srcmd5)"
check "catalog after rollback = baseline" "$BASE_CAT" "$(catalog)"
check "policy after rollback = baseline" "$BASE_POL" "$(policy)"
check "existing assignments survive the rollback (history)" "completed" "$(q "select status from public.training_assignments where id='$HIST';")"
check "after rollback a NEW consultant assignment is refused again" "invalid_assignee" "$(assign "$OWNER_A" "$PROG_A3" "$CONSULT_A")"
check "after rollback the ended intern loses the course title again (the old gap)" "NOROWS" "$(title_of "$INTERN_A" "$HIST")"

section "6. RE-APPLY — idempotent"
run "$MIG"
check "md5(prosrc) after re-apply = first apply" "$FIX_MD5" "$(srcmd5)"
check "catalog after re-apply = baseline" "$BASE_CAT" "$(catalog)"
check "policy after re-apply = first apply" "$FIX_POL" "$(policy)"
check "active employee assignable again after re-apply" "assigned" "$(assign "$OWNER_A" "$PROG_A3" emp2@a.test)"

printf '\n== RESULT: %d passed, %d failed ==\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
