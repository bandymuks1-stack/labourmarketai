#!/usr/bin/env bash
# ============================================================================
# W11 Slice 2 — REAL row-level-security behaviour proof.
#
# Spins up a THROWAWAY Postgres 15 container, builds the faithful harness
# (prelude = the 0001 posture including the tenant-blind
# `status = 'live' and auth.uid() is not null` branch), and measures who can
# read which project BEFORE and AFTER applying the actual files
#   supabase/migrations/20260803090000_project_assigned_worker_read_v1.sql
#   supabase/rollbacks/20260803090000_project_assigned_worker_read_v1.down.sql
# each executed VERBATIM — nothing here re-implements them.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS genuinely decides the result.
#
# Phases: BEFORE -> APPLY -> AFTER matrix -> GRANTS -> ROLLBACK -> RE-APPLY.
#
# Never point this at production or at a shared local Supabase stack. It uses
# its own container name and its own port, and touches neither.
# Usage:  bash scripts/db-proof/w11-project-assigned-worker-read.sh
# ============================================================================
set -uo pipefail

CT=w11-project-read-proof
PORT=55434
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG="$REPO/supabase/migrations/20260803090000_project_assigned_worker_read_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260803090000_project_assigned_worker_read_v1.down.sql"

A_OWNER='aaaaaaaa-0000-4000-8000-000000000001'
B_OWNER='bbbbbbbb-0000-4000-8000-000000000002'
ASSIGNED='cccccccc-0000-4000-8000-000000000003'
ENDED='dddddddd-0000-4000-8000-000000000004'
UNRELATED='eeeeeeee-0000-4000-8000-000000000005'
ADMIN='ffffffff-0000-4000-8000-000000000006'
P1='44440000-0000-4000-8000-000000000001'   # company A, draft, ASSIGNED is on it
P2='55550000-0000-4000-8000-000000000002'   # company B, live
P3='66660000-0000-4000-8000-000000000003'   # company A, live

PASS=0; FAIL=0
declare -a FAILURES=()

q() { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1 | tr -d '\r'; }

# Run SQL as a non-superuser role with a given auth.uid().
as_role() { # $1=role $2=uid $3=sql
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r' | grep -v '^BEGIN$\|^ROLLBACK$\|^SET$' | sed '/^$/d'
begin;
set local role $1;
set local app.uid = '$2';
$3
rollback;
SQL
}

check() { # $1=label $2=expected $3=actual
  if [ "$3" = "$2" ]; then
    PASS=$((PASS+1)); printf '  PASS  %-64s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected [$2] got [$3]")
    printf '  FAIL  %-64s expected [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

contains() { # $1=label $2=needle $3=haystack
  if printf '%s' "$3" | grep -qi -- "$2"; then
    PASS=$((PASS+1)); printf '  PASS  %-64s (matched "%s")\n' "$1" "$2"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected to contain [$2] got [$3]")
    printf '  FAIL  %-64s expected to contain [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w11-project-assigned-worker-read.seed.sql" >/dev/null 2>&1; }

projects_visible() { as_role authenticated "$1" "select count(*) from public.projects;"; }
sees_project()     { as_role authenticated "$1" "select count(*) from public.projects where id='$2';"; }

banner() { echo; echo "════════════════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════════════════"; }

cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "W11 slice 2 — assigned-worker project read proof"
echo "throwaway container: $CT  (port $PORT)  — shared local stack untouched"

if docker ps -a --format '{{.Names}}' | grep -qx "$CT"; then docker rm -f "$CT" >/dev/null; fi
docker run -d --name "$CT" -e POSTGRES_PASSWORD=proof -p "$PORT":5432 postgres:15 >/dev/null || {
  echo "could not start container"; exit 1; }

for _ in $(seq 1 60); do
  docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w11-project-assigned-worker-read.prelude.sql" >/dev/null || {
  echo "prelude failed"; exit 1; }
seed
echo "harness ready — 0001 posture in place (projects_select has the \`live\` branch)"

# Capture the ORIGINAL policy text. The rollback must restore this byte for byte.
QUAL_ORIGINAL="$(q "select qual from pg_policies where tablename='projects' and policyname='projects_select';")"
echo "  original qual: $QUAL_ORIGINAL"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 1 — BEFORE the migration (both defects as they exist in prod)"
# ════════════════════════════════════════════════════════════════════════════
# P0-2: the assigned worker's OWN project is `draft`, so it is filtered out.
check "BEFORE: the ASSIGNED worker CANNOT read their own project P1"   "0" "$(sees_project $ASSIGNED $P1)"
# ...and the only projects they can see are two they have nothing to do with.
check "BEFORE: the ASSIGNED worker sees 2 projects — both unrelated"   "2" "$(projects_visible $ASSIGNED)"
# P1-2: a worker with no relationship to anything reads other tenants' rows.
check "BEFORE: an UNRELATED worker reads other tenants' live projects" "2" "$(projects_visible $UNRELATED)"
check "BEFORE: an UNRELATED worker reads company B's project P2"       "1" "$(sees_project $UNRELATED $P2)"
check "BEFORE: an ENDED worker also reads them"                        "2" "$(projects_visible $ENDED)"
check "BEFORE: company A's owner reads company B's project too"        "1" "$(sees_project $A_OWNER $P2)"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 2 — APPLY the migration VERBATIM"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; then
  echo "  applied 20260803090000"; PASS=$((PASS+1))
else
  echo "  MIGRATION APPLY FAILED"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$MIG"
  FAIL=$((FAIL+1)); FAILURES+=("migration did not apply")
fi
seed

HELPER="$(q "select count(*) from pg_proc where proname='is_assigned_to_project';")"
check "APPLY: the helper function is created"                          "1" "$HELPER"
SECDEF="$(q "select prosecdef::text||'/'||coalesce(array_to_string(proconfig,','),'<none>') from pg_proc where proname='is_assigned_to_project';")"
check "APPLY: it is SECURITY DEFINER with search_path pinned"          "true/search_path=public" "$SECDEF"

QUAL_APPLIED="$(q "select qual from pg_policies where tablename='projects' and policyname='projects_select';")"
contains "APPLY: projects_select now calls is_assigned_to_project"     "is_assigned_to_project" "$QUAL_APPLIED"
if printf '%s' "$QUAL_APPLIED" | grep -qi "live"; then
  FAIL=$((FAIL+1)); FAILURES+=("the \`live\` branch survived the replacement"); echo "  FAIL  the \`live\` branch survived the replacement"
else
  PASS=$((PASS+1)); printf '  PASS  %-64s %s\n' "APPLY: the tenant-blind \`live\` branch is GONE" "ok"
fi

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 3 — AFTER: the project read matrix"
# ════════════════════════════════════════════════════════════════════════════
check "AFTER: the ASSIGNED worker CAN read their own project P1"       "1" "$(sees_project $ASSIGNED $P1)"
check "AFTER: the ASSIGNED worker sees EXACTLY that one project"       "1" "$(projects_visible $ASSIGNED)"
check "AFTER: the ASSIGNED worker still cannot read P2 (other tenant)" "0" "$(sees_project $ASSIGNED $P2)"
check "AFTER: the ASSIGNED worker still cannot read P3 (same tenant)"  "0" "$(sees_project $ASSIGNED $P3)"
check "AFTER: an ENDED assignment grants NOTHING"                      "0" "$(projects_visible $ENDED)"
check "AFTER: an UNRELATED worker sees NOTHING"                        "0" "$(projects_visible $UNRELATED)"
check "AFTER: company A's owner sees their OWN two projects"           "2" "$(projects_visible $A_OWNER)"
check "AFTER: company A's owner no longer reads company B's project"   "0" "$(sees_project $A_OWNER $P2)"
check "AFTER: company B's owner sees their own one project"            "1" "$(projects_visible $B_OWNER)"
check "AFTER: a platform ADMIN still sees every project"               "3" "$(projects_visible $ADMIN)"

ANON="$(as_role anon '' "select count(*) from public.projects;")"
contains "AFTER: anon has NO direct table SELECT"                      "permission denied" "$ANON"

# A worker must get an EMPTY RESULT, not an error confirming the row exists.
ORACLE="$(as_role authenticated $UNRELATED "select coalesce((select title from public.projects where id='$P2'),'<empty>');")"
check "AFTER: an unrelated worker gets an empty result, not an error"  "<empty>" "$ORACLE"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 4 — AFTER: the helper's privilege surface"
# ════════════════════════════════════════════════════════════════════════════
check "GRANTS: anon CANNOT execute is_assigned_to_project" "false" \
  "$(q "select has_function_privilege('anon','public.is_assigned_to_project(uuid)','execute')::text;")"
check "GRANTS: PUBLIC holds no EXECUTE" "0" \
  "$(q "select coalesce((select count(*) from aclexplode((select proacl from pg_proc where proname='is_assigned_to_project')) where grantee=0),0);")"
check "GRANTS: authenticated CAN execute it" "true" \
  "$(q "select has_function_privilege('authenticated','public.is_assigned_to_project(uuid)','execute')::text;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 5 — AFTER: the write surface is untouched"
# ════════════════════════════════════════════════════════════════════════════
WRITEPOL="$(q "select string_agg(policyname,',' order by policyname) from pg_policies where tablename='projects' and cmd<>'SELECT';")"
check "WRITES: the two write policies are still exactly as seeded"     "projects_insert,projects_update" "$WRITEPOL"
INS="$(as_role authenticated $ASSIGNED "insert into public.projects(id, company_id, title, status) values (gen_random_uuid(),'01010101-0000-4000-8000-00000000000a','worker-created','draft');")"
contains "WRITES: the assigned worker still CANNOT create a project"   "row-level security" "$INS"
UPD="$(as_role authenticated $ASSIGNED "update public.projects set title='hijacked' where id='$P1'; select 'rows='||count(*)::text from public.projects where id='$P1' and title='hijacked';")"
contains "WRITES: the assigned worker still CANNOT edit their project" "rows=0" "$UPD"

ROWS="$(q "select count(*) from public.projects;")"
check "WRITES: the migration mutated NO data (3 projects still there)" "3" "$ROWS"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 6 — ROLLBACK VERBATIM (must re-open P1-2, by design)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null 2>&1; then
  echo "  rollback applied cleanly"; PASS=$((PASS+1))
else
  echo "  ROLLBACK FAILED"; FAIL=$((FAIL+1)); FAILURES+=("rollback did not apply")
fi
seed

QUAL_ROLLED="$(q "select qual from pg_policies where tablename='projects' and policyname='projects_select';")"
check "ROLLBACK: the ORIGINAL policy is restored byte for byte"        "$QUAL_ORIGINAL" "$QUAL_ROLLED"
check "ROLLBACK: the helper function is dropped"                       "0" "$(q "select count(*) from pg_proc where proname='is_assigned_to_project';")"
check "ROLLBACK: P1-2 is re-opened (unrelated worker reads 2 again)"   "2" "$(projects_visible $UNRELATED)"
check "ROLLBACK: P0-2 is back (assigned worker loses their project)"   "0" "$(sees_project $ASSIGNED $P1)"
check "ROLLBACK: mutates NO data (3 projects still present)"           "3" "$(q "select count(*) from public.projects;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 7 — RE-APPLY (idempotency: must land in the same state)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; then
  echo "  re-applied cleanly"; PASS=$((PASS+1))
else
  echo "  RE-APPLY FAILED"; FAIL=$((FAIL+1)); FAILURES+=("re-apply did not succeed")
fi
seed

QUAL_REAPPLIED="$(q "select qual from pg_policies where tablename='projects' and policyname='projects_select';")"
check "RE-APPLY: the policy is byte-identical to the first apply"      "$QUAL_APPLIED" "$QUAL_REAPPLIED"
check "RE-APPLY: the assigned worker reads their project again"        "1" "$(sees_project $ASSIGNED $P1)"
check "RE-APPLY: the unrelated worker sees nothing again"              "0" "$(projects_visible $UNRELATED)"
check "RE-APPLY: anon EXECUTE is still revoked"                        "false" \
  "$(q "select has_function_privilege('anon','public.is_assigned_to_project(uuid)','execute')::text;")"

# ── summary ─────────────────────────────────────────────────────────────────
banner "RESULT"
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo; echo "  failures:"; for f in "${FAILURES[@]}"; do echo "    - $f"; done
  exit 1
fi
echo; echo "  W11 slice 2 behaviour proven end to end."
