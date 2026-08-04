#!/usr/bin/env bash
# ============================================================================
# W11 project lifecycle — REAL database proof.
#
# Throwaway Postgres 15 container on its OWN name and port; the shared local
# Supabase stack is never touched. The migration and its paired rollback are
# executed VERBATIM from the repo — nothing here re-implements them.
#
# Proves, in order:
#   A. the PRE-state (the pre-W11 shape refuses 'completed')
#   B. apply
#   C. the transition matrix, same-state idempotency, authority, anti-oracle
#   D. completion ends exactly this project's roster, once, with audit rows
#   E. a completed project refuses new assignments
#   F. rollback REFUSES while real completions exist  (the guard)
#   G. rollback SUCCEEDS on a clean database          (the happy path)
#   H. re-apply is clean
#
# Never point this at production or at a shared stack.
# Usage:  bash scripts/db-proof/w11-project-lifecycle.sh
# ============================================================================
set -uo pipefail

CT=w11-lifecycle-proof
PORT=55433
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260804120000_project_lifecycle_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260804120000_project_lifecycle_v1.down.sql"

OWNER='11111111-1111-1111-1111-111111111111'   # company owner (may manage)
WORKER='22222222-2222-2222-2222-222222222222'  # assigned worker (may NOT manage)
STRANGER='33333333-3333-3333-3333-333333333333'
CO='c0000000-0000-4000-8000-000000000001'
WK='40000000-0000-4000-8000-000000000001'
P1='a0000001-0000-4000-8000-000000000001'
P2='a0000002-0000-4000-8000-000000000002'

pass=0; fail=0
q() { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1; }
# NOTE: no `tail -1`. psql echoes `SET` for the uid statement, and a jsonb
# result can span lines — trimming to the last line discarded the actual answer
# in two probes on the first real run. `check` matches on substring, so the
# whole output is the safe thing to return.
as() { docker exec -i "$CT" psql -U postgres -tAc "set local app.uid='$1'; $2" 2>&1; }
# An INFRASTRUCTURE failure must never read as a PASS. A dead docker daemon
# returns prose that can contain almost any short expected substring ("t", "1",
# "-"), so it is detected FIRST and reported as its own class. This bit for
# real on the first run of this script: the daemon died mid-proof and six
# checks "passed" on the text of the error.
infra_fail() { # $1=actual
  [[ "$1" == *"docker API"* || "$1" == *"daemon is running"*      || "$1" == *"Cannot connect to the Docker"* || "$1" == *"No such container"* ]]
}
check() { # $1=label $2=expected $3=actual
  if infra_fail "$3"; then
    echo "  INFRA $1  — docker unavailable, NOT a result"; fail=$((fail+1)); return
  fi
  if [[ "$3" == *"$2"* ]]; then echo "  PASS  $1"; pass=$((pass+1));
  else echo "  FAIL  $1"; echo "        expected to contain: $2"; echo "        got: $3"; fail=$((fail+1)); fi
}

cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== boot throwaway postgres =="
cleanup
docker run -d --name "$CT" -e POSTGRES_PASSWORD=pw -p "$PORT":5432 postgres:15 >/dev/null
for _ in $(seq 1 40); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

seed_all() {
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w11-project-lifecycle.prelude.sql" >/dev/null 2>&1
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
insert into public.profiles (id, full_name) values
  ('$OWNER','Owner'), ('$WORKER','Worker'), ('$STRANGER','Stranger');
insert into public.companies (id, profile_id) values ('$CO','$OWNER');
insert into public.workers (id, profile_id) values ('$WK','$WORKER');
insert into public.company_workers (company_id, worker_id, status) values ('$CO','$WK','active');
insert into public.projects (id, company_id, title, status) values
  ('$P1','$CO','Rotterdam warehouse','draft'),
  ('$P2','$CO','Second project','draft');
insert into public.project_worker_assignments (project_id, worker_id, status) values ('$P1','$WK','active');
insert into public.project_worker_assignments (project_id, worker_id, status) values ('$P2','$WK','active');
SQL
}

seed_all

echo
echo "== A. PRE-state: the pre-W11 shape cannot hold 'completed' =="
check "old constraint refuses 'completed'" "violates check constraint" \
  "$(q "update public.projects set status='completed' where id='$P1'")"
check "set_project_status_v1 does not exist yet" "does not exist" \
  "$(q "select public.set_project_status_v1('$P1'::uuid,'live')")"

echo
echo "== B. apply the migration VERBATIM =="
APPLY="$(docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)"
check "migration applies cleanly" "COMMIT" "$APPLY"
check "constraint now allows completed" "completed" \
  "$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='projects_status_check'")"
check "constraint no longer allows closed" "" \
  "$(q "select case when pg_get_constraintdef(oid) like '%closed%' then 'STILL-CLOSED' else '' end from pg_constraint where conname='projects_status_check'")"
check "anon holds no EXECUTE" "f" \
  "$(q "select has_function_privilege('anon','public.set_project_status_v1(uuid,text)','execute')")"
check "authenticated holds EXECUTE" "t" \
  "$(q "select has_function_privilege('authenticated','public.set_project_status_v1(uuid,text)','execute')")"
check "search_path is pinned" "search_path=public" \
  "$(q "select array_to_string(proconfig,',') from pg_proc where proname='set_project_status_v1'")"

echo
echo "== C. the transition matrix, as the RPC really behaves =="
check "draft -> live"                "transitioned"        "$(as "$OWNER" "select public.set_project_status_v1('$P1','live')")"
check "same state is idempotent"     "already_in_state"    "$(as "$OWNER" "select public.set_project_status_v1('$P1','live')")"
check "live -> paused"               "transitioned"        "$(as "$OWNER" "select public.set_project_status_v1('$P1','paused')")"
check "paused -> live"               "transitioned"        "$(as "$OWNER" "select public.set_project_status_v1('$P1','live')")"
check "live -> draft is refused"     "invalid_transition"  "$(as "$OWNER" "select public.set_project_status_v1('$P1','draft')")"
check "unknown status is refused"    "invalid_transition"  "$(as "$OWNER" "select public.set_project_status_v1('$P1','archived')")"
check "assigned worker may NOT write" "not_authorized"     "$(as "$WORKER" "select public.set_project_status_v1('$P1','paused')")"
check "stranger gets not_found (no oracle)" "not_found"    "$(as "$STRANGER" "select public.set_project_status_v1('$P1','paused')")"
check "missing project is not_found" "not_found"           "$(as "$OWNER" "select public.set_project_status_v1('99999999-9999-4999-8999-999999999999','live')")"

SAME_AUDIT="$(q "select count(*) from public.audit_logs where action='set_project_status'")"
# draft->live, live->paused, paused->live = 3 real changes. The same-state
# call and the four refusals wrote nothing, which is the property under test.
check "same-state and refusals wrote NO audit row (3 real changes)" "3" "$SAME_AUDIT"

echo
echo "== D. completion ends exactly this project's roster =="
check "live -> completed reports 1 ending" '"assignments_ended": 1' \
  "$(as "$OWNER" "select (public.set_project_status_v1('$P1','completed'))::text")"
check "this project's assignment is ended"  "ended"  "$(q "select status from public.project_worker_assignments where project_id='$P1'")"
check "the OTHER project's assignment is untouched" "active" "$(q "select status from public.project_worker_assignments where project_id='$P2'")"
check "ended_at was stamped"                "t"      "$(q "select ended_at is not null from public.project_worker_assignments where project_id='$P1'")"
check "one assignment audit row"            "1"      "$(q "select count(*) from public.audit_logs where action='end_project_assignment'")"
check "completed is terminal (-> live)"     "invalid_transition" "$(as "$OWNER" "select public.set_project_status_v1('$P1','live')")"
check "completed is terminal (-> draft)"    "invalid_transition" "$(as "$OWNER" "select public.set_project_status_v1('$P1','draft')")"
check "re-completing is idempotent"         "already_in_state"   "$(as "$OWNER" "select public.set_project_status_v1('$P1','completed')")"
check "…and ended nothing a second time"    "1"      "$(q "select count(*) from public.audit_logs where action='end_project_assignment'")"

STAMP="$(q "select ended_at from public.project_worker_assignments where project_id='$P1'")"
as "$OWNER" "select public.set_project_status_v1('$P1','completed')" >/dev/null
check "existing ended_at was NOT overwritten" "$STAMP" \
  "$(q "select ended_at from public.project_worker_assignments where project_id='$P1'")"

echo
echo "== E. a completed project refuses new work =="
check "assign to a completed project is refused" "Project is completed" \
  "$(as "$OWNER" "select public.assign_worker_to_project('$P1','$WORKER')")"
check "assign to a live project still works" "-" \
  "$(as "$OWNER" "select public.set_project_status_v1('$P2','live')::text")"

echo
echo "== F. rollback REFUSES while real completions exist =="
RB_BLOCKED="$(docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)"
check "rollback aborts" "ROLLBACK REFUSED" "$RB_BLOCKED"
check "…and the function survives the refusal" "t" \
  "$(q "select count(*)>0 from pg_proc where proname='set_project_status_v1'")"

echo
echo "== G. rollback SUCCEEDS on a clean database =="
docker exec -i "$CT" psql -U postgres -q -c "drop schema public cascade; create schema public;" >/dev/null 2>&1
docker exec -i "$CT" psql -U postgres -q -c "drop role if exists authenticated; drop role if exists anon;" >/dev/null 2>&1
seed_all
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" >/dev/null 2>&1
RB_OK="$(docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)"
check "rollback commits" "COMMIT" "$RB_OK"
check "the lifecycle function is gone" "0" \
  "$(q "select count(*) from pg_proc where proname='set_project_status_v1'")"
check "the constraint is back to its pre-W11 shape" "closed" \
  "$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='projects_status_check'")"
check "assign_worker_to_project lost the completed guard" "0" \
  "$(q "select count(*) from pg_proc where proname='assign_worker_to_project' and prosrc like '%Project is completed%'")"

echo
echo "== H. re-apply is clean =="
RE="$(docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)"
check "re-apply commits" "COMMIT" "$RE"
check "constraint allows completed again" "completed" \
  "$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='projects_status_check'")"
check "the lifecycle still works after re-apply" "transitioned" \
  "$(as "$OWNER" "select public.set_project_status_v1('$P1','live')")"

echo
echo "============================================================"
echo "  W11 db-proof: $pass passed, $fail failed"
echo "============================================================"
[[ "$fail" -eq 0 ]] || exit 1
