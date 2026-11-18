#!/usr/bin/env bash
# ============================================================================
# J-12 access closure (migration 20261103090000): RUNTIME proof on a scratch
# PostgreSQL 16, owner conditions 2026-11-03 (1–6).
#
# Reuses the J-12 prelude, whose manages_organization is the PRODUCTION
# predicate (admits external_manager). Applies the two applied education
# migrations, the applied J-12 migration (20261102160000) and this one
# VERBATIM, and probes as `authenticated` / `anon` with a JWT subject.
#   - reproduces both gaps BEFORE the fix;
#   - negative: external manager by engagement and by membership, a manager of
#     ANOTHER institution, a wrong-role member and employee, anon — for every
#     membership-changing command and for reading request text;
#   - positive: the institution's own owner / admin / manager, and the learner;
#   - nothing destroyed: request text and audit rows survive;
#   - no alternative path: every client-executable definer function that
#     touches the membership table is in the known set;
#   - rollback restores all three objects exactly (md5).
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

# institution's own people (positive)
MGR=a0000000-0000-0000-0000-00000000000a      # engagement manager
OWNER=a1000000-0000-0000-0000-00000000000a    # membership owner
ADMINM=a2000000-0000-0000-0000-00000000000a   # membership admin
# no authority over this institution (negative)
EXTENG=e0000000-0000-0000-0000-00000000000e   # engagement external_manager
EXTMEM=e1000000-0000-0000-0000-00000000000e   # membership external_manager
OTHERMGR=e2000000-0000-0000-0000-00000000000e # manager of ANOTHER institution
WRONGMEM=e3000000-0000-0000-0000-00000000000e # membership role 'member'
WRONGEMP=e4000000-0000-0000-0000-00000000000e # engagement 'employee'
# learners (all already linked as students)
REQ=b0000000-0000-0000-0000-00000000000b
DEC=c0000000-0000-0000-0000-00000000000c
WD=d0000000-0000-0000-0000-00000000000d
PLAIN=d1000000-0000-0000-0000-00000000000d
ORG=f0000000-0000-0000-0000-0000000000f1
ORG2=f0000000-0000-0000-0000-0000000000f2
PROG=a1000000-0000-0000-0000-0000000000a1
COH=c1000000-0000-0000-0000-0000000000c1
COH2=c2000000-0000-0000-0000-0000000000c2
COH3=c3000000-0000-0000-0000-0000000000c3
SENTINEL=00000000-0000-0000-0000-00000000dead
NEG="$EXTENG $EXTMEM $OTHERMGR $WRONGMEM $WRONGEMP"

PASS=0; FAIL=0
DB=j12guard
$ADMIN -c "drop database if exists $DB" >/dev/null 2>&1
$ADMIN -c "create database $DB" >/dev/null
PSQL="psql -h $HOST -p $PORT -U postgres -d $DB -v ON_ERROR_STOP=1 -q"
$PSQL -f "$HERE/education-cohort-join-requests.prelude.sql" >/dev/null
for m in "${MIGS[@]}"; do $PSQL -f "$m" >/dev/null || { echo "failed: $m"; exit 1; }; done
# Stand-in for the applied erasure registry (20261019140000): the columns the
# executor reads, and the education_cohort_members.profile_id row verbatim.
$PSQL >/dev/null <<'SQL'
create table public.privacy_erasure_registry_v3 (
  schema_name text not null default 'public', table_name text not null, column_name text not null,
  parent text, treatment text not null, scrub_columns text[], note text not null,
  updated_at timestamptz not null default now(), primary key (schema_name, table_name, column_name));
insert into public.privacy_erasure_registry_v3 (schema_name, table_name, column_name, parent, treatment, scrub_columns, note) values
  ('public', 'education_cohort_members', 'profile_id', 'profiles', 'sever_sentinel', null, 'FK cascades on the live schema; v3 severs the row to the sentinel BEFORE the account delete so the cascade finds nothing (explicit decision, not an accident)');
insert into public.profiles values ('00000000-0000-0000-0000-00000000dead');
SQL

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
refused() { # name actual — any refusal (not_manager / permission denied / request_row_use_decide …), never success
  case "$2" in
    ""|requested|accepted|declined) FAIL=$((FAIL+1)); echo "  FAIL $1 — was ALLOWED [$2]";;
    *) PASS=$((PASS+1)); echo "  ok   $1 ($2)";;
  esac
}
OBJ="select md5(pg_get_functiondef('public.set_education_cohort_member_v1(uuid,uuid,text)'::regprocedure));"
DECFN="select md5(pg_get_functiondef('public.decide_education_cohort_join_v1(uuid,uuid,text)'::regprocedure));"
POL="select pg_get_expr(polqual, polrelid) from pg_policy where polname = 'education_cohort_members_select';"
BEFORE_OBJ="$(q '' postgres "$OBJ")"

$PSQL >/dev/null <<SQL
insert into profiles values ('$MGR'), ('$OWNER'), ('$ADMINM'), ('$EXTENG'), ('$EXTMEM'), ('$OTHERMGR'), ('$WRONGMEM'), ('$WRONGEMP'),
  ('$REQ'), ('$DEC'), ('$WD'), ('$PLAIN');
insert into organizations values ('$ORG', 'QA Institution', null, null), ('$ORG2', 'Other Institution', null, null);
insert into relationship_types values ('member') on conflict do nothing;
insert into engagement_contexts (profile_id, organization_id, relationship_slug, hash_self) values
  ('$MGR', '$ORG', 'manager', 'x'), ('$EXTENG', '$ORG', 'external_manager', 'x'),
  ('$OTHERMGR', '$ORG2', 'manager', 'x'), ('$WRONGEMP', '$ORG', 'employee', 'x'),
  ('$REQ', '$ORG', 'student', 'x'), ('$DEC', '$ORG', 'student', 'x'), ('$WD', '$ORG', 'student', 'x'), ('$PLAIN', '$ORG', 'student', 'x');
insert into company_memberships (profile_id, organization_id, role) values
  ('$OWNER', '$ORG', 'owner'), ('$ADMINM', '$ORG', 'admin'), ('$EXTMEM', '$ORG', 'external_manager'), ('$WRONGMEM', '$ORG', 'member');
insert into education_programs (id, organization_id, name) values ('$PROG', '$ORG', 'Tiling programme');
insert into education_cohorts (id, program_id, organization_id, name, join_requests_open) values
  ('$COH', '$PROG', '$ORG', 'Group A', true), ('$COH2', '$PROG', '$ORG', 'Group B', false), ('$COH3', '$PROG', '$ORG', 'Group C', false);
insert into education_cohort_members (cohort_id, profile_id, status, requested_at, request_label, request_note) values
  ('$COH', '$REQ', 'requested', now(), 'Typed Req', 'note req'),
  ('$COH', '$DEC', 'declined',  now(), 'Typed Dec', 'note dec'),
  ('$COH', '$WD',  'withdrawn', now(), 'Typed Wd',  'note wd');
SQL

echo "== BEFORE the fix — both gaps reproduced"
check "gap 1: an external manager flips a requested row to active" "" "$(q $EXTENG authenticated "select set_education_cohort_member_v1('$COH','$REQ','active');")"
check "gap 2: ... and reads the learner-typed text on the now-active row" "active|Typed Req|note req" "$(q $EXTMEM authenticated "select status, request_label, request_note from education_cohort_members where profile_id='$REQ';")"
$PSQL -c "update education_cohort_members set status='requested' where profile_id='$REQ';" >/dev/null

$PSQL -f "$MIG" >/dev/null || { echo "migration failed to apply"; exit 1; }
AUDIT0="$(q '' postgres "select count(*) from audit_logs;")"

echo "== negative: no authority over the institution (condition 5)"
for X in $NEG; do
  refused "$X: set_member on a linked learner"     "$(q $X authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','active');")"
  refused "$X: set_member on a request row"        "$(q $X authenticated "select set_education_cohort_member_v1('$COH','$REQ','active');")"
  refused "$X: accept"                             "$(q $X authenticated "select decide_education_cohort_join_v1('$COH','$REQ','accept');")"
  refused "$X: decline"                            "$(q $X authenticated "select decide_education_cohort_join_v1('$COH','$REQ','decline');")"
  refused "$X: open/close"                         "$(q $X authenticated "select set_education_cohort_join_requests_v1('$COH', false);")"
  refused "$X: archive"                            "$(q $X authenticated "select archive_education_cohort_v1('$COH');")"
  check   "$X: reads no membership row"            "0" "$(q $X authenticated "select count(*) from education_cohort_members;")"
  check   "$X: reads no learner-typed text"        "0" "$(q $X authenticated "select count(*) from education_cohort_members where request_label is not null or request_note is not null;")"
done
refused "anon: set_member"  "$(q '' anon "select set_education_cohort_member_v1('$COH','$PLAIN','active');")"
refused "anon: accept"      "$(q '' anon "select decide_education_cohort_join_v1('$COH','$REQ','accept');")"
refused "anon: open/close"  "$(q '' anon "select set_education_cohort_join_requests_v1('$COH', false);")"
refused "anon: archive"     "$(q '' anon "select archive_education_cohort_v1('$COH');")"
refused "anon: read rows"   "$(q '' anon "select count(*) from education_cohort_members;")"
refused "a learner cannot accept their own request" "$(q $REQ authenticated "select decide_education_cohort_join_v1('$COH','$REQ','accept');")"
refused "a learner cannot set their own membership" "$(q $REQ authenticated "select set_education_cohort_member_v1('$COH','$REQ','active');")"
check "every row unchanged after all refusals" "declined|requested|withdrawn" "$(q '' postgres "select string_agg(status, '|' order by status) from education_cohort_members;")"
check "no refusal wrote an audit row" "$AUDIT0" "$(q '' postgres "select count(*) from audit_logs;")"

echo "== request rows go only through decide / withdraw / archive (condition 1)"
for X in $MGR $OWNER $ADMINM; do
  for P in $REQ $DEC $WD; do
    check "internal $X cannot set_member $P" "request_row_use_decide" "$(q $X authenticated "select set_education_cohort_member_v1('$COH','$P','left');")"
  done
done

echo "== positive: the institution's own people and the learner (condition 6)"
check "learner reads own request row with own text" "requested|Typed Req|note req" "$(q $REQ authenticated "select status, request_label, request_note from education_cohort_members;")"
check "internal manager (engagement) reads the request text" "Typed Req|note req" "$(q $MGR authenticated "select request_label, request_note from education_cohort_members where profile_id='$REQ';")"
check "internal owner (membership) reads all three request rows" "3" "$(q $OWNER authenticated "select count(*) from education_cohort_members;")"
check "internal admin (membership) accepts" "accepted" "$(q $ADMINM authenticated "select decide_education_cohort_join_v1('$COH','$REQ','accept');")"
check "internal owner adds a linked learner" "" "$(q $OWNER authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','active');")"
check "internal manager ends that membership" "" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','left');")"
check "... and re-activates it" "" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','active');")"
check "member state after the internal writes" "active|t" "$(q '' postgres "select status, left_at is null from education_cohort_members where profile_id='$PLAIN';")"
check "unlinked learner still refused" "not_a_linked_learner" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$OWNER','active');")"
check "invalid status still refused" "invalid_status" "$(q $MGR authenticated "select set_education_cohort_member_v1('$COH','$PLAIN','requested');")"
check "internal manager can still close the group" "" "$(q $MGR authenticated "select set_education_cohort_join_requests_v1('$COH', false);")"
check "internal owner (membership) opens group B" "" "$(q $OWNER authenticated "select set_education_cohort_join_requests_v1('$COH2', true);")"
check "internal admin (membership) closes group B" "" "$(q $ADMINM authenticated "select set_education_cohort_join_requests_v1('$COH2', false);")"
check "internal owner (membership) archives group B" "" "$(q $OWNER authenticated "select archive_education_cohort_v1('$COH2');")"
check "internal admin (membership) archives group C" "" "$(q $ADMINM authenticated "select archive_education_cohort_v1('$COH3');")"
check "open/close + archive audit bases for owner and admin" "membership:admin,membership:owner|membership:admin,membership:owner" "$(q '' postgres "select (select string_agg(distinct payload->>'authority_basis', ',') from audit_logs where action='education_cohort_join_requests_set_v1' and entity_id='$COH2'), (select string_agg(payload->>'authority_basis', ',' order by payload->>'authority_basis') from audit_logs where action='education_cohort_archived_v1');")"
check "the learner reads their own active row" "active" "$(q $REQ authenticated "select status from education_cohort_members;")"
check "the learner reads no other learner's row" "1" "$(q $REQ authenticated "select count(*) from education_cohort_members;")"

echo "== nothing destroyed, everything traceable (condition 4)"
check "accept KEPT the learner's own request text" "active|Typed Req|note req" "$(q '' postgres "select status, request_label, request_note from education_cohort_members where profile_id='$REQ';")"
check "... readable to the learner" "Typed Req|note req" "$(q $REQ authenticated "select request_label, request_note from education_cohort_members;")"
check "... never to an external manager" "0" "$(q $EXTMEM authenticated "select count(*) from education_cohort_members where profile_id='$REQ';")"
check "declined / withdrawn rows keep their text" "2" "$(q '' postgres "select count(*) from education_cohort_members where status in ('declined','withdrawn') and request_label is not null and request_note is not null;")"
check "set_member writes an audit row with actor and basis" "3|membership:owner,engagement:manager,engagement:manager" "$(q '' postgres "select count(*), string_agg(payload->>'authority_basis', ',' order by occurred_at, (payload->>'authority_basis') desc) from audit_logs where action='education_cohort_member_set_v1';")"
check "accept audit row: actor + basis, no learner text" "t|membership:admin|f" "$(q '' postgres "select actor_id='$ADMINM', payload->>'authority_basis', payload::text like '%Typed%' from audit_logs where action='education_cohort_join_accepted_v1';")"
check "no audit row was removed" "t" "$(q '' postgres "select count(*) >= $AUDIT0 + 5 from audit_logs;")"

echo "== erasure rewrites the erased person's typed text, keeps the row (condition 4)"
check "registry row now scrubs request_label and request_note" "{request_label,request_note}|sever_sentinel" "$(q '' postgres "select scrub_columns, treatment from privacy_erasure_registry_v3 where table_name='education_cohort_members' and column_name='profile_id';")"
# the executor's severing statement, built exactly as erase_user_account_v3 (c) builds it
$PSQL >/dev/null <<SQL
do \$\$ declare r record; c text; v_sets text := ''; begin
  select * into r from public.privacy_erasure_registry_v3 where table_name='education_cohort_members' and column_name='profile_id';
  for c in select unnest(coalesce(r.scrub_columns, '{}'::text[])) loop v_sets := v_sets || format(', %I = null', c); end loop;
  execute format('update %s set %I = \$2%s where %I = \$1', 'public.education_cohort_members', r.column_name, v_sets, r.column_name)
    using '$REQ'::uuid, '$SENTINEL'::uuid;
end \$\$;
SQL
check "erased person's row kept, severed to the sentinel" "1|active" "$(q '' postgres "select count(*), max(status) from education_cohort_members where profile_id='$SENTINEL';")"
check "... with the typed name and note rewritten" "t|t" "$(q '' postgres "select request_label is null, request_note is null from education_cohort_members where profile_id='$SENTINEL';")"
check "... and no other row touched" "2" "$(q '' postgres "select count(*) from education_cohort_members where request_label is not null and status in ('declined','withdrawn');")"

echo "== no alternative path (condition 3)"
check "client-executable definer functions touching the membership table are exactly the known set" \
  "archive_education_cohort_v1,decide_education_cohort_join_v1,is_active_cohort_member_v1,is_active_program_member_v1,list_open_education_cohorts_v1,request_education_cohort_join_v1,set_education_cohort_member_v1,withdraw_education_cohort_join_v1" \
  "$(q '' postgres "select string_agg(proname, ',' order by proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.prosecdef and p.prosrc ilike '%education_cohort_members%' and has_function_privilege('authenticated', p.oid, 'execute');")"
check "every membership WRITER among them uses the decider basis or is the learner's own row" "0" \
  "$(q '' postgres "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prosrc ~* '(insert into|update)\s+public\.education_cohort_members' and has_function_privilege('authenticated', p.oid, 'execute') and p.prosrc not like '%education_cohort_decider_basis_v1%' and p.prosrc not like '%profile_id = v_uid%' and p.prosrc not like '%v_uid, ''requested''%';")"
check "authenticated holds no INSERT/UPDATE/DELETE on the membership table" "f|f|f" "$(q '' postgres "select has_table_privilege('authenticated','public.education_cohort_members','insert'), has_table_privilege('authenticated','public.education_cohort_members','update'), has_table_privilege('authenticated','public.education_cohort_members','delete');")"
check "anon holds no SELECT on the membership table" "f" "$(q '' postgres "select has_table_privilege('anon','public.education_cohort_members','select');")"
check "the membership table has exactly one policy (select)" "education_cohort_members_select:r" "$(q '' postgres "select string_agg(polname || ':' || polcmd::text, ',') from pg_policy where polrelid = 'public.education_cohort_members'::regclass;")"

echo "== rollback"
AFTER_POL="$(q '' postgres "$POL")"
AFTER_DEC="$(q '' postgres "$DECFN")"
TEXT_BEFORE_DOWN="$(q '' postgres "select count(*) from education_cohort_members where request_label is not null;")"
check "rollback applies" "ok" "$($PSQL -f "$DOWN" >/dev/null 2>&1 && echo ok)"
check "member command restored exactly (md5)" "$BEFORE_OBJ" "$(q '' postgres "$OBJ")"
check "the non-destructive decide is KEPT by the rollback" "$AFTER_DEC" "$(q '' postgres "$DECFN")"
check "... so an accept after the rollback still keeps the learner's text" "accepted|Typed Wd" "$(q '' postgres "update education_cohort_members set status='requested' where profile_id='$WD';" >/dev/null; q $MGR authenticated "select decide_education_cohort_join_v1('$COH','$WD','accept');")|$(q '' postgres "select request_label from education_cohort_members where profile_id='$WD';")"
check "the tightened select policy is KEPT by the rollback" "$AFTER_POL" "$(q '' postgres "$POL")"
check "an external manager still reads no row after the rollback" "0" "$(q $EXTMEM authenticated "select count(*) from education_cohort_members;")"
check "the erasure scrub is KEPT by the rollback" "{request_label,request_note}" "$(q '' postgres "select scrub_columns from privacy_erasure_registry_v3 where table_name='education_cohort_members' and column_name='profile_id';")"
check "the rollback nulled no request text" "$TEXT_BEFORE_DOWN" "$(q '' postgres "select count(*) from education_cohort_members where request_label is not null;")"
check "rows and audit history untouched by the rollback" "t" "$(q '' postgres "select count(*) >= $AUDIT0 + 5 from audit_logs;")"
check "migration re-applies after rollback" "ok" "$($PSQL -f "$MIG" >/dev/null 2>&1 && echo ok)"

echo "== $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
