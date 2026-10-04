#!/usr/bin/env bash
# ============================================================================
# commitment_override_receipt_team_basis_v1 - REAL PostgreSQL proof (scratch cluster, no Docker).
#
# Proves migration 20261003150900 on a prelude that contains BOTH 20261003150100 (#2146, the
# receipt table + writer) and 20261003150600 (#2149, team_assignments / team_member_at_v1),
# applied verbatim in that order, then the new migration. Helper predicates and
# project_worker_assignments come from the commitment-override-receipts-v1 prelude (production
# definitions read 2026-10-03).
#
# 20261003150600 lives on branch feat/cc/team-assignment-canonical-v1; this script takes it from
# the repo when present (integrated tree) and otherwise from origin/feat/cc/team-assignment-canonical-v1.
#
# The original person-basis proof (commitment-override-receipts-v1.sh, 76 cases) is a separate
# script and must still pass.
#
# Usage: PGPROOF_PORT=58737 bash scripts/db-proof/commitment-override-receipt-team-basis-v1.sh
# Never point at production or a shared local Supabase stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:?set PGPROOF_PORT to a free port of a scratch cluster}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PS() { psql -h "$PGPROOF_HOST" -p "$PGPROOF_PORT" -U postgres -d postgres -tA -q "$@" 2>&1 | tr -d '\r'; }

LFD="$(mktemp -d)"
lf() { tr -d '\r' < "$1" > "$2"; }
N1=20261003150100_commitment_override_receipts_v1
N2=20261003150600_brigade_work_assignment_v1
N3=20261003150900_commitment_override_receipt_team_basis_v1
lf "$REPO/supabase/migrations/$N1.sql" "$LFD/m1.sql"
lf "$REPO/supabase/migrations/$N3.sql" "$LFD/m3.sql"
lf "$REPO/supabase/rollbacks/$N3.down.sql" "$LFD/d3.sql"
if [ -f "$REPO/supabase/migrations/$N2.sql" ]; then
  lf "$REPO/supabase/migrations/$N2.sql" "$LFD/m2.sql"
else
  git -C "$REPO" show "origin/feat/cc/team-assignment-canonical-v1:supabase/migrations/$N2.sql" | tr -d '\r' > "$LFD/m2.sql"
fi
[ -s "$LFD/m2.sql" ] || { echo "cannot obtain $N2"; exit 1; }

PS -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null
for f in commitment-override-receipts-v1.prelude.sql commitment-override-receipt-team-basis-v1.prelude2.sql commitment-override-receipts-v1.seed.sql; do
  lf "$HERE/$f" "$LFD/x.sql"; PS -v ON_ERROR_STOP=1 -f "$LFD/x.sql" >/dev/null || { echo "BASELINE FAILED: $f"; exit 1; }
done
PS -c "create function public.zz_try(q text) returns text language plpgsql as \$f\$ declare r text; begin execute q into r; return coalesce(r,'null'); exception when others then return 'E'||sqlstate; end \$f\$;" >/dev/null

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { PS -c "$1" | head -1; }
as() { local who="$1"; shift; if [ "$who" = anon ]; then printf '%s\n' "set role anon; $*"; elif [ "$who" = nosub ]; then printf '%s\n' "set role authenticated; $*"; else printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*"; fi | PS -f - | grep -v '^SET$' | head -1; }
isuuid() { if echo "$1" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo uuid; else echo "$1"; fi; }
applyok() { local out; out=$(PS -v ON_ERROR_STOP=1 -f "$1" 2>&1); if echo "$out" | grep -qiE 'ERROR|FATAL'; then echo "$out" | head -5; return 1; fi; }

OWN=aa000000-0000-0000-0000-00000000000a; MGR=aa000000-0000-0000-0000-0000000000b1
MGRB=bb000000-0000-0000-0000-0000000000b2; ADM=ad000000-0000-0000-0000-0000000000ad
PW1=a1000000-0000-0000-0000-000000000001; PW2=a2000000-0000-0000-0000-000000000002
OUT=ee000000-0000-0000-0000-00000000000e
PA1=99999999-0000-0000-0000-0000000000a1; PA2=99999999-0000-0000-0000-0000000000a2
TM1=c1000000-0000-0000-0000-000000000001; TM2=c2000000-0000-0000-0000-000000000002
TL=c3000000-0000-0000-0000-000000000003;  TJ=c4000000-0000-0000-0000-000000000004
NM=c5000000-0000-0000-0000-000000000005;  TM3=c6000000-0000-0000-0000-000000000006
T1=7ea00000-0000-0000-0000-00000000000a;  T2=7ea00000-0000-0000-0000-0000000000a2
SID=5a5a5a5a-0000-4000-8000-000000000001
C_BOOK="[{\"kind\":\"booking\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-05\",\"overlapEnd\":\"2026-10-07\"}]"
C_ABS='[{"kind":"absence","sourceId":"5a5a5a5a-0000-4000-8000-000000000002","label":"chemotherapy","overlapStart":"2026-10-12","overlapEnd":"2026-10-13"}]'
rec() { local reason="null"; [ -n "${5:-}" ] && reason="'$5'"
  as "$1" "select public.zz_try(\$q\$select public.record_commitment_override_v1('$2','$3','$4'::jsonb,$reason)\$q\$);"; }

echo "=============================================================="
echo " commitment_override_receipt_team_basis_v1 - PostgreSQL proof"
echo "=============================================================="
applyok "$LFD/m1.sql" || { echo "20261003150100 FAILED"; exit 1; }
applyok "$LFD/m2.sql" || { echo "20261003150600 FAILED"; exit 1; }
echo "  prelude: 20261003150100 + 20261003150600 applied verbatim"
FN1=$(su "select md5(prosrc) from pg_proc where proname='record_commitment_override_v1'")

echo "--- B0 the gap: with only #2146 + #2149 a team member has no way to get a receipt"
lf "$HERE/commitment-override-receipt-team-basis-v1.seed.sql" "$LFD/x.sql"; PS -v ON_ERROR_STOP=1 -f "$LFD/x.sql" >/dev/null || { echo "TEAM SEED FAILED"; exit 1; }
OUTA=$(as $MGR "select public.assign_team_to_work_v1('$T1','$PA1');")
TA1=$(printf '%s' "$OUTA" | sed -n 's/.*"assignment_id": *"\([0-9a-f-]*\)".*/\1/p')
check "B0 manager assigned team T1 to PA1 (one team_assignments row)" 1 "$(su "select count(*) from public.team_assignments where project_id='$PA1' and ended_at is null")"
check "B0 the team assignment wrote NO per-person row for its members" 0 "$(su "select count(*) from public.project_worker_assignments a join public.workers w on w.id=a.worker_id where w.profile_id in ('$TM1','$TM2')")"
check "B0 BEFORE 150900: member of the active team cannot get a receipt (22023)" E22023 "$(rec $MGR $PA1 $TM1 "$C_BOOK" other)"

applyok "$LFD/m3.sql" || { echo "20261003150900 FAILED"; exit 1; }
echo "  migration 20261003150900 applied verbatim"
PWA0=$(su "select count(*) from public.project_worker_assignments")

echo "--- T1 manager records a team-basis override for a team member"
R1=$(rec $MGR $PA1 $TM1 "$C_BOOK" agreed_with_worker)
check "T1 receipt written (uuid)" uuid "$(isuuid "$R1")"
check "T1 basis = the team assignment, person assignment null" "$TA1|" "$(su "select team_assignment_id||'|'||coalesce(assignment_id::text,'') from public.commitment_override_receipts where id='$R1'")"
check "T1 worker + project + decider + window snapshot" "cccc0001-0000-0000-0000-000000000001|$PA1|$MGR|2026-10-05|2026-10-20" "$(su "select worker_id||'|'||project_id||'|'||decided_by||'|'||window_start||'|'||window_end from public.commitment_override_receipts where id='$R1'")"
check "T1 closed reason code, kind=kept" "agreed_with_worker|kept" "$(su "select reason_code||'|'||decision from public.commitment_override_receipts where id='$R1'")"
R1b=$(rec $MGR $PA1 $TM1 "$C_BOOK" agreed_with_worker)
check "T1 replay returns the SAME id (idempotent per team basis)" "$R1" "$R1b"
check "T1 replay wrote nothing" 1 "$(su "select count(*) from public.commitment_override_receipts")"
R2=$(rec $MGR $PA1 $TM2 "$C_BOOK" agreed_with_worker)
check "T1 another member is a separate receipt on the same team basis" 2 "$(su "select count(*) from public.commitment_override_receipts where team_assignment_id='$TA1'")"
check "T1 team basis fingerprint includes the basis (team: prefix)" "$(su "select md5('team:$TA1|cccc0001-0000-0000-0000-000000000001|$MGR|kept|agreed_with_worker|'||collisions::text) from public.commitment_override_receipts where id='$R1'")" "$(su "select fingerprint from public.commitment_override_receipts where id='$R1'")"
RA=$(rec $MGR $PA1 $TM1 "$C_ABS" partial_overlap)
check "T1 absence on a team basis stores kind + dates only" "kind,overlapEnd,overlapStart" "$(su "select string_agg(k,',' order by k) from (select jsonb_object_keys(c) k from public.commitment_override_receipts r, jsonb_array_elements(r.collisions) c where r.id='$RA') s")"
check "T1 ...and none of the private words anywhere" 0 "$(su "select count(*) from public.commitment_override_receipts r where r::text ~* 'chemo|label'")"

echo "--- P person basis unchanged"
RP=$(rec $MGR $PA1 $PW1 "$C_BOOK" agreed_with_worker)
check "P person-assigned worker (also a T1 member) gets the PERSON basis" "uuid|1|0" "$(isuuid "$RP")|$(su "select count(*) from public.commitment_override_receipts where id='$RP' and assignment_id is not null and team_assignment_id is null")|$(su "select count(*) from public.commitment_override_receipts where id='$RP' and team_assignment_id is not null")"
check "P person fingerprint is byte-identical to the 20261003150100 formula" "$(su "select md5(assignment_id::text||'|$MGR|kept|agreed_with_worker|'||collisions::text) from public.commitment_override_receipts where id='$RP'")" "$(su "select fingerprint from public.commitment_override_receipts where id='$RP'")"
check "P replay idempotent" "$RP" "$(rec $MGR $PA1 $PW1 "$C_BOOK" agreed_with_worker)"

echo "--- R refusals (22023): not covered by any basis"
CNT=$(su "select count(*) from public.commitment_override_receipts")
check "R worker who is NOT a team member and has no person assignment" E22023 "$(rec $MGR $PA1 $NM "$C_BOOK" other)"
check "R member who LEFT the team before now" E22023 "$(rec $MGR $PA1 $TL "$C_BOOK" other)"
check "R person who joins the team only in the future" E22023 "$(rec $MGR $PA1 $TJ "$C_BOOK" other)"
check "R member of an active team on ANOTHER project (PA2)" E22023 "$(rec $MGR $PA2 $TM1 "$C_BOOK" other)"
check "R member of a team that is not assigned anywhere (T2 member on PA1)" E22023 "$(rec $MGR $PA1 $TM3 "$C_BOOK" other)"
check "R free-text reason refused on the team path too" E22023 "$(rec $MGR $PA1 $TM1 "$C_BOOK" 'he is sick')"
check "R empty collisions refused on the team path" E22023 "$(rec $MGR $PA1 $TM1 '[]' other)"
check "R failed overrides recorded NO receipt" "$CNT" "$(su "select count(*) from public.commitment_override_receipts")"

echo "--- A authority on the team path (every denial raises 42501 and records nothing)"
check "A other tenant's manager" E42501 "$(rec $MGRB $PA1 $TM1 "$C_BOOK" other)"
check "A outsider" E42501 "$(rec $OUT $PA1 $TM1 "$C_BOOK" other)"
check "A ordinary worker" E42501 "$(rec $PW2 $PA1 $TM1 "$C_BOOK" other)"
check "A the member themself cannot waive their own clash" E42501 "$(rec $TM1 $PA1 $TM1 "$C_BOOK" other)"
check "A a fellow team member" E42501 "$(rec $TM2 $PA1 $TM1 "$C_BOOK" other)"
check "A NULL auth.uid" E42501 "$(rec nosub $PA1 $TM1 "$C_BOOK" other)"
check "A anon has no EXECUTE" E42501 "$(as anon "select public.zz_try(\$q\$select public.record_commitment_override_v1('$PA1','$TM1','$C_BOOK'::jsonb,null)::text\$q\$);")"
check "A admin may (can_manage_project includes admin)" uuid "$(isuuid "$(rec $ADM $PA1 $TM2 "[{\"kind\":\"trip\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-10\",\"overlapEnd\":\"2026-10-11\"}]" urgent_need)")"
check "A denials recorded nothing" "$((CNT+1))" "$(su "select count(*) from public.commitment_override_receipts")"

echo "--- S immutability + who can read"
check "S UPDATE refused even for the table owner" E42501 "$(su "select public.zz_try(\$q\$update public.commitment_override_receipts set reason_code='other' where team_assignment_id is not null returning 'x'\$q\$)")"
check "S DELETE refused even for the table owner" E42501 "$(su "select public.zz_try(\$q\$delete from public.commitment_override_receipts where team_assignment_id is not null returning 'x'\$q\$)")"
check "S TRUNCATE refused" E42501 "$(su "select public.zz_try(\$q\$truncate public.commitment_override_receipts\$q\$)")"
check "S manager UPDATE denied" E42501 "$(as $MGR "select public.zz_try(\$q\$update public.commitment_override_receipts set reason_code='other' returning 'x'\$q\$);")"
check "S manager direct INSERT denied" E42501 "$(as $MGR "select public.zz_try(\$q\$insert into public.commitment_override_receipts(team_assignment_id,project_id,worker_id,collisions,fingerprint) values ('$TA1','$PA1','cccc0001-0000-0000-0000-000000000001','[1]'::jsonb,'x') returning 'x'\$q\$);")"
check "S exactly one basis: neither basis is rejected by CHECK" E23514 "$(su "select public.zz_try(\$q\$insert into public.commitment_override_receipts(project_id,worker_id,collisions,fingerprint) values ('$PA1','cccc0001-0000-0000-0000-000000000001','[1]'::jsonb,'x') returning 'x'\$q\$)")"
check "S exactly one basis: BOTH bases are rejected by CHECK" E23514 "$(su "select public.zz_try(\$q\$insert into public.commitment_override_receipts(assignment_id,team_assignment_id,project_id,worker_id,collisions,fingerprint) select a.id,'$TA1',a.project_id,a.worker_id,'[1]'::jsonb,'y' from public.project_worker_assignments a limit 1 returning 'x'\$q\$)")"
check "S manager of the project reads all team receipts" 4 "$(as $MGR "select count(*) from public.commitment_override_receipts where team_assignment_id is not null;")"
check "S affected member reads ONLY their own (TM1: 2)" 2 "$(as $TM1 "select count(*) from public.commitment_override_receipts;")"
check "S co-member TM2 sees only theirs (2: own + admin-written)" 2 "$(as $TM2 "select count(*) from public.commitment_override_receipts;")"
check "S unaffected member of another team TM3 sees 0" 0 "$(as $TM3 "select count(*) from public.commitment_override_receipts;")"
check "S other tenant's manager reads 0" 0 "$(as $MGRB "select count(*) from public.commitment_override_receipts;")"
check "S NULL uid reads 0" 0 "$(as nosub "select count(*) from public.commitment_override_receipts;")"
check "S anon SELECT denied" E42501 "$(as anon "select public.zz_try(\$q\$select count(*)::text from public.commitment_override_receipts\$q\$);")"
check "S ACL unchanged: authenticated=SELECT only; one SELECT policy; RLS forced" "authenticated:SELECT|1|true|true" "$(su "select (select string_agg(g||':'||p, ',' order by g, p) from (select a.grantee::regrole::text g, a.privilege_type p from pg_class c, aclexplode(c.relacl) a where c.oid='public.commitment_override_receipts'::regclass and a.grantee::regrole::text not in ('postgres','service_role')) x)||'|'||(select count(*) from pg_policy where polrelid='public.commitment_override_receipts'::regclass)||'|'||(select relrowsecurity||'|'||relforcerowsecurity from pg_class where oid='public.commitment_override_receipts'::regclass)")"
check "S still no free-text column" "decision,fingerprint,reason_code" "$(su "select string_agg(column_name,',' order by column_name) from information_schema.columns where table_schema='public' and table_name='commitment_override_receipts' and data_type='text'")"

echo "--- L lifecycle of the team assignment: ended / replaced / member leaves"
check "L (setup) end the team assignment" ended "$(as $MGR "select public.end_team_assignment_v1('$TA1','done');")"
check "L ENDED team assignment: no basis for TM2 any more" E22023 "$(rec $MGR $PA1 $TM2 "[{\"kind\":\"plan\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-09\",\"overlapEnd\":\"2026-10-09\"}]" other)"
check "L receipts written while it was active are still there (immutable evidence)" 4 "$(su "select count(*) from public.commitment_override_receipts where team_assignment_id='$TA1'")"
OUTB=$(as $MGR "select public.assign_team_to_work_v1('$T1','$PA1');")
TA2=$(printf '%s' "$OUTB" | sed -n 's/.*"assignment_id": *"\([0-9a-f-]*\)".*/\1/p')
OUTC=$(as $MGR "select public.assign_team_to_work_v1('$T2','$PA1',null,null,'$TA2');")
TA3=$(printf '%s' "$OUTC" | sed -n 's/.*"assignment_id": *"\([0-9a-f-]*\)".*/\1/p')
check "L (setup) T1 re-assigned then REPLACED by T2" "ended|replaced" "$(su "select status||'|'||end_reason from public.team_assignments where id='$TA2'")"
check "L REPLACED team: its member TM2 refused" E22023 "$(rec $MGR $PA1 $TM2 "$C_BOOK" other)"
RT3=$(rec $MGR $PA1 $TM3 "$C_BOOK" other)
check "L the replacing team's member gets a receipt on the NEW basis" "$TA3" "$(su "select team_assignment_id from public.commitment_override_receipts where id='$RT3'")"
su "update public.engagement_contexts set status='ended', ended_at=(now() - interval '2 days')::date where profile_id='$TM3' and organization_id='$T2'" >/dev/null
check "L a member who LEFT the active team is refused" E22023 "$(rec $MGR $PA1 $TM3 "[{\"kind\":\"plan\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-09\",\"overlapEnd\":\"2026-10-09\"}]" other)"
check "L ...but their earlier receipt stays" 1 "$(su "select count(*) from public.commitment_override_receipts where id='$RT3'")"

echo "--- C cap of 50 receipts per basis"
# TM3 was ended above: restore membership so the cap path is exercised on the active team basis
su "update public.engagement_contexts set status='active', ended_at=null where profile_id='$TM3' and organization_id='$T2'" >/dev/null
for d in $(seq 1 51); do
  day=$(printf '2026-12-%02d' $(( (d % 28) + 1 )))
  sid=$(printf '5a5a5a5a-0000-4000-8000-%012d' $((d+200)))
  as $MGR "select public.zz_try(\$q\$select public.record_commitment_override_v1('$PA1','$TM3','[{\"kind\":\"project\",\"sourceId\":\"$sid\",\"overlapStart\":\"$day\",\"overlapEnd\":\"$day\"}]'::jsonb,null)\$q\$);" >/dev/null
done
check "C receipts on the replacing team basis are capped at 50" 50 "$(su "select count(*) from public.commitment_override_receipts where team_assignment_id='$TA3'")"
check "C the next one is refused loudly" E22023 "$(rec $MGR $PA1 $TM3 "[{\"kind\":\"trip\",\"sourceId\":\"$SID\",\"overlapStart\":\"2027-01-05\",\"overlapEnd\":\"2027-01-05\"}]" other)"
check "C another basis (the person basis) is not blocked by that cap" uuid "$(isuuid "$(rec $MGR $PA1 $PW1 "[{\"kind\":\"trip\",\"sourceId\":\"$SID\",\"overlapStart\":\"2027-01-05\",\"overlapEnd\":\"2027-01-05\"}]" other)")"

echo "--- N no per-person assignment rows were ever created by any team path"
check "N project_worker_assignments row count unchanged since 150900 was applied" "$PWA0" "$(su "select count(*) from public.project_worker_assignments")"
check "N no pwa row exists for any team-only member" 0 "$(su "select count(*) from public.project_worker_assignments a join public.workers w on w.id=a.worker_id where w.profile_id in ('$TM1','$TM2','$TM3','$TL','$TJ','$NM')")"

echo "--- D rollback"
check "D rollback REFUSES while team-basis receipts exist" t "$(PS -v ON_ERROR_STOP=1 -f "$LFD/d3.sql" 2>&1 | grep -c 'refusing to drop evidence' | awk '{print ($1>0)?"t":"f"}')"
check "D ...and nothing was changed by the refused rollback" 1 "$(su "select count(*) from information_schema.columns where table_name='commitment_override_receipts' and column_name='team_assignment_id'")"
# Delete the team-basis receipts the only lawful way: the cascade of the owning team assignment rows.
su "delete from public.team_assignments" >/dev/null
check "D (setup) cascade of team_assignments removed the team receipts" 0 "$(su "select count(*) from public.commitment_override_receipts where team_assignment_id is not null")"
check "D person receipts survive" 2 "$(su "select count(*) from public.commitment_override_receipts where assignment_id is not null")"
OUT_DOWN=$(PS -v ON_ERROR_STOP=1 -f "$LFD/d3.sql" 2>&1)
check "D rollback applies when no team receipt exists" "" "$(echo "$OUT_DOWN" | grep -i error)"
check "D function restored to EXACTLY the 20261003150100 body" "$FN1" "$(su "select md5(prosrc) from pg_proc where proname='record_commitment_override_v1'")"
check "D column, constraints, index gone; assignment_id NOT NULL again" "0|0|0|NO" "$(su "select (select count(*) from information_schema.columns where table_name='commitment_override_receipts' and column_name='team_assignment_id')||'|'||(select count(*) from pg_constraint where conname like 'commitment_override_receipts_%basis%' or conname like 'commitment_override_receipts_team%')||'|'||(select count(*) from pg_indexes where indexname='commitment_override_receipts_team_assignment_idx')||'|'||(select is_nullable from information_schema.columns where table_name='commitment_override_receipts' and column_name='assignment_id')")"
check "D after rollback the person path still works" uuid "$(isuuid "$(rec $MGR $PA1 $PW1 "$C_BOOK" agreed_with_worker)")"
check "D after rollback a team-only member is refused again" E22023 "$(rec $MGR $PA1 $TM1 "$C_BOOK" other)"
applyok "$LFD/m3.sql"; check "D re-applying 150900 after a rollback is clean" 0 "$?"
PS -v ON_ERROR_STOP=1 -f "$LFD/m3.sql" > "$LFD/re.txt" 2>&1
check "D applying 150900 twice is clean" 0 "$(grep -ciE 'ERROR' "$LFD/re.txt")"

echo
echo "RESULT: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
