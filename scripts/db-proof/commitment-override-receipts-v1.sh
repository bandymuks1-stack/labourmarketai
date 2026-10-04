#!/usr/bin/env bash
# ============================================================================
# commitment_override_receipts_v1 — REAL PostgreSQL 16 proof (throwaway container).
#
# Proves migration 20261003150100_commitment_override_receipts_v1 on a harness
# whose helper functions (can_manage_project, owns_company, manages_organization,
# owns_worker, is_admin) and project_worker_assignments (constraints, policies,
# ACL) are the PRODUCTION definitions read 2026-10-03, with Supabase default
# privileges (new public tables granted to anon/authenticated/service_role) so the
# migration's REVOKEs are really exercised.
#
# Never point this at production or at a shared local Supabase stack.
# Usage: bash scripts/db-proof/commitment-override-receipts-v1.sh
# ============================================================================
set -uo pipefail
export MSYS_NO_PATHCONV=1
CT=ovr-receipt-proof
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261003150100_commitment_override_receipts_v1
MIG="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16 >/dev/null || { echo "no container"; exit 1; }
trap 'docker rm -f "$CT" >/dev/null 2>&1' EXIT
for i in $(seq 1 40); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
PS() { docker exec -i "$CT" psql -U postgres -tA -q "$@" 2>&1 | tr -d '\r'; }
PS -v ON_ERROR_STOP=1 -f - < "$HERE/commitment-override-receipts-v1.prelude.sql" >/dev/null || { echo PRELUDE FAILED; exit 1; }
PS -v ON_ERROR_STOP=1 -f - < "$HERE/commitment-override-receipts-v1.seed.sql" >/dev/null || { echo SEED FAILED; exit 1; }
PS -c "create function public.zz_try(q text) returns text language plpgsql as \$f\$ declare r text; begin execute q into r; return coalesce(r,'null'); exception when others then return 'E'||sqlstate; end \$f\$;" >/dev/null

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { PS -c "$1" | head -1; }
as() { local who="$1"; shift; if [ "$who" = anon ]; then printf '%s\n' "set role anon; $*"; elif [ "$who" = nosub ]; then printf '%s\n' "set role authenticated; $*"; else printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*"; fi | PS -f - | grep -v '^SET$' | head -1; }
isuuid() { if echo "$1" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then echo uuid; else echo "$1"; fi; }

OWN=aa000000-0000-0000-0000-00000000000a; MGR=aa000000-0000-0000-0000-0000000000b1
MGRB=bb000000-0000-0000-0000-0000000000b2; ADM=ad000000-0000-0000-0000-0000000000ad
PW1=a1000000-0000-0000-0000-000000000001; PW2=a2000000-0000-0000-0000-000000000002
PW3=a3000000-0000-0000-0000-000000000003; OUT=ee000000-0000-0000-0000-00000000000e
PA1=99999999-0000-0000-0000-0000000000a1; PA2=99999999-0000-0000-0000-0000000000a2
SID=5a5a5a5a-0000-4000-8000-000000000001; SID2=5a5a5a5a-0000-4000-8000-000000000002
C_BOOK="[{\"kind\":\"booking\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-05\",\"overlapEnd\":\"2026-10-07\"}]"
rec() { # who project workerprofile collisions reason
  local reason="null"; [ -n "${5:-}" ] && reason="'$5'"
  as "$1" "select public.zz_try(\$q\$select public.record_commitment_override_v1('$2','$3','$4'::jsonb,$reason)\$q\$);"
}

echo "=============================================================="
echo " commitment_override_receipts_v1 - PostgreSQL 16 proof"
echo "=============================================================="

echo "--- BEFORE the migration: the writer does not exist (production state)"
check "BEFORE: no receipt table" "" "$(su "select to_regclass('public.commitment_override_receipts')")"
OUT_APPLY=$(PS -v ON_ERROR_STOP=1 -f - < "$MIG" 2>&1)
if echo "$OUT_APPLY" | grep -qiE 'ERROR|FATAL'; then echo "$OUT_APPLY" | head -5; echo "MIGRATION FAILED"; exit 1; fi
echo "  migration applied verbatim"

echo "--- S1 manager decides -> receipt"
R1=$(rec $MGR $PA1 $PW1 "$C_BOOK" agreed_with_worker)
check "S1 manager writes a receipt (uuid returned)" uuid "$(isuuid "$R1")"
check "S1 one receipt row" 1 "$(su "select count(*) from public.commitment_override_receipts")"
check "S1 decided_by = the manager" "$MGR" "$(su "select decided_by from public.commitment_override_receipts")"
check "S1 decision = kept" kept "$(su "select decision from public.commitment_override_receipts")"
check "S1 window snapshot from projects (not caller)" "2026-10-05|2026-10-20" "$(su "select window_start||'|'||window_end from public.commitment_override_receipts")"
check "S1 assignment_id is the real pwa row" 1 "$(su "select count(*) from public.commitment_override_receipts r join public.project_worker_assignments a on a.id=r.assignment_id and a.project_id=r.project_id and a.worker_id=r.worker_id")"
check "S1 reason is a closed code" agreed_with_worker "$(su "select reason_code from public.commitment_override_receipts")"
check "S1 collision shape" '[{"kind": "booking", "sourceId": "'$SID'", "overlapEnd": "2026-10-07", "overlapStart": "2026-10-05"}]' "$(su "select collisions::text from public.commitment_override_receipts")"

echo "--- S2 idempotency"
R1b=$(rec $MGR $PA1 $PW1 "$C_BOOK" agreed_with_worker)
check "S2 replay returns the SAME id" "$R1" "$R1b"
check "S2 replay wrote nothing" 1 "$(su "select count(*) from public.commitment_override_receipts")"
C_ORD="[{\"kind\":\"plan\",\"sourceId\":\"$SID2\",\"overlapStart\":\"2026-10-09\",\"overlapEnd\":\"2026-10-09\"},{\"kind\":\"booking\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-05\",\"overlapEnd\":\"2026-10-07\"}]"
C_ORD2="[{\"kind\":\"booking\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-05\",\"overlapEnd\":\"2026-10-07\"},{\"kind\":\"plan\",\"sourceId\":\"$SID2\",\"overlapStart\":\"2026-10-09\",\"overlapEnd\":\"2026-10-09\"}]"
RO=$(rec $MGR $PA1 $PW1 "$C_ORD" other)
RO2=$(rec $MGR $PA1 $PW1 "$C_ORD2" other)
check "S2 'plan' kind accepted" uuid "$(isuuid "$RO")"
check "S2 same facts in another order = same receipt" "$RO" "$RO2"
check "S2 two receipts total" 2 "$(su "select count(*) from public.commitment_override_receipts")"

echo "--- S3 immutability"
check "S3 UPDATE refused even for the table owner" E42501 "$(su "select public.zz_try(\$q\$update public.commitment_override_receipts set reason_code='other' returning 'x'\$q\$)")"
check "S3 DELETE refused even for the table owner" E42501 "$(su "select public.zz_try(\$q\$delete from public.commitment_override_receipts returning 'x'\$q\$)")"
check "S3 TRUNCATE refused" E42501 "$(su "select public.zz_try(\$q\$truncate public.commitment_override_receipts\$q\$)")"
check "S3 manager UPDATE denied" E42501 "$(as $MGR "select public.zz_try(\$q\$update public.commitment_override_receipts set reason_code='other' returning 'x'\$q\$);")"
check "S3 manager DELETE denied" E42501 "$(as $MGR "select public.zz_try(\$q\$delete from public.commitment_override_receipts returning 'x'\$q\$);")"
check "S3 manager direct INSERT denied" E42501 "$(as $MGR "select public.zz_try(\$q\$insert into public.commitment_override_receipts(assignment_id,project_id,worker_id,collisions,fingerprint) select id,project_id,worker_id,'[1]'::jsonb,'x' from public.project_worker_assignments limit 1 returning 'x'\$q\$);")"
check "S3 worker UPDATE denied" E42501 "$(as $PW1 "select public.zz_try(\$q\$update public.commitment_override_receipts set decided_by=null returning 'x'\$q\$);")"
check "S3 row count unchanged" 2 "$(su "select count(*) from public.commitment_override_receipts")"

echo "--- S4 who can READ"
check "S4 manager of the project reads" 2 "$(as $MGR "select count(*) from public.commitment_override_receipts;")"
check "S4 company owner reads" 2 "$(as $OWN "select count(*) from public.commitment_override_receipts;")"
check "S4 affected worker reads own receipt" 2 "$(as $PW1 "select count(*) from public.commitment_override_receipts;")"
check "S4 admin reads" 2 "$(as $ADM "select count(*) from public.commitment_override_receipts;")"
check "S4 other worker denied (0 rows)" 0 "$(as $PW2 "select count(*) from public.commitment_override_receipts;")"
check "S4 worker with an ENDED assignment on another project denied" 0 "$(as $PW3 "select count(*) from public.commitment_override_receipts;")"
check "S4 outsider denied (0 rows)" 0 "$(as $OUT "select count(*) from public.commitment_override_receipts;")"
check "S4 OTHER tenant's manager denied (0 rows)" 0 "$(as $MGRB "select count(*) from public.commitment_override_receipts;")"
check "S4 NULL auth.uid (authenticated, no sub) sees 0" 0 "$(as nosub "select count(*) from public.commitment_override_receipts;")"
check "S4 anon SELECT denied" E42501 "$(as anon "select public.zz_try(\$q\$select count(*)::text from public.commitment_override_receipts\$q\$);")"

echo "--- S5 who can WRITE (authority, NULL-safety, input)"
check "S5 other tenant's manager refused" E42501 "$(rec $MGRB $PA1 $PW1 "$C_BOOK" other)"
check "S5 outsider refused" E42501 "$(rec $OUT $PA1 $PW1 "$C_BOOK" other)"
check "S5 the affected worker cannot write their own override" E42501 "$(rec $PW1 $PA1 $PW1 "$C_BOOK" other)"
check "S5 NULL auth.uid refused" E42501 "$(rec nosub $PA1 $PW1 "$C_BOOK" other)"
check "S5 anon has no EXECUTE" E42501 "$(as anon "select public.zz_try(\$q\$select public.record_commitment_override_v1('$PA1','$PW1','$C_BOOK'::jsonb,null)::text\$q\$);")"
check "S5 admin may write (can_manage_project includes admin)" uuid "$(isuuid "$(rec $ADM $PA1 $PW1 "[{\"kind\":\"trip\",\"sourceId\":\"$SID\",\"overlapStart\":\"2026-10-10\",\"overlapEnd\":\"2026-10-11\"}]" urgent_need)")"
check "S5 NULL project -> 22023" E22023 "$(as $MGR "select public.zz_try(\$q\$select public.record_commitment_override_v1(null,'$PW1','$C_BOOK'::jsonb,null)::text\$q\$);")"
check "S5 NULL worker -> 22023" E22023 "$(as $MGR "select public.zz_try(\$q\$select public.record_commitment_override_v1('$PA1',null,'$C_BOOK'::jsonb,null)::text\$q\$);")"
check "S5 unknown project (no authority) -> 42501" E42501 "$(rec $MGR 99999999-0000-0000-0000-0000000000ff $PW1 "$C_BOOK" other)"
check "S5 worker not assigned -> 22023" E22023 "$(rec $MGR $PA1 $PW2 "$C_BOOK" other)"
check "S5 ENDED assignment -> 22023" E22023 "$(rec $MGR $PA1 $PW3 "$C_BOOK" other)"
check "S5 unknown worker profile -> 22023" E22023 "$(rec $MGR $PA1 ee000000-0000-0000-0000-0000000000ff "$C_BOOK" other)"
check "S5 free-text reason refused (closed code only)" E22023 "$(rec $MGR $PA1 $PW1 "$C_BOOK" 'he was sick, doctor appointment')"
check "S5 empty collisions refused" E22023 "$(rec $MGR $PA1 $PW1 '[]' other)"
check "S5 non-array collisions refused" E22023 "$(rec $MGR $PA1 $PW1 '{"kind":"trip"}' other)"
check "S5 unknown kind refused" E22023 "$(rec $MGR $PA1 $PW1 "[{\"kind\":\"medical\",\"overlapStart\":\"2026-10-05\",\"overlapEnd\":\"2026-10-06\"}]" other)"
check "S5 bad dates refused" E22023 "$(rec $MGR $PA1 $PW1 "[{\"kind\":\"absence\",\"overlapStart\":\"nope\",\"overlapEnd\":\"2026-10-06\"}]" other)"
check "S5 end before start refused" E22023 "$(rec $MGR $PA1 $PW1 "[{\"kind\":\"absence\",\"overlapStart\":\"2026-10-09\",\"overlapEnd\":\"2026-10-06\"}]" other)"
check "S5 booking without a uuid sourceId refused" E22023 "$(rec $MGR $PA1 $PW1 "[{\"kind\":\"booking\",\"sourceId\":\"drop table\",\"overlapStart\":\"2026-10-05\",\"overlapEnd\":\"2026-10-06\"}]" other)"
BIG=$(su "select jsonb_agg(jsonb_build_object('kind','absence','overlapStart','2026-10-05','overlapEnd','2026-10-06'))::text from generate_series(1,21)")
check "S5 more than 20 collisions refused" E22023 "$(rec $MGR $PA1 $PW1 "$BIG" other)"

echo "--- S6 an absence stores NOTHING but kind + dates"
C_ABS="[{\"kind\":\"absence\",\"sourceId\":\"$SID2\",\"label\":\"chemotherapy\",\"category\":\"medical\",\"reason\":\"private illness\",\"overlapStart\":\"2026-10-12\",\"overlapEnd\":\"2026-10-13\"}]"
RA=$(rec $MGR $PA2 $PW1 "$C_ABS" partial_overlap)
check "S6 absence receipt written" uuid "$(isuuid "$RA")"
check "S6 stored keys are exactly kind, overlapEnd, overlapStart" "kind,overlapEnd,overlapStart" "$(su "select string_agg(k,',' order by k) from (select jsonb_object_keys(c) k from public.commitment_override_receipts r, jsonb_array_elements(r.collisions) c where r.project_id='$PA2') s")"
check "S6 none of the private words are in ANY row" 0 "$(su "select count(*) from public.commitment_override_receipts r where r::text ~* 'chemo|medical|illness|private|label|category'")"
check "S6 sourceId of the absence is NOT stored" 0 "$(su "select count(*) from public.commitment_override_receipts r where r.project_id='$PA2' and r::text like '%5a5a5a5a-0000-4000-8000-000000000002%'")"
check "S6 no free-text column exists (only closed/derived text columns)" "decision,fingerprint,reason_code" "$(su "select string_agg(column_name,',' order by column_name) from information_schema.columns where table_schema='public' and table_name='commitment_override_receipts' and data_type='text'")"

echo "--- S7 ACL / RLS posture"
check "S7 table ACL: authenticated=SELECT only; anon/PUBLIC nothing" "authenticated:SELECT" "$(su "select string_agg(g||':'||p, ',' order by g, p) from (select a.grantee::regrole::text g, a.privilege_type p from pg_class c, aclexplode(c.relacl) a where c.oid='public.commitment_override_receipts'::regclass and a.grantee::regrole::text not in ('postgres','service_role')) x")"
check "S7 RLS enabled + FORCED" "true|true" "$(su "select relrowsecurity||'|'||relforcerowsecurity from pg_class where oid='public.commitment_override_receipts'::regclass")"
check "S7 exactly one policy, SELECT" "commitment_override_receipts_select:r" "$(su "select polname||':'||polcmd::text from pg_policy where polrelid='public.commitment_override_receipts'::regclass")"
check "S7 writer ACL has no anon / PUBLIC" 0 "$(su "select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.proname='record_commitment_override_v1' and (a.grantee=0 or a.grantee='anon'::regrole)")"
check "S7 writer: authenticated EXECUTE" t "$(su "select has_function_privilege('authenticated','public.record_commitment_override_v1(uuid,uuid,jsonb,text)','execute')")"
check "S7 writer is SECURITY DEFINER with search_path" "true|{search_path=public}" "$(su "select prosecdef||'|'||proconfig::text from pg_proc where proname='record_commitment_override_v1'")"
check "S7 anon has no table privilege at all" f "$(su "select has_table_privilege('anon','public.commitment_override_receipts','select')")"

echo "--- S8 abuse bound (50 per assignment)"
# distinct facts: vary the overlap day so each call is a new fingerprint
for d in $(seq 1 52); do
  day=$(printf '2026-12-%02d' $(( (d % 28) + 1 )))
  sid=$(printf '5a5a5a5a-0000-4000-8000-%012d' $d)
  as $MGR "select public.zz_try(\$q\$select public.record_commitment_override_v1('$PA2','$PW1','[{\"kind\":\"project\",\"sourceId\":\"$sid\",\"overlapStart\":\"$day\",\"overlapEnd\":\"$day\"}]'::jsonb,null)\$q\$);" >/dev/null
done
check "S8 receipts for that assignment are capped at 50" 50 "$(su "select count(*) from public.commitment_override_receipts where project_id='$PA2'")"
check "S8 the next one is refused loudly" E22023 "$(rec $MGR $PA2 $PW1 "[{\"kind\":\"trip\",\"sourceId\":\"$SID\",\"overlapStart\":\"2027-01-05\",\"overlapEnd\":\"2027-01-05\"}]" other)"

echo "--- S9 lifecycle cascades (the only allowed removals) + rollback guard"
check "S9 rollback REFUSES while receipts exist" t "$(PS -v ON_ERROR_STOP=1 -f - < "$DOWN" 2>&1 | grep -c 'refusing to drop evidence' | awk '{print ($1>0)?"t":"f"}')"
check "S9 table still present after the refused rollback" 1 "$(su "select count(*) from pg_class where oid='public.commitment_override_receipts'::regclass")"
su "update public.projects set status='active' where false" >/dev/null
SOME=$(su "select count(*) from public.commitment_override_receipts where project_id='$PA2'")
su "delete from public.projects where id='$PA2'" >/dev/null
check "S9 deleting the owning project cascades its receipts" 0 "$(su "select count(*) from public.commitment_override_receipts where project_id='$PA2'")"
check "S9 receipts of the other project untouched" 3 "$(su "select count(*) from public.commitment_override_receipts where project_id='$PA1'")"
su "delete from public.profiles where id='$ADM'" >/dev/null 2>&1
check "S9 deleting the deciding profile NULLs decided_by only" "1|0" "$(su "select count(*) filter (where decided_by is null)||'|'||count(*) filter (where decided_by=('$ADM')::uuid) from public.commitment_override_receipts where project_id='$PA1'")"
check "S9 ...and nothing else on that row changed" "urgent_need" "$(su "select reason_code from public.commitment_override_receipts where decided_by is null")"
su "delete from public.workers where id='aaaa0001-0000-0000-0000-000000000001'" >/dev/null
check "S9 deleting the worker cascades the remaining receipts" 0 "$(su "select count(*) from public.commitment_override_receipts")"

echo "--- S10 rollback (empty table) + re-apply idempotence"
OUT_DOWN=$(PS -v ON_ERROR_STOP=1 -f - < "$DOWN" 2>&1)
check "S10 rollback applies when empty" "" "$(echo "$OUT_DOWN" | grep -i error)"
check "S10 table, writer and trigger functions gone" "0|0" "$(su "select (select count(*) from pg_class where relname='commitment_override_receipts')||'|'||(select count(*) from pg_proc where proname in ('record_commitment_override_v1','commitment_override_receipts_immutable_v1','commitment_override_receipts_no_truncate_v1'))")"
PS -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; PS -v ON_ERROR_STOP=1 -f - < "$MIG" > /tmp/_ovr_reapply.txt 2>&1
check "S10 re-applying the migration twice is clean" 0 "$(grep -ciE 'ERROR' /tmp/_ovr_reapply.txt)"
rm -f /tmp/_ovr_reapply.txt

echo
echo "RESULT: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
