#!/usr/bin/env bash
# ============================================================================
# WORKFLOW TEMPLATE MANAGEMENT v1 — REAL per-role behavioural proof.
#
# Spins up a THROWAWAY Postgres container, loads the ENGINE's own faithful
# harness (scripts/db-proof/workflow-engine-v1.prelude.sql + .seed.sql), then
# executes the actual files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql
#   supabase/migrations/20260818120000_workflow_template_management_v1.sql
#   supabase/rollbacks/20260818120000_workflow_template_management_v1.down.sql
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / plain member / manager-but-not-owner /
#     owner / admin / wrong-org owner / attacker / revoked member) on all
#     three new commands;
#   * the DEFAULT PACK: 8 definitions, one step each, org_role[owner,admin],
#     mark_escalated, the right deadlines, EXACTLY ONE generic_request;
#   * IDEMPOTENCY: a second install is all-skips; a retired-but-present slug
#     is skipped, never overwritten;
#   * VERSIONING: a new version is a DRAFT, publishing it makes NEW instances
#     use it while a RUNNING instance keeps its own step snapshot and its own
#     resolved approvers;
#   * ACTIVATE / DEACTIVATE: retiring a template stops NEW requests and
#     leaves a running one completely untouched;
#   * ESCALATION VOCABULARY: anything other than mark_escalated is refused,
#     and so are an invalid mode and an invalid role;
#   * the CROSS-TENANT NEGATIVE (owner requirement 12): an approver of org A
#     cannot decide an instance of org B — proven against the REAL
#     decide_workflow_step_v1;
#   * the SINGLE-PERSON ORG reality the pack is designed around: the owner is
#     the only resolved approver and the ledger records that truthfully;
#   * rollback -> re-apply round trip.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/workflow-template-management-v1.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-workflow-template-mgmt-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
ENGINE="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
MIGRATION="$REPO/supabase/migrations/20260818120000_workflow_template_management_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260818120000_workflow_template_management_v1.down.sql"

O1='01000000-0000-4000-8000-000000000001'
O2='02000000-0000-4000-8000-000000000002'
OWNER1='a1000000-0000-4000-8000-00000000000a'
ADMIN1='a2000000-0000-4000-8000-00000000000a'
MGR1='a3000000-0000-4000-8000-00000000000a'
MEMBER1='a4000000-0000-4000-8000-00000000000a'
ENGREQ='a5000000-0000-4000-8000-00000000000a'
REVOKED='a6000000-0000-4000-8000-00000000000a'
OUT2='a7000000-0000-4000-8000-00000000000a'
NOONE='a8000000-0000-4000-8000-00000000000a'

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql
as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
set local app.is_admin = 'false';
$3
commit;
SQL
}

# Collapse a probe result to a single comparable token.
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

# Collapse an id-returning result: any uuid -> UUID, everything else verbatim.
uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-70s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-70s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

install_as() { # $1=actor $2=org -> the jsonb outcome word
  as authenticated "$1" "select public.install_default_workflow_pack_v1('$2')->>'outcome';" | tok
}
new_version_as() { # $1=actor $2=definition-id $3=steps-json
  as authenticated "$1" "select public.create_workflow_definition_version_v1('$2', '$3'::jsonb);" | tok
}
set_active_as() { # $1=actor $2=definition-id $3=true|false
  as authenticated "$1" "select public.set_workflow_definition_active_v1('$2', '$3');" | tok
}
start_as() { # $1=actor $2=definition-id $3=title
  as authenticated "$1" "select public.start_workflow_instance_v1('$2', '$3', '{}'::jsonb);" | tok
}
decide_as() { as authenticated "$1" "select public.decide_workflow_step_v1('$2', '$3', null);" | tok; }
def_id() { q "select id from public.workflow_definitions where organization_id = '${2:-$O1}' and slug = '$1';"; }

STEP_V2='[{"name":"Second look","approval_mode":"all","approver_rule":{"kind":"org_role","roles":["owner","admin"]},"deadline_hours":48,"escalation_rule":{"action":"mark_escalated","notify_roles":["owner"]}}]'
STEP_BAD_ESC='[{"name":"Sneaky","approval_mode":"single","approver_rule":{"kind":"org_role","roles":["owner"]},"escalation_rule":{"action":"auto_approve"}}]'
STEP_BAD_MODE='[{"name":"Round","approval_mode":"majority","approver_rule":{"kind":"org_role","roles":["owner"]}}]'
STEP_BAD_ROLE='[{"name":"Round","approval_mode":"single","approver_rule":{"kind":"org_role","roles":["superuser"]}}]'
STEP_BAD_KIND='[{"name":"Round","approval_mode":"single","approver_rule":{"kind":"anyone"}}]'
STEP_BAD_DL='[{"name":"Round","approval_mode":"single","approver_rule":{"kind":"org_role","roles":["owner"]},"deadline_hours":9000}]'

echo "=============================================================="
echo " WORKFLOW TEMPLATE MANAGEMENT v1 — behavioural proof"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/workflow-engine-v1.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/workflow-engine-v1.seed.sql" >/dev/null || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

echo
echo "--- APPLYING the ENGINE verbatim (the dependency) ---"
APPLY_ENGINE=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ENGINE" 2>&1)
if echo "$APPLY_ENGINE" | grep -qiE 'ERROR|FATAL'; then echo "$APPLY_ENGINE" | head -20; echo "ENGINE APPLY FAILED"; exit 1; fi
echo "  engine applied cleanly"

echo
echo "--- BEFORE: the management commands do not exist ---"
check "installer absent before apply" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='install_default_workflow_pack_v1';")"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"

echo
echo "--- A. install authority matrix (org owner/admin only) ---"
check "anon is refused outright"          "DENIED" "$(as anon '' "select public.install_default_workflow_pack_v1('$O1');" | tok)"
check "plain member cannot install"       "not_authorized" "$(install_as "$MEMBER1" "$O1")"
check "manager-but-not-owner cannot"      "not_authorized" "$(install_as "$MGR1" "$O1")"
check "revoked former admin cannot"       "not_authorized" "$(install_as "$REVOKED" "$O1")"
check "engagement-only member cannot"     "not_authorized" "$(install_as "$ENGREQ" "$O1")"
check "attacker with no org cannot"       "not_authorized" "$(install_as "$NOONE" "$O1")"
check "wrong-org owner cannot"            "not_authorized" "$(install_as "$OUT2" "$O1")"
check "garbage org id is refused"         "invalid" "$(as authenticated "$OWNER1" "select public.install_default_workflow_pack_v1('not-a-uuid')->>'outcome';" | tok)"
check "nothing was created by any refusal" "0" "$(q "select count(*) from public.workflow_definitions;")"
check "OWNER installs the pack"           "installed" "$(install_as "$OWNER1" "$O1")"

echo
echo "--- B. the pack is exactly what the contract says ---"
check "8 definitions exist"               "8" "$(q "select count(*) from public.workflow_definitions where organization_id='$O1';")"
check "all 8 are active"                  "8" "$(q "select count(*) from public.workflow_definitions where organization_id='$O1' and is_active;")"
check "all 8 have a PUBLISHED version 1"  "8" "$(q "select count(*) from public.workflow_definition_versions v join public.workflow_definitions d on d.id=v.definition_id where d.organization_id='$O1' and v.version=1 and v.published_at is not null;")"
check "EXACTLY ONE generic_request template" "employee_request_default" "$(q "select slug from public.workflow_definitions where organization_id='$O1' and context_entity_type='generic_request';")"
check "the 8 contexts are the contracted ones" "agreement|business_trip|expense|generic_request|invoice|management_decision|procurement|timesheet" "$(q "select string_agg(context_entity_type, '|' order by context_entity_type) from public.workflow_definitions where organization_id='$O1';")"
check "every template has exactly ONE step" "8" "$(q "select count(*) from (select v.id from public.workflow_version_steps s join public.workflow_definition_versions v on v.id=s.version_id join public.workflow_definitions d on d.id=v.definition_id where d.organization_id='$O1' group by v.id having count(*)=1) x;")"
check "every step is mode=single"         "8" "$(q "select count(*) from public.workflow_version_steps s join public.workflow_definition_versions v on v.id=s.version_id join public.workflow_definitions d on d.id=v.definition_id where d.organization_id='$O1' and s.approval_mode='single';")"
check "every step rule is org_role[owner,admin]" "8" "$(q "select count(*) from public.workflow_version_steps s join public.workflow_definition_versions v on v.id=s.version_id join public.workflow_definitions d on d.id=v.definition_id where d.organization_id='$O1' and s.approver_rule = '{\"kind\":\"org_role\",\"roles\":[\"owner\",\"admin\"]}'::jsonb;")"
check "every escalation is mark_escalated ONLY" "mark_escalated" "$(q "select distinct s.escalation_rule->>'action' from public.workflow_version_steps s join public.workflow_definition_versions v on v.id=s.version_id join public.workflow_definitions d on d.id=v.definition_id where d.organization_id='$O1';")"
check "NO escalation approves anything"   "0" "$(q "select count(*) from public.workflow_version_steps s where s.escalation_rule::text ilike '%approve%';")"
check "deadlines: 168 for six, 336 for two" "168:6|336:2" "$(q "select string_agg(x.d || ':' || x.n, '|' order by x.d) from (select s.deadline_hours d, count(*) n from public.workflow_version_steps s join public.workflow_definition_versions v on v.id=s.version_id join public.workflow_definitions d on d.id=v.definition_id where d.organization_id='$O1' group by s.deadline_hours) x;")"

echo
echo "--- C. install idempotency (a repeat is all-skips) ---"
check "second install is all_skipped"     "all_skipped" "$(install_as "$OWNER1" "$O1")"
check "…and skipped all 8 for context cover" "8" "$(as authenticated "$OWNER1" "select jsonb_array_length(public.install_default_workflow_pack_v1('$O1')->'skipped');" | tok)"
check "…and installed nothing"            "0" "$(as authenticated "$OWNER1" "select jsonb_array_length(public.install_default_workflow_pack_v1('$O1')->'installed');" | tok)"
check "still exactly 8 definitions"       "8" "$(q "select count(*) from public.workflow_definitions where organization_id='$O1';")"
DEF_TS=$(def_id timesheet_default "$O1")
check "retiring one template, then install: slug is SKIPPED not overwritten" "deactivated|all_skipped" "$(set_active_as "$OWNER1" "$DEF_TS" false)|$(install_as "$OWNER1" "$O1")"
check "the retired slug reports slug_already_exists" "slug_already_exists" "$(as authenticated "$OWNER1" "select e->>'reason' from jsonb_array_elements(public.install_default_workflow_pack_v1('$O1')->'skipped') e where e->>'slug'='timesheet_default';" | tok)"
check "still exactly 8 definitions"       "8" "$(q "select count(*) from public.workflow_definitions where organization_id='$O1';")"
check "reactivate for the rest of the run" "activated" "$(set_active_as "$OWNER1" "$DEF_TS" true)"
check "reactivating twice is honest"      "already_active" "$(set_active_as "$OWNER1" "$DEF_TS" true)"

echo
echo "--- D. version authoring authority + escalation vocabulary rejection ---"
check "plain member cannot version (no oracle)" "not_found" "$(new_version_as "$MEMBER1" "$DEF_TS" "$STEP_V2")"
check "manager-but-not-owner cannot"      "not_found" "$(new_version_as "$MGR1" "$DEF_TS" "$STEP_V2")"
check "wrong-org owner cannot"            "not_found" "$(new_version_as "$OUT2" "$DEF_TS" "$STEP_V2")"
check "attacker cannot"                   "not_found" "$(new_version_as "$NOONE" "$DEF_TS" "$STEP_V2")"
check "anon is refused outright"          "DENIED" "$(as anon '' "select public.create_workflow_definition_version_v1('$DEF_TS', '$STEP_V2'::jsonb);" | tok)"
check "escalation action other than mark_escalated REFUSED" "invalid" "$(new_version_as "$OWNER1" "$DEF_TS" "$STEP_BAD_ESC")"
check "invalid approval mode refused"     "invalid" "$(new_version_as "$OWNER1" "$DEF_TS" "$STEP_BAD_MODE")"
check "invalid org role refused"          "invalid" "$(new_version_as "$OWNER1" "$DEF_TS" "$STEP_BAD_ROLE")"
check "unknown rule kind refused"         "invalid" "$(new_version_as "$OWNER1" "$DEF_TS" "$STEP_BAD_KIND")"
check "out-of-range deadline refused"     "invalid" "$(new_version_as "$OWNER1" "$DEF_TS" "$STEP_BAD_DL")"
check "empty step array refused"          "invalid" "$(new_version_as "$OWNER1" "$DEF_TS" '[]')"
check "NO refused attempt wrote a version" "1" "$(q "select count(*) from public.workflow_definition_versions where definition_id='$DEF_TS';")"

echo
echo "--- E. a RUNNING instance keeps its own snapshot when a new version publishes ---"
INST1=$(start_as "$MEMBER1" "$DEF_TS" 'Week 33 hours')
check "a member starts a request on v1" "UUID" "$(echo "$INST1" | uu)"
check "…and the engine resolved the owner+admin as approvers" "2" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST1';")"
check "…with the v1 step name snapshotted" "Manager approval" "$(q "select name from public.workflow_instance_steps where instance_id='$INST1';")"
V2=$(new_version_as "$OWNER1" "$DEF_TS" "$STEP_V2")
check "owner authors version 2"          "UUID" "$(echo "$V2" | uu)"
check "…as a DRAFT (not published)"      "2|" "$(q "select version || '|' || coalesce(published_at::text,'') from public.workflow_definition_versions where id='$V2';")"
INSTD=$(start_as "$ENGREQ" "$DEF_TS" 'Started while v2 is a draft')
check "a draft version changes nothing: new request still takes v1" "1" "$(q "select v.version from public.workflow_instances i join public.workflow_definition_versions v on v.id=i.version_id where i.id='$INSTD';")"
check "owner publishes version 2"        "published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$V2');" | tok)"
INST2=$(start_as "$ENGREQ" "$DEF_TS" 'Week 34 hours')
check "a NEW request takes version 2"    "2" "$(q "select v.version from public.workflow_instances i join public.workflow_definition_versions v on v.id=i.version_id where i.id='$INST2';")"
check "…with the v2 step name"           "Second look" "$(q "select name from public.workflow_instance_steps where instance_id='$INST2';")"
check "the RUNNING instance still points at version 1" "1" "$(q "select v.version from public.workflow_instances i join public.workflow_definition_versions v on v.id=i.version_id where i.id='$INST1';")"
check "…its step snapshot is UNCHANGED"  "Manager approval|single" "$(q "select name || '|' || approval_mode from public.workflow_instance_steps where instance_id='$INST1';")"
check "…its approver set is UNCHANGED"   "2" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST1';")"
check "…it is still pending"             "pending" "$(q "select status from public.workflow_instances where id='$INST1';")"
check "…and NOTHING was decided by the publish" "0" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST1' and decision is not null;")"
check "the running request still decides normally (mode single)" "approved" "$(decide_as "$OWNER1" "$INST1" approved)"

echo
echo "--- F. deactivate stops NEW requests and leaves a RUNNING one untouched ---"
check "the v2 request is pending before we retire" "pending" "$(q "select status from public.workflow_instances where id='$INST2';")"
check "plain member cannot retire (no oracle)" "not_found" "$(set_active_as "$MEMBER1" "$DEF_TS" false)"
check "owner retires the template"       "deactivated" "$(set_active_as "$OWNER1" "$DEF_TS" false)"
check "a NEW request is refused (no oracle)" "not_found" "$(start_as "$MEMBER1" "$DEF_TS" 'Week 35 hours')"
check "the RUNNING request is still pending" "pending" "$(q "select status from public.workflow_instances where id='$INST2';")"
check "…its step is still active"        "active" "$(q "select status from public.workflow_instance_steps where instance_id='$INST2';")"
check "…and it can STILL be decided"     "recorded" "$(decide_as "$ADMIN1" "$INST2" approved)"
check "retiring twice is honest"         "already_inactive" "$(set_active_as "$OWNER1" "$DEF_TS" false)"
check "a bad flag is refused"            "invalid" "$(set_active_as "$OWNER1" "$DEF_TS" maybe)"
check "reactivate"                       "activated" "$(set_active_as "$OWNER1" "$DEF_TS" true)"

echo
echo "--- G. CROSS-TENANT NEGATIVE: an approver of org A cannot decide org B's request ---"
check "O2's own owner installs the pack there" "installed" "$(install_as "$OUT2" "$O2")"
DEF_O2=$(def_id timesheet_default "$O2")
INST_O2=$(start_as "$OUT2" "$DEF_O2" 'Other tenant hours')
check "O2 request started"               "UUID" "$(echo "$INST_O2" | uu)"
check "SINGLE-PERSON ORG: the sole owner IS the only approver" "1|$OUT2" "$(q "select count(*)::text || '|' || min(approver_profile_id::text) from public.workflow_instance_approvers where instance_id='$INST_O2';")"
check "org A's OWNER cannot decide org B's request"   "not_found" "$(decide_as "$OWNER1" "$INST_O2" approved)"
check "org A's ADMIN cannot decide org B's request"   "not_found" "$(decide_as "$ADMIN1" "$INST_O2" approved)"
check "org A's requester cannot decide it either"     "not_found" "$(decide_as "$MEMBER1" "$INST_O2" approved)"
check "org A's owner cannot even SEE org B's request" "0" "$(as authenticated "$OWNER1" "select count(*) from public.workflow_instances where id='$INST_O2';" | tok)"
check "org A's owner cannot retire org B's template"  "not_found" "$(set_active_as "$OWNER1" "$DEF_O2" false)"
check "org A's owner cannot version org B's template" "not_found" "$(new_version_as "$OWNER1" "$DEF_O2" "$STEP_V2")"
check "org B's owner cannot decide org A's request"   "not_found" "$(decide_as "$OUT2" "$INST2" approved)"
check "NOTHING crossed the tenant boundary"           "0" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST_O2' and decision is not null;")"
check "the sole owner approves their OWN request (documented consequence)" "approved" "$(decide_as "$OUT2" "$INST_O2" approved)"
check "…and the ledger records requester=approver truthfully" "$OUT2|$OUT2" "$(q "select i.requester_profile_id::text || '|' || a.decided_by::text from public.workflow_instances i join public.workflow_instance_approvers a on a.instance_id=i.id where i.id='$INST_O2';")"

echo
echo "--- H. rollback -> re-apply round trip ---"
BEFORE_DEFS=$(q "select count(*) from public.workflow_definitions;")
ROLL_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$ROLL_OUT" | grep -qiE 'ERROR|FATAL'; then echo "$ROLL_OUT" | head -10; echo "ROLLBACK FAILED"; exit 1; fi
check "rollback removes the three commands" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_workflow_definition_version_v1','set_workflow_definition_active_v1','install_default_workflow_pack_v1');")"
check "rollback leaves the ENGINE intact"   "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"
check "rollback DELETES NO ROW"             "$BEFORE_DEFS" "$(q "select count(*) from public.workflow_definitions;")"
check "…and no approval history was lost"   "1" "$(q "select count(*) from public.workflow_transitions where instance_id='$INST_O2' and action='completed';")"
REAPPLY=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$REAPPLY" | grep -qiE 'ERROR|FATAL'; then echo "$REAPPLY" | head -10; echo "RE-APPLY FAILED"; exit 1; fi
check "re-apply is clean and idempotent-safe" "all_skipped" "$(install_as "$OWNER1" "$O1")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
