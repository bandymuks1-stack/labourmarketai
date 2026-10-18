#!/usr/bin/env bash
# ============================================================================
# TEAM -> DEMAND OFFER v1 — REAL PostgreSQL proof (no Docker, no Supabase).
#
# Proves migration 20261007150000_team_demand_offer_v1 (and its rollback) on a
# THROWAWAY native PostgreSQL cluster. The REAL prior migrations build
# work_objects / work_tasks (20260817150000, 20260711210000) and team_assignments
# (20261003150600); the rest of the platform is stubbed in the existing
# work-tasks-stage-subtask / team-assignment-canonical preludes plus
# team-demand-offer.prelude.sql.
#
# Every probe runs under `set role authenticated|anon` with a real
# request.jwt.claim.sub, so RLS / EXECUTE grants genuinely decide.
#
# Usage (Windows git-bash; ports 54290-54389 are outside the Windows excluded range):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/team-demand-offer.sh
# Never point this at production or at a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
LFD="$(mktemp -d)"
for f in "$M"/20260817150000_work_objects_v1.sql "$M"/20260711210000_work_tasks_v1.sql \
         "$M"/20261003150600_brigade_work_assignment_v1.sql "$M"/20261007150000_team_demand_offer_v1.sql; do
  tr -d '\r' < "$f" > "$LFD/$(basename "$f")"
done
tr -d '\r' < "$REPO/supabase/rollbacks/20261007150000_team_demand_offer_v1.down.sql" > "$LFD/rollback.down.sql"
MIGRATION="$LFD/20261007150000_team_demand_offer_v1.sql"; ROLLBACK="$LFD/rollback.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/work-tasks-stage-subtask.prelude.sql" \
         "$HERE/team-assignment-canonical.prelude2.sql" \
         "$HERE/team-demand-offer.prelude.sql" \
         "$LFD/20260817150000_work_objects_v1.sql" \
         "$LFD/20260711210000_work_tasks_v1.sql" \
         "$LFD/20261003150600_brigade_work_assignment_v1.sql"; do
  tr -d '\r' < "$f" | $PSQL -v ON_ERROR_STOP=1 -f - >/dev/null 2>/tmp/_base_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_base_err_$$; exit 1; }
done
rm -f /tmp/_base_err_$$
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-assignment-canonical.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/team-demand-offer.seed.sql" >/dev/null || { echo "seed2 FAILED"; exit 1; }

OWN=c0c00000-0000-0000-0000-0000000000a1   # owner/manager of brigades C and SOLO; owns no other demand
MB=66666666-6666-6666-6666-666666666666    # owner of Company B / demands R1..R4,R7; manager of org B
MBM=c0c30000-0000-0000-0000-000000000001   # org B manager by MEMBERSHIP (has demand access, not the demand's owner profile)
MA=33333333-3333-3333-3333-333333333333    # manager of org A and of team A (NOT a party to R1)
M1=c0c10000-0000-0000-0000-000000000001    # brigade C members (secret identities)
M2=c0c10000-0000-0000-0000-000000000002
ADM=55555555-5555-5555-5555-555555555555
STRANGER=00000000-0000-0000-0000-0000000000ff
TC=7ea00000-0000-0000-0000-0000000000c1
TSOLO=7ea00000-0000-0000-0000-0000000000c2
TA=7ea00000-0000-0000-0000-00000000000a
R1=d0d00000-0000-0000-0000-000000000001; R2=d0d00000-0000-0000-0000-000000000002
R3=d0d00000-0000-0000-0000-000000000003; R4=d0d00000-0000-0000-0000-000000000004
R5=d0d00000-0000-0000-0000-000000000005; R6=d0d00000-0000-0000-0000-000000000006
R7=d0d00000-0000-0000-0000-000000000007
PB=99999999-0000-0000-0000-00000000000b; P1=99999999-0000-0000-0000-000000000001
ORGA=aaaaaaaa-0000-0000-0000-000000000001
GHOST=d0d00000-0000-0000-0000-0000000000ee

pass=0; fail=0
as() { local who="$1"; shift
  local pre="set role authenticated; set request.jwt.claim.sub='$who';"
  [ "$who" = "anon" ] && pre="set role anon;"
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
hasnt() { if printf '%s' "$3" | grep -qiE "$2"; then echo "  FAIL  $1 (found /$2/ in [$3])"; fail=$((fail+1)); else echo "  PASS  $1"; pass=$((pass+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }
oid() { printf '%s' "$1" | sed -n 's/.*"offer_id": *"\([0-9a-f-]*\)".*/\1/p'; }
aid() { printf '%s' "$1" | sed -n 's/.*"assignment_id": *"\([0-9a-f-]*\)".*/\1/p'; }

$PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>/tmp/_mig_err_$$ || { echo "PROOF 1 FAILED — migration did not apply:"; cat /tmp/_mig_err_$$; exit 1; }
rm -f /tmp/_mig_err_$$
echo "PROOF 1 — migration applies cleanly on a real PostgreSQL server: PASS"; pass=$((pass+1))
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  migration re-applies idempotently"; pass=$((pass+1)); else echo "  FAIL  migration is not re-runnable"; fail=$((fail+1)); fi

echo; echo "== PROOF 2 — which demand a brigade manager may offer against (market direction, closed allow-list)"
LIST=$(as $OWN "select string_agg(request_id::text, ',' order by request_id) from public.list_open_demand_for_team_offer_v1('$TC');")
check "offerable demand = R1 (company_request) + R2 (legacy null kind) only" "$R1,$R2" "$LIST"
hasnt "closed (R3), supply (R4), unverified (R5), own (R6), unknown kind (R7) are not listed" "$R3|$R4|$R5|$R6|$R7" "$LIST"
check "a stranger who manages no team sees an empty list" "0" "$(as $STRANGER "select count(*) from public.list_open_demand_for_team_offer_v1('$TC');")"
check "another org's manager cannot list on behalf of a team they do not manage" "0" "$(as $MA "select count(*) from public.list_open_demand_for_team_offer_v1('$TC');")"
check "the list carries no payload / contact column" "0" "$(q "select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname='list_open_demand_for_team_offer_v1' and a in ('payload','contact','profile_id','owner_id');")"
has "anon: list denied" 'permission denied' "$(as anon "select * from public.list_open_demand_for_team_offer_v1('$TC');")"
has "NULL uid: list refused" 'Not authenticated' "$(as '' "select * from public.list_open_demand_for_team_offer_v1('$TC');")"

echo; echo "== PROOF 3 — offering: authority, validation, idempotency"
R=$(as $OWN "select public.offer_team_to_demand_v1('$TC','$R1','we are 3 welders');")
has "owner offers brigade C to R1: created" '"outcome": *"created"' "$R"
O1=$(oid "$R")
R2x=$(as $OWN "select public.offer_team_to_demand_v1('$TC','$R1');")
has "second offer is idempotent: already_offered" 'already_offered' "$R2x"
check "idempotent: same offer id" "$O1" "$(oid "$R2x")"
check "exactly ONE offer row" "1" "$(q "select count(*) from public.team_demand_offers;")"
check "member count snapshot recorded" "3" "$(q "select member_count_at_offer from public.team_demand_offers where id='$O1';")"
has "a stranger cannot offer a team they do not manage" 'Not authorized to offer' "$(as $STRANGER "select public.offer_team_to_demand_v1('$TC','$R2');")"
has "org-A manager cannot offer brigade C" 'Not authorized to offer' "$(as $MA "select public.offer_team_to_demand_v1('$TC','$R2');")"
has "the DEMAND owner cannot offer someone else's team" 'Not authorized to offer' "$(as $MB "select public.offer_team_to_demand_v1('$TC','$R2');")"
has "admin is not an implicit manager of the team" 'Not authorized to offer' "$(as $ADM "select public.offer_team_to_demand_v1('$TC','$R2');")"
has "NULL uid refused" 'Not authenticated' "$(as '' "select public.offer_team_to_demand_v1('$TC','$R2');")"
has "anon denied" 'permission denied' "$(as anon "select public.offer_team_to_demand_v1('$TC','$R2');")"
has "an organisation that is not a team refused" 'Not authorized to offer' "$(as $OWN "select public.offer_team_to_demand_v1('$ORGA','$R2');")"
for pair in "$R3:closed demand" "$R4:SUPPLY (agency_offer) row" "$R5:demand of an unverified company" "$R6:the caller's OWN demand" "$R7:unrecognised kind" "$GHOST:nonexistent demand"; do
  id="${pair%%:*}"; label="${pair#*:}"
  has "$label: refused with ONE word (no oracle)" 'demand_not_offerable' "$(as $OWN "select public.offer_team_to_demand_v1('$TC','$id');")"
done
has "a brigade of ONE member cannot be offered" 'team_too_small' "$(as $OWN "select public.offer_team_to_demand_v1('$TSOLO','$R1');")"
check "no row was created by any refused attempt" "1" "$(q "select count(*) from public.team_demand_offers;")"
has "direct INSERT denied" 'permission denied' "$(as $OWN "insert into public.team_demand_offers(team_org_id,request_id,member_count_at_offer) values ('$TC','$R2',3);")"
has "direct UPDATE denied" 'permission denied' "$(as $OWN "update public.team_demand_offers set status='accepted';")"
has "direct DELETE denied" 'permission denied' "$(as $OWN "delete from public.team_demand_offers;")"
has "internal receiver predicate not callable" 'permission denied' "$(as $MB "select public.team_offer_receiver_v1('$R1');")"
check "the open demand list now marks R1 as already offered" "$O1|offered" "$(as $OWN "select open_offer_id||'|'||open_offer_status from public.list_open_demand_for_team_offer_v1('$TC') where request_id='$R1';")"

echo; echo "== PROOF 4 — receiving side: who sees the offer, and what"
check "demand owner reads 1 offer" "1" "$(as $MB "select count(*) from public.list_team_offers_for_request_v1('$R1');")"
check "org-level demand-access manager (not owner profile) reads 1 offer" "1" "$(as $MBM "select count(*) from public.list_team_offers_for_request_v1('$R1');")"
for who in "$OWN:the offering team's own manager (not a receiver)" "$MA:manager of an unrelated org" "$STRANGER:a stranger" "$M1:a brigade member" "$ADM:admin (no implicit receiver)"; do
  id="${who%%:*}"; label="${who#*:}"
  check "$label: reads ZERO offers via the receiver reader (no error, no oracle)" "0" "$(as $id "select count(*) from public.list_team_offers_for_request_v1('$R1');")"
done
check "nonexistent demand answers zero rows too" "0" "$(as $MB "select count(*) from public.list_team_offers_for_request_v1('$GHOST');")"
has "anon: receiver reader denied" 'permission denied' "$(as anon "select * from public.list_team_offers_for_request_v1('$R1');")"
has "NULL uid: receiver reader refused" 'Not authenticated' "$(as '' "select * from public.list_team_offers_for_request_v1('$R1');")"
AGG=$(as $MB "select row_to_json(t) from public.list_team_offers_for_request_v1('$R1') t;")
has "aggregate: team name + size 3" '"team_name":"Crew C".*"member_count":3' "$AGG"
has "aggregate: availability + deployable size + accommodation + transport" '"deployable_min":2,"deployable_max":3,"availability_status":"available_now".*"accommodation_needed":true,"transport_own":true' "$AGG"
has "aggregate: skill counts (welding 2 declared / 1 confirmed, tiling 1)" '"slug": "welding", "declared": 2, "confirmed": 1' "$AGG"
has "aggregate: language counts" '"code": "en", "count": 2' "$AGG"
has "aggregate: consent completeness 2 of 3" '"consented_members":2' "$AGG"
hasnt "PRIVACY: no member name appears" 'Secret|Alpha|Beta|Gamma' "$AGG"
hasnt "PRIVACY: no member profile id appears" 'c0c1000|c0c2000' "$AGG"
hasnt "PRIVACY: no member worker id appears" 'c0c2000' "$AGG"
hasnt "PRIVACY: no demand-owner contact / payload leaks" 'secret@example' "$AGG"
check "PRIVACY: the reader's projection has no identity column" "0" "$(q "select count(*) from pg_proc p, unnest(p.proargnames) a where p.proname='list_team_offers_for_request_v1' and a in ('profile_id','worker_id','full_name','member_name','email','phone','user_id');")"
check "OFFERING manager reads own offer through RLS" "1" "$(as $OWN "select count(*) from public.team_demand_offers;")"
check "demand owner cannot read the raw offer row (aggregates only, via RPC)" "0" "$(as $MB "select count(*) from public.team_demand_offers;")"
check "unrelated manager cannot read the raw offer row" "0" "$(as $MA "select count(*) from public.team_demand_offers;")"
check "stranger cannot read the raw offer row" "0" "$(as $STRANGER "select count(*) from public.team_demand_offers;")"
check "a brigade member cannot read the raw offer row" "0" "$(as $M1 "select count(*) from public.team_demand_offers;")"
check "admin reads the raw offer row" "1" "$(as $ADM "select count(*) from public.team_demand_offers;")"
check "offering side lists its own offers with demand title fields" "welder|NO|Company B|offered" "$(as $OWN "select role_text||'|'||country||'|'||company_name||'|'||status from public.list_team_demand_offers_for_team_v1('$TC');")"
check "a stranger gets nothing from the offering-side list" "0" "$(as $STRANGER "select count(*) from public.list_team_demand_offers_for_team_v1('$TC');")"
check "the demand owner gets nothing from the offering-side list" "0" "$(as $MB "select count(*) from public.list_team_demand_offers_for_team_v1('$TC');")"
check "NO identity reachable through team_assignments before hand-off (no assignment exists)" "0" "$(q "select count(*) from public.team_assignments;")"

echo; echo "== PROOF 5 — accept / decline authority"
has "stranger cannot answer" 'Not authorized to answer' "$(as $STRANGER "select public.respond_team_demand_offer_v1('$O1','accept');")"
has "the offering manager cannot accept their own offer" 'Not authorized to answer' "$(as $OWN "select public.respond_team_demand_offer_v1('$O1','accept');")"
has "unrelated manager cannot answer" 'Not authorized to answer' "$(as $MA "select public.respond_team_demand_offer_v1('$O1','accept');")"
has "admin cannot answer" 'Not authorized to answer' "$(as $ADM "select public.respond_team_demand_offer_v1('$O1','accept');")"
has "nonexistent offer: same refusal (no oracle)" 'Not authorized to answer' "$(as $MB "select public.respond_team_demand_offer_v1('$GHOST','accept');")"
has "NULL uid refused" 'Not authenticated' "$(as '' "select public.respond_team_demand_offer_v1('$O1','accept');")"
has "anon denied" 'permission denied' "$(as anon "select public.respond_team_demand_offer_v1('$O1','accept');")"
has "invalid decision refused" 'invalid_decision' "$(as $MB "select public.respond_team_demand_offer_v1('$O1','maybe');")"
check "status unchanged by every refusal" "offered" "$(q "select status from public.team_demand_offers where id='$O1';")"
check "org-level demand-access manager may accept" "accepted" "$(as $MBM "select public.respond_team_demand_offer_v1('$O1','accept');")"
check "accept is idempotent" "already_accepted" "$(as $MB "select public.respond_team_demand_offer_v1('$O1','accept');")"
check "responder recorded" "$MBM" "$(q "select responded_by from public.team_demand_offers where id='$O1';")"
check "acceptance discloses NOTHING further: still zero identity columns, still no assignment" "0" "$(q "select count(*) from public.team_assignments;")"
AGG2=$(as $MB "select row_to_json(t) from public.list_team_offers_for_request_v1('$R1') t;")
hasnt "PRIVACY after acceptance: still no member name/id" 'Secret|c0c1000|c0c2000' "$AGG2"

echo; echo "== PROOF 6 — hand-off into team_assignments"
has "stranger cannot hand off" 'Not authorized to assign' "$(as $STRANGER "select public.hand_off_team_demand_offer_v1('$O1','$PB');")"
has "the offering manager cannot hand off (not the receiver)" 'Not authorized to assign' "$(as $OWN "select public.hand_off_team_demand_offer_v1('$O1','$PB');")"
has "org-A manager cannot hand off" 'Not authorized to assign' "$(as $MA "select public.hand_off_team_demand_offer_v1('$O1','$PB');")"
has "NULL uid refused" 'Not authenticated' "$(as '' "select public.hand_off_team_demand_offer_v1('$O1','$PB');")"
has "anon denied" 'permission denied' "$(as anon "select public.hand_off_team_demand_offer_v1('$O1','$PB');")"
has "receiver without authority over the project refused (org A project)" 'Not authorized to assign' "$(as $MBM "select public.hand_off_team_demand_offer_v1('$O1','$P1');")"
su "insert into public.engagement_contexts(profile_id,organization_id,status,relationship_slug) values ('$MB','$ORGA','active','manager');" >/dev/null
has "receiver who manages ANOTHER org's project still cannot use it (project must be the demand owner's)" 'project_not_of_demand_owner' "$(as $MB "select public.hand_off_team_demand_offer_v1('$O1','$P1');")"
check "no assignment was written by any refusal" "0" "$(q "select count(*) from public.team_assignments;")"
has "task of another project refused" 'task_not_assignable' "$(as $MB "select public.hand_off_team_demand_offer_v1('$O1','$PB',null,'7a5c0000-0000-0000-0000-000000000001');")"
has "object + task together refused" 'one_scope_only' "$(as $MB "select public.hand_off_team_demand_offer_v1('$O1','$PB','0b1e0000-0000-0000-0000-000000000001','7a5c0000-0000-0000-0000-000000000002');")"
RH=$(as $MBM "select public.hand_off_team_demand_offer_v1('$O1','$PB');")
has "receiver hands off to ITS OWN project: created" '"outcome": *"created"' "$RH"
AS1=$(aid "$RH")
check "ONE team_assignments row, project-level" "1|$TC|$PB" "$(q "select count(*)||'|'||min(team_org_id::text)||'|'||min(project_id::text) from public.team_assignments;")"
check "NO per-person fan-out rows" "0" "$(q "select count(*) from public.project_worker_assignments;")"
check "offer is 'assigned' and linked to the assignment" "assigned|$AS1|true" "$(q "select status||'|'||assignment_id||'|'||(handed_off_at is not null) from public.team_demand_offers where id='$O1';")"
check "assigned_by is the receiver" "$MBM" "$(q "select assigned_by from public.team_assignments where id='$AS1';")"
check "same audit action as assign_team_to_work_v1, tagged with the offer" "1" "$(q "select count(*) from public.audit_logs where action='team_assigned_v1' and payload->>'via_offer_id'='$O1';")"
has "hand-off is idempotent: already_assigned, same id" "already_assigned.*$AS1" "$(as $MB "select public.hand_off_team_demand_offer_v1('$O1','$PB');")"
check "still ONE assignment row" "1" "$(q "select count(*) from public.team_assignments;")"
check "the receiving project's manager now reads the members through the EXISTING resolver" "Secret Alpha,Secret Beta,Secret Gamma" "$(as $MBM "select string_agg(full_name, ',' order by full_name) from public.list_team_assignment_members_v1(array['$AS1']::uuid[]);")"
check "(existing disclosure unchanged) an unrelated manager still sees no members" "0" "$(as $MA "select count(*) from public.list_team_assignment_members_v1(array['$AS1']::uuid[]);")"
check "(existing disclosure unchanged) the stranger still sees no members" "0" "$(as $STRANGER "select count(*) from public.list_team_assignment_members_v1(array['$AS1']::uuid[]);")"
check "the existing end door still works for the project's manager" "ended" "$(as $MBM "select public.end_team_assignment_v1('$AS1','done');")"
check "status after end: offer stays as history ('assigned')" "assigned" "$(q "select status from public.team_demand_offers where id='$O1';")"
has "a handed-off offer cannot be withdrawn through the offer door" 'offer_not_open' "$(as $OWN "select public.withdraw_team_demand_offer_v1('$O1');")"
check "after hand-off the reader still shows the offer as assigned" "assigned" "$(as $MB "select status from public.list_team_offers_for_request_v1('$R1');")"

echo; echo "== PROOF 7 — decline, withdraw, re-offer rules"
RR2=$(as $OWN "select public.offer_team_to_demand_v1('$TC','$R2');"); O2=$(oid "$RR2")
check "decline" "declined" "$(as $MB "select public.respond_team_demand_offer_v1('$O2','decline');")"
check "decline is idempotent" "already_declined" "$(as $MB "select public.respond_team_demand_offer_v1('$O2','decline');")"
has "a declined offer cannot later be accepted" 'offer_not_open' "$(as $MB "select public.respond_team_demand_offer_v1('$O2','accept');")"
has "the team cannot re-offer a declined demand" 'previously_declined' "$(as $OWN "select public.offer_team_to_demand_v1('$TC','$R2');")"
check "declined offers do not appear in the receiver's reader" "0" "$(as $MB "select count(*) from public.list_team_offers_for_request_v1('$R2');")"
has "team A's owner (MA) offers team A (3 active members) to R2" 'created' "$(as $MA "select public.offer_team_to_demand_v1('$TA','$R2');")"
O3=$(q "select id from public.team_demand_offers where team_org_id='$TA';")
has "a stranger cannot withdraw" 'Not authorized to withdraw' "$(as $STRANGER "select public.withdraw_team_demand_offer_v1('$O3');")"
has "the demand owner cannot withdraw the team's offer" 'Not authorized to withdraw' "$(as $MB "select public.withdraw_team_demand_offer_v1('$O3');")"
check "the team's manager withdraws" "withdrawn" "$(as $MA "select public.withdraw_team_demand_offer_v1('$O3');")"
check "withdraw idempotent" "already_withdrawn" "$(as $MA "select public.withdraw_team_demand_offer_v1('$O3');")"
has "a withdrawn offer cannot be accepted" 'offer_not_open' "$(as $MB "select public.respond_team_demand_offer_v1('$O3','accept');")"
check "withdrawn offers are not shown to the receiver" "0" "$(as $MB "select count(*) from public.list_team_offers_for_request_v1('$R2');")"
check "after withdrawal the same team may offer again (history kept: 2 rows)" "2" "$(as $MA "select public.offer_team_to_demand_v1('$TA','$R2');" >/dev/null; q "select count(*) from public.team_demand_offers where team_org_id='$TA';")"
echo "  -- demand closes between offer and answer"
su "update public.customer_requests set status='closed' where id='$R2';" >/dev/null
O4=$(q "select id from public.team_demand_offers where team_org_id='$TA' and status='offered';")
has "accepting an offer on a demand that is no longer open is refused" 'demand_closed' "$(as $MB "select public.respond_team_demand_offer_v1('$O4','accept');")"
su "update public.customer_requests set status='submitted' where id='$R2';" >/dev/null
echo "  -- the unit must still be a team at answer time"
su "update public.engagement_contexts set status='ended', ended_at='2026-10-01' where organization_id='$TA' and profile_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');" >/dev/null
has "team shrank below 2 since the offer: accept refused" 'team_too_small' "$(as $MB "select public.respond_team_demand_offer_v1('$O4','accept');")"

echo; echo "== PROOF 8 — abuse cap"
su "delete from public.team_demand_offers;" >/dev/null
su "insert into public.customer_requests(id,profile_id,title,status,kind) select gen_random_uuid(),'$MB','bulk '||g,'submitted','company_request' from generate_series(1,25) g;" >/dev/null
n=0; for rid in $(q "select string_agg(id::text,' ') from public.customer_requests where title like 'bulk %';"); do
  as $OWN "select public.offer_team_to_demand_v1('$TC','$rid');" >/dev/null; n=$((n+1)); [ $n -ge 20 ] && break; done
check "20 open offers allowed" "20" "$(q "select count(*) from public.team_demand_offers where team_org_id='$TC';")"
has "the 21st open offer is refused" 'offer_limit_reached' "$(as $OWN "select public.offer_team_to_demand_v1('$TC','$R1');")"

echo; echo "== PROOF 9 — rollback refuses with history, then removes exactly the additions"
out="$($PSQL -f "$ROLLBACK" 2>&1 | tr -d '\r')"
has "rollback REFUSES while rows exist" 'rollback refused' "$out"
check "table still present after refusal" "1" "$(q "select count(*) from pg_class where relname='team_demand_offers';")"
su "delete from public.team_demand_offers;" >/dev/null
out="$($PSQL -v ON_ERROR_STOP=1 -f "$ROLLBACK" 2>&1 | tr -d '\r')"; rc=$?
check "rollback succeeds with zero rows" "0" "$rc"
check "table/indexes, eight functions, policy all gone" "0|0|0" "$(q "select (select count(*) from pg_class where relname like 'team_demand_offers%')||'|'||(select count(*) from pg_proc where proname in ('team_offer_receiver_v1','list_open_demand_for_team_offer_v1','offer_team_to_demand_v1','withdraw_team_demand_offer_v1','list_team_demand_offers_for_team_v1','list_team_offers_for_request_v1','respond_team_demand_offer_v1','hand_off_team_demand_offer_v1'))||'|'||(select count(*) from pg_policy where polname='team_demand_offers_select_v1');")"
check "the existing team layer is untouched by the rollback" "5" "$(q "select count(*) from pg_proc where proname in ('team_member_at_v1','assign_team_to_work_v1','end_team_assignment_v1','list_team_assignment_members_v1','team_assignments_for_work_v1');")"
if $PSQL -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1; then echo "  PASS  forward migration re-applies after rollback (round trip)"; pass=$((pass+1)); else echo "  FAIL  re-apply after rollback"; fail=$((fail+1)); fi

echo; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
