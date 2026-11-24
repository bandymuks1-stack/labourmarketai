#!/usr/bin/env bash
# ============================================================================
# W9 Slice 2 — REAL row-level-security behaviour proof.
#
# Spins up a THROWAWAY Postgres 15 container, builds the faithful harness
# (prelude = the 0013 posture including `organizations_select using (true)`),
# and measures who can read what BEFORE and AFTER applying the actual files
#   supabase/migrations/20260802160000_org_membership_revocation_v1.sql
#   supabase/migrations/20260802170000_organization_rls_hardening_v1.sql
# and the actual rollback
#   supabase/rollbacks/20260802170000_organization_rls_hardening_v1.down.sql
# each executed VERBATIM — nothing here re-implements them.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS genuinely decides the result.
#
# Phases: BEFORE -> APPLY -> AFTER -> ROLLBACK -> RE-APPLY.
#
# Never point this at production or at a shared local Supabase stack. It uses
# its own container name and its own port, and touches neither.
# Usage:  bash scripts/db-proof/w9-organization-rls-hardening.sh
# ============================================================================
set -uo pipefail

CT=w9-rls-proof
PORT=55433
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG_S1="$REPO/supabase/migrations/20260802160000_org_membership_revocation_v1.sql"
MIG_S2="$REPO/supabase/migrations/20260802170000_organization_rls_hardening_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260802170000_organization_rls_hardening_v1.down.sql"

A_OWNER='aaaaaaaa-0000-4000-8000-000000000001'
B_OWNER='bbbbbbbb-0000-4000-8000-000000000002'
EMPLOYEE='cccccccc-0000-4000-8000-000000000003'
MANAGER='dddddddd-0000-4000-8000-000000000004'
EX_MEMBER='eeeeeeee-0000-4000-8000-000000000005'
STRANGER='ffffffff-0000-4000-8000-000000000006'
ORG_A='01010101-0000-4000-8000-00000000000a'
ORG_B='02020202-0000-4000-8000-00000000000b'
ORG_P='03030303-0000-4000-8000-00000000000c'
ENG_EMPLOYEE='22220000-0000-4000-8000-000000000002'
ENG_MANAGER='33330000-0000-4000-8000-000000000003'

PASS=0; FAIL=0
declare -a FAILURES=()

q() { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1 | tr -d '\r'; }

# Run SQL as a non-superuser role with a given auth.uid() / is_admin().
# $1=role $2=uid $3=is_admin $4=sql   -> prints the last statement's output
as_role() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r' | grep -v '^BEGIN$\|^ROLLBACK$\|^SET$' | sed '/^$/d'
begin;
set local role $1;
set local app.uid = '$2';
set local app.is_admin = '$3';
$4
rollback;
SQL
}

check() { # $1=label $2=expected $3=actual
  if [ "$3" = "$2" ]; then
    PASS=$((PASS+1)); printf '  PASS  %-62s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected [$2] got [$3]")
    printf '  FAIL  %-62s expected [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

contains() { # $1=label $2=needle $3=haystack
  if printf '%s' "$3" | grep -qi -- "$2"; then
    PASS=$((PASS+1)); printf '  PASS  %-62s (matched "%s")\n' "$1" "$2"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected to contain [$2] got [$3]")
    printf '  FAIL  %-62s expected to contain [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w9-organization-rls-hardening.seed.sql" >/dev/null 2>&1; }

# ── org visibility for one actor: how many organization rows come back ───────
orgs_visible() { as_role authenticated "$1" "${2:-false}" "select count(*) from public.organizations;"; }
sees_org()     { as_role authenticated "$1" "${2:-false}" "select count(*) from public.organizations where id='$3';"; }

banner() { echo; echo "════════════════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════════════════"; }

# ── container lifecycle ─────────────────────────────────────────────────────
cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "W9 slice 2 — organization RLS hardening proof"
echo "throwaway container: $CT  (port $PORT)  — shared local stack untouched"

if docker ps -a --format '{{.Names}}' | grep -qx "$CT"; then docker rm -f "$CT" >/dev/null; fi
docker run -d --name "$CT" -e POSTGRES_PASSWORD=proof -p "$PORT":5432 postgres:15 >/dev/null || {
  echo "could not start container"; exit 1; }

for _ in $(seq 1 60); do
  docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/w9-organization-rls-hardening.prelude.sql" >/dev/null || {
  echo "prelude failed"; exit 1; }
seed
echo "harness ready — 0013 posture in place (organizations_select = using(true))"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 1 — BEFORE the migration (the P0 as it exists in production)"
# ════════════════════════════════════════════════════════════════════════════
check "BEFORE: a STRANGER reads every organization row"            "3" "$(orgs_visible $STRANGER)"
check "BEFORE: an EX-MEMBER reads every organization row"          "3" "$(orgs_visible $EX_MEMBER)"
check "BEFORE: A_OWNER reads B's private organization too"         "1" "$(sees_org $A_OWNER false $ORG_B)"

LEAK="$(as_role authenticated $STRANGER false "select count(*) from public.organizations where owner_profile_id is not null and vat_number is not null;")"
check "BEFORE: a STRANGER reads owner_profile_id AND vat_number"   "3" "$LEAK"

CONTACT="$(as_role authenticated $STRANGER false "select count(*) from public.organizations where public_contact_email is not null;")"
check "BEFORE: a STRANGER reads private contact email"             "3" "$CONTACT"

# The latent P1: prove it is real by simulating the one future line that arms it.
q "grant insert, update, delete on public.engagement_contexts to authenticated;" >/dev/null
ESC="$(as_role authenticated $STRANGER false "insert into public.engagement_contexts(profile_id, organization_id, relationship_slug, status, hash_self) values ('$STRANGER','$ORG_A','manager','active','h-escalation'); select 'inserted='||count(*)::text from public.engagement_contexts where profile_id='$STRANGER';")"
contains "BEFORE: a stray GRANT lets a STRANGER self-insert MANAGER" "inserted=1" "$ESC"
q "revoke insert, update, delete on public.engagement_contexts from authenticated;" >/dev/null

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 2 — APPLY both migrations VERBATIM"
# ════════════════════════════════════════════════════════════════════════════
apply_migrations() {
  docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG_S1" >/dev/null 2>&1 \
    && docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG_S2" >/dev/null 2>&1
}
if apply_migrations; then echo "  applied 20260802160000 (slice 1) + 20260802170000 (slice 2)"
else echo "  MIGRATION APPLY FAILED"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$MIG_S2"; FAIL=$((FAIL+1)); fi
seed

QUAL="$(q "select qual from pg_policies where tablename='organizations' and policyname='organizations_select';")"
contains "APPLY: organizations_select no longer reads \`true\`"    "belongs_to_organization" "$QUAL"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 3 — AFTER: organizations isolation matrix"
# ════════════════════════════════════════════════════════════════════════════
check "AFTER: A_OWNER sees their OWN organization"                 "1" "$(sees_org $A_OWNER false $ORG_A)"
check "AFTER: A_OWNER sees ONLY that one row"                      "1" "$(orgs_visible $A_OWNER)"
check "AFTER: A_OWNER does NOT see B's organization"               "0" "$(sees_org $A_OWNER false $ORG_B)"
check "AFTER: B_OWNER sees both organizations they own"            "2" "$(orgs_visible $B_OWNER)"
check "AFTER: an ACTIVE EMPLOYEE sees the org they work for"       "1" "$(sees_org $EMPLOYEE false $ORG_A)"
check "AFTER: an ACTIVE EMPLOYEE sees nothing else"                "1" "$(orgs_visible $EMPLOYEE)"
check "AFTER: an ACTIVE MANAGER sees the org they manage"          "1" "$(sees_org $MANAGER false $ORG_A)"
check "AFTER: an ENDED member sees NOTHING"                        "0" "$(orgs_visible $EX_MEMBER)"
check "AFTER: an unrelated STRANGER sees NOTHING"                  "0" "$(orgs_visible $STRANGER)"
check "AFTER: a platform ADMIN sees every organization"            "3" "$(orgs_visible $STRANGER true)"

# Publication must NOT be a row-policy arm.
check "AFTER: a PUBLISHED org is still not row-readable by a stranger" "0" "$(sees_org $STRANGER false $ORG_P)"
check "AFTER: a PUBLISHED org is not row-readable by an ended member"  "0" "$(sees_org $EX_MEMBER false $ORG_P)"

# Field-level leak probes — zero rows means zero fields.
check "AFTER: owner_profile_id does not leak to a stranger"        "0" "$(as_role authenticated $STRANGER false "select count(*) from public.organizations where owner_profile_id is not null;")"
check "AFTER: vat_number does not leak to a stranger"              "0" "$(as_role authenticated $STRANGER false "select count(*) from public.organizations where vat_number is not null;")"
check "AFTER: contact email/phone do not leak to a stranger"       "0" "$(as_role authenticated $STRANGER false "select count(*) from public.organizations where public_contact_email is not null or public_contact_phone is not null;")"
check "AFTER: legal_name does not leak to a stranger"              "0" "$(as_role authenticated $STRANGER false "select count(*) from public.organizations where legal_name is not null;")"

# A stranger must get an EMPTY RESULT, not an error that confirms the row exists.
ORACLE="$(as_role authenticated $STRANGER false "select coalesce((select display_name from public.organizations where id='$ORG_A'),'<empty>');")"
check "AFTER: a stranger gets an empty result, not a permission error" "<empty>" "$ORACLE"

# anon has no table grant at all.
ANON="$(as_role anon '' false "select count(*) from public.organizations;")"
contains "AFTER: anon has NO direct table SELECT"                  "permission denied" "$ANON"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 4 — AFTER: the invitation directory RPC"
# ════════════════════════════════════════════════════════════════════════════
DIR="$(as_role authenticated $STRANGER false "select count(*) from public.search_organizations_directory_v1('Org B');")"
check "DIRECTORY: a non-member CAN still find an organization by name" "1" "$DIR"

COLS="$(q "select pg_get_function_result(oid) from pg_proc where proname='search_organizations_directory_v1';")"
contains "DIRECTORY: projection is id + display_name + type + country" "display_name" "$COLS"
if printf '%s' "$COLS" | grep -qiE "owner_profile_id|vat_number|public_contact|trust_score|legal_name"; then
  FAIL=$((FAIL+1)); FAILURES+=("DIRECTORY leaks a private field in its signature"); echo "  FAIL  DIRECTORY signature leaks a private field"
else
  PASS=$((PASS+1)); printf '  PASS  %-62s %s\n' "DIRECTORY: signature exposes no private field" "ok"
fi

NCOL="$(q "select array_length(proallargtypes,1)-1 from pg_proc where proname='search_organizations_directory_v1';")"
check "DIRECTORY: exactly four output columns"                     "4" "$NCOL"

DUMP="$(as_role authenticated $STRANGER false "select count(*) from public.search_organizations_directory_v1('O');")"
check "DIRECTORY: a one-character term returns nothing (no dump)"  "0" "$DUMP"

WILD="$(as_role authenticated $STRANGER false "select count(*) from public.search_organizations_directory_v1('%');")"
check "DIRECTORY: a bare wildcard returns nothing"                 "0" "$WILD"

ANONRPC="$(as_role anon '' false "select count(*) from public.search_organizations_directory_v1('Org B');")"
contains "DIRECTORY: anon cannot execute the RPC"                  "permission denied" "$ANONRPC"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 5 — AFTER: engagement_contexts writes are RPC-only"
# ════════════════════════════════════════════════════════════════════════════
GRANTS="$(q "select coalesce(string_agg(privilege_type,',' order by privilege_type),'<none>') from information_schema.role_table_grants where table_name='engagement_contexts' and grantee='authenticated';")"
check "WRITES: authenticated holds SELECT only"                    "SELECT" "$GRANTS"

# Re-arm the stray grant. The policy alone must now hold the line.
q "grant insert, update, delete on public.engagement_contexts to authenticated;" >/dev/null

ESC2="$(as_role authenticated $STRANGER false "insert into public.engagement_contexts(profile_id, organization_id, relationship_slug, status, hash_self) values ('$STRANGER','$ORG_A','manager','active','h-escalation2');")"
contains "WRITES: self-INSERT of a MANAGER row is refused"         "row-level security" "$ESC2"

PROMO="$(as_role authenticated $EMPLOYEE false "update public.engagement_contexts set relationship_slug='manager' where id='$ENG_EMPLOYEE'; select 'rows='||count(*)::text from public.engagement_contexts where id='$ENG_EMPLOYEE' and relationship_slug='manager';")"
contains "WRITES: employee -> manager self-promotion is refused"   "rows=0" "$PROMO"

MOVE="$(as_role authenticated $EMPLOYEE false "update public.engagement_contexts set organization_id='$ORG_B' where id='$ENG_EMPLOYEE'; select 'rows='||count(*)::text from public.engagement_contexts where id='$ENG_EMPLOYEE' and organization_id='$ORG_B';")"
contains "WRITES: moving your engagement to another org is refused" "rows=0" "$MOVE"

REVIVE="$(as_role authenticated $EX_MEMBER false "update public.engagement_contexts set status='active' where profile_id='$EX_MEMBER'; select 'rows='||count(*)::text from public.engagement_contexts where profile_id='$EX_MEMBER' and status='active';")"
contains "WRITES: reactivating your own ENDED membership is refused" "rows=0" "$REVIVE"

DEL="$(as_role authenticated $EMPLOYEE false "delete from public.engagement_contexts where id='$ENG_EMPLOYEE'; select 'rows='||count(*)::text from public.engagement_contexts where id='$ENG_EMPLOYEE';")"
contains "WRITES: deleting your own engagement is refused"          "rows=1" "$DEL"

READOWN="$(as_role authenticated $EMPLOYEE false "select count(*) from public.engagement_contexts where profile_id='$EMPLOYEE';")"
check "WRITES: reading your OWN memberships still works"           "1" "$READOWN"

q "revoke insert, update, delete on public.engagement_contexts from authenticated;" >/dev/null

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 6 — W9 SLICE 1 regression (the REAL end_org_membership_v1 RPC)"
# ════════════════════════════════════════════════════════════════════════════
seed
MGR_BEFORE="$(as_role authenticated $MANAGER false "select public.manages_organization('$ORG_A');")"
check "SLICE1: an ACTIVE manager has manages_organization = true"  "t" "$MGR_BEFORE"

# The owner revokes the manager's membership through the canonical RPC.
# Exact-match on purpose: a substring match would be satisfied by an ERROR
# message that merely happens to contain the word (e.g. the `ended_at` column).
REV="$(as_role authenticated $A_OWNER false "select public.end_org_membership_v1('$ENG_MANAGER','proof') ->> 'outcome';")"
check "SLICE1: the owner CAN revoke a manager via the RPC"         "ended" "$REV"

# The RPC runs in a rolled-back probe transaction, so apply it for real to
# measure the downstream effect.
PERSIST="$(docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=1 2>&1 <<SQL
set role authenticated;
set app.uid = '$A_OWNER';
set app.is_admin = 'false';
select public.end_org_membership_v1('$ENG_MANAGER','proof');
SQL
)"
echo "  [persist] ${PERSIST}"

MGR_AFTER="$(as_role authenticated $MANAGER false "select public.manages_organization('$ORG_A');")"
check "SLICE1: after revocation manages_organization = false"      "f" "$MGR_AFTER"
check "SLICE1: the revoked manager can no longer read the org"     "0" "$(orgs_visible $MANAGER)"
STATUS="$(q "select status from public.engagement_contexts where id='$ENG_MANAGER';")"
check "SLICE1: the engagement is in the terminal 'ended' state"    "ended" "$STATUS"
AUDIT="$(q "select count(*) from public.audit_logs where entity_id='$ENG_MANAGER';")"
check "SLICE1: the revocation wrote an audit row"                  "1" "$AUDIT"

# Last-owner protection must still refuse.
LASTOWNER="$(as_role authenticated $A_OWNER false "select public.end_org_membership_v1('11110000-0000-4000-8000-000000000001','proof') ->> 'outcome';")"
check "SLICE1: last-owner protection still refuses"                "last_owner" "$LASTOWNER"

# A stranger must not be able to revoke someone else's membership — and the
# refusal is `not_found`, NOT `not_authorized`, on purpose (20260802160000
# lines 185-191): a caller with no relationship to the organization must not be
# able to tell an existing engagement id from a non-existent one. Asserting the
# exact outcome pins that anti-oracle so a later refactor cannot "helpfully"
# turn it into an existence confirmation.
STRANGERREV="$(as_role authenticated $STRANGER false "select public.end_org_membership_v1('$ENG_EMPLOYEE','proof') ->> 'outcome';")"
check "SLICE1: a stranger gets not_found (no existence oracle)"    "not_found" "$STRANGERREV"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 7 — ROLLBACK VERBATIM (must re-open the P0, by design)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null 2>&1; then
  echo "  rollback applied cleanly"; PASS=$((PASS+1))
else
  echo "  ROLLBACK FAILED"; FAIL=$((FAIL+1)); FAILURES+=("rollback did not apply")
fi
seed
check "ROLLBACK: the stranger can read every row again (P0 re-opened)" "3" "$(orgs_visible $STRANGER)"
GONE="$(q "select count(*) from pg_proc where proname in ('belongs_to_organization','search_organizations_directory_v1');")"
check "ROLLBACK: both new functions are dropped"                   "0" "$GONE"
S1SURVIVES="$(q "select count(*) from pg_proc where proname='end_org_membership_v1';")"
check "ROLLBACK: W9 slice 1 is untouched by the slice 2 rollback"  "1" "$S1SURVIVES"
NODML="$(q "select count(*) from public.organizations;")"
check "ROLLBACK: mutates NO data (3 organizations still present)"  "3" "$NODML"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 8 — RE-APPLY (idempotency: must land in the same state)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG_S2" >/dev/null 2>&1; then
  echo "  re-applied cleanly"; PASS=$((PASS+1))
else
  echo "  RE-APPLY FAILED"; FAIL=$((FAIL+1)); FAILURES+=("re-apply did not succeed")
fi
seed
check "RE-APPLY: a stranger sees nothing again"                    "0" "$(orgs_visible $STRANGER)"
check "RE-APPLY: the owner still sees their own organization"      "1" "$(sees_org $A_OWNER false $ORG_A)"
check "RE-APPLY: an active employee still sees their org"          "1" "$(sees_org $EMPLOYEE false $ORG_A)"
QUAL2="$(q "select qual from pg_policies where tablename='organizations' and policyname='organizations_select';")"
check "RE-APPLY: the policy is byte-identical to the first apply"  "$QUAL" "$QUAL2"

# ── summary ─────────────────────────────────────────────────────────────────
banner "RESULT"
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo; echo "  failures:"; for f in "${FAILURES[@]}"; do echo "    - $f"; done
  exit 1
fi
echo; echo "  W9 slice 2 behaviour proven end to end."
