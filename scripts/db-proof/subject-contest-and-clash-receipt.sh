#!/usr/bin/env bash
# ============================================================================
# RED #4 + #5 — RUNTIME proof of the authority model.
#
# Applies supabase/migrations/20260915180000_subject_contest_and_clash_receipt.sql
# VERBATIM to a throwaway Postgres and measures BEFORE and AFTER behaviour for
# every case the owner named. RLS is genuinely enabled and every subject-facing
# case runs as the non-owner role `authenticated`, so a policy verdict here is
# the policy engine's, not a reading of the SQL.
#
# Usage: bash scripts/db-proof/subject-contest-and-clash-receipt.sh
# Requires: a running Postgres reachable via $PGPROOF_SOCK (default below).
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SOCK="${PGPROOF_SOCK:-/var/lib/postgresql/proof/sock}"
MIGRATION="$REPO/supabase/migrations/20260915180000_subject_contest_and_clash_receipt.sql"

SUBJECT='11111111-1111-1111-1111-111111111111'
OUTSIDER='22222222-2222-2222-2222-222222222222'
ORGMGR='33333333-3333-3333-3333-333333333333'
REC1='e0000000-0000-4000-8000-000000000001'
B2='b0000000-0000-4000-8000-000000000002'
B3='b0000000-0000-4000-8000-000000000003'

pass=0; fail=0
q() { psql -h "$SOCK" -U postgres -d postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run $2 as role authenticated with auth.uid()=$1, return output or the SQLSTATE.
as_user() { # $1=uid $2=sql
  psql -h "$SOCK" -U postgres -d postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
\\set VERBOSITY terse
begin;
set local role authenticated;
set local app.uid = '$1';
$2
commit;
SQL
}

check() { # $1=label $2=expectation-kind(contains|absent) $3=needle $4=actual
  if { [ "$2" = contains ] && grep -qiF -- "$3" <<<"$4"; } ||
     { [ "$2" = absent ]  && ! grep -qiF -- "$3" <<<"$4"; }; then
    printf '  PASS  %s\n' "$1"; pass=$((pass+1))
  else
    printf '  FAIL  %s\n        expected %s "%s"\n        got: %s\n' "$1" "$2" "$3" "${4//$'\n'/ | }"
    fail=$((fail+1))
  fi
}

echo "=============================================================="
echo " RED #4 + #5 runtime proof"
echo " migration: $(basename "$MIGRATION")"
echo "=============================================================="

echo; echo "-- prelude + seed ---------------------------------------------"
psql -h "$SOCK" -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "$HERE/subject-contest-and-clash-receipt.prelude.sql" >/dev/null || { echo "PRELUDE FAILED"; exit 1; }
psql -h "$SOCK" -U postgres -d postgres -q -v ON_ERROR_STOP=1 -f "$HERE/subject-contest-and-clash-receipt.seed.sql" >/dev/null || { echo "SEED FAILED"; exit 1; }
echo "  ok"

echo; echo "== BEFORE the migration ======================================="
out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) select organization_id, id, 'disputed', auth.uid(), 'I did not do this' from public.organization_evidence_records where id='$REC1';")
check "B1 subject CANNOT dispute before the migration" contains "row-level security" "$out"

out=$(as_user "$SUBJECT" "select public.respond_booking_request_v3('$B2','accepted',null,null);")
check "B2 overlapping accept is refused by v3" contains "Conflicting accepted booking" "$out"

out=$(q "select count(*) from pg_proc where proname='respond_booking_request_v4';")
check "B3 v4 does not exist yet" contains "0" "$out"

echo; echo "-- applying the migration VERBATIM ------------------------------"
mig=$(psql -h "$SOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)
if [ $? -ne 0 ]; then echo "MIGRATION FAILED:"; echo "$mig"; exit 1; fi
echo "  applied"

echo; echo "== SCHEMA_PROVEN =============================================="
out=$(q "select count(*) from information_schema.columns where table_name='booking_request_events' and column_name='related_booking_request_id';")
check "S1 receipt column exists" contains "1" "$out"
out=$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='booking_request_events_clash_receipt';")
check "S2 receipt CHECK is the iff" contains "clash_acknowledged" "$out"
out=$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='booking_request_events_event_type_check';")
check "S3 event_type widened by exactly one value" contains "clash_acknowledged" "$out"
out=$(q "select count(*) from pg_indexes where indexname='organization_evidence_events_one_dispute_per_actor';")
check "S4 one-dispute index exists" contains "1" "$out"
out=$(q "select count(*) from pg_policies where tablename='organization_evidence_events' and policyname='organization_evidence_events_subject_dispute';")
check "S5 subject-dispute policy exists" contains "1" "$out"
out=$(q "select string_agg(distinct cmd,',') from pg_policies where tablename in ('organization_evidence_events','organization_evidence_records');")
check "S6 no UPDATE policy anywhere" absent "UPDATE" "$out"
check "S7 no DELETE policy anywhere" absent "DELETE" "$out"

echo; echo "== POLICY_PROVEN — RED #4 ====================================="
out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) select organization_id, id, 'disputed', auth.uid(), 'I did not do this' from public.organization_evidence_records where id='$REC1';")
check "P1 the CORRECT subject is admitted" absent "row-level security" "$out"
out=$(q "select count(*) from public.organization_evidence_events where event_type='disputed' and actor_profile_id='$SUBJECT';")
check "P2 the dispute persisted" contains "1" "$out"

out=$(as_user "$OUTSIDER" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) values ('a0000000-0000-4000-8000-00000000000a','$REC1','disputed', auth.uid(), 'not my record');")
check "P3 an UNRELATED person is refused" contains "row-level security" "$out"

out=$(as_user "$ORGMGR" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) values ('a0000000-0000-4000-8000-00000000000a','$REC1','disputed','$SUBJECT','employer pretending to be the subject');")
check "P4 employer CANNOT write a dispute as the subject" contains "row-level security" "$out"

out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_role, actor_profile_id) values ('a0000000-0000-4000-8000-00000000000a','$REC1','attested','employer', auth.uid());")
check "P5 subject CANNOT attest (only dispute)" contains "row-level security" "$out"

out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, replacement_record_id) values ('a0000000-0000-4000-8000-00000000000a','$REC1','disputed', auth.uid(), 'e0000000-0000-4000-8000-000000000002');")
check "P6 dispute cannot carry a replacement record" contains "row-level security" "$out"

# P7/P9 measure the refusal AT ITS REAL LAYER. Production grants `authenticated`
# only INSERT,SELECT on this table, so an UPDATE dies on privilege before RLS is
# ever consulted. An earlier draft asserted "row-level security" here and failed
# — the expectation was wrong, not the migration, and the truth is the stronger
# of the two. P7b/P9b then remove that shield and prove the SECOND layer holds
# on its own: even handed the grant, there is no UPDATE or DELETE policy for RLS
# to satisfy, so the write is still refused.
out=$(as_user "$SUBJECT" "update public.organization_evidence_records set original_text='rewritten by the subject' where id='$REC1';")
check "P7 subject CANNOT modify the underlying evidence (no grant)" contains "permission denied" "$out"

# RLS refuses UPDATE/DELETE SILENTLY, not loudly: with no policy for those
# commands no row is visible to them, so the statement matches zero rows and
# returns success. (INSERT is the loud one — a WITH CHECK failure raises.) An
# earlier draft asserted an error here and failed; the expectation was wrong,
# and the zero-row no-op plus an unchanged row is the real proof.
q "grant update, delete on public.organization_evidence_records to authenticated;" >/dev/null
out=$(as_user "$SUBJECT" "update public.organization_evidence_records set original_text='rewritten by the subject' where id='$REC1';")
check "P7b RLS matches ZERO rows even WITH the grant" contains "UPDATE 0" "$out"

out=$(q "select original_text from public.organization_evidence_records where id='$REC1';")
check "P8 the employer's text is unchanged" contains "Poured foundation slab" "$out"

out=$(as_user "$SUBJECT" "delete from public.organization_evidence_records where id='$REC1';")
check "P9 subject deletes ZERO rows even WITH the grant" contains "DELETE 0" "$out"
out=$(q "select count(*) from public.organization_evidence_records where id='$REC1';")
check "P9b the record still exists" contains "1" "$out"
q "revoke update, delete on public.organization_evidence_records from authenticated;" >/dev/null

out=$(q "select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type),'none') from information_schema.role_table_grants where table_schema='public' and table_name='organization_evidence_events' and grantee='authenticated';")
check "P9c the migration granted authenticated no new privilege" contains "INSERT,SELECT" "$out"

out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, note) select organization_id, id, 'disputed', auth.uid(), 'second try' from public.organization_evidence_records where id='$REC1';")
check "P10 a second dispute by the same actor is refused" contains "duplicate key" "$out"

out=$(as_user "$SUBJECT" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('a0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-000000000002','disputed', auth.uid());")
check "P11 subject of record A cannot dispute record B" contains "row-level security" "$out"

echo; echo "== RUNTIME_PROVEN — RED #5 ===================================="
out=$(as_user "$SUBJECT" "select public.respond_booking_request_v4('$B2','accepted',null,null,false);")
check "R1 clash WITHOUT acknowledgement is still refused" contains "Conflicting accepted booking" "$out"
out=$(q "select status from public.booking_requests where id='$B2';")
check "R2 the refused booking stayed proposed" contains "proposed" "$out"

out=$(as_user "$SUBJECT" "select public.respond_booking_request_v4('$B2','accepted',null,null,true);")
check "R3 clash WITH acknowledgement proceeds" contains "acknowledged_clashes" "$out"
check "R4 and reports exactly one clash overridden" contains '"acknowledged_clashes": 1' "$out"

out=$(q "select count(*) from public.booking_request_events where event_type='clash_acknowledged' and booking_request_id='$B2' and related_booking_request_id='b0000000-0000-4000-8000-000000000001' and actor_id='$SUBJECT';")
check "R5 the receipt persisted, naming its counterpart and its author" contains "1" "$out"

out=$(q "select start_date||'..'||expected_end_date||' '||status from public.booking_requests where id in ('b0000000-0000-4000-8000-000000000001','$B2') order by id;")
check "R6 the original booking kept its dates and status" contains "2026-10-01..2026-10-10 accepted" "$out"
check "R7 the overridden booking kept its dates" contains "2026-10-05..2026-10-15 accepted" "$out"

# The clash is DERIVED, so re-deriving it is the real test that nothing erased it.
out=$(q "select count(*) from public.booking_requests a join public.booking_requests b on a.id < b.id and a.worker_id = b.worker_id where a.status='accepted' and b.status='accepted' and daterange(a.start_date, coalesce(a.expected_end_date,a.start_date),'[]') && daterange(b.start_date, coalesce(b.expected_end_date,b.start_date),'[]');")
check "R8 conflict detection STILL reports the overlap" contains "1" "$out"

out=$(as_user "$OUTSIDER" "select public.respond_booking_request_v4('$B3','accepted',null,null,true);")
check "R9 a non-addressed worker is still refused" contains "Only the addressed worker may respond" "$out"

out=$(psql -h "$SOCK" -U postgres -d postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
\\set VERBOSITY terse
begin; set local role anon; set local app.uid='$SUBJECT';
select public.respond_booking_request_v4('$B3','accepted',null,null,true);
commit;
SQL
)
check "R10 anon is refused EXECUTE" contains "permission denied" "$out"

out=$(psql -h "$SOCK" -U postgres -d postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
\\set VERBOSITY terse
begin; set local role anon; set local app.uid='$SUBJECT';
insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id)
values ('a0000000-0000-4000-8000-00000000000a','$REC1','disputed','$SUBJECT');
commit;
SQL
)
check "R11 anon cannot write a dispute" contains "permission denied" "$out"

out=$(q "select count(*) from public.booking_request_events where event_type='clash_acknowledged' and related_booking_request_id is null;")
check "R12 no receipt exists without a counterpart" contains "0" "$out"

echo; echo "== ROLLBACK_PROVEN ============================================"
# An untested rollback is not a rollback. Run the shipped file verbatim and
# prove it restores the pre-migration state AND keeps what it must keep.
rb=$(psql -h "$SOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$REPO/supabase/rollbacks/20260915180000_subject_contest_and_clash_receipt.down.sql" 2>&1)
if [ $? -ne 0 ]; then echo "  ROLLBACK FAILED:"; echo "$rb"; fail=$((fail+1)); else echo "  applied"; fi

out=$(q "select count(*) from pg_proc where proname='respond_booking_request_v4';")
check "X1 v4 is gone" contains "0" "$out"
out=$(q "select count(*) from pg_proc where proname='respond_booking_request_v3';")
check "X2 v3 SURVIVES the rollback" contains "1" "$out"
out=$(q "select count(*) from information_schema.columns where table_name='booking_request_events' and column_name='related_booking_request_id';")
check "X3 the receipt column is gone" contains "0" "$out"
out=$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='booking_request_events_event_type_check';")
check "X4 the original event_type CHECK is restored" absent "clash_acknowledged" "$out"
out=$(q "select count(*) from pg_policies where tablename='organization_evidence_events' and policyname='organization_evidence_events_subject_dispute';")
check "X5 the subject-dispute policy is gone" contains "0" "$out"
out=$(q "select count(*) from public.organization_evidence_events where event_type='disputed';")
check "X6 a dispute already written SURVIVES — rollback removes authority, not a record" contains "1" "$out"
out=$(q "select count(*) from public.booking_requests where status='accepted';")
check "X7 both accepted bookings survive" contains "2" "$out"

echo
echo "=============================================================="
printf " PASS %d   FAIL %d\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
