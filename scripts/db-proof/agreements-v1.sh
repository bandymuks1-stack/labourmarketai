#!/usr/bin/env bash
# ============================================================================
# AGREEMENT & RIGHTS ENGINE v1 — REAL per-role behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (document-file-layer prelude + agreements prelude supplement + seeds),
# then executes the ACTUAL files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql   (dependency)
#   supabase/migrations/20260817140000_document_file_layer_v1.sql (dependency)
#   supabase/migrations/20260817200000_agreements_v1.sql
#   supabase/rollbacks/20260817200000_agreements_v1.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / owner / admin / manager / member /
#     responsible / engagement-truth / revoked / wrong-org / attacker /
#     platform admin) on every command and on RLS reads;
#   * the honest status machine (record-keeping transitions only; no path
#     into 'submitted_for_approval' except the real workflow mirror);
#   * append-only amendments + events (trigger-enforced even against the
#     superuser); base document pointer never rewritten by amending;
#   * cross-org attach rejection (documents, evidence files, amendments);
#   * signature evidence: separate explicit field pair, constraint-shaped;
#   * the workflow round trip: start (engine RPC) → submit mirror → decide
#     (engine RPC) → sync read-repair (approved and rejected paths);
#   * rollback → re-apply at 0 rows, and rollback REFUSAL once rows exist.
#
# Every probe runs under `set local role authenticated` (or `anon`), never
# as the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/agreements-v1.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-agreements-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG_WORKFLOW="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIG_DOCS="$REPO/supabase/migrations/20260817140000_document_file_layer_v1.sql"
MIGRATION="$REPO/supabase/migrations/20260817200000_agreements_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817200000_agreements_v1.down.sql"

O_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
O_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
OWNER='11111111-1111-4111-8111-111111111111'
ADMIN='22222222-2222-4222-8222-222222222222'
MEMBER='33333333-3333-4333-8333-333333333333'
MANAGER='44444444-4444-4444-8444-444444444444'
OUTSIDER='55555555-5555-4555-8555-555555555555'
WORKER_ROW='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PLATFORM='77777777-7777-4777-8777-777777777777'
ENG='88888888-8888-4888-8888-888888888888'
REVOKED='99999999-9999-4999-8999-999999999999'
NOONE='a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
DOC_A='d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0'
DOC_B='d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'
FILE_A='f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0'
FILE_B='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
DEF_AG='e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql [$4=is_admin]
as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
set local app.is_admin = '${4:-false}';
$3
commit;
SQL
}

# Collapse a probe result to a single comparable token.
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

create_as() { # $1=actor $2=type $3=title [$4=worker] [$5=responsible]
  as authenticated "$1" "select public.create_agreement_v1('$O_A', '$2', '$3', 'Acme Counterparty UAB', null, ${4:-null}, ${5:-null}, null, null, null);" | tok
}
ag_id() { q "select id from public.agreements where title = '$1' limit 1;"; }
ag_status() { q "select status from public.agreements where id = '$1';"; }

echo "=============================================================="
echo " AGREEMENT & RIGHTS ENGINE v1 — behavioural proof"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/document-file-layer.prelude.sql" >/dev/null || { echo "doc prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/agreements-v1.prelude.sql" >/dev/null || { echo "agreements prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/document-file-layer.seed.sql" >/dev/null || { echo "doc seed failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/agreements-v1.seed.sql" >/dev/null || { echo "agreements seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- BEFORE: the register does not exist ---"
check "agreements absent before apply" "" "$(q "select to_regclass('public.agreements');")"

echo
echo "--- APPLYING dependencies + $(basename "$MIGRATION") verbatim ---"
for f in "$MIG_WORKFLOW" "$MIG_DOCS" "$MIGRATION"; do
  APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$f" 2>&1)
  if echo "$APPLY_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION $(basename "$f") FAILED"; exit 1; fi
  echo "  applied $(basename "$f")"
done

echo
echo "--- R0. rollback -> re-apply round trip at 0 rows ---"
ROLL_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$ROLL_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "rollback removes the register"  "" "$(q "select to_regclass('public.agreements');")"
check "rollback leaves org_documents"  "org_documents" "$(q "select to_regclass('public.org_documents');")"
check "rollback leaves workflow"       "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"
REAPPLY=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$REAPPLY" | grep -qiE 'ERROR|FATAL'; then echo "$REAPPLY" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "re-apply restores the register" "agreements" "$(q "select to_regclass('public.agreements');")"

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/agreements-v1.seed2.sql" >/dev/null || { echo "seed2 failed"; exit 1; }

echo
echo "--- A. create authority (org governance owner/admin only) ---"
check "anon is refused outright"      "DENIED"      "$(as anon '' "select public.create_agreement_v1('$O_A','service','X','Y',null,null,null,null,null,null);" | tok)"
check "member cannot create"          "not_allowed" "$(create_as "$MEMBER" service 'M try')"
check "manager cannot create"         "not_allowed" "$(create_as "$MANAGER" service 'Mgr try')"
check "engagement-truth cannot create" "not_allowed" "$(create_as "$ENG" service 'Eng try')"
check "revoked admin cannot create"   "not_allowed" "$(create_as "$REVOKED" service 'Rev try')"
check "wrong-org owner cannot create" "not_allowed" "$(create_as "$OUTSIDER" service 'Out try')"
check "attacker cannot create"        "not_allowed" "$(create_as "$NOONE" service 'No try')"
check "owner creates service record"  "created"     "$(create_as "$OWNER" service 'Service AG1')"
check "admin creates employment rec"  "created"     "$(create_as "$ADMIN" employment_related 'Employment AG2' "'$WORKER_ROW'")"
check "platform admin may create"     "created"     "$(as authenticated "$PLATFORM" "select public.create_agreement_v1('$O_A','nda','Platform AG3','Acme Counterparty UAB',null,null,null,null,null,null);" true | tok)"

echo
echo "--- B. validation bounds ---"
check "unknown type refused"          "invalid" "$(create_as "$OWNER" franchise 'Bad type')"
check "worker on non-employment type" "invalid" "$(create_as "$OWNER" service 'Bad worker' "'$WORKER_ROW'")"
check "garbage worker uuid refused"   "invalid" "$(create_as "$OWNER" employment_related 'Bad uuid' "'nonsense'")"
check "non-member responsible"        "invalid" "$(create_as "$OWNER" service 'Bad resp' null "'$OUTSIDER'")"
check "member responsible accepted"   "created" "$(create_as "$OWNER" service 'Resp AG4' null "'$MANAGER'")"
check "reversed dates refused"        "invalid" "$(as authenticated "$OWNER" "select public.create_agreement_v1('$O_A','service','Bad dates','C',null,null,null,'2026-09-01','2026-08-01',null);" | tok)"
check "short title refused"           "invalid" "$(create_as "$OWNER" service 'ab')"

AG1=$(ag_id 'Service AG1'); AG2=$(ag_id 'Employment AG2'); AG4=$(ag_id 'Resp AG4')

echo
echo "--- C. RLS reads (fail-closed) ---"
check "owner reads the register"      "4" "$(as authenticated "$OWNER" "select count(*) from public.agreements;" | tok)"
check "admin reads the register"      "4" "$(as authenticated "$ADMIN" "select count(*) from public.agreements;" | tok)"
check "platform admin reads all"      "4" "$(as authenticated "$PLATFORM" "select count(*) from public.agreements;" true | tok)"
check "responsible sees own row only" "1" "$(as authenticated "$MANAGER" "select count(*) from public.agreements;" | tok)"
check "plain member reads nothing"    "0" "$(as authenticated "$MEMBER" "select count(*) from public.agreements;" | tok)"
check "engagement-truth reads nothing" "0" "$(as authenticated "$ENG" "select count(*) from public.agreements;" | tok)"
check "revoked reads nothing"         "0" "$(as authenticated "$REVOKED" "select count(*) from public.agreements;" | tok)"
check "wrong-org owner reads nothing" "0" "$(as authenticated "$OUTSIDER" "select count(*) from public.agreements;" | tok)"
check "attacker reads nothing"        "0" "$(as authenticated "$NOONE" "select count(*) from public.agreements;" | tok)"
check "anon read denied"              "DENIED" "$(as anon '' "select count(*) from public.agreements;" | tok)"
check "events mirror parent visibility (member)" "0" "$(as authenticated "$MEMBER" "select count(*) from public.agreement_events;" | tok)"
check "events readable by admin"      "4" "$(as authenticated "$ADMIN" "select count(*) from public.agreement_events;" | tok)"

echo
echo "--- D. direct writes are revoked ---"
check "authenticated direct insert denied" "DENIED" "$(as authenticated "$OWNER" "insert into public.agreements (organization_id, agreement_type, title, counterparty_name, created_by) values ('$O_A','service','Direct','X','$OWNER');" | tok)"
check "authenticated direct update denied" "DENIED" "$(as authenticated "$OWNER" "update public.agreements set title = 'Hacked' where id = '$AG1';" | tok)"
check "authenticated direct delete denied" "DENIED" "$(as authenticated "$OWNER" "delete from public.agreements where id = '$AG1';" | tok)"

echo
echo "--- E. update command ---"
check "owner updates"                 "updated"   "$(as authenticated "$OWNER" "select public.update_agreement_v1('$AG1', 'Service AG1', 'Acme Counterparty UAB', '123456', null, '2026-08-01', '2026-12-31', 'REF-1');" | tok)"
check "member cannot update (no oracle)" "not_found" "$(as authenticated "$MEMBER" "select public.update_agreement_v1('$AG1', 'X title', 'Y', null, null, null, null, null);" | tok)"
check "wrong-org cannot update"       "not_found" "$(as authenticated "$OUTSIDER" "select public.update_agreement_v1('$AG1', 'X title', 'Y', null, null, null, null, null);" | tok)"

echo
echo "--- F. honest status machine ---"
check "draft -> active_record"        "updated" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG1', 'active_record');" | tok)"
check "draft -> expired refused"      "invalid_transition" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG2', 'expired');" | tok)"
check "no manual submitted_for_approval" "invalid" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG2', 'submitted_for_approval');" | tok)"
check "no legal-sounding status"      "invalid" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG2', 'signed');" | tok)"
check "AG4 draft -> active_record"    "updated" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG4', 'active_record');" | tok)"
check "active -> terminated_record"   "updated" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG4', 'terminated_record');" | tok)"
check "terminated event recorded"     "1" "$(q "select count(*) from public.agreement_events where agreement_id = '$AG4' and event_type = 'terminated';")"
check "terminated is not editable"    "not_editable" "$(as authenticated "$OWNER" "select public.update_agreement_v1('$AG4', 'New title', 'Y', null, null, null, null, null);" | tok)"

echo
echo "--- G. document attach (engine link, same org only) ---"
check "attach same-org document"      "attached" "$(as authenticated "$OWNER" "select public.attach_agreement_document_v1('$AG2', '$DOC_A');" | tok)"
check "cross-org document refused"    "invalid"  "$(as authenticated "$OWNER" "select public.attach_agreement_document_v1('$AG2', '$DOC_B');" | tok)"
check "attach on terminated refused"  "not_editable" "$(as authenticated "$OWNER" "select public.attach_agreement_document_v1('$AG4', '$DOC_A');" | tok)"
check "member cannot attach"          "not_found" "$(as authenticated "$MEMBER" "select public.attach_agreement_document_v1('$AG2', '$DOC_A');" | tok)"

echo
echo "--- H. signature EVIDENCE (separate, explicit, no legal claim) ---"
check "default signature_status none" "none" "$(q "select signature_status from public.agreements where id = '$AG1';")"
check "attach same-org evidence file" "evidence_attached" "$(as authenticated "$OWNER" "select public.attach_agreement_signature_evidence_v1('$AG1', '$FILE_A');" | tok)"
check "status flips to evidence-attached" "externally_signed_evidence_attached" "$(q "select signature_status from public.agreements where id = '$AG1';")"
check "record status did NOT change"  "active_record" "$(ag_status "$AG1")"
check "cross-org evidence refused"    "invalid" "$(as authenticated "$OWNER" "select public.attach_agreement_signature_evidence_v1('$AG2', '$FILE_B');" | tok)"
check "member cannot attach evidence" "not_found" "$(as authenticated "$MEMBER" "select public.attach_agreement_signature_evidence_v1('$AG1', '$FILE_A');" | tok)"

echo
echo "--- I. amendments (append-only history, base pointer untouched) ---"
check "amendment on draft refused"    "invalid_state" "$(as authenticated "$OWNER" "select public.add_agreement_amendment_v1('$AG2', 'Early amendment', null, null, null);" | tok)"
BASE_DOC_BEFORE=$(q "select current_document_id from public.agreements where id = '$AG1';")
check "amendment 1 appends"           "amended" "$(as authenticated "$OWNER" "select public.add_agreement_amendment_v1('$AG1', 'Rate change 2026', 'Updated rates.', '$DOC_A', '2026-10-01');" | tok)"
check "base status becomes amended"   "amended" "$(ag_status "$AG1")"
check "amendment 2 appends in order"  "amended" "$(as authenticated "$ADMIN" "select public.add_agreement_amendment_v1('$AG1', 'Scope extension', null, null, null);" | tok)"
check "sequences are 1|2"             "1|2" "$(q "select sequence from public.agreement_amendments where agreement_id = '$AG1' order by sequence;" | tr '\n' '|' | sed 's/|$//')"
check "base document pointer untouched" "$BASE_DOC_BEFORE" "$(q "select current_document_id from public.agreements where id = '$AG1';")"
check "cross-org amendment doc refused" "invalid" "$(as authenticated "$OWNER" "select public.add_agreement_amendment_v1('$AG1', 'Foreign doc', null, '$DOC_B', null);" | tok)"
check "amendment UPDATE blocked (superuser)" "DENIED" "$(q "update public.agreement_amendments set title = 'Rewritten' where agreement_id = '$AG1';" | tok)"
check "amendment DELETE blocked (superuser)" "DENIED" "$(q "delete from public.agreement_amendments where agreement_id = '$AG1';" | tok)"
check "event UPDATE blocked (superuser)"     "DENIED" "$(q "update public.agreement_events set event_type = 'created' where agreement_id = '$AG1';" | tok)"
check "event DELETE blocked (superuser)"     "DENIED" "$(q "delete from public.agreement_events where agreement_id = '$AG1';" | tok)"

echo
echo "--- J. workflow round trip (engine RPCs + mirror read-repair) ---"
check "submit without instance"       "no_pending_workflow" "$(as authenticated "$OWNER" "select public.submit_agreement_for_approval_v1('$AG2');" | tok)"
WF1=$(as authenticated "$OWNER" "select public.start_workflow_instance_v1('$DEF_AG', 'Approve Employment AG2', '{}'::jsonb, '$AG2');" | tok)
check "engine start returns instance" "UUID" "$(echo "$WF1" | uu)"
check "submit flips the mirror"       "submitted" "$(as authenticated "$OWNER" "select public.submit_agreement_for_approval_v1('$AG2');" | tok)"
check "mirror is submitted_for_approval" "submitted_for_approval" "$(ag_status "$AG2")"
check "sync while pending: unchanged" "unchanged" "$(as authenticated "$OWNER" "select public.sync_agreement_approval_v1('$AG2');" | tok)"
check "no manual exit from submitted" "invalid_transition" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG2', 'active_record');" | tok)"
check "approver decides via engine"   "approved" "$(as authenticated "$ADMIN" "select public.decide_workflow_step_v1('$WF1', 'approved', null);" | tok)"
check "member cannot sync (no view)"  "not_found" "$(as authenticated "$MEMBER" "select public.sync_agreement_approval_v1('$AG2');" | tok)"
check "sync repairs to approved_internally" "repaired_approved" "$(as authenticated "$OWNER" "select public.sync_agreement_approval_v1('$AG2');" | tok)"
check "mirror is approved_internally" "approved_internally" "$(ag_status "$AG2")"
check "approved_internally -> active" "updated" "$(as authenticated "$OWNER" "select public.set_agreement_status_v1('$AG2', 'active_record');" | tok)"

check "second record for reject path" "created" "$(create_as "$OWNER" supply 'Supply AG5')"
AG5=$(ag_id 'Supply AG5')
WF2=$(as authenticated "$OWNER" "select public.start_workflow_instance_v1('$DEF_AG', 'Approve Supply AG5', '{}'::jsonb, '$AG5');" | tok)
check "second instance starts"        "UUID" "$(echo "$WF2" | uu)"
check "second submit"                 "submitted" "$(as authenticated "$OWNER" "select public.submit_agreement_for_approval_v1('$AG5');" | tok)"
check "approver rejects via engine"   "rejected" "$(as authenticated "$ADMIN" "select public.decide_workflow_step_v1('$WF2', 'rejected', 'not ready');" | tok)"
check "sync returns record to draft"  "repaired_returned" "$(as authenticated "$OWNER" "select public.sync_agreement_approval_v1('$AG5');" | tok)"
check "mirror is draft again"         "draft" "$(ag_status "$AG5")"
check "sync is idempotent"            "unchanged" "$(as authenticated "$OWNER" "select public.sync_agreement_approval_v1('$AG5');" | tok)"

echo
echo "--- K. rollback REFUSES while real rows exist (0-row guard) ---"
ROLL_REFUSE=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=0 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL_REFUSE" | grep -q 'rollback refused'; then
  printf '  PASS  %-66s %s\n' "populated rollback refused" "refused"; pass=$((pass+1))
else
  printf '  FAIL  %-66s %s\n' "populated rollback refused" "did not refuse"; fail=$((fail+1))
fi
check "register survives refused rollback" "agreements" "$(q "select to_regclass('public.agreements');")"

echo
echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
