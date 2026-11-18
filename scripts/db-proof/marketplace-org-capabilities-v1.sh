#!/usr/bin/env bash
# org_capabilities_for_visible_listings_v1 - REAL PostgreSQL proof on a THROWAWAY cluster (never prod).
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 58738 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58738 bash scripts/db-proof/marketplace-org-capabilities-v1.sh
# DROPs schema public. Reuses the marketplace-index-v1 prelude/seed and the real prior migrations.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
LFD="$(mktemp -d)"
for f in "$REPO"/supabase/migrations/20260627*.sql "$REPO"/supabase/migrations/20260718210000*.sql "$REPO"/supabase/migrations/2026100217*.sql "$REPO"/supabase/rollbacks/2026100217*.sql \
         "$REPO"/supabase/migrations/20261003150300*.sql "$REPO"/supabase/migrations/20261003150400*.sql \
         "$REPO"/supabase/migrations/20261003151200*.sql "$REPO"/supabase/rollbacks/20261003151200*.sql; do
  [ -f "$f" ] && tr -d '\r' < "$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58738}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
FAIL=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1 :: $2"; FAIL=1; }
chk() { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1" "expected [$2] got [$3]"; fi; }
as() { $PSQL -c "set role $1" -c "set request.jwt.claim.sub = '$2'" -c "$3" 2>&1 | grep -v '^SET$' | grep -v -e '^CONTEXT' -e '^PL/pgSQL' -e '^SQL statement' | tr '\n' ',' | sed 's/,$//; s/ERROR:  /ERROR: /'; }
asnull() { $PSQL -c "set role $1" -c "reset request.jwt.claim.sub" -c "$2" 2>&1 | grep -v '^SET$' | grep -v '^RESET$' | tr '\n' ',' | sed 's/,$//; s/ERROR:  /ERROR: /'; }

U1=11111111-1111-1111-1111-111111111111   # member of ORG_A
U2=22222222-2222-2222-2222-222222222222   # foreign viewer
ORG_A=aaaaaaaa-0000-0000-0000-000000000001
ORG_B=aaaaaaaa-0000-0000-0000-000000000002  # only draft/paused/expired listings
ORG_C=aaaaaaaa-0000-0000-0000-000000000003  # published nothing
L_A=cccccccc-0000-0000-0000-000000000001    # active, ORG_A (from seed)
L_DRAFT=cccccccc-0000-0000-0000-0000000000b1
L_PAUSED=cccccccc-0000-0000-0000-0000000000b2
L_EXPIRED=cccccccc-0000-0000-0000-0000000000b3
L_NOORG=cccccccc-0000-0000-0000-0000000000a1
F="org_capabilities_for_visible_listings_v1"

echo "== baseline + 150300 + 150400 + 151200"
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
for f in "$HERE/marketplace-index-v1.prelude.sql" "$LFD/20260627121713_service_offerings.sql" "$LFD/20260627145318_service_offering_requests.sql" "$LFD/20260718210000_marketplace_listings.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED $f"; cat "$LFD/err"; exit 1; }
done
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/marketplace-index-v1.seed.sql" >/dev/null || { echo "seed FAILED"; exit 1; }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003150300_marketplace_index_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 150300" "$(cat "$LFD/err")"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003150400_marketplace_public_business_expiry_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 150400" "$(cat "$LFD/err")"

# Minimal organization_roles (production shape) with the production member-only SELECT policy idea.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_slug text not null,
  granted_at timestamptz not null default now(),
  unique (organization_id, role_slug));
alter table public.organization_roles enable row level security;
create policy organization_roles_select on public.organization_roles for select
  using (public.manages_organization(organization_id));
revoke all on public.organization_roles from public, anon, authenticated;
grant select on public.organization_roles to authenticated;
insert into public.organizations(id, public_profile_enabled) values ('$ORG_B', false), ('$ORG_C', false);
insert into public.organization_roles(organization_id, role_slug) values
  ('$ORG_A','training_provider'), ('$ORG_A','employer'), ('$ORG_A','not_a_mapped_slug'),
  ('$ORG_B','supplier'), ('$ORG_C','workforce_provider');
insert into public.marketplace_listings(id,owner_id,organization_id,listing_kind,category,title,status,expires_at) values
  ('$L_DRAFT','$U1','$ORG_B','sale','tools','Draft tool','draft',null),
  ('$L_PAUSED','$U1','$ORG_B','sale','tools','Paused tool','paused',null),
  ('$L_EXPIRED','$U1','$ORG_B','sale','tools','Expired tool','active', now() - interval '1 day'),
  ('$L_NOORG','$U1',null,'sale','tools','Personal tool','active',null);
SQL

# apply AFTER the roles table exists (function body references it at call time; applying earlier is fine too)
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151200_market_org_capabilities_for_visible_listings_v1.sql" >/dev/null 2>"$LFD/err" || bad "apply 151200" "$(cat "$LFD/err")"
chk "151200 idempotent re-run" "0" "$($PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151200_market_org_capabilities_for_visible_listings_v1.sql" 2>&1 | grep -ci error)"

echo "== table RLS is NOT widened"
chk "foreign viewer cannot read organization_roles directly" "0" "$(as authenticated $U2 "select count(*) from organization_roles")"
chk "member reads own org roles directly (unchanged)" "3" "$(as authenticated $U1 "select count(*) from organization_roles where organization_id='$ORG_A'")"

echo "== foreign authenticated viewer"
chk "visible active listing -> mapped capability slugs only" "$L_A|employer,$L_A|training_provider" "$(as authenticated $U2 "select string_agg(listing_id||'|'||role_slug, ',' order by role_slug) from $F(array['$L_A']::uuid[])" | tr -d ' ' | sed 's/,$//')"
chk "unmapped slug never returned" "0" "$(as authenticated $U2 "select count(*) from $F(array['$L_A']::uuid[]) where role_slug='not_a_mapped_slug'")"
chk "draft listing -> nothing" "0" "$(as authenticated $U2 "select count(*) from $F(array['$L_DRAFT']::uuid[])")"
chk "paused listing -> nothing" "0" "$(as authenticated $U2 "select count(*) from $F(array['$L_PAUSED']::uuid[])")"
chk "expired listing -> nothing" "0" "$(as authenticated $U2 "select count(*) from $F(array['$L_EXPIRED']::uuid[])")"
chk "personal listing (no org) -> nothing" "0" "$(as authenticated $U2 "select count(*) from $F(array['$L_NOORG']::uuid[])")"
chk "non-published org not enumerable (org ids are not accepted keys)" "0" "$(as authenticated $U2 "select count(*) from $F(array['$ORG_A','$ORG_B','$ORG_C']::uuid[])")"
chk "unknown / wrong ids -> nothing" "0" "$(as authenticated $U2 "select count(*) from $F(array['99999999-9999-9999-9999-999999999999']::uuid[])")"
chk "mixed input returns only the published org" "2" "$(as authenticated $U2 "select count(*) from $F(array['$L_A','$L_DRAFT','$L_PAUSED','$L_EXPIRED','$L_NOORG']::uuid[])")"
chk "NULL / empty array -> nothing" "0" "$(as authenticated $U2 "select count(*) from $F(null::uuid[])")"
chk "output columns are exactly listing_id, role_slug" "TABLE(listing_id uuid, role_slug text)" "$($PSQL -c "select pg_get_function_result('public.$F(uuid[])'::regprocedure)")"
chk "returns no organization id / member / contact column" "0" "$($PSQL -c "select count(*) from pg_get_function_result('public.$F(uuid[])'::regprocedure) r where r ~ '(organization_id|owner|member|email|phone|name)'")"
chk "cap at 200 ids (no error on large input)" "2" "$(as authenticated $U2 "select count(*) from $F(array['$L_A']::uuid[] || (select array_agg(gen_random_uuid()) from generate_series(1,300)))")"

echo "== NULL uid / anon / wrong role"
chk "authenticated with NULL uid -> nothing" "0" "$(asnull authenticated "select count(*) from $F(array['$L_A']::uuid[])")"
chk "anon cannot execute" "ERROR: permission denied for function $F" "$(as anon $U2 "select count(*) from $F(array['$L_A']::uuid[])")"
chk "ACL: no anon / public execute" "false|false" "$($PSQL -c "select has_function_privilege('anon','public.$F(uuid[])','execute')::text||'|'||has_function_privilege('public','public.$F(uuid[])','execute')::text")"
chk "ACL: authenticated can execute" "true" "$($PSQL -c "select has_function_privilege('authenticated','public.$F(uuid[])','execute')::text")"
chk "definer with pinned search_path" "true|public, pg_temp" "$($PSQL -c "select p.prosecdef||'|'||array_to_string(p.proconfig,'')::text from pg_proc p where p.proname='$F'" | sed 's/search_path=//')"

echo "== rollback"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151200_market_org_capabilities_for_visible_listings_v1.down.sql" >/dev/null 2>"$LFD/err" || bad "down 151200" "$(cat "$LFD/err")"
chk "function gone after rollback" "0" "$($PSQL -c "select count(*) from pg_proc where proname='$F'")"
chk "rows intact after rollback" "6" "$($PSQL -c "select count(*) from marketplace_listings")"
if $PSQL -v ON_ERROR_STOP=1 -f "$LFD/20261003151200_market_org_capabilities_for_visible_listings_v1.sql" >/dev/null 2>"$LFD/err"; then ok "re-apply after rollback"; else bad "re-apply" "$(cat "$LFD/err")"; fi
if [ $FAIL -eq 0 ]; then echo "ALL PASS"; else echo "FAILURES"; exit 1; fi
