#!/usr/bin/env bash
# ============================================================================
# privacy-consent-locale-sv-v1 -- REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# The REAL migration and rollback over stand-ins with the production column shapes. Synthetic data only.
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/privacy-consent-locale-sv-v1.sh
# Uses database `pcsv1` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261112210000_privacy_consent_locale_sv_v1
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PL="$REPO/supabase/migrations/20260922140000_privacy_consent_rpc_locale_pl_v1.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58741}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d pcsv1 -tA -q"
$ADMINP -c "drop database if exists pcsv1" -c "create database pcsv1" >/dev/null 2>&1 || { echo "cannot reach postgres on $PGPROOF_PORT"; exit 2; }

OLD_PD=d4145ac3d118b17e5bc3bd68c3f2737ff0c872e08a38df034464213aad534549
OLD_ED=6f57d9167a6313220ba34ae46a1ca03357db0737d17f5985b3dd5f1e75b6fb81
OLD_PS=28b2a552ae56b5e0f260896664a9f5f7a5a918fe536e613c62c0028ac267db7f
NEW_PD=aed377c0113d0649c587a517ae63adea0c91354dbb0484f290a634710ffc46f9
NEW_PS=f5d40f6757f6e71c3c7712a214ef3f2465f7dc27d319c33b7a2fad1bdacf3262

$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || exit 1
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end \$\$;
create schema auth;
create function auth.uid() returns uuid language sql stable as \$f\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$f\$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.privacy_consent_purposes (purpose text primary key, current_version text not null,
  current_text_hash text not null, updated_at timestamptz not null default now());
create table public.privacy_consent_events (id uuid primary key default gen_random_uuid(), user_id uuid, purpose text not null,
  action text not null, consent_text_version text not null, consent_text_hash text not null, locale text not null,
  source text not null, recipient_organization_id uuid, context_type text, context_id uuid, selected_fields jsonb,
  created_at timestamptz not null default now());
create table public.workers (profile_id uuid);
create table public.organizations (id uuid primary key);
create table public.customer_requests (id uuid primary key);
create table public.booking_requests (id uuid primary key);
create table public.service_offering_requests (id uuid primary key);
insert into public.privacy_consent_purposes (purpose, current_version, current_text_hash) values
 ('profile_discoverability', '2026-07-11.v2', '$OLD_PD'),
 ('employer_data_disclosure', '2026-07-11.v2', '$OLD_ED'),
 ('partner_supply_representation', '2026-09-04.v1', '$OLD_PS');
-- an earlier grant in Polish, as evidence that must never move
insert into public.privacy_consent_events (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
values ('b0000000-0000-4000-8000-000000000001', 'profile_discoverability', 'granted', '2026-07-11.v2', '$OLD_PD', 'pl', 'settings');
SQL
# the production functions as of today (20260922140000, byte-identical to production prosrc)
$PSQL -v ON_ERROR_STOP=1 -f "$PL" >/dev/null || { echo "baseline failed"; exit 1; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | paste -sd'|' -; }
as_user() { printf "set role authenticated;\nset request.jwt.claim.sub = 'b0000000-0000-4000-8000-000000000002';\n%s\n" "$1" | $PSQL -f - 2>&1 | tr -d '\r' | paste -sd'|' -; }
grant_pd() { as_user "select grant_profile_discoverability_consent('2026-07-11.v2', '$1', '$2', 'settings') ->> 'error'"; }
EVID=$(q "select md5(string_agg(id::text||consent_text_hash||locale, ',' order by id)) from privacy_consent_events")

echo "== before: sv is refused"
check "today a Swedish grant is refused" "unsupported_locale" "$(grant_pd $OLD_PD sv)"

$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null || { echo "apply failed"; exit 1; }
echo "== after apply"
check "all three pins moved to the sv hashes, versions unchanged" \
  "employer_data_disclosure:2026-07-11.v2:eed33d481b7cb620087d8e34448651d8cfa0651d5e77515e51491c02c63ac0e0|partner_supply_representation:2026-09-04.v1:$NEW_PS|profile_discoverability:2026-07-11.v2:$NEW_PD" \
  "$(q "select purpose||':'||current_version||':'||current_text_hash from privacy_consent_purposes order by purpose")"
check "a Swedish grant at the new pin is recorded" "" "$(grant_pd $NEW_PD sv)"
check "it records the language and the moment" "sv|true" "$(q "select locale||'|'||(created_at is not null) from privacy_consent_events where locale='sv'")"
check "a grant at the OLD pin is refused as stale" "stale_consent_version" "$(grant_pd $OLD_PD lt)"
check "an unknown language is still refused" "unsupported_locale" "$(grant_pd $NEW_PD fi)"
check "partner representation accepts sv too" "" "$(as_user "select grant_partner_supply_representation_consent('2026-09-04.v1', '$NEW_PS', 'sv', 'settings') ->> 'error'")"
check "the earlier Polish evidence did not move" "1" "$(q "select count(*) from privacy_consent_events where locale='pl' and consent_text_hash='$OLD_PD'")"
check "grants stay authenticated only (anon refused)" "1" "$(printf "set role anon;\nselect grant_profile_discoverability_consent('a','b','sv','x');\n" | $PSQL -f - 2>&1 | grep -c 'permission denied')"
check "SECURITY DEFINER and search_path kept" "3" "$(q "select count(*) from pg_proc where proname in ('grant_profile_discoverability_consent','grant_partner_supply_representation_consent','grant_employer_data_disclosure') and prosecdef and array_to_string(proconfig, ',') = 'search_path=public'")"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null
check "applying twice changes nothing" "$NEW_PD" "$(q "select current_text_hash from privacy_consent_purposes where purpose='profile_discoverability'")"

echo "== rollback"
SV_BEFORE=$(q "select count(*) from privacy_consent_events where locale='sv'")
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null || { echo "rollback failed"; exit 1; }
check "rollback restores the three pre-sv pins" "$OLD_ED|$OLD_PS|$OLD_PD" "$(q "select current_text_hash from privacy_consent_purposes order by purpose")"
check "rollback refuses sv again" "unsupported_locale" "$(grant_pd $OLD_PD sv)"
check "rollback keeps every Swedish consent event as evidence" "$SV_BEFORE" "$(q "select count(*) from privacy_consent_events where locale='sv'")"
check "rollback leaves the six-locale functions byte-identical to production" "3" "$(q "select count(*) from pg_proc where proname in ('grant_profile_discoverability_consent','grant_partner_supply_representation_consent','grant_employer_data_disclosure') and md5(prosrc) in ('2a425a837e7fdce83f1ed356f314ab66','7088d28164ffc3d244a94faecc001a97','42ffc9841ab6f5994db6fa40fb3e1c01')")"
check "rollback twice changes nothing" "$OLD_PD" "$($PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null; q "select current_text_hash from privacy_consent_purposes where purpose='profile_discoverability'")"

echo "== a drifted pin refuses the whole file"
$PSQL -c "update privacy_consent_purposes set current_text_hash='drifted' where purpose='employer_data_disclosure'" >/dev/null
check "apply over an unexpected pin fails" "1" "$($PSQL -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | grep -c 'expected 3 pins')"
check "and changes nothing" "$OLD_PD" "$(q "select current_text_hash from privacy_consent_purposes where purpose='profile_discoverability'")"
check "the pre-existing evidence row never changed" "1" "$(q "select count(*) from privacy_consent_events where locale='pl' and consent_text_hash='$OLD_PD'")"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
