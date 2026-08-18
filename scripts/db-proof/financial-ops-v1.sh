#!/usr/bin/env bash
# ============================================================================
# FINANCIAL OPS v1 — REAL per-role behavioural proof (train J).
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (workflow-engine prelude+seed, then the finance/document/object prelude+seed),
# then executes the actual files
#   supabase/migrations/20260817130000_workflow_engine_v1.sql        (dependency)
#   supabase/migrations/20260817220000_finance_invoice_upgrades_v1.sql (under test)
#   supabase/migrations/20260817221000_procurement_v1.sql              (under test)
#   supabase/migrations/20260817222000_business_trips_v1.sql           (under test)
#   supabase/rollbacks/*.down.sql for all three
# each VERBATIM, and measures:
#   * the AUTHORITY MATRIX (anon / requester / org owner / org admin / org
#     manager / plain member / engagement-truth member / wrong-org / revoked /
#     attacker) on every command and on every RLS read;
#   * DUPLICATE DETECTION semantics: warn-not-block, scoped to received
#     invoices + same counterparty + same scope, cancelled excluded, and
#     NEVER a refusal;
#   * the ENGINE SEAM for all three contexts (expense/invoice, procurement,
#     business_trip): the instance is started through the engine's OWN start
#     RPC, decisions happen in the engine, and each sync command only COPIES a
#     TERMINAL outcome onto a module-local mirror — never decides;
#   * procurement lifecycle: offers, the manager-only offer decision, ordered/
#     closed transitions, the invoice link and its finance-authority re-check;
#   * business trips: date rules, the approval mirror, completion, cancellation
#     and the DERIVED (never stored) linked-expense total;
#   * append-only events (immutable even for the superuser);
#   * rollback → re-apply round trip for all three, engine untouched.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS + grants genuinely decide the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/financial-ops-v1.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-financial-ops-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
ENGINE="$REPO/supabase/migrations/20260817130000_workflow_engine_v1.sql"
M_INV="$REPO/supabase/migrations/20260817220000_finance_invoice_upgrades_v1.sql"
M_PROC="$REPO/supabase/migrations/20260817221000_procurement_v1.sql"
M_TRIP="$REPO/supabase/migrations/20260817222000_business_trips_v1.sql"
R_INV="$REPO/supabase/rollbacks/20260817220000_finance_invoice_upgrades_v1.down.sql"
R_PROC="$REPO/supabase/rollbacks/20260817221000_procurement_v1.down.sql"
R_TRIP="$REPO/supabase/rollbacks/20260817222000_business_trips_v1.down.sql"

O1='01000000-0000-4000-8000-000000000001'
O2='02000000-0000-4000-8000-000000000002'
OWNER1='a1000000-0000-4000-8000-00000000000a'
ADMIN1='a2000000-0000-4000-8000-00000000000a'
MGR1='a3000000-0000-4000-8000-00000000000a'
MEMBER1='a4000000-0000-4000-8000-00000000000a'
ENGREQ='a5000000-0000-4000-8000-00000000000a'   # engagement-truth member of O1
REVOKED='a6000000-0000-4000-8000-00000000000a'  # revoked former admin of O1
OUT2='a7000000-0000-4000-8000-00000000000a'     # owner of O2 only
NOONE='a8000000-0000-4000-8000-00000000000a'    # attacker, no org at all

CO1='c1000000-0000-4000-8000-00000000000c'      # company bridged to O1
PROJ1='91000000-0000-4000-8000-000000000091'    # project managed through O1
PROJ2='92000000-0000-4000-8000-000000000092'    # wrong-org project
OBJ1='81000000-0000-4000-8000-000000000081'     # work object in O1
OBJ2='82000000-0000-4000-8000-000000000082'     # work object in O2
DOC_OK='71000000-0000-4000-8000-000000000071'   # ACTIVE standard doc in O1
DOC_CLS='72000000-0000-4000-8000-000000000072'  # classified doc in O1
DOC_OUT='73000000-0000-4000-8000-000000000073'  # doc in O2

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

tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL|psql)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

uu() { local out; out=$(cat);
       if echo "$out" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo "UUID"; else echo "$out"; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-70s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-70s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

echo "=============================================================="
echo " FINANCIAL OPS v1 — behavioural proof (invoice + procurement + trips)"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

for f in workflow-engine-v1.prelude.sql workflow-engine-v1.seed.sql financial-ops-v1.prelude.sql financial-ops-v1.seed.sql; do
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/$f" >/dev/null || { echo "$f failed"; exit 1; }
done
echo "harness loaded (throwaway $CT)"

echo
echo "--- BEFORE: none of the new objects exist ---"
check "procurement_inquiries absent"    "" "$(q "select to_regclass('public.procurement_inquiries');")"
check "business_trips absent"           "" "$(q "select to_regclass('public.business_trips');")"
check "finance_records.invoice_number absent" "0" "$(q "select count(*) from information_schema.columns where table_name='finance_records' and column_name='invoice_number';")"

echo
echo "--- APPLYING the ENGINE dependency, then the three migrations verbatim ---"
for m in "$ENGINE" "$M_INV" "$M_PROC" "$M_TRIP"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$m" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -20; echo "APPLY FAILED: $m"; exit 1; fi
  echo "  applied: $(basename "$m")"
done

# ── A. invoice upgrades: create v2, bounds, links ─────────────────────────
echo
echo "--- A. create_finance_record_v2 — bounds, link authority, no oracle ---"
mk() { # $1=actor $2=type $3=title $4=counterparty $5=cents $6=company $7=invno $8=vat $9=doc
  as authenticated "$1" "select public.create_finance_record_v2('$2','$3','$4','$5','draft','','','$6','','$7','$8','$9');" | tok
}
check "anon refused outright"           "DENIED" "$(as anon '' "select public.create_finance_record_v2('expense','Fuel','Shell','1000','draft','','','','','','','');" | tok)"
check "owner creates a company-linked expense" "created" "$(mk "$OWNER1" expense 'Fuel' 'Shell' 1000 "$CO1" '' '' '')"
check "org ADMIN also has company authority (membership spine)" "created" "$(mk "$ADMIN1" expense 'Gloves' 'Toolshop' 2000 "$CO1" '' '' '')"
check "plain member has NO company authority" "not_allowed" "$(mk "$MEMBER1" expense 'Nope' 'Nope' 500 "$CO1" '' '' '')"
check "REVOKED former admin has none either" "not_allowed" "$(mk "$REVOKED" expense 'Nope' 'Nope' 500 "$CO1" '' '' '')"
check "wrong-org owner has none"        "not_allowed" "$(mk "$OUT2" expense 'Nope' 'Nope' 500 "$CO1" '' '' '')"
check "float amount refused (cents only)" "invalid" "$(mk "$OWNER1" expense 'Fuel' 'Shell' '10.00' "$CO1" '' '' '')"
check "negative amount refused"         "invalid" "$(mk "$OWNER1" expense 'Fuel' 'Shell' '-5' "$CO1" '' '' '')"
check "bad record type refused"         "invalid" "$(mk "$OWNER1" payslip 'Fuel' 'Shell' 1000 "$CO1" '' '' '')"
check "float VAT refused"               "invalid" "$(mk "$OWNER1" expense 'Fuel' 'Shell' 1000 "$CO1" '' '2.5' '')"
check "readable ACTIVE standard doc accepted" "created" "$(mk "$OWNER1" expense 'Scan' 'Shell' 1000 "$CO1" '' '' "$DOC_OK")"
check "classified doc: owner MAY link"  "created" "$(mk "$OWNER1" expense 'Board' 'Shell' 1000 "$CO1" '' '' "$DOC_CLS")"
check "wrong-org doc refused (no oracle)" "not_allowed" "$(mk "$OWNER1" expense 'Bad' 'Shell' 1000 "$CO1" '' '' "$DOC_OUT")"
# (VALID bounded fields — the LINK authority, not a length bound, must refuse.)
check "unmanageable project refused"    "not_allowed" "$(as authenticated "$OWNER1" "select public.create_finance_record_v2('expense','Cross-org attempt','Some supplier','100','draft','','$PROJ2','$CO1','','','','');" | tok)"
check "VAT stored as integer cents"     "2100" "$(as authenticated "$OWNER1" "select public.create_finance_record_v2('invoice_received','VAT case','Baltic','10000','draft','','','$CO1','','INV-1','2100','');" | tok >/dev/null; q "select vat_amount_cents from public.finance_records where invoice_number='INV-1';")"

echo
echo "--- B. DUPLICATE DETECTION — warns, NEVER blocks ---"
DUPBEFORE=$(q "select count(*) from public.finance_records where invoice_number='INV-1';")
check "same counterparty+number → WARNING outcome" "created_possible_duplicate" "$(mk "$OWNER1" invoice_received 'VAT case again' 'Baltic' 10000 "$CO1" 'INV-1' '' '')"
check "…and the row IS still created"   "2" "$(q "select count(*) from public.finance_records where invoice_number='INV-1';")"
check "case-insensitive on number+party" "created_possible_duplicate" "$(mk "$OWNER1" invoice_received 'Third' 'baltic' 10000 "$CO1" 'inv-1' '' '')"
check "different counterparty is NOT a duplicate" "created" "$(mk "$OWNER1" invoice_received 'Other party' 'Nordic' 10000 "$CO1" 'INV-1' '' '')"
check "issued invoices never warn (own numbering)" "created" "$(mk "$OWNER1" invoice_issued 'Ours' 'Baltic' 10000 "$CO1" 'INV-1' '' '')"
check "expenses never warn"             "created" "$(mk "$OWNER1" expense 'Exp' 'Baltic' 10000 "$CO1" 'INV-1' '' '')"
check "no invoice number → no warning"  "created" "$(mk "$OWNER1" invoice_received 'Numberless' 'Baltic' 10000 "$CO1" '' '' '')"
# Cancel EVERY matching received invoice — case-insensitively, exactly the
# way the probe matches (an exact-case filter would leave the 'inv-1' row
# live and the next probe would still, correctly, warn).
q "update public.finance_records set status='cancelled', paid_at=null where lower(invoice_number)='inv-1' and record_type='invoice_received';" >/dev/null
check "cancelled rows are NOT duplicates" "created" "$(mk "$OWNER1" invoice_received 'After cancel' 'Baltic' 10000 "$CO1" 'INV-1' '' '')"
check "another creator's UNLINKED rows are invisible to the probe" "created" "$(as authenticated "$MEMBER1" "select public.create_finance_record_v2('invoice_received','Private','Baltic','10000','draft','','','','','INV-9','','');" | tok)"
check "…and the first creator's own unlinked repeat DOES warn" "created_possible_duplicate" "$(as authenticated "$MEMBER1" "select public.create_finance_record_v2('invoice_received','Private 2','Baltic','10000','draft','','','','','INV-9','','');" | tok)"
check "no UNIQUE constraint blocks recurring numbers" "0" "$(q "select count(*) from pg_indexes where tablename='finance_records' and indexdef ilike '%unique%invoice_number%';")"

echo
echo "--- C. update v2 + RLS + direct-DML denial ---"
FR=$(q "select id from public.finance_records where title='Fuel' and counterparty_name='Shell' limit 1;")
check "creator updates own record"      "updated" "$(as authenticated "$OWNER1" "select public.update_finance_record_v2('$FR','Fuel Aug','Shell','1500','','','INV-77','315','');" | tok)"
check "invoice number persisted"        "INV-77" "$(q "select invoice_number from public.finance_records where id='$FR';")"
check "attacker update: no oracle"      "not_found" "$(as authenticated "$NOONE" "select public.update_finance_record_v2('$FR','Hack','Hack','1','','','','','');" | tok)"
check "org admin CAN update (company authority)" "updated" "$(as authenticated "$ADMIN1" "select public.update_finance_record_v2('$FR','Fuel Aug','Shell','1500','','','INV-77','315','');" | tok)"
check "plain member sees no company rows" "0" "$(as authenticated "$MEMBER1" "select count(*) from public.finance_records where id='$FR';" | tok)"
check "org admin reads it"              "1" "$(as authenticated "$ADMIN1" "select count(*) from public.finance_records where id='$FR';" | tok)"
check "anon: table denied"              "DENIED" "$(as anon '' "select count(*) from public.finance_records;" | tok)"
check "direct UPDATE denied (RPC-only)" "DENIED" "$(as authenticated "$OWNER1" "update public.finance_records set approval_status='approved' where id='$FR';" | tok)"
check "v2 cannot set the approval mirror" "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_finance_record_v2' and pg_get_function_arguments(p.oid) ilike '%approval%';")"

echo
echo "--- D. finance approval seam — the ENGINE decides, sync only copies ---"
STEPS='[{"name":"Approval","approval_mode":"single","approver_rule":{"kind":"org_role","roles":["owner","admin"]}}]'
check "owner authors an EXPENSE template" "created" "$(as authenticated "$OWNER1" "select public.create_workflow_definition_v1('$O1','Expense approval','expense_approval_standard','expense','$STEPS'::jsonb);" | tok)"
DEF_EXP=$(q "select id from public.workflow_definitions where slug='expense_approval_standard';")
VER_EXP=$(q "select id from public.workflow_definition_versions where definition_id='$DEF_EXP' order by version desc limit 1;")
check "owner publishes it"              "published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER_EXP');" | tok)"
check "sync before any instance"        "not_pending" "$(as authenticated "$OWNER1" "select public.sync_finance_record_approval_v1('$FR');" | tok)"
check "attacker cannot submit (no oracle)" "not_found" "$(as authenticated "$NOONE" "select public.submit_finance_record_approval_v1('$FR');" | tok)"
check "creator submits the mirror"      "submitted" "$(as authenticated "$OWNER1" "select public.submit_finance_record_approval_v1('$FR');" | tok)"
check "repeat submit is honest"         "already_pending" "$(as authenticated "$OWNER1" "select public.submit_finance_record_approval_v1('$FR');" | tok)"
check "no engine instance yet → no_instance" "no_instance" "$(as authenticated "$OWNER1" "select public.sync_finance_record_approval_v1('$FR');" | tok)"
INST_EXP=$(as authenticated "$OWNER1" "select public.start_workflow_instance_v1('$DEF_EXP','Fuel Aug','{}'::jsonb,'$FR');" | tok)
check "instance starts WITH the record as context" "UUID" "$(echo "$INST_EXP" | uu)"
check "context type is expense"         "expense" "$(q "select context_entity_type from public.workflow_instances where id='$INST_EXP';")"
check "sync while pending writes nothing" "still_pending" "$(as authenticated "$OWNER1" "select public.sync_finance_record_approval_v1('$FR');" | tok)"
check "admin decides IN THE ENGINE"     "approved" "$(as authenticated "$ADMIN1" "select public.decide_workflow_step_v1('$INST_EXP','approved');" | tok)"
check "mirror still pending until synced" "pending" "$(q "select approval_status from public.finance_records where id='$FR';")"
check "sync copies the outcome"         "approved" "$(as authenticated "$OWNER1" "select public.sync_finance_record_approval_v1('$FR');" | tok)"
check "mirror now approved"             "approved" "$(q "select approval_status from public.finance_records where id='$FR';")"
check "re-submitting an APPROVED record refused" "already_decided" "$(as authenticated "$OWNER1" "select public.submit_finance_record_approval_v1('$FR');" | tok)"
check "sync NEVER decided anything itself: the engine slot holds the only decision" "1" "$(q "select count(*) from public.workflow_instance_approvers where instance_id='$INST_EXP' and decision is not null;")"

echo
echo "--- E. procurement — authority, offers, the manager-only decision ---"
mkinq() { as authenticated "$1" "select public.create_procurement_inquiry_v1('$O1','$2','$3','$4','$5','$6');" | tok; }
check "anon refused"                    "DENIED" "$(as anon '' "select public.create_procurement_inquiry_v1('$O1','x','','','','');" | tok)"
check "attacker with no org (no oracle)" "not_found" "$(mkinq "$NOONE" 'Cement' '40 bags' '' '' '')"
check "wrong-org owner (no oracle)"     "not_found" "$(mkinq "$OUT2" 'Cement' '40 bags' '' '' '')"
check "float budget refused"            "invalid" "$(mkinq "$MEMBER1" 'Cement' '40 bags' '10.00' '' '')"
check "wrong-org object refused"        "not_allowed" "$(mkinq "$MEMBER1" 'Cement' '40 bags' '' '' "$OBJ2")"
check "unmanageable project refused"    "not_allowed" "$(mkinq "$MEMBER1" 'Cement' '40 bags' '' "$PROJ2" '')"
INQ=$(mkinq "$MEMBER1" 'Cement for the foundation' '40 bags' '50000' '' "$OBJ1")
check "PLAIN MEMBER can ask for materials" "UUID" "$(echo "$INQ" | uu)"
INQ_ENG=$(mkinq "$ENGREQ" 'Scaffolding rental' '2 weeks' '' '' '')
check "ENGAGEMENT-truth member can too" "UUID" "$(echo "$INQ_ENG" | uu)"
check "requester reads own inquiry"     "1" "$(as authenticated "$MEMBER1" "select count(*) from public.procurement_inquiries where id='$INQ';" | tok)"
check "org manager reads it"            "1" "$(as authenticated "$MGR1" "select count(*) from public.procurement_inquiries where id='$INQ';" | tok)"
check "a DIFFERENT plain member does NOT" "0" "$(as authenticated "$ENGREQ" "select count(*) from public.procurement_inquiries where id='$INQ';" | tok)"
check "wrong-org owner does NOT"        "0" "$(as authenticated "$OUT2" "select count(*) from public.procurement_inquiries where id='$INQ';" | tok)"
check "anon: table denied"              "DENIED" "$(as anon '' "select count(*) from public.procurement_inquiries;" | tok)"
check "direct INSERT denied (RPC-only)" "DENIED" "$(as authenticated "$OWNER1" "insert into public.procurement_inquiries (organization_id, requester_profile_id, item_description, created_by) values ('$O1','$OWNER1','hack','$OWNER1');" | tok)"
check "requester edits own draft"       "updated" "$(as authenticated "$MEMBER1" "select public.update_procurement_inquiry_v1('$INQ','Cement, 42.5N','40 bags','50000');" | tok)"
check "outsider edit: no oracle"        "not_found" "$(as authenticated "$NOONE" "select public.update_procurement_inquiry_v1('$INQ','hack','','');" | tok)"
OFF1=$(as authenticated "$MEMBER1" "select public.add_procurement_offer_v1('$INQ','Baltic Build','48000','fastest delivery','$DOC_OK');" | tok)
check "requester records offer 1"       "UUID" "$(echo "$OFF1" | uu)"
OFF2=$(as authenticated "$MGR1" "select public.add_procurement_offer_v1('$INQ','Nordic Supply','45500','','');" | tok)
check "manager records offer 2"         "UUID" "$(echo "$OFF2" | uu)"
check "outsider cannot record an offer" "not_found" "$(as authenticated "$NOONE" "select public.add_procurement_offer_v1('$INQ','Fake','1','','');" | tok)"
# (VALID supplier + amount — the DOCUMENT authority must be what refuses.)
check "wrong-org document on an offer refused" "not_allowed" "$(as authenticated "$MGR1" "select public.add_procurement_offer_v1('$INQ','Cross-org Supply','1','','$DOC_OUT');" | tok)"
check "float offer amount refused"      "invalid" "$(as authenticated "$MGR1" "select public.add_procurement_offer_v1('$INQ','Nordic Supply','45.50','','');" | tok)"
check "offers visible to the requester" "2" "$(as authenticated "$MEMBER1" "select count(*) from public.procurement_offers where inquiry_id='$INQ';" | tok)"
check "offers invisible to an outsider" "0" "$(as authenticated "$NOONE" "select count(*) from public.procurement_offers where inquiry_id='$INQ';" | tok)"
check "deciding a DRAFT refused"        "not_submitted" "$(as authenticated "$MGR1" "select public.select_procurement_offer_v1('$INQ','$OFF2','');" | tok)"
check "requester submits"               "submitted" "$(as authenticated "$MEMBER1" "select public.submit_procurement_inquiry_v1('$INQ');" | tok)"
check "repeat submit honest"            "already_submitted" "$(as authenticated "$MEMBER1" "select public.submit_procurement_inquiry_v1('$INQ');" | tok)"
check "editing a submitted inquiry refused" "not_editable" "$(as authenticated "$MEMBER1" "select public.update_procurement_inquiry_v1('$INQ','changed','','');" | tok)"
check "REQUESTER cannot choose the offer (managers only)" "not_found" "$(as authenticated "$MEMBER1" "select public.select_procurement_offer_v1('$INQ','$OFF2','');" | tok)"
check "an offer from ANOTHER inquiry refused" "offer_not_found" "$(as authenticated "$MGR1" "select public.select_procurement_offer_v1('$INQ','$INQ','');" | tok)"
check "manager chooses the cheaper offer" "decided" "$(as authenticated "$MGR1" "select public.select_procurement_offer_v1('$INQ','$OFF2','PO-2026-31');" | tok)"
check "selected offer recorded"         "$OFF2" "$(q "select selected_offer_id from public.procurement_inquiries where id='$INQ';")"
check "order reference recorded"        "PO-2026-31" "$(q "select order_reference from public.procurement_inquiries where id='$INQ';")"
check "requester cannot mark ordered"   "not_found" "$(as authenticated "$MEMBER1" "select public.set_procurement_status_v1('$INQ','ordered','');" | tok)"
check "manager marks ordered"           "updated" "$(as authenticated "$MGR1" "select public.set_procurement_status_v1('$INQ','ordered','');" | tok)"
check "cancelling an ORDERED inquiry refused" "not_editable" "$(as authenticated "$MGR1" "select public.set_procurement_status_v1('$INQ','cancelled','');" | tok)"
check "requester CAN cancel their own draft" "updated" "$(as authenticated "$ENGREQ" "select public.set_procurement_status_v1('$INQ_ENG','cancelled','');" | tok)"

echo
echo "--- F. procurement → invoice link (finance authority re-checked) ---"
FR_INV=$(q "select id from public.finance_records where title='VAT case' limit 1;")
FR_PRIV=$(q "select id from public.finance_records where title='Private' limit 1;")
check "linking a record the caller has NO finance authority over" "not_allowed" "$(as authenticated "$MGR1" "select public.set_procurement_finance_record_v1('$INQ','$FR_PRIV');" | tok)"
check "requester cannot link at all (managers only)" "not_found" "$(as authenticated "$MEMBER1" "select public.set_procurement_finance_record_v1('$INQ','$FR_INV');" | tok)"
check "org OWNER links the settling invoice" "linked" "$(as authenticated "$OWNER1" "select public.set_procurement_finance_record_v1('$INQ','$FR_INV');" | tok)"
check "link stored"                     "$FR_INV" "$(q "select finance_record_id from public.procurement_inquiries where id='$INQ';")"
check "empty id unlinks"                "unlinked" "$(as authenticated "$OWNER1" "select public.set_procurement_finance_record_v1('$INQ','');" | tok)"
check "manager closes the inquiry"      "updated" "$(as authenticated "$MGR1" "select public.set_procurement_status_v1('$INQ','closed','');" | tok)"

echo
echo "--- G. procurement approval seam (same engine, context 'procurement') ---"
INQ2=$(mkinq "$MEMBER1" 'Insulation panels' '60 m2' '120000' '' '')
check "second inquiry filed"            "UUID" "$(echo "$INQ2" | uu)"
check "approval before submit refused"  "not_submitted" "$(as authenticated "$MEMBER1" "select public.submit_procurement_approval_v1('$INQ2');" | tok)"
check "requester submits it"            "submitted" "$(as authenticated "$MEMBER1" "select public.submit_procurement_inquiry_v1('$INQ2');" | tok)"
check "owner authors a PROCUREMENT template" "created" "$(as authenticated "$OWNER1" "select public.create_workflow_definition_v1('$O1','Purchase approval','procurement_approval_standard','procurement','$STEPS'::jsonb);" | tok)"
DEF_PR=$(q "select id from public.workflow_definitions where slug='procurement_approval_standard';")
VER_PR=$(q "select id from public.workflow_definition_versions where definition_id='$DEF_PR' order by version desc limit 1;")
check "owner publishes it"              "published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER_PR');" | tok)"
check "requester flips the mirror"      "submitted" "$(as authenticated "$MEMBER1" "select public.submit_procurement_approval_v1('$INQ2');" | tok)"
INST_PR=$(as authenticated "$MEMBER1" "select public.start_workflow_instance_v1('$DEF_PR','Insulation panels','{}'::jsonb,'$INQ2');" | tok)
check "instance started with the inquiry as context" "UUID" "$(echo "$INST_PR" | uu)"
check "context type is procurement"     "procurement" "$(q "select context_entity_type from public.workflow_instances where id='$INST_PR';")"
check "sync while pending writes nothing" "still_pending" "$(as authenticated "$MEMBER1" "select public.sync_procurement_approval_v1('$INQ2');" | tok)"
check "owner REJECTS in the engine"     "rejected" "$(as authenticated "$OWNER1" "select public.decide_workflow_step_v1('$INST_PR','rejected','over budget');" | tok)"
check "sync copies the rejection"       "rejected" "$(as authenticated "$MEMBER1" "select public.sync_procurement_approval_v1('$INQ2');" | tok)"
check "mirror now rejected"             "rejected" "$(q "select approval_status from public.procurement_inquiries where id='$INQ2';")"
check "the inquiry status itself is UNCHANGED (approval is a separate axis)" "submitted" "$(q "select status from public.procurement_inquiries where id='$INQ2';")"
check "a rejected mirror may be re-submitted" "submitted" "$(as authenticated "$MEMBER1" "select public.submit_procurement_approval_v1('$INQ2');" | tok)"
INST_PR2=$(as authenticated "$MEMBER1" "select public.start_workflow_instance_v1('$DEF_PR','Insulation panels v2','{}'::jsonb,'$INQ2');" | tok)
check "withdrawn instance CLEARS the mirror (never approves)" "withdrawn" "$(as authenticated "$MEMBER1" "select public.withdraw_workflow_instance_v1('$INST_PR2','changed my mind');" | tok)"
check "…and sync reports cleared"       "cleared" "$(as authenticated "$MEMBER1" "select public.sync_procurement_approval_v1('$INQ2');" | tok)"
check "mirror is NULL, not approved"    "NOROWS" "$(as authenticated "$MEMBER1" "select approval_status from public.procurement_inquiries where id='$INQ2';" | tok)"

echo
echo "--- H. business trips — dates, authority, approval mirror, completion ---"
mktrip() { as authenticated "$1" "select public.create_business_trip_v1('$O1','$2','$3','$4','$5','','$6');" | tok; }
check "anon refused"                    "DENIED" "$(as anon '' "select public.create_business_trip_v1('$O1','Oslo','2026-09-01','2026-09-05','x','','');" | tok)"
check "attacker with no org (no oracle)" "not_found" "$(mktrip "$NOONE" Oslo 2026-09-01 2026-09-05 'Install windows' '')"
check "reversed dates refused"          "invalid_dates" "$(mktrip "$MEMBER1" Oslo 2026-09-05 2026-09-01 'Install windows' '')"
check "over-a-year span refused"        "invalid_dates" "$(mktrip "$MEMBER1" Oslo 2026-09-01 2028-09-01 'Install windows' '')"
check "malformed date refused"          "invalid" "$(mktrip "$MEMBER1" Oslo 2026-9-1 2026-09-05 'Install windows' '')"
check "float advance refused"           "invalid" "$(mktrip "$MEMBER1" Oslo 2026-09-01 2026-09-05 'Install windows' '45.00')"
TRIP=$(mktrip "$MEMBER1" Oslo 2026-09-01 2026-09-05 'Install windows at the Oslo site' '25000')
check "plain member files their own trip" "UUID" "$(echo "$TRIP" | uu)"
check "advance stored as integer cents" "25000" "$(q "select advance_amount_cents from public.business_trips where id='$TRIP';")"
check "traveler reads own trip"         "1" "$(as authenticated "$MEMBER1" "select count(*) from public.business_trips where id='$TRIP';" | tok)"
check "org manager reads it"            "1" "$(as authenticated "$MGR1" "select count(*) from public.business_trips where id='$TRIP';" | tok)"
check "another plain member does NOT"   "0" "$(as authenticated "$ENGREQ" "select count(*) from public.business_trips where id='$TRIP';" | tok)"
check "wrong-org owner does NOT"        "0" "$(as authenticated "$OUT2" "select count(*) from public.business_trips where id='$TRIP';" | tok)"
check "anon: table denied"              "DENIED" "$(as anon '' "select count(*) from public.business_trips;" | tok)"
check "direct UPDATE denied (RPC-only)" "DENIED" "$(as authenticated "$MGR1" "update public.business_trips set status='approved' where id='$TRIP';" | tok)"
check "manager cannot edit someone's draft (traveler-own)" "not_found" "$(as authenticated "$MGR1" "select public.update_business_trip_v1('$TRIP','Bergen','2026-09-01','2026-09-05','changed','');" | tok)"
check "traveler edits own draft"        "updated" "$(as authenticated "$MEMBER1" "select public.update_business_trip_v1('$TRIP','Oslo','2026-09-01','2026-09-06','Install windows at the Oslo site','30000');" | tok)"
check "completing a DRAFT refused"      "not_approved" "$(as authenticated "$MGR1" "select public.complete_business_trip_v1('$TRIP');" | tok)"
check "traveler submits"                "submitted" "$(as authenticated "$MEMBER1" "select public.submit_business_trip_v1('$TRIP');" | tok)"
# (VALID field values — the state guard, not the bounds guard, must be what
#  refuses here.)
check "editing a submitted trip refused" "not_editable" "$(as authenticated "$MEMBER1" "select public.update_business_trip_v1('$TRIP','Bergen','2026-09-01','2026-09-06','Changed my mind about the site','');" | tok)"
check "sync with no instance"           "no_instance" "$(as authenticated "$MEMBER1" "select public.sync_business_trip_decision_v1('$TRIP');" | tok)"
check "owner authors a TRIP template"   "created" "$(as authenticated "$OWNER1" "select public.create_workflow_definition_v1('$O1','Business trip approval','business_trip_approval_standard','business_trip','$STEPS'::jsonb);" | tok)"
DEF_TR=$(q "select id from public.workflow_definitions where slug='business_trip_approval_standard';")
VER_TR=$(q "select id from public.workflow_definition_versions where definition_id='$DEF_TR' order by version desc limit 1;")
check "owner publishes it"              "published" "$(as authenticated "$OWNER1" "select public.publish_workflow_version_v1('$VER_TR');" | tok)"
INST_TR=$(as authenticated "$MEMBER1" "select public.start_workflow_instance_v1('$DEF_TR','Trip Oslo','{}'::jsonb,'$TRIP');" | tok)
check "instance started with the trip as context" "UUID" "$(echo "$INST_TR" | uu)"
check "context type is business_trip"   "business_trip" "$(q "select context_entity_type from public.workflow_instances where id='$INST_TR';")"
check "outsider cannot sync (no oracle)" "not_found" "$(as authenticated "$NOONE" "select public.sync_business_trip_decision_v1('$TRIP');" | tok)"
check "sync while pending"              "still_pending" "$(as authenticated "$MEMBER1" "select public.sync_business_trip_decision_v1('$TRIP');" | tok)"
check "admin approves IN THE ENGINE"    "approved" "$(as authenticated "$ADMIN1" "select public.decide_workflow_step_v1('$INST_TR','approved');" | tok)"
check "trip still submitted until synced" "submitted" "$(q "select status from public.business_trips where id='$TRIP';")"
check "manager syncs the outcome"       "approved" "$(as authenticated "$MGR1" "select public.sync_business_trip_decision_v1('$TRIP');" | tok)"
check "trip is now approved"            "approved" "$(q "select status from public.business_trips where id='$TRIP';")"
check "decided_at stamped"              "1" "$(q "select count(*) from public.business_trips where id='$TRIP' and decided_at is not null;")"
check "repeat sync is honest"           "not_submitted" "$(as authenticated "$MGR1" "select public.sync_business_trip_decision_v1('$TRIP');" | tok)"

echo
echo "--- I. trip↔expense linkage; the total is DERIVED, never stored ---"
check "no stored total column exists"   "0" "$(q "select count(*) from information_schema.columns where table_name='business_trips' and column_name ilike '%total%';")"
FR_T1=$(q "select id from public.finance_records where title='Gloves' limit 1;")
check "outsider cannot link (no oracle)" "not_found" "$(as authenticated "$NOONE" "select public.set_finance_record_trip_v1('$FR_T1','$TRIP');" | tok)"
check "no finance authority over the RECORD: merged answer, no oracle" "not_found" "$(as authenticated "$ENGREQ" "select public.set_finance_record_trip_v1('$FR_T1','$TRIP');" | tok)"
# THE cross-org probe: an actor who legitimately owns the record but may not
# see the trip. OUT2 owns company CO2 and therefore its finance rows, but has
# no membership of O1 at all — the SECOND gate (trip visibility) must refuse.
check "wrong-org owner creates their own record" "created" "$(as authenticated "$OUT2" "select public.create_finance_record_v1('expense','Their fuel','Shell','900','draft','','','c2000000-0000-4000-8000-00000000000c','');" | tok)"
FR_OUT=$(q "select id from public.finance_records where title='Their fuel' limit 1;")
check "…and linking it to an UNVIEWABLE trip is refused" "not_allowed" "$(as authenticated "$OUT2" "select public.set_finance_record_trip_v1('$FR_OUT','$TRIP');" | tok)"
check "org admin links an expense to the trip" "linked" "$(as authenticated "$ADMIN1" "select public.set_finance_record_trip_v1('$FR_T1','$TRIP');" | tok)"
check "link stored"                     "$TRIP" "$(q "select trip_id from public.finance_records where id='$FR_T1';")"
check "derived total = the linked non-cancelled rows" "2000" "$(q "select coalesce(sum(amount_cents),0) from public.finance_records where trip_id='$TRIP' and status<>'cancelled';")"
check "empty id unlinks"                "unlinked" "$(as authenticated "$ADMIN1" "select public.set_finance_record_trip_v1('$FR_T1','');" | tok)"
check "traveler completes the approved trip" "completed" "$(as authenticated "$MEMBER1" "select public.complete_business_trip_v1('$TRIP');" | tok)"
check "cancelling a COMPLETED trip refused" "not_editable" "$(as authenticated "$MEMBER1" "select public.cancel_business_trip_v1('$TRIP');" | tok)"
TRIP2=$(mktrip "$ENGREQ" Bergen 2026-10-01 2026-10-03 'Site inspection' '')
check "engagement-truth member files a trip" "UUID" "$(echo "$TRIP2" | uu)"
check "traveler cancels own draft"      "cancelled" "$(as authenticated "$ENGREQ" "select public.cancel_business_trip_v1('$TRIP2');" | tok)"

echo
echo "--- J. append-only events, immutable even for the superuser ---"
check "procurement event UPDATE blocked" "DENIED" "$(q "update public.procurement_events set action='closed' where inquiry_id='$INQ';" | tok)"
check "procurement event DELETE blocked" "DENIED" "$(q "delete from public.procurement_events where inquiry_id='$INQ';" | tok)"
check "trip event UPDATE blocked"       "DENIED" "$(q "update public.business_trip_events set action='approved' where trip_id='$TRIP';" | tok)"
check "trip event DELETE blocked"       "DENIED" "$(q "delete from public.business_trip_events where trip_id='$TRIP';" | tok)"
# The ORDERED action sequence is the real assertion — a count alone would
# pass on the wrong history.
check "the procurement history is the real ordered sequence" \
  "created|updated|offer_added|offer_added|submitted|offer_selected|ordered|finance_linked|finance_unlinked|closed" \
  "$(q "select string_agg(action, '|' order by created_at, id) from public.procurement_events where inquiry_id='$INQ';")"
check "the trip history is the real ordered sequence" \
  "created|updated|submitted|approved|completed" \
  "$(q "select string_agg(action, '|' order by created_at, id) from public.business_trip_events where trip_id='$TRIP';")"
check "events invisible to an outsider" "0" "$(as authenticated "$NOONE" "select count(*) from public.procurement_events where inquiry_id='$INQ';" | tok)"

echo
echo "--- K. rollback → re-apply round trip (engine + finance v1 untouched) ---"
for r in "$R_TRIP" "$R_PROC" "$R_INV"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$r" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -10; echo "ROLLBACK FAILED: $r"; exit 1; fi
  echo "  rolled back: $(basename "$r")"
done
check "procurement tables gone"         "" "$(q "select to_regclass('public.procurement_inquiries');")"
check "business_trips gone"             "" "$(q "select to_regclass('public.business_trips');")"
check "the additive finance columns are gone" "0" "$(q "select count(*) from information_schema.columns where table_name='finance_records' and column_name in ('invoice_number','vat_amount_cents','org_document_id','approval_status','trip_id');")"
check "all train-J commands gone"       "0" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%procurement%' or p.proname like '%business_trip%' or p.proname in ('create_finance_record_v2','update_finance_record_v2','submit_finance_record_approval_v1','sync_finance_record_approval_v1','set_finance_record_trip_v1'));")"
check "finance_records SURVIVES the rollback" "finance_records" "$(q "select to_regclass('public.finance_records');")"
check "the v1 finance RPC survives untouched" "1" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_finance_record_v1';")"
check "the ENGINE survives the rollback" "workflow_instances" "$(q "select to_regclass('public.workflow_instances');")"
check "engine rows survive too"         "1" "$(q "select count(*) from public.workflow_instances where id='$INST_TR';")"
for m in "$M_INV" "$M_PROC" "$M_TRIP"; do
  OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$m" 2>&1)
  if echo "$OUT" | grep -qiE 'ERROR|FATAL'; then echo "$OUT" | head -10; echo "RE-APPLY FAILED: $m"; exit 1; fi
done
check "re-apply is clean (procurement)" "procurement_inquiries" "$(q "select to_regclass('public.procurement_inquiries');")"
check "re-apply is clean (trips)"       "business_trips" "$(q "select to_regclass('public.business_trips');")"
check "re-apply is clean (finance columns)" "5" "$(q "select count(*) from information_schema.columns where table_name='finance_records' and column_name in ('invoice_number','vat_amount_cents','org_document_id','approval_status','trip_id');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
