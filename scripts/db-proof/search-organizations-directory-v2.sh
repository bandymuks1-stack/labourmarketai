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
-- Production v1 (20260802170000), granted to authenticated as production holds it.
create function public.search_organizations_directory_v1(p_term text)
returns table (id uuid, display_name text, organization_type text, country text)
language sql stable security definer set search_path = public as $$
  select o.id, btrim(coalesce(nullif(btrim(o.display_name), ''), nullif(btrim(o.legal_name), ''), '')),
         o.organization_type, o.country
    from public.organizations o
   where char_length(coalesce(p_term, '')) >= 2
     and (o.display_name ilike '%' || p_term || '%' or o.legal_name ilike '%' || p_term || '%')
   limit 20;
$$;
revoke all on function public.search_organizations_directory_v1(text) from public;
grant execute on function public.search_organizations_directory_v1(text) to authenticated;
insert into public.organizations (id, owner_profile_id, organization_type, display_name, legal_name, country, claim_state,
  public_profile_enabled, public_slug, public_contact_email, vat_number, archived_at, archived_reason) values
 ('00000000-0000-4000-8000-000000000001', gen_random_uuid(), 'company', 'QA-SYNTHETIC Statyba Opted', null, 'LT', 'claimed', true,  'qa-statyba', 'x@company.example', 'LT1', null, null),
 ('00000000-0000-4000-8000-000000000002', gen_random_uuid(), 'company', 'QA-SYNTHETIC Statyba Private', null, 'LT', 'claimed', false, null, 'y@company.example', 'LT2', null, null),
 ('00000000-0000-4000-8000-000000000003', null, 'company', 'QA-SYNTHETIC Statyba Register', null, 'IT', 'discovered', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000004', null, 'company', 'QA-SYNTHETIC Statyba Referral', null, 'LT', 'discovered', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000005', null, 'company', 'QA-SYNTHETIC Statyba Archived', null, 'LT', 'discovered', false, null, null, null, now(), 'test'),
 ('00000000-0000-4000-8000-000000000006', gen_random_uuid(), 'team', 'QA-SYNTHETIC Statyba Brigade', null, 'LT', 'claimed', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000007', null, 'company', 'QA-SYNTHETIC Statyba Superseded', null, 'LT', 'invited', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000008', null, 'company', 'QA-SYNTHETIC Statyba Private Name', null, 'LT', 'discovered', false, null, null, null, null, null),
 ('00000000-0000-4000-8000-000000000009', gen_random_uuid(), 'team', 'QA-SYNTHETIC Statyba Old Brigade', null, 'LT', 'claimed', false, null, null, null, now(), 'test'),
 ('00000000-0000-4000-8000-00000000000a', null, 'company', 'QA-SYNTHETIC Zeta', 'QA-SYNTHETIC Statyba Hidden Legal', 'LT', 'discovered', false, null, null, null, null, null);
insert into public.organization_facts (organization_id, field, value, source_kind, superseded_by) values
 ('00000000-0000-4000-8000-000000000003', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Register'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000003', 'country', to_jsonb('IT'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000003', 'contact_public_email', to_jsonb('z@company.example'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000004', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Referral'::text), 'partner_referral', null),
 ('00000000-0000-4000-8000-000000000005', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Archived'::text), 'public_register', null),
 ('00000000-0000-4000-8000-000000000007', 'display_name', to_jsonb('QA-SYNTHETIC Statyba Superseded'::text), 'company_website', gen_random_uuid()),
 -- a later public ingest with another name; the shown name is still the private one
 ('00000000-0000-4000-8000-000000000008', 'legal_name', to_jsonb('QA-SYNTHETIC Statyba Public Register Name'::text), 'public_register', null),
 ('00000000-0000-4000-8000-00000000000a', 'display_name', to_jsonb('QA-SYNTHETIC Zeta'::text), 'public_register', null);
SQL

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | paste -sd'|' -; }
as_role() { printf 'set role %s;\n%s\n' "$1" "$2" | $PSQL -f - 2>&1 | tr -d '\r' | paste -sd'|' -; }
user() { as_role authenticated "$1"; }
anon() { as_role anon "$1"; }

check "before: v1 lists archived and privately named organizations to a signed-in caller" "10" \
  "$(user "select count(*) from search_organizations_directory_v1('statyba')")"

$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null || { echo "apply failed"; exit 1; }
echo "== who a signed-in caller finds"
check "claimed organizations (opted in or not, team included) as confirmed; publicly named unclaimed ones as not confirmed" \
  "QA-SYNTHETIC Statyba Brigade:true|QA-SYNTHETIC Statyba Opted:true|QA-SYNTHETIC Statyba Private:true|QA-SYNTHETIC Statyba Register:false" \
  "$(user "select display_name||':'||confirmed from search_organizations_directory_v2('statyba')")"
check "never an archived company or team" "0|0" "$(user "select count(*) from search_organizations_directory_v2('archived')")|$(user "select count(*) from search_organizations_directory_v2('old brigade')")"
check "a privately sourced name is never listed, even with a public fact under another name" "0" "$(user "select count(*) from search_organizations_directory_v2('private name')")"
check "an unclaimed company is not found by a legal name nobody published" "0" "$(user "select count(*) from search_organizations_directory_v2('hidden legal')")"
check "exactly five columns: no contact, identifier, owner, slug or description" "id,display_name,organization_type,country,confirmed" \
  "$(q "select string_agg(a, ',' order by n) from (select unnest(proargnames[2:]) a, generate_subscripts(proargnames[2:],1) n from pg_proc where proname='search_organizations_directory_v2') x")"
$PSQL -c "update organizations set display_name='QA-SYNTHETIC Statyba Nocountry' where id='00000000-0000-4000-8000-000000000004'; update organization_facts set source_kind='public_register', value=to_jsonb('QA-SYNTHETIC Statyba Nocountry'::text) where organization_id='00000000-0000-4000-8000-000000000004'" >/dev/null
check "an unconfirmed company's country is shown only with a public fact" "IT|" "$(user "select coalesce(country,'') from search_organizations_directory_v2('statyba') where not confirmed order by display_name desc")"
check "a term under two characters lists nothing" "0" "$(user "select count(*) from search_organizations_directory_v2('s')")"
check "a wildcard term lists nothing" "0" "$(user "select count(*) from search_organizations_directory_v2('%%')")"
echo "== who may call"
check "an anonymous visitor cannot call v2" "1" "$(anon "select count(*) from search_organizations_directory_v2('statyba')" | grep -c 'permission denied')"
check "v1 is closed to a signed-in caller" "1" "$(user "select count(*) from search_organizations_directory_v1('statyba')" | grep -c 'permission denied')"
check "v1 is closed to an anonymous visitor" "1" "$(anon "select count(*) from search_organizations_directory_v1('statyba')" | grep -c 'permission denied')"
check "an anonymous visitor still cannot read organizations directly" "1" "$(anon "select count(*) from organizations" | grep -c 'permission denied')"
echo "== rollback"
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null || { echo "rollback failed"; exit 1; }
check "rollback removes v2" "0" "$(q "select count(*) from pg_proc where proname='search_organizations_directory_v2'")"
check "rollback gives v1 back to a signed-in caller (the app's fallback)" "1" "$(user "select count(*) > 0 from search_organizations_directory_v1('statyba')" | grep -c '^t$')"
check "rollback does not open v1 to anon" "1" "$(anon "select count(*) from search_organizations_directory_v1('statyba')" | grep -c 'permission denied')"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null && $PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null
check "re-apply twice is idempotent" "1" "$(q "select count(*) from pg_proc where proname='search_organizations_directory_v2'")"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
