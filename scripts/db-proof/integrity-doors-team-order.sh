#!/usr/bin/env bash
# ============================================================================
# INTEGRITY DOORS v1 x TEAM-ASSIGNMENT LANE: both apply orders, REAL functions.
#
# The G-1 trigger of 20261003151300 must compose with the UNAPPLIED lane
# 20261003150600 / 20261003150700 (feat/cc/team-assignment-canonical-v1: team
# assignment as a journal context, independent_journal_context_v1) WITHOUT a
# hard dependency. This script proves both orders on a scratch PostgreSQL:
#
#   ORDER A  integrity doors first, then 150700
#   ORDER B  150700 first, then integrity doors
#
# The team lane is not on main, so its files are read with `git show` from
# origin/feat/cc/team-assignment-canonical-v1 into a temp dir (nothing from that
# branch is copied into this PR). Its harness (prelude2 + seeds) and its REAL
# migrations 150600 / 150700 are used; the LIVE production bodies of the replaced
# functions come from its rollback file, exactly as its own proof does.
#
# Usage (needs `git fetch origin` first):
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/integrity-doors-team-order.sh
# Never point this at production or a shared local stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-58741}"
case "$HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
PSQL="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
BR="${TEAM_BRANCH:-origin/feat/cc/team-assignment-canonical-v1}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
gs() { git -C "$REPO" show "$BR:$1" 2>/dev/null | tr -d '\r' > "$T/$(basename "$1")" || return 1; [ -s "$T/$(basename "$1")" ]; }
for f in scripts/db-proof/team-assignment-canonical.prelude2.sql scripts/db-proof/team-assignment-canonical.seed.sql \
         scripts/db-proof/team-assignment-journal-context.seed.sql \
         supabase/migrations/20261003150600_brigade_work_assignment_v1.sql \
         supabase/migrations/20261003150700_brigade_journal_context_v1.sql \
         supabase/rollbacks/20261003150700_brigade_journal_context_v1.down.sql; do
  gs "$f" || { echo "cannot read $f from $BR (git fetch origin first)"; exit 2; }
done
M="$REPO/supabase/migrations"; MINE="$T/mine.sql"; tr -d '\r' < "$M/20261003151300_integrity_doors_v1.sql" > "$MINE"
for f in "$M"/20260817150000_work_objects_v1.sql "$M"/20260711210000_work_tasks_v1.sql "$M"/20260718140000_project_operations_stages.sql \
         "$M"/20260817151000_work_tasks_v2_collaboration.sql "$M"/20260819190000_journal_task_evidence_link_v1.sql \
         "$M"/20261002141500_work_task_authz_null_safe_v1.sql "$M"/20261002150000_work_tasks_stage_and_subtask_v1.sql; do
  tr -d '\r' < "$f" > "$T/$(basename "$f")"
done
tr -d '\r' < "$HERE/work-tasks-stage-subtask.prelude.sql" > "$T/base.prelude.sql"

MA=33333333-3333-3333-3333-333333333333; U1=11111111-1111-1111-1111-111111111111; OUT=44444444-4444-4444-4444-444444444444
WU1=aaaa1111-0000-0000-0000-000000000001; WOUT=aaaa4444-0000-0000-0000-000000000004
P1=99999999-0000-0000-0000-000000000001; P2=99999999-0000-0000-0000-000000000002
TA=7ea00000-0000-0000-0000-00000000000a; ORGA=aaaaaaaa-0000-0000-0000-000000000001; ORGB=bbbbbbbb-0000-0000-0000-000000000002
IND=12121212-1212-1212-1212-121212121212; WIND=aaaa1212-0000-0000-0000-000000001212

pass=0; fail=0
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
as() { printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$1'; $2" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
check() { if [ "$2" = "$3" ]; then printf '  PASS  %s\n' "$1"; pass=$((pass+1)); else printf '  FAIL  %s (expected [%s], got [%s])\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then printf '  PASS  %s\n' "$1"; pass=$((pass+1)); else printf '  FAIL  %s (wanted /%s/, got [%s])\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
res() { local o; o=$(cat); if printf "%s" "$o" | grep -q ERROR; then printf "%s" "$o" | grep ERROR | head -1; else echo OK; fi; }
ctx() { q "select id from public.engagement_contexts where profile_id='$1' and organization_id $2 and relationship_slug='employee' limit 1;"; }
ins() { as "$1" "insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope, project_id) values ('$2','$3','freeform','t','lt','h','closed',$4);"; }
rpc() { as "$1" "select public.create_journal_entry_full('$2','$3','freeform',null,'t','lt','h0','h$RANDOM','closed','[]'::jsonb,$4,true) is not null;"; }

base() {
  $PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
  for f in "$T/base.prelude.sql" "$T/team-assignment-canonical.prelude2.sql" "$T/20260817150000_work_objects_v1.sql" "$T/20260711210000_work_tasks_v1.sql" \
           "$T/20260718140000_project_operations_stages.sql" "$T/20260817151000_work_tasks_v2_collaboration.sql" "$T/20260819190000_journal_task_evidence_link_v1.sql" \
           "$T/20261002141500_work_task_authz_null_safe_v1.sql" "$T/20261002150000_work_tasks_stage_and_subtask_v1.sql"; do
    $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$T/e" || { echo "BASELINE FAILED: $f"; cat "$T/e"; exit 1; }
  done
  $PSQL -v ON_ERROR_STOP=1 -f "$T/team-assignment-canonical.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
  $PSQL -v ON_ERROR_STOP=1 -f "$T/team-assignment-journal-context.seed.sql" >/dev/null || { echo "seed2 FAILED"; exit 1; }
  $PSQL -v ON_ERROR_STOP=1 -f "$T/20261003150600_brigade_work_assignment_v1.sql" >/dev/null 2>"$T/e" || { echo "MIG 150600 FAILED"; cat "$T/e"; exit 1; }
  # live production bodies of the functions 150700 replaces (its rollback file), then the production ACLs
  $PSQL -v ON_ERROR_STOP=1 -f "$T/20261003150700_brigade_journal_context_v1.down.sql" >/dev/null 2>"$T/e" || { echo "LIVE BODIES FAILED"; cat "$T/e"; exit 1; }
  $PSQL -v ON_ERROR_STOP=1 -c "create or replace function public.create_journal_entry_full(p_worker_id uuid, p_engagement_context_id uuid, p_entry_type_slug text, p_profession_id uuid, p_original_text text, p_original_language character, p_hash_prev text, p_hash_self text, p_visibility_scope text, p_metrics jsonb) returns uuid language sql set search_path to 'public' as \$f\$ select public.create_journal_entry_full(p_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id, p_original_text, p_original_language, p_hash_prev, p_hash_self, p_visibility_scope, p_metrics, null::uuid, false) \$f\$; grant execute on all functions in schema public to authenticated; grant insert on public.journal_entries to authenticated;" >/dev/null
  # an INDEPENDENT provider: personal (org NULL) context, ACTIVE person assignment on org A's project P1, not a member of org A
  $PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.profiles (id, active_role, full_name) values ('$IND','worker','Independent');
insert into public.workers (id, profile_id) values ('$WIND','$IND');
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at) values ('$IND', null, 'active', 'employee', '2026-02-01');
SQL
}
# The team lane's harness has no skills / evidence tables; the migration touches them, so load the
# SAME live-shaped definitions the main proof uses (everything from the G-5 section of the prelude on).
awk '/^-- ── G-5: worker_skills/{f=1} f{print}' "$HERE/integrity-doors.prelude.sql" | tr -d '' > "$T/domain.sql"
domain() {
  $PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"$T/e" <<'SQL' || { echo "DOMAIN DEPS FAILED"; cat "$T/e"; exit 1; }
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table if not exists public.skills (id uuid primary key default gen_random_uuid(), slug text unique, is_active boolean default true);
create table if not exists public.productivity_units (slug text primary key);
SQL
  $PSQL -v ON_ERROR_STOP=1 -f "$T/domain.sql" >/dev/null 2>"$T/e" || { echo "DOMAIN STUBS FAILED"; cat "$T/e"; exit 1; }
}
apply() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$T/e" || { echo "APPLY FAILED: $1"; cat "$T/e"; exit 1; }; }

probe_team_world() { # $1 = label prefix ; $2 = "team-aware" | "no-team-lane"
  local CU1T CU1A CU1X COUT CIND CPERS
  CU1T=$(ctx $U1 "= '$TA'"); CU1A=$(ctx $U1 "= '$ORGA'"); CU1X=$(ctx $U1 "= '$ORGB'"); COUT=$(ctx $OUT "= '$ORGB'"); CIND=$(ctx $IND "is null")
  su "select public.assign_team_to_work_v1('$TA','$P1');" >/dev/null 2>&1
  # assign_team_to_work_v1 needs the manager as the caller
  as $MA "select public.assign_team_to_work_v1('$TA','$P1');" >/dev/null
  su "insert into public.project_worker_assignments (project_id, worker_id, status) values ('$P1','$WIND','active');" >/dev/null
  if [ "$2" = team-aware ]; then
    check "$1 team member: direct insert, TEAM context, team's project -> accepted" "OK" "$(ins $U1 $WU1 $CU1T "'$P1'" | res)"
    check "$1 team member: RPC explicit project -> accepted" "t" "$(rpc $U1 $WU1 $CU1T "'$P1'::uuid" | grep -E '^t$|ERROR' | tail -1)"
    check "$1 independent provider: direct insert, personal context, client project (person assignment) -> accepted" "OK" "$(ins $IND $WIND $CIND "'$P1'" | res)"
  else
    has "$1 team member: direct insert with the team's project -> refused (no team lane yet)" "project_not_assignable" "$(ins $U1 $WU1 $CU1T "'$P1'")"
    has "$1 independent provider: client project -> refused (no team lane yet)" "project_not_assignable" "$(ins $IND $WIND $CIND "'$P1'")"
  fi
  has "$1 team member: OTHER project P2 -> refused" "project_not_assignable" "$(ins $U1 $WU1 $CU1T "'$P2'")"
  has "$1 outsider using a MEMBER's context -> refused" "engagement_context_not_own|row-level security" "$(ins $OUT $WOUT $CU1T "'$P1'")"
  has "$1 member using the context of ANOTHER org (org B) for the project -> refused" "project_not_assignable|engagement_context_not_own" "$(ins $U1 $WU1 $CU1X "'$P1'")"
  has "$1 foreign context of someone else, no project -> refused" "engagement_context_not_own" "$(ins $OUT $WOUT $CU1T null)"
  check "$1 team member: no project, own team context -> accepted" "OK" "$(ins $U1 $WU1 $CU1T null | res)"
  if [ "$2" = team-aware ]; then
    check "$1 team member: own project-org employee context + assigned team project -> accepted" "OK" "$(ins $U1 $WU1 $CU1A "'$P1'" | res)"
  fi
}

echo "=============================================================="
echo " INTEGRITY DOORS x TEAM LANE - apply-order proof (real functions)"
echo "=============================================================="

echo; echo "== ORDER A: integrity doors FIRST, then 150700"
base; domain; apply "$MINE"
echo "  (integrity doors applied on the live baseline; team lane 150700 NOT applied)"
check "A0 the team functions do not exist yet" "0" "$(q "select count(*) from pg_proc where proname in ('team_work_context_v1','independent_journal_context_v1');")"
probe_team_world "A1" no-team-lane
apply "$T/20261003150700_brigade_journal_context_v1.sql"
echo "  (150700 applied AFTER the integrity doors; no re-apply of the doors)"
check "A2 the team functions now exist" "2" "$(q "select count(*) from pg_proc where proname in ('team_work_context_v1','independent_journal_context_v1');")"
probe_team_world "A3" team-aware

echo; echo "== ORDER B: 150700 FIRST, then integrity doors"
base; domain; apply "$T/20261003150700_brigade_journal_context_v1.sql"
CU1T=$(ctx $U1 "= '$TA'")
echo "  (150700 applied; doors NOT applied yet)"
check "B0 BEFORE the doors a member can plant a FOREIGN context (the bug, with the team lane in)" "OK" "$(ins $U1 $WU1 $(ctx $OUT "= '$ORGB'") null | res)"
apply "$MINE"
probe_team_world "B1" team-aware

echo; echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
