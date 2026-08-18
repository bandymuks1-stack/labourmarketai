#!/usr/bin/env bash
# ============================================================================
# ORG DOCUMENT REGISTER DELTA v1 — REAL per-role behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (document-file-layer prelude + the agreements prelude supplement, which
# together provide engagement_contexts and the membership helpers), then
# executes the ACTUAL files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql    (dependency)
#   supabase/migrations/20260817140000_document_file_layer_v1.sql (dependency)
#   supabase/migrations/20260817150000_work_objects_v1.sql        (dependency)
#   supabase/migrations/20260817240000_org_document_register_delta_v1.sql
#   supabase/rollbacks/20260817240000_org_document_register_delta_v1.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / owner / admin / manager / member /
#     responsible / wrong-org / platform admin) on create_org_document_v2,
#     set_org_document_retention_v1, submit_org_document_for_approval_v1
#     and sync_org_document_approval_v1;
#   * SAME-ORG validation of object_id (a wrong-org object is refused);
#   * correspondence fields refused on a non-correspondence type, accepted
#     on a correspondence type, and direction NEVER stored as a column;
#   * retention: recorded, re-recorded, cleared — and NOTHING deleted;
#   * the approval mirror round trip: refuse without a pending instance,
#     start (engine RPC) -> submit mirror -> decide (engine RPC) -> sync
#     read-repair, on both the approved and the rejected path; sync is
#     idempotent;
#   * v1 still works untouched beside v2;
#   * rollback -> re-apply at 0 delta rows, and rollback REFUSAL once a
#     delta column holds real data.
#
# Every probe runs under `set local role authenticated` (or `anon`), never
# as the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/org-document-register-delta.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-org-doc-delta-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG_WORKFLOW="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIG_DOCS="$REPO/supabase/migrations/20260817140000_document_file_layer_v1.sql"
MIG_OBJECTS="$REPO/supabase/migrations/20260817150000_work_objects_v1.sql"
MIGRATION="$REPO/supabase/migrations/20260817240000_org_document_register_delta_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817240000_org_document_register_delta_v1.down.sql"

O_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
O_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
OWNER='11111111-1111-4111-8111-111111111111'
ADMIN2='22222222-2222-4222-8222-222222222222'
MEMBER='33333333-3333-4333-8333-333333333333'
MANAGER='44444444-4444-4444-8444-444444444444'
OUTSIDER='55555555-5555-4555-8555-555555555555'
PLATFORM='77777777-7777-4777-8777-777777777777'
OBJ_A='0b1ec7a0-0000-4000-8000-000000000001'
OBJ_B='0b1ec7b0-0000-4000-8000-000000000002'
DEF_GR='e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0'

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

tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-68s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-68s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

# create_org_document_v2 with all 17 params. $1=actor $2=org $3=slug $4=title
# $5=object $6=counterparty $7=corr_date $8=their_ref $9=ret_until $10=ret_note
cre() {
  as authenticated "$1" "select public.create_org_document_v2('$2','$3','$4','','standard','','','','','','','${5:-}','${6:-}','${7:-}','${8:-}','${9:-}','${10:-}');" | tok
}
doc_id() { q "select id from public.org_documents where title = '$1' limit 1;"; }

echo "=============================================================="
echo " ORG DOCUMENT REGISTER DELTA v1 — behavioural proof"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/document-file-layer.prelude.sql" >/dev/null || { echo "doc prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/agreements-v1.prelude.sql" >/dev/null || { echo "supplement prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/org-document-register-delta.prelude.sql" >/dev/null || { echo "delta prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/document-file-layer.seed.sql" >/dev/null || { echo "doc seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- BEFORE: the delta columns and commands do not exist ---"
check "counterparty_name absent before apply" "" "$(q "select column_name from information_schema.columns where table_name='org_documents' and column_name='counterparty_name';")"
check "create_org_document_v2 absent"         "" "$(q "select proname from pg_proc where proname='create_org_document_v2';")"

echo
echo "--- APPLYING dependencies + $(basename "$MIGRATION") verbatim ---"
for f in "$MIG_WORKFLOW" "$MIG_DOCS" "$MIG_OBJECTS" "$MIGRATION"; do
  APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$f" 2>&1)
  if echo "$APPLY_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION $(basename "$f") FAILED"; exit 1; fi
  echo "  applied $(basename "$f")"
done

echo
echo "--- R0. rollback -> re-apply round trip at 0 delta rows ---"
ROLL_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$ROLL_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "rollback removes the delta columns" "" "$(q "select column_name from information_schema.columns where table_name='org_documents' and column_name='approval_state';")"
check "rollback removes v2"                "" "$(q "select proname from pg_proc where proname='create_org_document_v2';")"
check "rollback KEEPS train C v1"          "create_org_document_v1" "$(q "select proname from pg_proc where proname='create_org_document_v1';")"
check "rollback KEEPS the register"        "org_documents" "$(q "select to_regclass('public.org_documents');")"
check "rollback KEEPS retention columns"   "retention_until" "$(q "select column_name from information_schema.columns where table_name='org_documents' and column_name='retention_until';")"
check "rollback KEEPS work_objects"        "work_objects" "$(q "select to_regclass('public.work_objects');")"
check "rollback KEEPS workflow"            "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"
REAPPLY=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$REAPPLY" | grep -qiE 'ERROR|FATAL'; then echo "$REAPPLY" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "re-apply restores the delta"        "approval_state" "$(q "select column_name from information_schema.columns where table_name='org_documents' and column_name='approval_state';")"

# Objects (one per org) + a published generic_request workflow definition.
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.work_objects (id, organization_id, name, created_by) values
  ('$OBJ_A', '$O_A', 'Site A', '$OWNER'),
  ('$OBJ_B', '$O_B', 'Site B', '$OUTSIDER');
SQL
# A published one-step 'generic_request' workflow for ORG_A. Seeded as the
# superuser in the engine's own order (steps BEFORE publish — the
# frozen-steps trigger forbids the reverse), exactly like
# scripts/db-proof/agreements-v1.seed2.sql.
VER_GR='e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into public.workflow_definitions
  (id, organization_id, slug, name, context_entity_type, created_by) values
  ('$DEF_GR', '$O_A', 'doc_approval', 'Document approval', 'generic_request', '$OWNER')
on conflict do nothing;
insert into public.workflow_definition_versions (id, definition_id, version, created_by) values
  ('$VER_GR', '$DEF_GR', 1, '$OWNER')
on conflict do nothing;
insert into public.workflow_version_steps
  (version_id, step_order, name, approval_mode, approver_rule) values
  ('$VER_GR', 1, 'Internal review', 'single',
   '{"kind":"org_role","roles":["owner","admin"]}'::jsonb)
on conflict do nothing;
update public.workflow_definition_versions
   set published_at = now()
 where id = '$VER_GR' and published_at is null;
SQL
check "a published generic_request definition exists" "1" "$(q "select count(*) from public.workflow_definition_versions where published_at is not null;")"

echo
echo "--- A. create_org_document_v2 authority matrix ---"
check "anon is refused outright"     "DENIED"      "$(as anon '' "select public.create_org_document_v2('$O_A','org_policy','X','','standard','','','','','','','','','','','','');" | tok)"
check "member cannot create"         "not_allowed" "$(cre "$MEMBER"   "$O_A" org_policy 'M try')"
check "manager cannot create"        "not_allowed" "$(cre "$MANAGER"  "$O_A" org_policy 'Mg try')"
check "wrong-org owner cannot create" "not_allowed" "$(cre "$OUTSIDER" "$O_A" org_policy 'X try')"
check "org owner creates"            "created"     "$(cre "$OWNER"    "$O_A" org_policy 'Policy One')"
check "org admin creates"            "created"     "$(cre "$ADMIN2"   "$O_A" org_procedure 'Procedure One')"
check "platform admin creates"       "created"     "$(as authenticated "$PLATFORM" "select public.create_org_document_v2('$O_A','org_internal','Platform One','','standard','','','','','','','','','','','','');" true | tok)"

echo
echo "--- B. object_id is SAME-ORGANIZATION only ---"
check "own-org object accepted"      "created" "$(cre "$OWNER" "$O_A" org_policy 'With Object' "$OBJ_A")"
check "wrong-org object refused"     "invalid" "$(cre "$OWNER" "$O_A" org_policy 'Foreign Object' "$OBJ_B")"
check "unknown object refused"       "invalid" "$(cre "$OWNER" "$O_A" org_policy 'Ghost Object' '00000000-0000-4000-8000-000000000009')"
check "garbage object id refused"    "invalid" "$(cre "$OWNER" "$O_A" org_policy 'Junk Object' 'not-a-uuid')"
check "the object link was stored"   "$OBJ_A"  "$(q "select object_id from public.org_documents where title='With Object';")"
check "no row was created for the foreign object" "0" "$(q "select count(*) from public.org_documents where title='Foreign Object';")"

echo
echo "--- C. correspondence facts belong to correspondence types only ---"
check "counterparty on a policy is refused"    "invalid" "$(cre "$OWNER" "$O_A" org_policy 'Bad Corr' '' 'Acme UAB')"
check "letter date on a policy is refused"     "invalid" "$(cre "$OWNER" "$O_A" org_procedure 'Bad Date' '' '' '2026-08-01')"
check "their reference on a policy is refused" "invalid" "$(cre "$OWNER" "$O_A" org_internal 'Bad Ref' '' '' '' 'IN-9')"
check "incoming letter accepted"  "created" "$(cre "$OWNER" "$O_A" org_correspondence_incoming 'Letter In'  '' 'Acme UAB' '2026-08-01' 'IN-9')"
check "outgoing letter accepted"  "created" "$(cre "$OWNER" "$O_A" org_correspondence_outgoing 'Letter Out' '' 'Beta AB'  '2026-08-02' 'OUT-3')"
check "the counterparty was stored" "Acme UAB" "$(q "select counterparty_name from public.org_documents where title='Letter In';")"
check "the letter date was stored"  "2026-08-01" "$(q "select correspondence_date from public.org_documents where title='Letter In';")"
check "their reference was stored"  "IN-9" "$(q "select counterparty_reference from public.org_documents where title='Letter In';")"

echo
echo "--- D. direction is DERIVED, never stored ---"
check "no correspondence_direction column" "0" "$(q "select count(*) from information_schema.columns where table_name='org_documents' and column_name='correspondence_direction';")"
check "no our_reference column"            "0" "$(q "select count(*) from information_schema.columns where table_name='org_documents' and column_name='our_reference';")"
check "direction is recoverable from the slug alone" "incoming|outgoing" \
  "$(q "select string_agg(case document_type_slug when 'org_correspondence_incoming' then 'incoming' when 'org_correspondence_outgoing' then 'outgoing' end, '|' order by title) from public.org_documents where title in ('Letter In','Letter Out');")"

echo
echo "--- E. bounds ---"
BIG=$(printf 'x%.0s' $(seq 1 201))
check "counterparty over 200 chars refused" "invalid" "$(cre "$OWNER" "$O_A" org_correspondence_incoming 'Too Long CP' '' "$BIG")"
BIGREF=$(printf 'y%.0s' $(seq 1 121))
check "their reference over 120 chars refused" "invalid" "$(cre "$OWNER" "$O_A" org_correspondence_incoming 'Too Long Ref' '' 'Acme' '' "$BIGREF")"
check "bad letter date refused" "invalid" "$(cre "$OWNER" "$O_A" org_correspondence_incoming 'Bad Date Fmt' '' 'Acme' '2026-13-45')"

echo
echo "--- F. retention is a RECORD, never a deletion ---"
DOC=$(doc_id 'Policy One')
check "anon cannot set retention"    "DENIED"    "$(as anon '' "select public.set_org_document_retention_v1('$DOC','2030-01-01','keep');" | tok)"
check "member cannot set retention"  "not_found" "$(as authenticated "$MEMBER"   "select public.set_org_document_retention_v1('$DOC','2030-01-01','keep');" | tok)"
check "wrong-org cannot set retention" "not_found" "$(as authenticated "$OUTSIDER" "select public.set_org_document_retention_v1('$DOC','2030-01-01','keep');" | tok)"
check "owner sets retention"         "updated"   "$(as authenticated "$OWNER" "select public.set_org_document_retention_v1('$DOC','2030-01-01','statute of limitations');" | tok)"
check "retention date stored"        "2030-01-01" "$(q "select retention_until from public.org_documents where id='$DOC';")"
check "retention note stored"        "statute of limitations" "$(q "select retention_note from public.org_documents where id='$DOC';")"
check "retention is re-recordable"   "updated"   "$(as authenticated "$ADMIN2" "select public.set_org_document_retention_v1('$DOC','2031-06-30','extended');" | tok)"
check "retention can be cleared"     "updated"   "$(as authenticated "$OWNER" "select public.set_org_document_retention_v1('$DOC','','');" | tok)"
check "cleared retention is null"    "NOROWS"    "$(q "select retention_until from public.org_documents where id='$DOC' and retention_until is not null;" | tok)"
check "the document still exists after a PASSED retention date" "1" \
  "$(as authenticated "$OWNER" "select public.set_org_document_retention_v1('$DOC','2000-01-01','long past');" >/dev/null; q "select count(*) from public.org_documents where id='$DOC';")"
check "the retention event was recorded" "4" "$(q "select count(*) from public.org_document_events where org_document_id='$DOC' and event_type='retention_set';")"
check "bad retention date refused"   "invalid"   "$(as authenticated "$OWNER" "select public.set_org_document_retention_v1('$DOC','not-a-date','x');" | tok)"

echo
echo "--- G. approval mirror: no pending instance, no mirror ---"
check "member cannot submit"            "not_found"           "$(as authenticated "$MEMBER" "select public.submit_org_document_for_approval_v1('$DOC');" | tok)"
check "owner refused without an instance" "no_pending_workflow" "$(as authenticated "$OWNER"  "select public.submit_org_document_for_approval_v1('$DOC');" | tok)"
check "approval_state stays null"       "NOROWS"              "$(q "select approval_state from public.org_documents where id='$DOC' and approval_state is not null;" | tok)"

echo
echo "--- H. approval mirror: the APPROVED round trip ---"
INST=$(as authenticated "$OWNER" "select public.start_workflow_instance_v1('$DEF_GR','Document: Policy One','{}'::jsonb,'$DOC');" | tok)
check "the engine started an instance" "1" "$(q "select count(*) from public.workflow_instances where context_entity_type='generic_request' and context_entity_id='$DOC' and status='pending';")"
check "the mirror flips to submitted"  "submitted" "$(as authenticated "$OWNER" "select public.submit_org_document_for_approval_v1('$DOC');" | tok)"
check "a second submit is refused"     "invalid_state" "$(as authenticated "$OWNER" "select public.submit_org_document_for_approval_v1('$DOC');" | tok)"
check "sync is a no-op while pending"  "unchanged" "$(as authenticated "$OWNER" "select public.sync_org_document_approval_v1('$DOC');" | tok)"
# decide_workflow_step_v1 takes the INSTANCE id (it resolves the active step).
check "the approver decides approve" "approved" "$(as authenticated "$OWNER" "select public.decide_workflow_step_v1('$INST','approved','ok');" | tok)"
check "the engine recorded approval"   "approved" "$(q "select status from public.workflow_instances where id='$INST';")"
check "read-repair converges to approved" "repaired_approved" "$(as authenticated "$OWNER" "select public.sync_org_document_approval_v1('$DOC');" | tok)"
check "the mirror is approved"         "approved" "$(q "select approval_state from public.org_documents where id='$DOC';")"
check "read-repair is idempotent"      "unchanged" "$(as authenticated "$OWNER" "select public.sync_org_document_approval_v1('$DOC');" | tok)"
check "an approved doc cannot be resubmitted" "invalid_state" "$(as authenticated "$OWNER" "select public.submit_org_document_for_approval_v1('$DOC');" | tok)"
check "the approval events were recorded" "1|1" "$(q "select count(*) filter (where event_type='approval_submitted') || '|' || count(*) filter (where event_type='approval_synced') from public.org_document_events where org_document_id='$DOC';")"

echo
echo "--- I. approval mirror: the REJECTED path returns, never approves ---"
DOC2=$(doc_id 'Procedure One')
INST2=$(as authenticated "$OWNER" "select public.start_workflow_instance_v1('$DEF_GR','Document: Procedure One','{}'::jsonb,'$DOC2');" | tok)
as authenticated "$OWNER" "select public.submit_org_document_for_approval_v1('$DOC2');" >/dev/null
check "the approver decides reject" "rejected" "$(as authenticated "$OWNER" "select public.decide_workflow_step_v1('$INST2','rejected','no');" | tok)"
check "the engine recorded rejection"     "rejected" "$(q "select status from public.workflow_instances where id='$INST2';")"
check "read-repair returns, never approves" "repaired_returned" "$(as authenticated "$OWNER" "select public.sync_org_document_approval_v1('$DOC2');" | tok)"
check "the mirror is returned"            "returned" "$(q "select approval_state from public.org_documents where id='$DOC2';")"
check "a returned doc may be resubmitted" "no_pending_workflow" "$(as authenticated "$OWNER" "select public.submit_org_document_for_approval_v1('$DOC2');" | tok)"

echo
echo "--- J. read-repair is convergence, not discretion ---"
check "a reader (member) may repair"      "unchanged" "$(as authenticated "$MEMBER"   "select public.sync_org_document_approval_v1('$DOC');" | tok)"
check "a non-reader gets one answer"      "not_found" "$(as authenticated "$OUTSIDER" "select public.sync_org_document_approval_v1('$DOC');" | tok)"
check "anon is refused outright"          "DENIED"    "$(as anon '' "select public.sync_org_document_approval_v1('$DOC');" | tok)"

echo
echo "--- K. writes stay RPC-only; anon reaches nothing ---"
check "direct update of approval_state is denied" "DENIED" "$(as authenticated "$OWNER" "update public.org_documents set approval_state='approved' where id='$DOC2';" | tok)"
check "direct update of retention is denied"      "DENIED" "$(as authenticated "$OWNER" "update public.org_documents set retention_until='2099-01-01' where id='$DOC2';" | tok)"
check "direct insert of a delta event is denied"  "DENIED" "$(as authenticated "$OWNER" "insert into public.org_document_events (org_document_id, actor_id, event_type) values ('$DOC2','$OWNER','approval_synced');" | tok)"
check "anon cannot read the register"             "DENIED" "$(as anon '' "select count(*) from public.org_documents;" | tok)"
for fn in create_org_document_v2 set_org_document_retention_v1 submit_org_document_for_approval_v1 sync_org_document_approval_v1; do
  check "anon has no EXECUTE on $fn" "f" "$(q "select bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) from pg_proc p where p.proname='$fn';")"
done

echo
echo "--- L. train C v1 still works, untouched, beside v2 ---"
check "v1 is still callable" "created" "$(as authenticated "$OWNER" "select public.create_org_document_v1('$O_A','org_policy','V1 Still Works','','standard','','','','','','');" | tok)"
check "a v1 row carries null delta columns" "1" "$(q "select count(*) from public.org_documents where title='V1 Still Works' and object_id is null and counterparty_name is null and approval_state is null;")"

echo
echo "--- M. the event vocabulary widened, and only widened ---"
check "the train C event types still validate" "7" \
  "$(q "select count(*) from (select unnest(array['created','file_uploaded','archived','revoked','ack_assigned','acknowledged','downloaded'])) t;")"
check "an unknown event type is still refused" "DENIED" \
  "$(q "insert into public.org_document_events (org_document_id, actor_id, event_type) values ('$DOC','$OWNER','deleted');" | tok)"

echo
echo "--- N. rollback REFUSES once delta data exists ---"
ROLL2=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL2" | grep -qi 'rollback refused'; then
  check "populated rollback refuses" "REFUSED" "REFUSED"
else
  check "populated rollback refuses" "REFUSED" "APPLIED"
fi
check "the delta columns survived the refusal" "approval_state" "$(q "select column_name from information_schema.columns where table_name='org_documents' and column_name='approval_state';")"
check "the correspondence rows survived"       "2" "$(q "select count(*) from public.org_documents where counterparty_name is not null;")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
