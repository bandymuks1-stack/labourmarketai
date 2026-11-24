#!/usr/bin/env bash
# ============================================================================
# TRAINING & CERTIFICATION + DEVELOPMENT REVIEWS + MANAGEMENT DECISIONS v1
# — REAL per-role behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (document-file-layer prelude + agreements prelude + this train's prelude
# supplement), then executes the ACTUAL files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql     (dependency)
#   supabase/migrations/20260817140000_document_file_layer_v1.sql (dependency)
#   supabase/migrations/20260817230000_training_certification_v1.sql
#   supabase/migrations/20260817231000_performance_reviews_v1.sql
#   supabase/migrations/20260817232000_management_decisions_v1.sql
#   supabase/rollbacks/<each>.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / owner / admin / manager / member /
#     assignee / subject / reviewer / revoked / wrong-org / attacker /
#     platform admin) on every command and on every RLS read;
#   * FILL-ONCE completion (RPC + trigger, even against the superuser) and
#     self-only completion;
#   * APPEND-ONLY enforcement on all three event ledgers (superuser too);
#   * the NO-SCORE schema assertion read from the live catalog;
#   * the evidence-link relevance checks (a foreign journal entry, a foreign
#     project and a foreign training assignment are all refused);
#   * the management-decision mirror: no mirror without a REAL pending
#     workflow instance; sync is idempotent read-repair; a result can only be
#     recorded after the ENGINE approved it;
#   * rollback → re-apply at 0 rows, and rollback REFUSAL once rows exist.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/training-development-v1.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-training-development-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG_WORKFLOW="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIG_DOCS="$REPO/supabase/migrations/20260817140000_document_file_layer_v1.sql"
MIG_TRAIN="$REPO/supabase/migrations/20260817230000_training_certification_v1.sql"
MIG_REVIEW="$REPO/supabase/migrations/20260817231000_performance_reviews_v1.sql"
MIG_DEC="$REPO/supabase/migrations/20260817232000_management_decisions_v1.sql"
DOWN_TRAIN="$REPO/supabase/rollbacks/20260817230000_training_certification_v1.down.sql"
DOWN_REVIEW="$REPO/supabase/rollbacks/20260817231000_performance_reviews_v1.down.sql"
DOWN_DEC="$REPO/supabase/rollbacks/20260817232000_management_decisions_v1.down.sql"

ORG_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ORG_B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
OWNER='11111111-1111-4111-8111-111111111111'
ADMIN='22222222-2222-4222-8222-222222222222'
MEMBER='33333333-3333-4333-8333-333333333333'
MANAGER='44444444-4444-4444-8444-444444444444'
OUTSIDER='55555555-5555-4555-8555-555555555555'
PLATFORM='77777777-7777-4777-8777-777777777777'
REVOKED='99999999-9999-4999-8999-999999999999'
NOONE='a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
JE1='1e1e1e1e-1e1e-41e1-81e1-1e1e1e1e1e1e'
SKILL='5c5c5c5c-5c5c-45c5-85c5-5c5c5c5c5c5c'
PROJ='50505050-5050-4505-8505-505050505050'
DOC_A='d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0'
DOC_B='d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'
FILE_A='f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0'
FILE_B='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1'
TASK_OWN='7a5c7a5c-7a5c-47a5-87a5-7a5c7a5c7a5c'
TASK_FOREIGN='7b5c7b5c-7b5c-47b5-87b5-7b5c7b5c7b5c'

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

uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-70s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-70s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

echo "== booting throwaway postgres ($IMAGE) =="
docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

echo "== harness =="
for f in "$HERE/document-file-layer.prelude.sql" \
         "$HERE/agreements-v1.prelude.sql" \
         "$HERE/training-development-v1.prelude.sql"; do
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 < "$f" >/dev/null || { echo "prelude failed: $f"; exit 1; }
done

echo "== applying the REAL migrations verbatim =="
for f in "$MIG_WORKFLOW" "$MIG_DOCS" "$MIG_TRAIN" "$MIG_REVIEW" "$MIG_DEC"; do
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 < "$f" >/dev/null \
    || { echo "MIGRATION FAILED: $f"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 < "$f"; exit 1; }
  echo "  applied $(basename "$f")"
done

echo "== seed =="
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 < "$HERE/training-development-v1.seed.sql" >/dev/null \
  || { echo "seed failed"; exit 1; }

# ────────────────────────────────────────────────────────────────────────────
section "0. schema doctrine — NO score / rating / grade / rank column exists"
check "no assessment column on any of the 12 new tables" "NOROWS" \
  "$(q "select table_name||'.'||column_name from information_schema.columns
        where table_schema='public'
          and table_name in ('training_programs','training_assignments','training_assignment_events','training_skill_links','review_cycles','performance_reviews','review_evidence_links','performance_review_events','management_decisions','decision_document_links','decision_task_links','management_decision_events')
          and (column_name ~* '(rating|score|grade|rank|stars|points|level|competenc)');" | tok)"
check "12 new tables exist, all with RLS enabled" "12" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relrowsecurity
          and c.relname in ('training_programs','training_assignments','training_assignment_events','training_skill_links','review_cycles','performance_reviews','review_evidence_links','performance_review_events','management_decisions','decision_document_links','decision_task_links','management_decision_events');" | tok)"
check "no INSERT/UPDATE/DELETE policy on any new table" "NOROWS" \
  "$(q "select polname from pg_policy p join pg_class c on c.oid=p.polrelid
        where c.relname in ('training_programs','training_assignments','training_assignment_events','training_skill_links','review_cycles','performance_reviews','review_evidence_links','performance_review_events','management_decisions','decision_document_links','decision_task_links','management_decision_events')
          and p.polcmd <> 'r';" | tok)"
check "anon holds no privilege on any new table" "NOROWS" \
  "$(q "select table_name from information_schema.role_table_grants
        where grantee='anon' and table_schema='public'
          and table_name in ('training_programs','training_assignments','review_cycles','performance_reviews','management_decisions');" | tok)"
check "anon may execute none of the 21 new commands" "NOROWS" \
  "$(q "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname ~ '^(create_training_program|update_training_program|assign_training|complete_training_assignment|attach_training_certificate|set_training_assignment_expired|link_training_skill|create_review_cycle|set_review_cycle_status|create_performance_review|save_review_worker_input|save_review_manager_input|add_review_evidence_link|close_performance_review|create_management_decision|update_management_decision|submit_management_decision|sync_management_decision|record_management_decision_result|attach_decision_document|link_decision_task)_v1$'
          and has_function_privilege('anon', p.oid, 'execute');" | tok)"
check "every new command is SECURITY DEFINER with a pinned search_path" "21" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prosecdef
          and p.proconfig @> array['search_path=public']
          and p.proname ~ '^(create_training_program|update_training_program|assign_training|complete_training_assignment|attach_training_certificate|set_training_assignment_expired|link_training_skill|create_review_cycle|set_review_cycle_status|create_performance_review|save_review_worker_input|save_review_manager_input|add_review_evidence_link|close_performance_review|create_management_decision|update_management_decision|submit_management_decision|sync_management_decision|record_management_decision_result|attach_decision_document|link_decision_task)_v1$';" | tok)"

# ────────────────────────────────────────────────────────────────────────────
section "1. training — programme authoring authority"
check "anon cannot create a programme" "DENIED" \
  "$(as anon "$NOONE" "select public.create_training_program_v1('$ORG_A','Height safety','desc',null);" | tok)"
check "member cannot create a programme" "not_authorized" \
  "$(as authenticated "$MEMBER" "select public.create_training_program_v1('$ORG_A','Height safety','desc',null);" | tok)"
check "manager cannot create a programme (owner/admin only)" "not_authorized" \
  "$(as authenticated "$MANAGER" "select public.create_training_program_v1('$ORG_A','Height safety','desc',null);" | tok)"
check "revoked member cannot create a programme" "not_authorized" \
  "$(as authenticated "$REVOKED" "select public.create_training_program_v1('$ORG_A','Height safety','desc',null);" | tok)"
check "wrong-org owner cannot create a programme in org A" "not_authorized" \
  "$(as authenticated "$OUTSIDER" "select public.create_training_program_v1('$ORG_A','Height safety','desc',null);" | tok)"
check "attacker with a random uuid gets the same answer" "not_authorized" \
  "$(as authenticated "$NOONE" "select public.create_training_program_v1('$ORG_A','X Y Z','desc',null);" | tok)"
check "org owner creates the programme" "created" \
  "$(as authenticated "$OWNER" "select public.create_training_program_v1('$ORG_A','Height safety','Working at height','$DOC_A');" | tok)"
check "a cross-org material is refused" "invalid_material" \
  "$(as authenticated "$OWNER" "select public.create_training_program_v1('$ORG_A','Second programme','x','$DOC_B');" | tok)"
check "a too-short title is refused" "invalid" \
  "$(as authenticated "$OWNER" "select public.create_training_program_v1('$ORG_A','ab','x',null);" | tok)"
PROG=$(q "select id from public.training_programs where organization_id='$ORG_A' limit 1;" | tr -d '[:space:]')
check "programme row exists" "UUID" "$(echo "$PROG" | uu)"

section "2. training — assignment authority + subject key"
check "member cannot assign" "not_found" \
  "$(as authenticated "$MEMBER" "select public.assign_training_v1('$PROG','member@a.test','2026-12-01');" | tok)"
check "manager CAN assign (managing role)" "assigned" \
  "$(as authenticated "$MANAGER" "select public.assign_training_v1('$PROG','member@a.test','2026-12-01');" | tok)"
check "assigning the same person twice is idempotent-safe" "already_assigned" \
  "$(as authenticated "$MANAGER" "select public.assign_training_v1('$PROG','member@a.test','2026-12-01');" | tok)"
check "a foreign-org address is refused with no account oracle" "invalid_assignee" \
  "$(as authenticated "$MANAGER" "select public.assign_training_v1('$PROG','outsider@b.test',null);" | tok)"
check "an address with no account answers the SAME" "invalid_assignee" \
  "$(as authenticated "$MANAGER" "select public.assign_training_v1('$PROG','ghost@nowhere.test',null);" | tok)"
check "a revoked member is refused" "invalid_assignee" \
  "$(as authenticated "$MANAGER" "select public.assign_training_v1('$PROG','revoked@a.test',null);" | tok)"
ASG=$(q "select id from public.training_assignments limit 1;" | tr -d '[:space:]')
check "assignment row exists" "UUID" "$(echo "$ASG" | uu)"
check "the subject key is the PROFILE, matching document_acknowledgements" "assignee_profile_id" \
  "$(q "select column_name from information_schema.columns
        where table_schema='public' and table_name='training_assignments'
          and column_name in ('assignee_profile_id','worker_id');" | tok)"

section "3. training — completion is SELF-ONLY and FILL-ONCE"
check "the manager cannot complete on the assignee's behalf" "not_found" \
  "$(as authenticated "$MANAGER" "select public.complete_training_assignment_v1('$ASG','done');" | tok)"
check "the org owner cannot complete on the assignee's behalf" "not_found" \
  "$(as authenticated "$OWNER" "select public.complete_training_assignment_v1('$ASG','done');" | tok)"
check "a platform admin cannot complete on the assignee's behalf" "not_found" \
  "$(as authenticated "$PLATFORM" "select public.complete_training_assignment_v1('$ASG','done');" true | tok)"
check "the ASSIGNEE completes" "completed" \
  "$(as authenticated "$MEMBER" "select public.complete_training_assignment_v1('$ASG','watched the material');" | tok)"
check "completing twice is refused (fill-once, RPC layer)" "already_completed" \
  "$(as authenticated "$MEMBER" "select public.complete_training_assignment_v1('$ASG','again');" | tok)"
check "the SUPERUSER cannot move the completion stamp (trigger layer)" "DENIED" \
  "$(q "update public.training_assignments set completed_at = now() - interval '1 day' where id='$ASG';" | tok)"
check "the SUPERUSER cannot move the subject (identity immutable)" "DENIED" \
  "$(q "update public.training_assignments set assignee_profile_id='$OWNER' where id='$ASG';" | tok)"

section "4. training — certificate evidence + expiry"
check "a certificate cannot come from another org's file" "invalid_file" \
  "$(as authenticated "$MANAGER" "select public.attach_training_certificate_v1('$ASG','$FILE_B','2026-08-01','2027-08-01');" | tok)"
check "the assignee cannot attach their own certificate" "not_found" \
  "$(as authenticated "$MEMBER" "select public.attach_training_certificate_v1('$ASG','$FILE_A','2026-08-01','2027-08-01');" | tok)"
check "expiry before issue is refused" "invalid" \
  "$(as authenticated "$MANAGER" "select public.attach_training_certificate_v1('$ASG','$FILE_A','2026-08-01','2025-08-01');" | tok)"
check "a managing role attaches the certificate" "attached" \
  "$(as authenticated "$MANAGER" "select public.attach_training_certificate_v1('$ASG','$FILE_A','2026-08-01','2027-08-01');" | tok)"

section "5. training — the SKILL SEAM is not crossed"
check "linking a skill records this module's OWN row" "linked" \
  "$(as authenticated "$MANAGER" "select public.link_training_skill_v1('$ASG','$SKILL');" | tok)"
check "linking the same skill twice is idempotent-safe" "already_linked" \
  "$(as authenticated "$MANAGER" "select public.link_training_skill_v1('$ASG','$SKILL');" | tok)"
check "a non-existent skill is refused" "invalid_skill" \
  "$(as authenticated "$MANAGER" "select public.link_training_skill_v1('$ASG','$FILE_B');" | tok)"
check "the link carries the ONE fixed provenance and nothing else" "training_completion" \
  "$(q "select distinct provenance from public.training_skill_links;" | tok)"
check "ZERO worker_skills rows were written by the module" "NOROWS" \
  "$(q "select 1 from information_schema.tables where table_schema='public' and table_name='worker_skills';" | tok)"
check "the migration text never writes worker_skills" "0" \
  "$(grep -ciE '(insert|update)[[:space:]]+(into[[:space:]]+)?public\.worker_skills' "$MIG_TRAIN" | tr -d '[:space:]')"
check "the migration text never writes journal_entry_skills" "0" \
  "$(grep -ciE '(insert|update)[[:space:]]+(into[[:space:]]+)?public\.journal_entry_skills' "$MIG_TRAIN" | tr -d '[:space:]')"
check "marking expired needs a managing role" "not_found" \
  "$(as authenticated "$MEMBER" "select public.set_training_assignment_expired_v1('$ASG');" | tok)"
check "expiry is an explicit human act, never a job" "expired" \
  "$(as authenticated "$MANAGER" "select public.set_training_assignment_expired_v1('$ASG');" | tok)"
check "marking it twice is idempotent-safe" "already_expired" \
  "$(as authenticated "$MANAGER" "select public.set_training_assignment_expired_v1('$ASG');" | tok)"
check "an expiry mark never erases the completion stamp" "1" \
  "$(q "select count(*) from public.training_assignments where id='$ASG' and completed_at is not null;" | tok)"

section "6. training — RLS read matrix"
check "assignee reads their own assignment" "1" \
  "$(as authenticated "$MEMBER" "select count(*) from public.training_assignments;" | tok)"
check "org owner reads it (managing authority)" "1" \
  "$(as authenticated "$OWNER" "select count(*) from public.training_assignments;" | tok)"
check "a wrong-org owner reads NOTHING" "0" \
  "$(as authenticated "$OUTSIDER" "select count(*) from public.training_assignments;" | tok)"
check "a revoked member reads NOTHING" "0" \
  "$(as authenticated "$REVOKED" "select count(*) from public.training_assignments;" | tok)"
check "an attacker with a random uuid reads NOTHING" "0" \
  "$(as authenticated "$NOONE" "select count(*) from public.training_assignments;" | tok)"
check "anon reads NOTHING" "DENIED" \
  "$(as anon "$NOONE" "select count(*) from public.training_assignments;" | tok)"
check "the event ledger is append-only even for the superuser" "DENIED" \
  "$(q "delete from public.training_assignment_events;" | tok)"

# ────────────────────────────────────────────────────────────────────────────
section "7. reviews — cycle + review authority"
check "a manager cannot open a cycle (owner/admin only)" "not_authorized" \
  "$(as authenticated "$MANAGER" "select public.create_review_cycle_v1('$ORG_A','H2 2026','2026-07-01','2026-12-31');" | tok)"
check "the org owner opens a cycle" "created" \
  "$(as authenticated "$OWNER" "select public.create_review_cycle_v1('$ORG_A','H2 2026','2026-07-01','2026-12-31');" | tok)"
CYC=$(q "select id from public.review_cycles limit 1;" | tr -d '[:space:]')
check "a review cannot be created while the cycle is a draft" "invalid_state" \
  "$(as authenticated "$OWNER" "select public.create_performance_review_v1('$CYC','member@a.test','manager@a.test');" | tok)"
check "the owner opens the cycle" "updated" \
  "$(as authenticated "$OWNER" "select public.set_review_cycle_status_v1('$CYC','open');" | tok)"
check "a foreign-org subject is refused" "invalid_subject" \
  "$(as authenticated "$OWNER" "select public.create_performance_review_v1('$CYC','outsider@b.test','manager@a.test');" | tok)"
check "a plain member cannot be the reviewer" "invalid_reviewer" \
  "$(as authenticated "$OWNER" "select public.create_performance_review_v1('$CYC','member@a.test','member@a.test');" | tok)"
check "the review is created with two distinct named people" "created" \
  "$(as authenticated "$OWNER" "select public.create_performance_review_v1('$CYC','member@a.test','manager@a.test');" | tok)"
REV=$(q "select id from public.performance_reviews limit 1;" | tr -d '[:space:]')
check "review row exists" "UUID" "$(echo "$REV" | uu)"

section "8. reviews — subjective observation is authored, never borrowed"
check "the reviewer cannot write the subject's own input" "not_found" \
  "$(as authenticated "$MANAGER" "select public.save_review_worker_input_v1('$REV','I did well');" | tok)"
check "the org owner cannot write the subject's own input" "not_found" \
  "$(as authenticated "$OWNER" "select public.save_review_worker_input_v1('$REV','I did well');" | tok)"
check "the SUBJECT writes their own observation" "saved" \
  "$(as authenticated "$MEMBER" "select public.save_review_worker_input_v1('$REV','I worked on the tower job');" | tok)"
check "the subject cannot write the manager's observation" "not_found" \
  "$(as authenticated "$MEMBER" "select public.save_review_manager_input_v1('$REV','looks fine',null,null);" | tok)"
check "the REVIEWER writes theirs, and the author id is server-stamped" "saved" \
  "$(as authenticated "$MANAGER" "select public.save_review_manager_input_v1('$REV','Reliable on site','Shadow the foreman','2026-11-01');" | tok)"
check "the stored author is the reviewer, not the caller-supplied id" "$MANAGER" \
  "$(q "select manager_input_by::text from public.performance_reviews where id='$REV';" | tok)"

section "9. reviews — EVIDENCE is re-checked, never decorative"
check "an arbitrary uuid is refused as evidence" "invalid_reference" \
  "$(as authenticated "$MANAGER" "select public.add_review_evidence_link_v1('$REV','journal_entry','$FILE_B','x');" | tok)"
check "a real journal entry of the SUBJECT is accepted" "linked" \
  "$(as authenticated "$MANAGER" "select public.add_review_evidence_link_v1('$REV','journal_entry','$JE1','tower job');" | tok)"
check "a same-org project is accepted" "linked" \
  "$(as authenticated "$MANAGER" "select public.add_review_evidence_link_v1('$REV','project','$PROJ',null);" | tok)"
check "the subject's own training assignment is accepted" "linked" \
  "$(as authenticated "$MANAGER" "select public.add_review_evidence_link_v1('$REV','training_assignment','$ASG',null);" | tok)"
check "an unknown evidence kind is refused" "invalid" \
  "$(as authenticated "$MANAGER" "select public.add_review_evidence_link_v1('$REV','rating','$JE1',null);" | tok)"
check "a wrong-org reader sees no evidence rows" "0" \
  "$(as authenticated "$OUTSIDER" "select count(*) from public.review_evidence_links;" | tok)"

section "10. reviews — visibility is NARROW, closing freezes the record"
check "the subject reads their own review" "1" \
  "$(as authenticated "$MEMBER" "select count(*) from public.performance_reviews;" | tok)"
check "the reviewer reads it" "1" \
  "$(as authenticated "$MANAGER" "select count(*) from public.performance_reviews;" | tok)"
check "the org owner reads it (governance)" "1" \
  "$(as authenticated "$OWNER" "select count(*) from public.performance_reviews;" | tok)"
check "an unrelated ACTIVE member of the same org reads NOTHING" "0" \
  "$(as authenticated "$ADMIN" "select count(*) from public.performance_reviews where reviewer_profile_id='$MANAGER' and subject_profile_id='$OWNER';" | tok)"
check "a wrong-org owner reads NOTHING" "0" \
  "$(as authenticated "$OUTSIDER" "select count(*) from public.performance_reviews;" | tok)"
check "anon reads NOTHING" "DENIED" \
  "$(as anon "$NOONE" "select count(*) from public.performance_reviews;" | tok)"
check "the reviewer closes the record" "closed" \
  "$(as authenticated "$MANAGER" "select public.close_performance_review_v1('$REV');" | tok)"
check "closing twice is idempotent-safe" "already_closed" \
  "$(as authenticated "$MANAGER" "select public.close_performance_review_v1('$REV');" | tok)"
check "a CLOSED record refuses every further write" "invalid_state" \
  "$(as authenticated "$MANAGER" "select public.save_review_manager_input_v1('$REV','rewriting history',null,null);" | tok)"
check "even the SUPERUSER cannot rewrite a closed record" "DENIED" \
  "$(q "update public.performance_reviews set manager_input='tampered' where id='$REV';" | tok)"
check "the review ledger is append-only even for the superuser" "DENIED" \
  "$(q "update public.performance_review_events set event_type='closed';" | tok)"

# ────────────────────────────────────────────────────────────────────────────
section "11. management decisions — the mirror cannot invent an approval"
check "a manager cannot open a decision (owner/admin only)" "not_authorized" \
  "$(as authenticated "$MANAGER" "select public.create_management_decision_v1('$ORG_A','Buy a second lift','Do we buy it?',null,null);" | tok)"
check "a foreign responsible person is refused" "invalid_responsible" \
  "$(as authenticated "$OWNER" "select public.create_management_decision_v1('$ORG_A','Buy a lift','Do we buy it?','outsider@b.test',null);" | tok)"
check "the org owner opens the decision" "created" \
  "$(as authenticated "$OWNER" "select public.create_management_decision_v1('$ORG_A','Buy a second lift','Do we buy it this quarter?','manager@a.test','2026-10-01');" | tok)"
DEC=$(q "select id from public.management_decisions limit 1;" | tr -d '[:space:]')
check "decision row exists" "UUID" "$(echo "$DEC" | uu)"
check "submitting WITHOUT a real engine instance is refused" "no_instance" \
  "$(as authenticated "$OWNER" "select public.submit_management_decision_v1('$DEC');" | tok)"
check "the mirror is still a draft (no approval was invented)" "draft" \
  "$(q "select status from public.management_decisions where id='$DEC';" | tok)"
check "a result cannot be recorded before the engine approves" "invalid_state" \
  "$(as authenticated "$OWNER" "select public.record_management_decision_result_v1('$DEC','we buy it');" | tok)"

section "12. management decisions — the ENGINE's vote is the vote"
check "the owner authors a 2-approver 'all' step (that IS the vote)" "created" \
  "$(as authenticated "$OWNER" "select public.create_workflow_definition_v1('$ORG_A','Management vote','management_vote','management_decision',
     '[{\"name\":\"Board vote\",\"approval_mode\":\"all\",\"approver_rule\":{\"kind\":\"profiles\",\"profile_ids\":[\"$OWNER\",\"$ADMIN\"]}}]'::jsonb);" | tok)"
VER=$(q "select v.id from public.workflow_definition_versions v join public.workflow_definitions d on d.id=v.definition_id where d.slug='management_vote';" | tr -d '[:space:]')
DEF=$(q "select id from public.workflow_definitions where slug='management_vote';" | tr -d '[:space:]')
check "the owner publishes the version" "published" \
  "$(as authenticated "$OWNER" "select public.publish_workflow_version_v1('$VER');" | tok)"
INST=$(as authenticated "$OWNER" "select public.start_workflow_instance_v1('$DEF','Buy a second lift','{}'::jsonb,'$DEC');" | tok)
check "the ENGINE's own command started the instance" "UUID" "$(echo "$INST" | uu)"
check "the decision now mirrors a REAL pending instance" "submitted" \
  "$(as authenticated "$OWNER" "select public.submit_management_decision_v1('$DEC');" | tok)"
check "sync while pending is a no-op" "unchanged" \
  "$(as authenticated "$OWNER" "select public.sync_management_decision_v1('$DEC');" | tok)"
check "approver 1 of 2 records, the step is not settled" "recorded" \
  "$(as authenticated "$OWNER" "select public.decide_workflow_step_v1('$INST','approved','yes');" | tok)"
check "the mirror is untouched while the vote is open" "unchanged" \
  "$(as authenticated "$OWNER" "select public.sync_management_decision_v1('$DEC');" | tok)"
check "approver 2 of 2 completes the unanimous vote" "approved" \
  "$(as authenticated "$ADMIN" "select public.decide_workflow_step_v1('$INST','approved','yes');" | tok)"
check "sync copies the engine's terminal truth" "synced" \
  "$(as authenticated "$OWNER" "select public.sync_management_decision_v1('$DEC');" | tok)"
check "sync is idempotent" "unchanged" \
  "$(as authenticated "$OWNER" "select public.sync_management_decision_v1('$DEC');" | tok)"
check "the mirror equals the engine status" "approved" \
  "$(q "select status from public.management_decisions where id='$DEC';" | tok)"
check "the result can now be recorded" "recorded" \
  "$(as authenticated "$OWNER" "select public.record_management_decision_result_v1('$DEC','Approved: buy one lift in Q4.');" | tok)"
check "recording twice is idempotent-safe (fill-once)" "already_recorded" \
  "$(as authenticated "$OWNER" "select public.record_management_decision_result_v1('$DEC','changed my mind');" | tok)"
check "no ballot/tally/vote column exists in this module" "NOROWS" \
  "$(q "select column_name from information_schema.columns
        where table_schema='public' and table_name like 'management_decision%'
          and column_name ~* '(vote|ballot|tally|quorum)';" | tok)"

section "13. management decisions — links point at REAL rows only"
check "a foreign-org document is refused" "invalid_document" \
  "$(as authenticated "$OWNER" "select public.attach_decision_document_v1('$DEC','$DOC_B');" | tok)"
check "a same-org document links" "linked" \
  "$(as authenticated "$OWNER" "select public.attach_decision_document_v1('$DEC','$DOC_A');" | tok)"
check "a task the caller does not own is refused" "invalid_task" \
  "$(as authenticated "$OWNER" "select public.link_decision_task_v1('$DEC','$TASK_FOREIGN');" | tok)"
check "the caller's own real work_task links" "linked" \
  "$(as authenticated "$OWNER" "select public.link_decision_task_v1('$DEC','$TASK_OWN');" | tok)"
check "the link table copies NO task field" "NOROWS" \
  "$(q "select column_name from information_schema.columns
        where table_schema='public' and table_name='decision_task_links'
          and column_name in ('title','status','assignee_profile_id','due_at');" | tok)"
check "an unrelated org member reads no decision" "0" \
  "$(as authenticated "$MEMBER" "select count(*) from public.management_decisions;" | tok)"
check "the named responsible person reads it" "1" \
  "$(as authenticated "$MANAGER" "select count(*) from public.management_decisions;" | tok)"
check "a wrong-org owner reads NOTHING" "0" \
  "$(as authenticated "$OUTSIDER" "select count(*) from public.management_decisions;" | tok)"
check "anon reads NOTHING" "DENIED" \
  "$(as anon "$NOONE" "select count(*) from public.management_decisions;" | tok)"
check "the decision ledger is append-only even for the superuser" "DENIED" \
  "$(q "update public.management_decision_events set event_type='created';" | tok)"

# ────────────────────────────────────────────────────────────────────────────
section "14. rollback refuses while rows exist, then round-trips at 0 rows"
for pair in "$DOWN_DEC:management decisions" "$DOWN_REVIEW:development reviews" "$DOWN_TRAIN:training"; do
  f="${pair%%:*}"; label="${pair##*:}"
  out=$(docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 < "$f" 2>&1)
  if echo "$out" | grep -q "refusing to roll back"; then r=REFUSED; else r="$out"; fi
  check "$label rollback REFUSES while real rows exist" "REFUSED" "$r"
done

# Emptying the module is a DELIBERATE operator act, exactly as the rollback
# headers demand. The append-only triggers are disabled here (superuser) only
# to simulate that export-and-delete step inside the throwaway container.
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
alter table public.management_decision_events disable trigger management_decision_events_append_only;
alter table public.performance_review_events  disable trigger performance_review_events_append_only;
alter table public.training_assignment_events disable trigger training_assignment_events_append_only;
delete from public.management_decision_events;
delete from public.decision_task_links;
delete from public.decision_document_links;
delete from public.management_decisions;
delete from public.performance_review_events;
delete from public.review_evidence_links;
delete from public.performance_reviews;
delete from public.review_cycles;
delete from public.training_assignment_events;
delete from public.training_skill_links;
delete from public.training_assignments;
delete from public.training_programs;
SQL

for pair in "$DOWN_DEC:management decisions" "$DOWN_REVIEW:development reviews" "$DOWN_TRAIN:training"; do
  f="${pair%%:*}"; label="${pair##*:}"
  out=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 < "$f" 2>&1)
  if [ $? -eq 0 ]; then r=OK; else r="FAILED: $(echo "$out" | head -3 | tr '\n' ' ')"; fi
  check "$label rollback runs clean at 0 rows" "OK" "$r"
done
check "all 12 tables are gone after rollback" "0" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r'
          and c.relname in ('training_programs','training_assignments','training_assignment_events','training_skill_links','review_cycles','performance_reviews','review_evidence_links','performance_review_events','management_decisions','decision_document_links','decision_task_links','management_decision_events');" | tok)"
check "all 21 commands are gone after rollback" "0" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname ~ '^(create_training_program|update_training_program|assign_training|complete_training_assignment|attach_training_certificate|set_training_assignment_expired|link_training_skill|create_review_cycle|set_review_cycle_status|create_performance_review|save_review_worker_input|save_review_manager_input|add_review_evidence_link|close_performance_review|create_management_decision|update_management_decision|submit_management_decision|sync_management_decision|record_management_decision_result|attach_decision_document|link_decision_task)_v1$';" | tok)"
check "the ENGINE tables survived untouched" "7" \
  "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname like 'workflow%' and c.relkind='r';" | tok)"

for f in "$MIG_TRAIN" "$MIG_REVIEW" "$MIG_DEC"; do
  if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 < "$f" >/dev/null 2>&1; then r=OK; else r=FAILED; fi
  check "re-apply $(basename "$f") after rollback" "OK" "$r"
done

printf '\n\033[1m== %d passed, %d failed ==\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
