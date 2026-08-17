#!/usr/bin/env bash
# ============================================================================
# Document & Evidence Engine v1 — REAL per-role authority-matrix proof.
#
# Expects a THROWAWAY Postgres 15 container named $CT to be running (same
# convention as booking-atomic-double-booking.sh):
#   docker run -d --name doc-file-proof -e POSTGRES_PASSWORD=x postgres:15
# Loads the faithful harness (prelude + seed), then executes the ACTUAL
# migration file
#   supabase/migrations/20260817120000_document_file_layer_v1.sql
# and the ACTUAL rollback VERBATIM, measuring per role:
#   anon / org owner / org admin / plain member / manager / assignee /
#   wrong-org / worker / platform admin / attacker (direct writes).
# Covers: RPC authority, version monotonicity, path-prefix verification,
# MIME/size caps, ack fill-once + version binding + no carry-over, revoke
# semantics, storage policy scoping incl. orphan-only delete, rollback +
# clean re-apply.
#
# Every probe runs under `set local role authenticated` (or `anon`), never
# as the superuser, so RLS genuinely decides the result.
# Never point this at production or at a shared local Supabase stack.
# ============================================================================
set -uo pipefail

CT=${CT:-doc-file-proof}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260817120000_document_file_layer_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260817120000_document_file_layer_v1.down.sql"

OWNER='11111111-1111-4111-8111-111111111111'
ADMIN2='22222222-2222-4222-8222-222222222222'
MEMBER='33333333-3333-4333-8333-333333333333'
MANAGER='44444444-4444-4444-8444-444444444444'
OUTSIDER='55555555-5555-4555-8555-555555555555'
WORKERP='66666666-6666-4666-8666-666666666666'
PLATFORM='77777777-7777-4777-8777-777777777777'
ORG_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
WORKER_ID='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
WD='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
SHA='0000000000000000000000000000000000000000000000000000000000000000'

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

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
        if echo "$out" | grep -qiE '^(ERROR|FATAL)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-64s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-64s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

echo "=============================================================="
echo " Document & Evidence Engine v1 — per-role authority proof"
echo "=============================================================="
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT not ready"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/document-file-layer.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/document-file-layer.seed.sql"   >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo "-- apply the REAL migration VERBATIM"
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" >/dev/null 2>&1; then
  check "migration applies cleanly" "ok" "ok"
else
  check "migration applies cleanly" "ok" "FAILED"; echo "aborting"; exit 1
fi

echo "-- 1. create_org_document_v1 authority"
DOC_STD=$(as authenticated "$OWNER" "select public.create_org_document_v1('$ORG_A','org_policy','Safety policy','', 'standard','','','','','','');" | tok)
check "owner creates standard doc" "created" "$DOC_STD"
DOC_CLS=$(as authenticated "$ADMIN2" "select public.create_org_document_v1('$ORG_A','org_internal','Board notes','', 'classified','','','','','','');" | tok)
check "admin creates classified doc" "created" "$DOC_CLS"
check "member cannot create"  "not_allowed" "$(as authenticated "$MEMBER"   "select public.create_org_document_v1('$ORG_A','org_policy','X doc','', 'standard','','','','','','');" | tok)"
check "manager cannot create" "not_allowed" "$(as authenticated "$MANAGER"  "select public.create_org_document_v1('$ORG_A','org_policy','X doc','', 'standard','','','','','','');" | tok)"
check "wrong-org owner cannot create in ORG_A" "not_allowed" "$(as authenticated "$OUTSIDER" "select public.create_org_document_v1('$ORG_A','org_policy','X doc','', 'standard','','','','','','');" | tok)"
check "anon rpc denied" "DENIED" "$(as anon '' "select public.create_org_document_v1('$ORG_A','org_policy','X doc','', 'standard','','','','','','');" | tok)"
check "unknown worker type slug rejected" "invalid" "$(as authenticated "$OWNER" "select public.create_org_document_v1('$ORG_A','cv','CV as org doc','', 'standard','','','','','','');" | tok)"

STD_ID=$(q "select id from public.org_documents where title='Safety policy';")
CLS_ID=$(q "select id from public.org_documents where title='Board notes';")

echo "-- 2. org_documents read matrix"
check "member sees ONLY active standard (1 row)" "1" "$(as authenticated "$MEMBER" "select count(*) from public.org_documents;" | tok)"
check "member does NOT see classified" "NOROWS" "$(as authenticated "$MEMBER" "select title from public.org_documents where id='$CLS_ID';" | tok)"
check "owner sees both" "2" "$(as authenticated "$OWNER" "select count(*) from public.org_documents;" | tok)"
check "wrong-org sees none" "0" "$(as authenticated "$OUTSIDER" "select count(*) from public.org_documents;" | tok)"
check "platform admin sees both" "2" "$(as authenticated "$PLATFORM" "select count(*) from public.org_documents;" true | tok)"
check "anon table read denied" "DENIED" "$(as anon '' "select count(*) from public.org_documents;" | tok)"

echo "-- 3. register_document_file_v1 — caps, path, versions"
check "worker registers v1 (canonical path)" "registered" "$(as authenticated "$WORKERP" "select public.register_document_file_v1('worker','$WD','worker/$WORKER_ID/doc/$WD/v1/a1.pdf','a1.pdf','application/pdf',1000,'$SHA');" | tok)"
check "bad prefix -> path_mismatch" "path_mismatch" "$(as authenticated "$WORKERP" "select public.register_document_file_v1('worker','$WD','worker/$WORKER_ID/doc/$WD/v9/a1.pdf','a1.pdf','application/pdf',1000,'$SHA');" | tok)"
check "bad mime -> unsupported_type" "unsupported_type" "$(as authenticated "$WORKERP" "select public.register_document_file_v1('worker','$WD','worker/$WORKER_ID/doc/$WD/v2/x.gif','x.gif','image/gif',1000,'$SHA');" | tok)"
check "oversize -> file_too_large" "file_too_large" "$(as authenticated "$WORKERP" "select public.register_document_file_v1('worker','$WD','worker/$WORKER_ID/doc/$WD/v2/a1.pdf','a1.pdf','application/pdf',5242881,'$SHA');" | tok)"
check "worker registers v2" "registered" "$(as authenticated "$WORKERP" "select public.register_document_file_v1('worker','$WD','worker/$WORKER_ID/doc/$WD/v2/a1.pdf','a1.pdf','application/pdf',1000,'$SHA');" | tok)"
check "versions are monotonic (1,2)" "1|2" "$(q "select version from public.document_files where worker_document_id='$WD' order by version;" | tok)"
check "exactly one current version (v2)" "2" "$(q "select version from public.document_files where worker_document_id='$WD' and superseded_at is null;")"
check "worker_document_events got file_uploaded x2" "2" "$(q "select count(*) from public.worker_document_events where event_type='file_uploaded';")"
check "member cannot register on the worker doc" "not_found" "$(as authenticated "$MEMBER" "select public.register_document_file_v1('worker','$WD','worker/$WORKER_ID/doc/$WD/v3/a1.pdf','a1.pdf','application/pdf',1000,'$SHA');" | tok)"
check "owner registers org file v1" "registered" "$(as authenticated "$OWNER" "select public.register_document_file_v1('organization','$STD_ID','org/$ORG_A/doc/$STD_ID/v1/policy.pdf','policy.pdf','application/pdf',2000,'$SHA');" | tok)"
check "member cannot register org file" "not_found" "$(as authenticated "$MEMBER" "select public.register_document_file_v1('organization','$STD_ID','org/$ORG_A/doc/$STD_ID/v2/policy.pdf','policy.pdf','application/pdf',2000,'$SHA');" | tok)"
check "admin registers classified org file" "registered" "$(as authenticated "$ADMIN2" "select public.register_document_file_v1('organization','$CLS_ID','org/$ORG_A/doc/$CLS_ID/v1/notes.pdf','notes.pdf','application/pdf',2000,'$SHA');" | tok)"

ORG_F1=$(q "select id from public.document_files where org_document_id='$STD_ID' and version=1;")
CLS_F1=$(q "select id from public.document_files where org_document_id='$CLS_ID' and version=1;")

echo "-- 4. document_files read matrix"
check "worker sees own 2 file rows" "2" "$(as authenticated "$WORKERP" "select count(*) from public.document_files where worker_document_id='$WD';" | tok)"
check "member sees standard org file" "1" "$(as authenticated "$MEMBER" "select count(*) from public.document_files where id='$ORG_F1';" | tok)"
check "member does NOT see classified file" "0" "$(as authenticated "$MEMBER" "select count(*) from public.document_files where id='$CLS_F1';" | tok)"
check "wrong-org sees no org files" "0" "$(as authenticated "$OUTSIDER" "select count(*) from public.document_files;" | tok)"
check "member never sees worker's files" "0" "$(as authenticated "$MEMBER" "select count(*) from public.document_files where worker_document_id='$WD';" | tok)"

echo "-- 5. acknowledgements — bind to VERSION, fill-once, self-only"
check "owner assigns ack to member" "assigned" "$(as authenticated "$OWNER" "select public.assign_document_acknowledgement_v1('$ORG_F1','$MEMBER','');" | tok)"
check "duplicate assignment refused" "already_assigned" "$(as authenticated "$OWNER" "select public.assign_document_acknowledgement_v1('$ORG_F1','$MEMBER','');" | tok)"
check "outsider is invalid assignee" "invalid_assignee" "$(as authenticated "$OWNER" "select public.assign_document_acknowledgement_v1('$ORG_F1','$OUTSIDER','');" | tok)"
check "member cannot assign" "not_found" "$(as authenticated "$MEMBER" "select public.assign_document_acknowledgement_v1('$ORG_F1','$MEMBER','');" | tok)"
ACK_ID=$(q "select id from public.document_acknowledgements where document_file_id='$ORG_F1' and assignee_profile_id='$MEMBER';")
check "assignee (member) reads classified doc IT WAS ASSIGNED? no — std doc visible anyway; ack row visible" "1" "$(as authenticated "$MEMBER" "select count(*) from public.document_acknowledgements where id='$ACK_ID';" | tok)"
check "owner cannot acknowledge someone else's ack" "not_found" "$(as authenticated "$OWNER" "select public.acknowledge_document_v1('$ACK_ID');" | tok)"
check "assignee acknowledges" "acknowledged" "$(as authenticated "$MEMBER" "select public.acknowledge_document_v1('$ACK_ID');" | tok)"
check "fill-once: second acknowledge refused" "already_acknowledged" "$(as authenticated "$MEMBER" "select public.acknowledge_document_v1('$ACK_ID');" | tok)"
check "stamp is self-only (acknowledged_by = assignee)" "t" "$(q "select acknowledged_by = assignee_profile_id from public.document_acknowledgements where id='$ACK_ID';")"

echo "-- 6. new version: acks do NOT carry over; superseded gathers no new acks"
check "owner registers org file v2" "registered" "$(as authenticated "$OWNER" "select public.register_document_file_v1('organization','$STD_ID','org/$ORG_A/doc/$STD_ID/v2/policy.pdf','policy.pdf','application/pdf',2100,'$SHA');" | tok)"
ORG_F2=$(q "select id from public.document_files where org_document_id='$STD_ID' and version=2;")
check "v2 has ZERO acknowledgements (v1 ack did not carry over)" "0" "$(q "select count(*) from public.document_acknowledgements where document_file_id='$ORG_F2';")"
check "assigning on the SUPERSEDED v1 refused" "not_current" "$(as authenticated "$OWNER" "select public.assign_document_acknowledgement_v1('$ORG_F1','$ADMIN2','');" | tok)"
check "re-assignment on v2 is an explicit new act" "assigned" "$(as authenticated "$OWNER" "select public.assign_document_acknowledgement_v1('$ORG_F2','$MEMBER','');" | tok)"

echo "-- 7. attacker: direct writes are revoked everywhere"
check "direct insert into document_files denied" "DENIED" "$(as authenticated "$OWNER" "insert into public.document_files (scope, org_document_id, version, storage_path, original_filename, mime_type, byte_size, content_sha256, uploaded_by) values ('organization','$STD_ID',9,'org/x','x','application/pdf',1,'$SHA','$OWNER');" | tok)"
check "direct update of org_documents denied" "DENIED" "$(as authenticated "$OWNER" "update public.org_documents set title='hacked' where id='$STD_ID';" | tok)"
check "direct insert of acks denied" "DENIED" "$(as authenticated "$OWNER" "insert into public.document_acknowledgements (document_file_id, assignee_profile_id, organization_id, assigned_by) values ('$ORG_F2','$OWNER','$ORG_A','$OWNER');" | tok)"
check "direct delete of events denied" "DENIED" "$(as authenticated "$OWNER" "delete from public.org_document_events;" | tok)"

echo "-- 8. storage.objects policies — prefix-scoped, truth-delegating, orphan-only delete"
check "worker inserts under own canonical prefix" "INSERT 0 1" "$(as authenticated "$WORKERP" "insert into storage.objects (bucket_id, name) values ('document-files','worker/$WORKER_ID/doc/$WD/v3/orphan.pdf');" | tok)"
check "worker cannot insert under a FOREIGN worker prefix" "DENIED" "$(as authenticated "$OUTSIDER" "insert into storage.objects (bucket_id, name) values ('document-files','worker/$WORKER_ID/doc/$WD/v4/evil.pdf');" | tok)"
check "member cannot insert under the org prefix" "DENIED" "$(as authenticated "$MEMBER" "insert into storage.objects (bucket_id, name) values ('document-files','org/$ORG_A/doc/$STD_ID/v3/evil.pdf');" | tok)"
check "owner inserts under the org prefix" "INSERT 0 1" "$(as authenticated "$OWNER" "insert into storage.objects (bucket_id, name) values ('document-files','org/$ORG_A/doc/$STD_ID/v3/next.pdf');" | tok)"
q "insert into storage.objects (bucket_id, name) values ('document-files','worker/$WORKER_ID/doc/$WD/v1/a1.pdf'),('document-files','org/$ORG_A/doc/$STD_ID/v1/policy.pdf'),('document-files','org/$ORG_A/doc/$CLS_ID/v1/notes.pdf');" >/dev/null
check "worker reads own registered object" "1" "$(as authenticated "$WORKERP" "select count(*) from storage.objects where name='worker/$WORKER_ID/doc/$WD/v1/a1.pdf';" | tok)"
check "member reads standard org object" "1" "$(as authenticated "$MEMBER" "select count(*) from storage.objects where name='org/$ORG_A/doc/$STD_ID/v1/policy.pdf';" | tok)"
check "member cannot read classified object" "0" "$(as authenticated "$MEMBER" "select count(*) from storage.objects where name='org/$ORG_A/doc/$CLS_ID/v1/notes.pdf';" | tok)"
check "admin2 (doc manager) reads classified object" "1" "$(as authenticated "$ADMIN2" "select count(*) from storage.objects where name='org/$ORG_A/doc/$CLS_ID/v1/notes.pdf';" | tok)"
check "outsider reads nothing in the bucket" "0" "$(as authenticated "$OUTSIDER" "select count(*) from storage.objects where bucket_id='document-files';" | tok)"
check "unregistered orphan IS deletable by its scope owner" "DELETE 1" "$(as authenticated "$WORKERP" "delete from storage.objects where name='worker/$WORKER_ID/doc/$WD/v3/orphan.pdf';" | tok)"
check "REGISTERED object is NOT deletable (0 rows)" "DELETE 0" "$(as authenticated "$WORKERP" "delete from storage.objects where name='worker/$WORKER_ID/doc/$WD/v1/a1.pdf';" | tok)"
check "bucket is private" "f" "$(q "select public from storage.buckets where id='document-files';")"

echo "-- 9. revoke semantics — files kept, register honest"
check "member revoke attempt -> not_found" "not_found" "$(as authenticated "$MEMBER" "select public.revoke_org_document_v1('$STD_ID');" | tok)"
FILES_BEFORE=$(q "select count(*) from public.document_files where org_document_id='$STD_ID';")
check "owner revokes" "revoked" "$(as authenticated "$OWNER" "select public.revoke_org_document_v1('$STD_ID');" | tok)"
check "revoke keeps every version" "$FILES_BEFORE" "$(q "select count(*) from public.document_files where org_document_id='$STD_ID';")"
# The MANAGER holds an active membership but no acknowledgement on this doc:
# after revoke the member-read branch (active+standard) is gone for them.
check "plain colleague (no ack) no longer sees the revoked doc" "0" "$(as authenticated "$MANAGER" "select count(*) from public.org_documents where id='$STD_ID';" | tok)"
# DESIGN DECISION, pinned: an acknowledgement ASSIGNEE retains read on the
# document their version-bound confirmation references, even after revoke —
# their ack history must never point at a row they cannot resolve.
check "assignee retains read after revoke (ack history stays resolvable)" "1" "$(as authenticated "$MEMBER" "select count(*) from public.org_documents where id='$STD_ID';" | tok)"
check "owner still sees it (register history)" "1" "$(as authenticated "$OWNER" "select count(*) from public.org_documents where id='$STD_ID';" | tok)"
check "registering on a revoked doc refused" "invalid_state" "$(as authenticated "$OWNER" "select public.register_document_file_v1('organization','$STD_ID','org/$ORG_A/doc/$STD_ID/v3/late.pdf','late.pdf','application/pdf',100,'$SHA');" | tok)"
check "archive of a revoked doc refused" "invalid_state" "$(as authenticated "$OWNER" "select public.archive_org_document_v1('$STD_ID');" | tok)"

echo "-- 10. events visibility"
check "owner reads org events" "$(q "select count(*) from public.org_document_events;")" "$(as authenticated "$OWNER" "select count(*) from public.org_document_events where org_document_id in (select id from public.org_documents);" | tok)"
check "member reads NO org events (managers only)" "0" "$(as authenticated "$MEMBER" "select count(*) from public.org_document_events;" | tok)"

echo "-- 11. rollback VERBATIM restores the prior world, then clean re-apply"
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null 2>&1; then
  check "rollback applies cleanly" "ok" "ok"
else
  check "rollback applies cleanly" "ok" "FAILED"
fi
check "new tables gone" "0" "$(q "select count(*) from pg_class where relname in ('org_documents','document_files','document_acknowledgements','org_document_events');")"
check "bucket gone" "0" "$(q "select count(*) from storage.buckets where id='document-files';")"
check "org type slugs removed" "0" "$(q "select count(*) from public.document_types where category='organization';")"
check "worker event constraint restored (file_uploaded now invalid)" "DENIED" "$(q "insert into public.worker_document_events (worker_document_id, actor_id, event_type) values ('$WD','$WORKERP','file_uploaded');" | tok)"
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" >/dev/null 2>&1; then
  check "re-apply after rollback is clean" "ok" "ok"
else
  check "re-apply after rollback is clean" "ok" "FAILED"
fi

echo "=============================================================="
echo " RESULT: $pass passed, $fail failed"
echo "=============================================================="
[ "$fail" -eq 0 ]
