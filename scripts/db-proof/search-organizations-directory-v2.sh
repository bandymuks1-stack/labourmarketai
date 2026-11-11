#!/usr/bin/env bash
# ============================================================================
# search-organizations-directory-v2 -- REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# The REAL migration and rollback over stand-ins with the production column shapes. Synthetic data only.
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/search-organizations-directory-v2.sh
# Uses database `sod2` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261111090000_search_organizations_directory_v2
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58741}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d sod2 -tA -q"
$ADMINP -c "drop database if exists sod2" -c "create database sod2" >/dev/null 2>&1 || { echo "cannot reach postgres on $PGPROOF_PORT"; exit 2; }

$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
create table public.organizations (
  id uuid primary key default gen_random_uuid(), owner_profile_id uuid, organization_type text not null,
  legal_name text, display_name text, country text, description text, vat_number text, website text,
  public_profile_enabled boolean not null default false, public_slug text, public_tagline text,
  public_contact_email text, public_contact_phone text, archived_at timestamptz, archived_reason text,
  claim_state text not null default 'claimed');
create table public.organization_facts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, field text not null, value jsonb,
  source_kind text not null, superseded_by uuid);
insert into public.organizations (id, owner_profile_id, organization_type, display_name, country, claim_state,
  public_profile_enabled, public_slug, public_contact_email, vat_number, archived_at, archived_reason) values
 ('00000000-0000-4000-8000-000000000001', gen_random_uuid(), 'company', 'QA-SYNTHETIC Statyba Opted', 'LT', 'claimed', true,  'qa-statyba', 'x@company.example', 'LT1', null, null),
 ('00000000-0000-4000-8000-000000000002', gen_random_uuid(), 'company', 'QA-SYNTHETIC Statyba Private', 'LT', 'claimed', false, null, 'y@company.example', 'LT2', null, null),
 ('00000000-0000-4000-8000-000000000003', null, 'company', 'QA-SYNTHETIC Statyba Register', 'IT', 'discovered', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000004', null, 'company', 'QA-SYNTHETIC Statyba Referral', 'LT', 'discovered', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000005', null, 'company', 'QA-SYNTHETIC Statyba Archived', 'LT', 'discovered', false, null, null, null, now(), 'test'),
 ('00000000-0000-4000-8000-000000000006', gen_random_uuid(), 'team', 'QA-SYNTHETIC Statyba Brigade', 'LT', 'claimed', true, 'qa-brigade', null, null, null, null),
 ('00000000-0000-4000-8000-000000000007', null, 'company', 'QA-SYNTHETIC Statyba Superseded', 'LT', 'invited', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000008', null, 'company', 'QA-SYNTHETIC Statyba Private Name', 'LT', 'discovered', false, null, null, null, null, null);
insert into public.organization_facts (organization_id, field, value, source_kind, superseded_by) values
 ('00000000-0000-4000-8000-000000000003', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Register'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000003', 'country', to_jsonb('IT'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000003', 'contact_public_email', to_jsonb('z@company.example'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000004', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Referral'::text), 'partner_referral', null),
 ('00000000-0000-4000-8000-000000000005', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Archived'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000007', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Superseded'::text), 'company_website', gen_random_uuid()),
 -- a later public ingest with another name; the shown name is still the private one
 ('00000000-0000-4000-8000-000000000008', 'legal_name', to_jsonb('QA-SYNTHETIC Statyba Public Register Name'::text), 'public_register', null);
SQL

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | paste -sd'|' -; }
anon() { printf 'set role anon;\n%s\n' "$1" | $PSQL -f - 2>&1 | tr -d '\r' | paste -sd'|' -; }

$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null || { echo "apply failed"; exit 1; }
echo "== who is listed"
check "an anonymous visitor lists the opted-in company and the publicly sourced one" \
  "QA-SYNTHETIC Statyba Opted:true:qa-statyba|QA-SYNTHETIC Statyba Register:false:" \
  "$(anon "select display_name||':'||confirmed||':'||coalesce(public_slug,'') from search_organizations_directory_v2('statyba')")"
check "no contact, identifier, owner or description column exists" "id,display_name,organization_type,country,public_slug,confirmed" \
  "$(q "select string_agg(a, ',' order by n) from (select unnest(proargnames[2:]) a, generate_subscripts(proargnames[2:],1) n from pg_proc where proname='search_organizations_directory_v2') x")"
check "a public fact with another name does not publish a privately sourced name" "0" "$(anon "select count(*) from search_organizations_directory_v2('private name')")"
$PSQL -c "update organizations set display_name='QA-SYNTHETIC Statyba Nocountry' where id='00000000-0000-4000-8000-000000000004'; update organization_facts set source_kind='public_register', value=to_jsonb('QA-SYNTHETIC Statyba Nocountry'::text) where organization_id='00000000-0000-4000-8000-000000000004'" >/dev/null
check "an unconfirmed company's country is shown only with a public fact" "IT|" "$(anon "select coalesce(country,'') from search_organizations_directory_v2('statyba') where not confirmed order by display_name desc")"
check "a term under two characters lists nothing" "0" "$(anon "select count(*) from search_organizations_directory_v2('s')")"
check "a wildcard term lists nothing" "0" "$(anon "select count(*) from search_organizations_directory_v2('%%')")"
check "an anonymous visitor still cannot read organizations directly" "1" "$(anon "select count(*) from organizations" | grep -c 'permission denied')"
echo "== rollback"
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null || { echo "rollback failed"; exit 1; }
check "rollback removes the function" "0" "$(q "select count(*) from pg_proc where proname='search_organizations_directory_v2'")"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null && $PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null
check "re-apply twice is idempotent" "1" "$(q "select count(*) from pg_proc where proname='search_organizations_directory_v2'")"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
