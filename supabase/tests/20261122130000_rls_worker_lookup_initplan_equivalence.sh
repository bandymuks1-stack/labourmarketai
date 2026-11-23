#!/usr/bin/env bash
# #3604 equivalence check, isolated database only (signup-isolated stack).
#
# In ONE transaction that is rolled back at the end (the database is left as it
# was): seed synthetic rows, then
#   phase 0: rollback body  -> policies P0, access A0  (the production state)
#   phase 1: migration body -> P1, A1
#   phase 2: rollback body  -> P2, A2
#   phase 3: migration body -> P3, A3
# and require: P0 == P2 and P1 == P3 byte for byte; P1 with
# `( SELECT auth.uid() AS uid)` written back as `auth.uid()` == P0; and
# A0 == A1 == A2 == A3 (every read and write of every actor).
set -euo pipefail
cd "$(dirname "$0")/../.."
N=20261122130000_rls_worker_lookup_initplan
UP="supabase/migrations/${N}_v1.sql"; DOWN="supabase/rollbacks/${N}_v1.down.sql"; T="supabase/tests/${N}"
PSQL=${PSQL:-"docker exec -i supabase_db_labourmarketai psql -U postgres -X -q -tA"}
body() { grep -viE '^\s*(begin|commit);\s*$' "$1"; }
out=${EQ_OUT:-$(mktemp -d)}; mkdir -p "$out"
{
  echo "begin;"
  cat "${T}_seed.sql"
  for ph in 0 1 2 3; do
    if [ $((ph % 2)) -eq 0 ]; then body "$DOWN"; else body "$UP"; fi
    echo "\\echo PHASE|$ph"
    cat "${T}_policies.sql"
    cat "${T}_assert.sql"
  done
  echo "rollback;"
} | $PSQL -v ON_ERROR_STOP=0 2>"$out/err.txt" \
  | sed -E 's/^psql:[^:]*:[0-9]+: //' | grep -vE '^$|^(DETAIL|CONTEXT|HINT|NOTICE):' > "$out/raw.txt"
awk -v d="$out" '
  /^PHASE\|/ { ph=substr($0,7); cur=""; next }
  /^(READ|WRITE)\|/ { print > (d "/A" ph ".txt"); cur=""; next }
  /^POLICY\|/ { cur="P" }
  { if (cur=="P") print > (d "/P" ph ".txt") }' "$out/raw.txt"
fail=0
# Every expected refusal is caught inside the check; anything on stderr is a broken step.
if grep -q "ERROR" "$out/err.txt"; then echo "::error::the run itself failed"; grep "ERROR" "$out/err.txt" | head -5; fail=1; fi
for i in 0 1 2 3; do
  [ -s "$out/P$i.txt" ] && [ "$(wc -l < "$out/A$i.txt")" -eq 170 ] || { echo "::error::phase $i incomplete"; fail=1; }
done
cmp -s "$out/P0.txt" "$out/P2.txt" && echo "PASS rollback restores the 18 policies byte for byte" || { echo "::error::rollback differs"; diff "$out/P0.txt" "$out/P2.txt" | head -20; fail=1; }
cmp -s "$out/P1.txt" "$out/P3.txt" && echo "PASS re-apply gives the same policies" || { echo "::error::re-apply differs"; fail=1; }
sed 's/( SELECT auth.uid() AS uid)/auth.uid()/g' "$out/P1.txt" | cmp -s - "$out/P0.txt" && echo "PASS only auth.uid() -> (select auth.uid()) changed ($(grep -o '( SELECT auth.uid() AS uid)' "$out/P1.txt" | wc -l) calls)" || { echo "::error::a policy changed beyond the wrapping"; fail=1; }
for i in 1 2 3; do
  cmp -s "$out/A0.txt" "$out/A$i.txt" && echo "PASS access phase $i == phase 0 (170 checks)" || { echo "::error::access differs in phase $i"; diff "$out/A0.txt" "$out/A$i.txt" | head -20; fail=1; }
done
grep -q "^WRITE|worker|dis_insert_for_worker => rows=1$" "$out/A0.txt" || { echo "::error::the allowed write did not succeed: the check would prove nothing"; fail=1; }
grep -q "^READ|former_manager|booking_requests_of_former_org => visible=\$" "$out/A0.txt" && grep -q "^READ|employer|booking_requests_of_former_org => visible=booking_requests#former_member\$" "$out/A0.txt" && echo "PASS #3575 kept: a former manager does not see the organization booking they created, the organization's owner does" || { echo "::error::#3575 booking constraint not held"; fail=1; }
grep -c "=> visible=" "$out/A0.txt" | sed 's/^/reads: /'; grep -c "^WRITE" "$out/A0.txt" | sed 's/^/writes: /'
exit $fail
