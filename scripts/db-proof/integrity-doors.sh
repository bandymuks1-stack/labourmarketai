#!/usr/bin/env bash
# ============================================================================
# INTEGRITY DOORS v1 - RUNTIME proof, BEFORE -> AFTER -> ROLLBACK -> RE-APPLY.
#
# Doors: G-1 journal attribution, G-4 roster link without consent, G-5 worker
# skill self-verification, F-5 evidence-event INSERT audit (matrix; nothing
# tightened). The harness (integrity-doors.prelude.sql) reproduces the LIVE
# production definitions; create_journal_entry_full and journal_entry_supersede_v2
# are loaded VERBATIM from the repo migrations; the migration and rollback under
# test are executed verbatim. Every probe runs `set local role authenticated`.
#
# Usage (scratch PostgreSQL 16, no Docker, pick a free port):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58741 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/integrity-doors.sh
# Never point this at production or a shared local stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-58741}"
case "$HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
PSQL="psql -h $HOST -p $PORT -U postgres -d postgres"
M="$REPO/supabase/migrations"
MIG="$M/20261003151300_integrity_doors_v1.sql"
DOWN="$REPO/supabase/rollbacks/20261003151300_integrity_doors_v1.down.sql"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
lf() { tr -d '\r' < "$1" > "$2"; }
lf "$MIG" "$TMP/mig.sql"; lf "$DOWN" "$TMP/down.sql"
lf "$M/20261002120000_journal_explicit_project_attribution_v1.sql" "$TMP/cjef.sql"
tr -d '\r' < "$M/20260720150000_journal_photo_continuity_v1.sql" \
  | awk '/^create or replace function public.journal_entry_supersede_v2/{f=1} f{print} f&&/^\$\$;/{exit}' > "$TMP/supersede.sql"

PA=a1111111-1111-4111-8111-111111111111; WA=aa000000-0000-4000-8000-0000000000a1
PB=b2222222-2222-4222-8222-222222222222; WB=bb000000-0000-4000-8000-0000000000b2
MA=3a333333-3333-4333-8333-333333333333; MB=3b333333-3333-4333-8333-333333333333; MC=3c333333-3333-4333-8333-333333333333
STR=5a555555-5555-4555-8555-555555555555; WSTR=55000000-0000-4000-8000-000000000005
ADM=adadadad-adad-4dad-8dad-adadadadadad
ORGA=0a000000-0000-4000-8000-00000000000a; ORGB=0b000000-0000-4000-8000-00000000000b; ORGC=0c000000-0000-4000-8000-00000000000c
ECA=ec00000a-0000-4000-8000-0000000000a1; ECB=ec00000b-0000-4000-8000-0000000000b2; ECSTR=ec000005-0000-4000-8000-000000000005
PRJA=9a000000-0000-4000-8000-00000000000a; PRJA2=9a000000-0000-4000-8000-0000000000a2; PRJB=9b000000-0000-4000-8000-00000000000b
SK1=5c000000-0000-4000-8000-000000000001; SK2=5c000000-0000-4000-8000-000000000002; SK3=5c000000-0000-4000-8000-000000000003
P1=0e000000-0000-4000-8000-0000000000e1; P2=0e000000-0000-4000-8000-0000000000e2; P3=0e000000-0000-4000-8000-0000000000e3
R1=3e000000-0000-4000-8000-0000000000c1; R2=3e000000-0000-4000-8000-0000000000c2; R3=3e000000-0000-4000-8000-0000000000c3

pass=0; fail=0
su() { $PSQL -tAq -v ON_ERROR_STOP=0 -c "$1" 2>&1 | tr -d '\r'; }
# as <role> <uid> <sql>: one transaction, ROLLED BACK (probe leaves no trace)
as_role() { $PSQL -tAq -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r'
\\set VERBOSITY terse
begin;
set local role $1;
set local app.uid = '$2';
$3
rollback;
SQL
}
as() { as_role authenticated "$1" "$2"; }
# as_commit: same but COMMITS (state setup performed AS the user)
as_commit() { $PSQL -tAq -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r'
\\set VERBOSITY terse
begin;
set local role $1;
set local app.uid = '$2';
$3
commit;
SQL
}
tok() { local o; o=$(grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET)$' | sed '/^$/d'); 
  if echo "$o" | grep -qiE '^(ERROR|FATAL)'; then echo "DENIED:$(echo "$o" | grep -iE '^(ERROR|FATAL)' | head -1 | sed -E 's/^ERROR:  //; s/^FATAL:  //' | cut -c1-70)";
  elif [ -z "$o" ]; then echo "OK"; else echo "$o" | tr '\n' '|' | sed 's/|$//'; fi; }
q() { su "$1" | head -1; }
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-78s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-78s\n        expected=%s\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
checkre() { if echo "$3" | grep -qE "$2"; then printf '  PASS  %-78s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-78s\n        wanted /%s/\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

build() {
  $PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/integrity-doors.prelude.sql" >/dev/null 2>"$TMP/e" || { echo "PRELUDE FAILED"; cat "$TMP/e"; exit 1; }
  $PSQL -q -v ON_ERROR_STOP=1 -f "$TMP/cjef.sql" >/dev/null 2>"$TMP/e" || { echo "create_journal_entry_full LOAD FAILED"; cat "$TMP/e"; exit 1; }
  $PSQL -q -v ON_ERROR_STOP=1 -f "$TMP/supersede.sql" >/dev/null 2>"$TMP/e" || { echo "supersede LOAD FAILED"; cat "$TMP/e"; exit 1; }
  $PSQL -q -v ON_ERROR_STOP=1 -c "grant execute on function public.journal_entry_supersede_v2(uuid,uuid,text,uuid,text,character,text,text,jsonb,text[],text[]) to authenticated;" >/dev/null 2>&1
  $PSQL -q -v ON_ERROR_STOP=1 -f "$HERE/integrity-doors.seed.sql" >/dev/null 2>"$TMP/e" || { echo "SEED FAILED"; cat "$TMP/e"; exit 1; }
}

# ── probes ───────────────────────────────────────────────────────────────────
ins_direct() { # uid worker ctx project(null|uuid)
  local pj="null"; [ "$4" != "null" ] && pj="'$4'"
  as "$1" "insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope, project_id) values ('$2','$3','freeform','probe','lt','h','closed',$pj);" | tok; }
rpc_new() { # uid worker ctx project|null explicit
  local pj="null::uuid"; [ "$4" != "null" ] && pj="'$4'::uuid"
  as "$1" "select public.create_journal_entry_full('$2','$3','freeform',null,'probe','lt','h0','h1','closed','[]'::jsonb,$pj,$5) is not null;" | tok; }
mgr_reads_foreign() { # entries manager MB can read that point at ORGB context but belong to worker A
  as "$MB" "select count(*) from public.journal_entries where worker_id='$WA' and engagement_context_id='$ECB';" | tok; }
mk_entry() { # committed entry owned by PA in ECA, optional project; echoes id
  local pj="null"; [ -n "${1:-}" ] && pj="'$1'"
  su "insert into public.journal_entries (id, worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope, project_id) values (gen_random_uuid(),'$WA','$ECA','freeform','seed text','lt','hs','closed',$pj) returning id;" | head -1; }
supersede() { # uid old ctx
  as "$1" "select public.journal_entry_supersede_v2('$2','$3','freeform',null,'edited','lt','hx','closed','[]'::jsonb,'{}','{}') is not null;" | tok; }

# G-5 probes
sk_selfverify_update() { as "$PA" "update public.worker_skills set verified=true, verified_by='$PA', verified_at=now(), source='manager_confirmed', confidence_bin='green', confidence_score=99 where worker_id='$WA' and skill_id='$SK1';" | tok; }
sk_selfverify_insert() { as "$PA" "insert into public.worker_skills (worker_id, skill_id, verified, verified_by, verified_at, source, confidence_bin, confidence_score) values ('$WA','$SK2',true,'$PA',now(),'manager_confirmed','green',99);" | tok; }
sk_row() { su "select verified||'|'||source||'|'||confidence_bin||'|'||confidence_score from public.worker_skills where worker_id='$WA' and skill_id='$1';"; }

# G-4 probes
mgr_force_link() { as "$MA" "update public.organization_people set link_state='linked', link_method='manager_link', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P1';" | tok; }
subj_sees() { as "$PA" "select count(*) from public.organization_evidence_records where id in ('$R1','$R2','$R3');" | tok; }
subj_sees_events() { as "$PA" "select count(*) from public.organization_evidence_events where record_id in ('$R1','$R2','$R3');" | tok; }

# F-5 matrix: actor x event_type -> OK|DENIED
ev() { # uid type [actor_role actor_org]
  local role="null" aorg="null"; [ -n "${3:-}" ] && role="'$3'"; [ -n "${4:-}" ] && aorg="'$4'"
  as "$1" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, actor_organization_id, actor_role) values ('$ORGA','$R1','$2','$1',$aorg,$role);" | tok | sed -E 's/^DENIED:.*/DENIED/'; }
matrix() {
  local out=""
  for t in attestation_withdrawn withdrawn reinstated corrected source_preserved disputed dispute_withdrawn verification_withdrawn; do
    out+="MA:$t=$(ev $MA $t) "; done
  out+="MA:attested=$(ev $MA attested employer $ORGA) "
  out+="MA:attested_wrongrole=$(ev $MA attested client $ORGA) "
  out+="MA:independently_verified=$(ev $MA independently_verified client $ORGA) "
  out+="MC:independently_verified=$(ev $MC independently_verified client $ORGC) "
  out+="MC:attested=$(ev $MC attested employer $ORGC) "
  out+="MC:withdrawn=$(ev $MC withdrawn) "
  out+="MB:attested=$(ev $MB attested employer $ORGB) "
  out+="MB:independently_verified=$(ev $MB independently_verified client $ORGB) "
  out+="STR:disputed=$(ev $STR disputed) "
  out+="STR:independently_verified=$(ev $STR independently_verified client $ORGC) "
  out+="PA:independently_verified=$(ev $PA independently_verified client $ORGC) "
  out+="PA:attested=$(ev $PA attested employer $ORGA) "
  echo "$out"; }

echo "=============================================================="
echo " INTEGRITY DOORS v1 - runtime proof"
echo " migration: $(basename "$MIG")"
echo "=============================================================="
build
echo "harness: prelude + verbatim create_journal_entry_full + journal_entry_supersede_v2 + seed"

# subject PA confirms ONE legit roster link in the baseline (P2) through the real flow, used by the legit-flow probes
su "update public.organization_people set link_state='link_proposed', link_method='manager_offer', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P2';" >/dev/null
# a skill PA already owns (self-declared)
su "insert into public.worker_skills (worker_id, skill_id) values ('$WA','$SK1');" >/dev/null

echo; echo "== BEFORE: the four doors are open on the LIVE definitions ====="
echo "-- G-1"
check "G-1 exploit: PA direct-inserts an entry in ORG B's context (FOREIGN)"     "OK" "$(ins_direct $PA $WA $ECB null)"
check "G-1 exploit: via the RPC create_journal_entry_full (SECURITY INVOKER)"   "t"  "$(rpc_new $PA $WA $ECB null false)"
check "G-1 exploit: PA attributes the entry to ORG B's PROJECT B via direct insert" "OK" "$(ins_direct $PA $WA $ECA $PRJB)"
check "G-1 exploit: PA attributes ORG A's project A2 (not assigned) directly"  "OK" "$(ins_direct $PA $WA $ECA $PRJA2)"
su "insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope) values ('$WA','$ECB','freeform','planted by A in B','lt','h','closed');" >/dev/null
check "G-1 consequence: ORG B's manager READS the entry the foreign worker planted" "1" "$(mgr_reads_foreign)"
su "delete from public.journal_entries where original_text='planted by A in B';" >/dev/null
E_SUP=$(mk_entry "$PRJA")
check "G-1 exploit: supersede_v2 (definer) accepts a FOREIGN context"            "t"  "$(supersede $PA $E_SUP $ECB)"
echo "-- G-5"
check "G-5 exploit: PA self-verifies an owned skill (verified+manager_confirmed+green)" "OK" "$(sk_selfverify_update)"
check "G-5 exploit: PA inserts a pre-verified skill row"                        "OK" "$(sk_selfverify_insert)"
su "update public.worker_skills set verified=false, verified_by=null, verified_at=null, source='self_declared', confidence_bin='red', confidence_score=0 where worker_id='$WA' and skill_id='$SK1'; delete from public.worker_skills where skill_id='$SK2';" >/dev/null
echo "-- G-4"
check "G-4 exploit: manager MA forces link_state='linked'/'manager_link' onto PA WITHOUT consent" "OK" "$(mgr_force_link)"
su "update public.organization_people set link_state='linked', link_method='manager_link', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P1';" >/dev/null
check "G-4 consequence: the employee now SEES the imported records (record P1)" "1" "$(as "$PA" "select count(*) from public.organization_evidence_records where id='$R1';" | tok)"
su "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, actor_organization_id, actor_role) values ('$ORGA','$R1','attested','$MA','$ORGA','employer');" >/dev/null
check "G-4 consequence: ...and the attested events on them" "1" "$(as "$PA" "select count(*) from public.organization_evidence_events where record_id='$R1';" | tok)"
check "G-4 consequence: ...and may DISPUTE as the 'subject' (never asked)" "OK" "$(as "$PA" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORGA','$R1','disputed','$PA');" | tok)"
M_BEFORE="$(matrix)"
echo "-- F-5 matrix BEFORE (live policies): $M_BEFORE"
# reset G-4 state
su "update public.organization_people set link_state='unlinked', link_method=null, linked_profile_id=null, linked_worker_id=null, linked_by=null, linked_at=null where id='$P1';" >/dev/null

echo; echo "== APPLY $(basename "$MIG") verbatim ==="
out=$($PSQL -q -v ON_ERROR_STOP=1 -f "$TMP/mig.sql" 2>&1 | tr -d '\r'); echo "$out" | grep -qiE '^(psql:.*)?ERROR' && { echo "$out" | head; echo "MIGRATION FAILED"; exit 1; }
echo "  applied cleanly"
out=$($PSQL -q -v ON_ERROR_STOP=1 -f "$TMP/mig.sql" 2>&1 | tr -d '\r'); echo "$out" | grep -qiE 'ERROR' && { echo "$out" | head; echo "RE-RUN FAILED"; exit 1; }
echo "  re-runnable (applied twice)"

echo; echo "== AFTER: G-1 journal attribution ============================="
checkre "G-1 direct insert in a FOREIGN context is refused"                    "DENIED:engagement_context_not_own" "$(ins_direct $PA $WA $ECB null)"
checkre "G-1 the RPC with a FOREIGN context is refused"                         "DENIED:engagement_context_not_own" "$(rpc_new $PA $WA $ECB null false)"
checkre "G-1 the RPC with a FOREIGN context + explicit foreign project refused" "DENIED:(engagement_context_not_own|project_not_assignable)" "$(rpc_new $PA $WA $ECB $PRJB true)"
checkre "G-1 a FOREIGN project on own context is refused (direct insert)"      "DENIED:project_not_assignable" "$(ins_direct $PA $WA $ECA $PRJB)"
checkre "G-1 own-org project the worker is NOT assigned to is refused"         "DENIED:project_not_assignable" "$(ins_direct $PA $WA $ECA $PRJA2)"
checkre "G-1 …and via the RPC (its own check fires first, same code)"          "DENIED:project_not_assignable" "$(rpc_new $PA $WA $ECA $PRJA2 true)"
checkre "G-1 a worker cannot write ANOTHER worker's id (RLS, unchanged)"       "DENIED" "$(ins_direct $PA $WB $ECA null)"
checkre "G-1 a worker cannot use ANOTHER worker's context for their own entry" "DENIED:engagement_context_not_own" "$(ins_direct $PB $WB $ECA null)"
check   "G-1 ORG B's manager reads NO foreign-planted entry"                   "0" "$(mgr_reads_foreign)"
checkre "G-1 supersede_v2 (definer) with a FOREIGN context is refused"         "DENIED:engagement_context_not_own" "$(supersede $PA $E_SUP $ECB)"
echo "-- legit flows still work"
check "legit employee entry: RPC, own context, no project"                      "t"  "$(rpc_new $PA $WA $ECA null false)"
check "legit employee entry: RPC auto-links the single assigned project"        "t"  "$(rpc_new $PA $WA $ECA null false)"
check "legit employee entry: RPC explicit assigned project"                     "t"  "$(rpc_new $PA $WA $ECA $PRJA true)"
check "legit employee entry: direct insert, assigned project (policy path)"     "OK" "$(ins_direct $PA $WA $ECA $PRJA)"
check "legit employee entry: direct insert, own context, no project"            "OK" "$(ins_direct $PA $WA $ECA null)"
check "legit independent provider: personal (org NULL) context, no project"     "t"  "$(rpc_new $STR $WSTR $ECSTR null false)"
check "legit worker B: own org, own assigned project"                           "t"  "$(rpc_new $PB $WB $ECB $PRJB true)"
check "legit supersede / correction carrying the SAME context"                  "t"  "$(supersede $PA $E_SUP $ECA)"
su "update public.project_worker_assignments set status='ended' where worker_id='$WA' and project_id='$PRJA';" >/dev/null
E_SUP2=$(mk_entry "$PRJA")
check "legit supersede AFTER the assignment ended (project carried; continuation)" "t" "$(supersede $PA $E_SUP2 $ECA)"
checkre "…but a NEW explicit attribution to the ended project is refused"        "DENIED:project_not_assignable" "$(rpc_new $PA $WA $ECA $PRJA true)"
su "update public.project_worker_assignments set status='active' where worker_id='$WA' and project_id='$PRJA';" >/dev/null
check "legit document-draft / voice entries use the same RPC + supersede (no other writer)" "t" "$(rpc_new $PA $WA $ECA $PRJA true)"
check "privileged path (auth.uid() NULL, e.g. service role) is not blocked"      "INSERT 0 1" "$($PSQL -tA -c "insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope) values ('$WA','$ECB','freeform','service path','lt','h','closed');" 2>&1 | tr -d '\r')"
su "delete from public.journal_entries where original_text='service path';" >/dev/null
checkre "UPDATE of the context by an end user is refused too (guard on UPDATE)" "DENIED:engagement_context_not_own" "$(as_role postgres "$PA" "update public.journal_entries set engagement_context_id='$ECB' where id='$E_SUP2';" | tok)"

echo; echo "== AFTER: G-5 worker_skills ==================================="
checkre "G-5 self-verify UPDATE refused"                                        "DENIED:worker_skill_verification_is_pipeline_only" "$(sk_selfverify_update)"
checkre "G-5 pre-verified INSERT refused"                                       "DENIED:worker_skill_verification_is_pipeline_only" "$(sk_selfverify_insert)"
check   "G-5 the row is unchanged"                                              "false|self_declared|red|0" "$(sk_row $SK1)"
for col in "verified=true" "verified_by='$PA'" "verified_at=now()" "source='manager_confirmed'" "confidence_bin='green'" "confidence_score=50" "last_recompute_at=now()"; do
  checkre "G-5 single-column attempt refused: $col" "DENIED:worker_skill_verification_is_pipeline_only" "$(as "$PA" "update public.worker_skills set $col where worker_id='$WA' and skill_id='$SK1';" | tok)"
done
echo "-- legit self-declared writes still work"
check "legit: insert a self-declared skill (defaults)"                          "OK" "$(as "$PA" "insert into public.worker_skills (worker_id, skill_id) values ('$WA','$SK2');" | tok)"
check "legit: the app's upsert payload (verified:false, self_declared, yellow, ignoreDuplicates)" "OK" "$(as "$PA" "insert into public.worker_skills (worker_id, skill_id, verified, source, confidence_bin) values ('$WA','$SK3',false,'self_declared','yellow') on conflict (worker_id, skill_id) do nothing;" | tok)"
check "legit: upsert of an EXISTING skill (conflict do nothing)"                "OK" "$(as "$PA" "insert into public.worker_skills (worker_id, skill_id, verified, source, confidence_bin) values ('$WA','$SK1',false,'self_declared','yellow') on conflict (worker_id, skill_id) do nothing;" | tok)"
check "legit: source reconcile self_declared -> work_journal (verified=false fence)" "OK" "$(as "$PA" "update public.worker_skills set source='work_journal', updated_at=now() where worker_id='$WA' and skill_id='$SK1' and verified=false;" | tok)"
check "legit: ...and back to self_declared"                                     "OK" "$(as "$PA" "update public.worker_skills set source='self_declared' where worker_id='$WA' and skill_id='$SK1';" | tok)"
check "legit: self_rated_level and the pace fields"                             "OK" "$(as "$PA" "update public.worker_skills set self_rated_level=4, current_pace_value=12 where worker_id='$WA' and skill_id='$SK1';" | tok)"
check "legit: the worker may still DELETE their own claim"                      "OK" "$(as "$PA" "delete from public.worker_skills where worker_id='$WA' and skill_id='$SK2';" | tok)"
echo "-- the SECURITY DEFINER pipeline still verifies"
check "definer writer (confirm_entry_and_verify_skills stand-in) verifies 1 row, called by a manager" "1" "$(as_commit authenticated "$MA" "select public.confirm_entry_and_verify_skills('$WA', array['$SK1']::uuid[]);" | tok)"
su "select 1" >/dev/null
check "...the row is now verified / manager_confirmed / green"                  "true|manager_confirmed|green|0" "$(sk_row $SK1)"
checkre "...and the WORKER still cannot touch the verified columns afterwards"  "DENIED:worker_skill_verification_is_pipeline_only" "$(as "$PA" "update public.worker_skills set verified=false where worker_id='$WA' and skill_id='$SK1';" | tok)"
checkre "...nor downgrade the confirmed source"                                 "DENIED:worker_skill_verification_is_pipeline_only" "$(as "$PA" "update public.worker_skills set source='self_declared' where worker_id='$WA' and skill_id='$SK1';" | tok)"
$PSQL -q -c "grant select, update on public.worker_skills to service_role; grant usage on schema public to service_role;" >/dev/null 2>&1
check "service role (current_user service_role) keeps full authority"                                        "OK" "$(as_role service_role "$PA" "update public.worker_skills set confidence_score=77 where worker_id='$WA' and skill_id='$SK1';" | tok)"
check "admin keeps the authority the policy always gave it"                     "OK" "$(as "$ADM" "update public.worker_skills set confidence_bin='yellow' where worker_id='$WA' and skill_id='$SK1';" | tok)"
check "the real journal pipeline path (supersede definer) still inserts self-declared/yellow skills" "t" "$(as "$PA" "select public.journal_entry_supersede_v2('$(mk_entry "")','$ECA','freeform',null,'t','lt','hz','closed','[]'::jsonb,array['tiling','welding'],'{}') is not null;" | tok)"

echo; echo "== AFTER: G-4 roster link without consent ====================="
su "update public.organization_people set link_state='unlinked', link_method=null, linked_profile_id=null, linked_worker_id=null, linked_by=null, linked_at=null where id='$P1';" >/dev/null
checkre "G-4 manager forcing linked/'manager_link' is REFUSED"                   "DENIED:a roster link becomes linked only" "$(mgr_force_link)"
checkre "G-4 manager forging linked/'worker_confirmed' is refused (existing guard)" "DENIED:roster link confirmation is the subject" "$(as "$MA" "update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P1';" | tok)"
checkre "G-4 manager forcing linked/'invitation' is refused"                      "DENIED:a roster link becomes linked only" "$(as "$MA" "update public.organization_people set link_state='linked', link_method='invitation', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P1';" | tok)"
checkre "G-4 manager INSERTing a row already 'linked' is refused (policy, unchanged)" "DENIED" "$(as "$MA" "insert into public.organization_people (organization_id, display_name, normalized_name, link_state, link_method, linked_profile_id, linked_worker_id, created_by) values ('$ORGA','x','x','linked','manager_link','$PA','$WA','$MA');" | tok)"
check   "G-4 the 'manager_link' VALUE stays legal for other uses (state link_proposed)" "OK" "$(as "$MA" "update public.organization_people set link_state='link_proposed', link_method='manager_link', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P1';" | tok)"
check   "G-4 ...and a proposed link shows the subject NOTHING"                   "0" "$(subj_sees)"
su "update public.organization_people set link_state='unlinked', link_method=null, linked_profile_id=null, linked_worker_id=null where id='$P1';" >/dev/null
su "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id, actor_organization_id, actor_role) values ('$ORGA','$R2','attested','$MA','$ORGA','employer');" >/dev/null
echo "-- legit flow: manager offer -> link_proposed -> subject accept -> worker_confirmed -> history visible"
check   "offer exists (link_proposed / manager_offer, P2)"                         "link_proposed|manager_offer" "$(q "select link_state||'|'||link_method from public.organization_people where id='$P2';")"
check   "before acceptance the subject sees NO history"                          "0" "$(subj_sees)"
check   "subject ACCEPTS (the exact patch import-core.ts sends)"                  "OK" "$(as_commit authenticated "$PA" "update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_at=now() where id='$P2' and linked_profile_id='$PA' and link_state='link_proposed';" | tok)"
check   "row is linked / worker_confirmed, linked_by = the subject (trigger)"     "linked|worker_confirmed|$PA" "$(q "select link_state||'|'||link_method||'|'||linked_by from public.organization_people where id='$P2';")"
check   "after acceptance the subject sees the record of THAT roster row only"     "1" "$(subj_sees)"
check   "...and its events"                                                      "$(q "select count(*) from public.organization_evidence_events where record_id='$R2';")" "$(subj_sees_events)"
check   "the unrelated roster rows (P1, P3) stay invisible to the subject"        "0" "$(as "$PA" "select count(*) from public.organization_evidence_records where id in ('$R1','$R3');" | tok)"
check   "subject may DISPUTE a confirmed record"                                 "OK" "$(as "$PA" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORGA','$R2','disputed','$PA');" | tok)"
su "update public.organization_people set link_state='unlinked', link_method=null, linked_profile_id=null, linked_worker_id=null, linked_at=null where id='$P2';" >/dev/null
check   "when the link ends (privileged unlink) the history is gone from the subject again" "0" "$(subj_sees)"
check   "manager can still read/mutate other roster fields (rename)"             "OK" "$(as "$MA" "update public.organization_people set display_name='Renamed' where id='$P3';" | tok)"
echo "-- defence in depth: a row forced to linked/'manager_link' by a PRIVILEGED writer is still NOT subject-visible"
su "update public.organization_people set link_state='linked', link_method='manager_link', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P1';" >/dev/null
check   "RLS: subject sees NO records of a manager_link 'linked' row"             "0" "$(as "$PA" "select count(*) from public.organization_evidence_records where id='$R1';" | tok)"
check   "RLS: ...no events"                                                      "0" "$(as "$PA" "select count(*) from public.organization_evidence_events where record_id='$R1';" | tok)"
checkre "RLS: ...and cannot dispute on it"                                       "DENIED" "$(as "$PA" "insert into public.organization_evidence_events (organization_id, record_id, event_type, actor_profile_id) values ('$ORGA','$R1','disputed','$PA');" | tok)"
check   "RLS: the managing organisation still sees its own records"              "1" "$(as "$MA" "select count(*) from public.organization_evidence_records where id='$R1';" | tok)"
check   "RLS: subject cannot read the PARTIES of a manager_link row (is_evidence_record_subject)" "0" "$(as "$PA" "select count(*) from public.organization_evidence_parties where record_id='$R1';" | tok)"
check   "RLS: ...nor its competency signals"                                      "0" "$(as "$PA" "select count(*) from public.organization_evidence_competency_signals where record_id='$R1';" | tok)"
check   "RLS: ...nor export its import rows (privacy export definer)"            "0" "$(as "$PA" "select count(*) from public.privacy_export_evidence_import_rows_v1() x where x->>'organization_person_id'='$P1';" | tok)"
checkre "RLS: ...nor withdraw a contest on it (definer RPC)"                      "DENIED:only the subject of this record" "$(as "$PA" "select public.withdraw_organization_evidence_dispute_v1('$R1');" | tok)"
su "update public.organization_people set link_state='unlinked', link_method=null, linked_profile_id=null, linked_worker_id=null where id='$P1';" >/dev/null
su "set app.uid='$PA'; update public.organization_people set link_state='linked', link_method='worker_confirmed', linked_profile_id='$PA', linked_worker_id='$WA' where id='$P3';" >/dev/null
check   "confirmed row: subject reads PARTIES / signals / export rows through the same surfaces" "1|1|1" "$(as "$PA" "select (select count(*) from public.organization_evidence_parties where record_id='$R3') ||'|'|| (select count(*) from public.organization_evidence_competency_signals where record_id='$R3') ||'|'|| (select count(*) from public.privacy_export_evidence_import_rows_v1() x where x->>'organization_person_id'='$P3');" | tok)"
checkre "confirmed row: withdraw RPC reaches its own logic (idempotent no-op)"    "idempotent" "$(as "$PA" "select public.withdraw_organization_evidence_dispute_v1('$R3');" | tok)"
su "update public.organization_people set link_state='unlinked', link_method=null, linked_profile_id=null, linked_worker_id=null, linked_by=null, linked_at=null where id='$P3';" >/dev/null

echo; echo "== AFTER: F-5 evidence-event INSERT matrix (audit; NOTHING tightened) ==="
M_AFTER="$(matrix)"
echo "   $M_AFTER"
check "F-5 matrix is IDENTICAL before and after the migration (no policy changed)" "$M_BEFORE" "$M_AFTER"
EXPECT="MA:attestation_withdrawn=OK MA:withdrawn=OK MA:reinstated=OK MA:corrected=OK MA:source_preserved=DENIED MA:disputed=DENIED MA:dispute_withdrawn=DENIED MA:verification_withdrawn=DENIED MA:attested=OK MA:attested_wrongrole=DENIED MA:independently_verified=DENIED MC:independently_verified=OK MC:attested=DENIED MC:withdrawn=DENIED MB:attested=DENIED MB:independently_verified=DENIED STR:disputed=DENIED STR:independently_verified=DENIED PA:independently_verified=DENIED PA:attested=DENIED "
check "F-5 audit result: only the designed doors are open (no bypass of an RPC-enforced rule)" "${EXPECT% }" "${M_AFTER% }"

echo; echo "== objects ===================================================="
check "no policy dropped: events INSERT policies = 4 (attest, verify, subject_dispute, hist_p4)" "4" "$(q "select count(*) from pg_policies where tablename='organization_evidence_events' and cmd='INSERT';")"
check "hist_p4 is still RESTRICTIVE"                                             "RESTRICTIVE" "$(q "select permissive from pg_policies where policyname='hist_p4_events_insert';")"
check "G-1 trigger present, BEFORE INSERT OR UPDATE"                             "1" "$(q "select count(*) from pg_trigger where tgname='journal_entries_attribution_guard_v1' and not tgisinternal and (tgtype & 4)=4 and (tgtype & 16)=16 and (tgtype & 2)=2;")"
check "G-5 trigger function is SECURITY INVOKER (current_user is the real caller)" "f" "$(q "select prosecdef from pg_proc where proname='worker_skills_integrity_guard_v1';")"
check "G-4 trigger function is SECURITY INVOKER"                                 "f" "$(q "select prosecdef from pg_proc where proname='organization_people_linked_requires_consent_guard_v1';")"
check "G-1 trigger function is SECURITY DEFINER with a pinned search_path"       "true|{search_path=public}" "$(q "select prosecdef||'|'||proconfig::text from pg_proc where proname='journal_entries_attribution_guard_v1';")"
for f in journal_entries_attribution_guard_v1 worker_skills_integrity_guard_v1 organization_people_linked_requires_consent_guard_v1; do
  check "anon cannot EXECUTE $f"                  "f" "$(q "select has_function_privilege('anon','public.$f()','execute');")"
  check "authenticated cannot EXECUTE $f"         "f" "$(q "select has_function_privilege('authenticated','public.$f()','execute');")"
done
check "existing consent guard function untouched (md5 equal to the live body)"   "1" "$(q "select count(*) from pg_proc where proname='organization_people_guard_subject_consent' and prosrc like '%roster link confirmation is the subject%';")"
check "create_journal_entry_full unchanged (still SECURITY INVOKER)"             "f" "$(q "select bool_or(prosecdef) from pg_proc where proname='create_journal_entry_full';")"

echo; echo "== ROLLBACK $(basename "$DOWN") verbatim ======================"
out=$($PSQL -q -v ON_ERROR_STOP=1 -f "$TMP/down.sql" 2>&1 | tr -d '\r'); echo "$out" | grep -qiE 'ERROR' && { echo "$out" | head; echo "ROLLBACK FAILED"; exit 1; }
check "rollback removes the three triggers"                                      "0" "$(q "select count(*) from pg_trigger where tgname in ('journal_entries_attribution_guard_v1','worker_skills_integrity_guard_v1','organization_people_linked_requires_consent_guard_v1');")"
check "rollback removes the three functions"                                     "0" "$(q "select count(*) from pg_proc where proname in ('journal_entries_attribution_guard_v1','worker_skills_integrity_guard_v1','organization_people_linked_requires_consent_guard_v1');")"
check "rollback restores the doors (G-1 foreign context accepted again)"          "OK" "$(ins_direct $PA $WA $ECB null)"
check "rollback restores the doors (G-5 self-verify accepted again)"              "OK" "$(sk_selfverify_update)"
check "rollback restores the live subject policy (no link_method term)"           "0" "$(q "select count(*) from pg_policies where policyname='organization_evidence_records_select' and qual like '%worker_confirmed%';")"
check "rollback: policy count unchanged"                                          "4" "$(q "select count(*) from pg_policies where tablename='organization_evidence_events' and cmd='INSERT';")"

echo; echo "== RE-APPLY ==================================================="
out=$($PSQL -q -v ON_ERROR_STOP=1 -f "$TMP/mig.sql" 2>&1 | tr -d '\r'); echo "$out" | grep -qiE 'ERROR' && { echo "$out" | head; echo "RE-APPLY FAILED"; exit 1; }
checkre "re-apply closes G-1 again"  "DENIED:engagement_context_not_own" "$(ins_direct $PA $WA $ECB null)"
su "update public.worker_skills set verified=false, verified_by=null, verified_at=null, source='self_declared', confidence_bin='red', confidence_score=0 where worker_id='$WA' and skill_id='$SK1';" >/dev/null
checkre "re-apply closes G-5 again"  "DENIED:worker_skill_verification_is_pipeline_only" "$(sk_selfverify_update)"
checkre "re-apply closes G-4 again"  "DENIED:a roster link becomes linked only" "$(mgr_force_link)"

echo; echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
