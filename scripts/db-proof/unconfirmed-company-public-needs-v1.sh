#!/usr/bin/env bash
# ============================================================================
# UNCONFIRMED COMPANY PUBLIC NEEDS (owner decision V-1, 2026-11-12) — REAL
# PostgreSQL 16 proof (no Docker, no Supabase).
#
# Applies the CURRENT worker board (20261029190000) on a reduced schema, then
# 20261112100000_unconfirmed_company_public_needs_v1, and proves:
#   * one rule: worker board and public reader agree; a verified company's need
#     is unchanged, a clean unconfirmed one is shown and labelled, a spammy,
#     incomplete, disposable-mail, rate-burst, duplicate or advert one is held;
#   * signed-out visitors read only the public reader, 9 columns, no contact;
#   * the company reads its own state ("waiting for review"), nobody else's;
#   * only an admin reads the queue and decides; an approval binds to content;
#   * rollback restores the verified-only board, keeps decisions; re-apply works.
#
# Usage:
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/unconfirmed-company-public-needs-v1.sh
# Never point this at production or at a shared local stack. It DROPs schema public.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
RB="$REPO/supabase/rollbacks"
BOARD="$M/20261029190000_worker_board_need_skill_slugs_v1.sql"
MIG="$M/20261112100000_unconfirmed_company_public_needs_v1.sql"
DOWN="$RB/20261112100000_unconfirmed_company_public_needs_v1.down.sql"

PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}
PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
ERR="$(mktemp)"

apply() { tr -d '\r' < "$1" | $PSQL -v ON_ERROR_STOP=1 -f - >/dev/null 2>"$ERR" || { echo "APPLY FAILED: $1"; cat "$ERR"; exit 1; }; }

echo "Rebuilding a clean proof database ..."
$PSQL -c "drop schema if exists public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null 2>&1
apply "$HERE/unconfirmed-company-public-needs-v1.prelude.sql"
apply "$BOARD"

ADMIN=a0000000-0000-4000-8000-000000000001
WRK=a0000000-0000-4000-8000-000000000002
VER=b0000000-0000-4000-8000-000000000001   # verified company owner
UNC=b0000000-0000-4000-8000-000000000002   # unconfirmed, clean
SPM=b0000000-0000-4000-8000-000000000003   # unconfirmed, phone in the shown role
INC=b0000000-0000-4000-8000-000000000004   # unconfirmed, no place
DSP=b0000000-0000-4000-8000-000000000005   # unconfirmed, disposable sign-in mail
RAT=b0000000-0000-4000-8000-000000000006   # unconfirmed, 6 needs in 24 h
DUP=b0000000-0000-4000-8000-000000000007   # unconfirmed, copies UNC's summary
ADV=b0000000-0000-4000-8000-000000000008   # unconfirmed, advert pitch in private notes
SYN=b0000000-0000-4000-8000-000000000009   # unconfirmed synthetic QA fixture
DRF=b0000000-0000-4000-8000-00000000000b   # company still in draft
OUT=b0000000-0000-4000-8000-00000000000a   # signed-in stranger

$PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"$ERR" <<SQL || { echo "seed FAILED"; cat "$ERR"; exit 1; }
insert into public.profiles(id, is_admin) values ('$ADMIN', true), ('$WRK', false), ('$VER', false), ('$UNC', false),
  ('$SPM', false), ('$INC', false), ('$DSP', false), ('$RAT', false), ('$DUP', false), ('$ADV', false), ('$SYN', false), ('$OUT', false), ('$DRF', false);
insert into auth.users(id, email) select id, 'p' || substr(id::text, 34) || '@firma.lt' from public.profiles;
update auth.users set email = 'x@mailinator.com' where id = '$DSP';
insert into public.workers(profile_id) values ('$WRK');
insert into public.skills(slug) values ('tiling');
do \$\$
declare p record; c uuid; o uuid;
begin
  for p in select * from (values
      ('$VER'::uuid, 'Verified UAB', 'verified'), ('$UNC'::uuid, 'Clean UAB', 'active_unverified'),
      ('$SPM'::uuid, 'Spam UAB', 'active_unverified'), ('$INC'::uuid, 'Incomplete UAB', 'pending_verification'),
      ('$DSP'::uuid, 'Disposable UAB', 'active_unverified'), ('$RAT'::uuid, 'Burst UAB', 'active_unverified'),
      ('$DUP'::uuid, 'Copy UAB', 'active_unverified'), ('$ADV'::uuid, 'Advert UAB', 'unverified'),
      ('$SYN'::uuid, 'QA-SYNTHETIC UAB', 'active_unverified'), ('$DRF'::uuid, 'Draft UAB', 'draft')) v(pid, name, st)
  loop
    insert into public.companies(profile_id, display_name, country, contact_email, contact_phone, verification_status)
      values (p.pid, p.name, 'LT', 'secret@firma.lt', '+37060000000', p.st) returning id into c;
    insert into public.organizations(display_name, legacy_company_id) values (p.name, c) returning id into o;
    insert into public.company_memberships values (p.pid, o, 'active', 'owner');
  end loop;
end \$\$;
create function pg_temp.need(p uuid, role text, loc text, summary text, notes text default null, at timestamptz default now())
returns uuid language sql as \$f\$
  insert into public.customer_requests(profile_id, organization_id, title, role_or_work_type, country, location,
                                       need_summary, notes, status, kind, created_at)
  select p, o.id, 'Need of ' || role, role, 'LT', loc, summary, notes, 'submitted', 'company_request', at
    from public.organizations o join public.companies c on c.id = o.legacy_company_id where c.profile_id = p
  returning id \$f\$;
select pg_temp.need('$VER', 'tiler', 'Vilnius', 'Bathroom tiling on a residential site.');
select pg_temp.need('$UNC', 'electrician', 'Kaunas', 'Wiring of a new warehouse, three months from January.');
select pg_temp.need('$SPM', 'welder call +370 612 34567', 'Klaipeda', 'Steel works.');
select pg_temp.need('$INC', 'painter', null, 'Painting.');
select pg_temp.need('$DSP', 'carpenter', 'Siauliai', 'Roof works.');
select pg_temp.need('$RAT', 'helper', 'Alytus', 'Helper ' || g, null, now() - (g || ' minutes')::interval) from generate_series(1, 6) g;
select pg_temp.need('$DUP', 'electrician', 'Vilnius', 'Wiring of a new warehouse, three months from January.');
select pg_temp.need('$ADV', 'driver', 'Panevezys', 'Driver.', 'We sell b2b data: 5 million companies, lifetime deal at www.leads.io');
select pg_temp.need('$SYN', 'mason', 'Vilnius', 'Masonry.');
select pg_temp.need('$DRF', 'plumber', 'Vilnius', 'Plumbing.');
insert into public.customer_requests(profile_id, organization_id, title, role_or_work_type, country, location, status, kind)
  select '$UNC', o.id, 'draft', 'roofer', 'LT', 'Kaunas', 'draft', 'company_request'
    from public.organizations o join public.companies c on c.id = o.legacy_company_id where c.profile_id = '$UNC';
SQL

pass=0; fail=0
as()   { local who="$1"; shift; printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$who'; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
anon() { printf '%s\n' "set role anon; $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
q()    { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
check(){ if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has()  { if printf '%s' "$3" | grep -qiE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
rid()  { q "select cr.id from public.customer_requests cr where cr.profile_id='$1' and cr.status='submitted' order by cr.created_at desc limit 1;"; }
board(){ as $WRK "select string_agg(company_name || ':' || route_status, ',' order by company_name) from public.list_open_demand_for_workers();"; }

echo; echo "== Before (20261029190000): workers see only the verified company"
check "board = verified only" "Verified UAB:approved_direct_partner" "$(board)"

apply "$MIG"
echo; echo "== After V-1: one rule"
check "worker board: verified unchanged + clean unconfirmed labelled; burst shows its first 5" \
  "Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Clean UAB:unconfirmed_company,Verified UAB:approved_direct_partner" "$(board)"
check "signed-out public reader agrees (same set)" \
  "Burst UAB:false,Burst UAB:false,Burst UAB:false,Burst UAB:false,Burst UAB:false,Clean UAB:false,Verified UAB:true" \
  "$(anon "select string_agg(company_name || ':' || company_confirmed, ',' order by company_name) from public.list_public_company_needs_v1();")"
check "public reader returns exactly 9 columns, no contact/poster/text" \
  "id,role_text,country,location_label,team_size,start_period,created_at,company_name,company_confirmed" \
  "$(q "select string_agg(a, ',' order by o) from unnest((select proargnames from pg_proc where proname='list_public_company_needs_v1')) with ordinality t(a,o) where a not like 'p\_%';")"
has "public reader leaks no contact e-mail or phone" "^0$" "$(anon "select count(*) from public.list_public_company_needs_v1() x where x::text ~ '(secret@|\\+3706)';")"
check "query filter: 'electr' finds the clean need only" "electrician" "$(anon "select string_agg(role_text, ',') from public.list_public_company_needs_v1('electr');")"
check "country filter: a bad code is ignored, LV finds nothing" "7|0" "$(anon "select count(*) from public.list_public_company_needs_v1(null, 'lt; drop');")|$(anon "select count(*) from public.list_public_company_needs_v1(null, 'LV');")"
check "synthetic QA fixture never public" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name ~ 'SYNTHETIC';")"
check "draft need never public" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where role_text = 'roofer';")"

echo; echo "== The checks (states and reasons)"
st() { q "select s.state || ':' || array_to_string(s.reasons, '+') from public.need_public_state_v1('$1') s;"; }
check "verified"            "verified:"                    "$(st $(rid $VER))"
check "clean unconfirmed"   "unconfirmed_public:"          "$(st $(rid $UNC))"
check "phone in role"       "held_review:phone"            "$(st $(rid $SPM))"
check "no place"            "held_incomplete:missing_location" "$(st $(rid $INC))"
check "disposable e-mail"   "held_review:disposable_email" "$(st $(rid $DSP))"
check "6th need in 24 h"    "held_review:rate"             "$(st $(rid $RAT))"
check "copied summary"      "held_review:duplicate_text"   "$(st $(rid $DUP))"
check "advert in private notes" "held_review:pitch"        "$(st $(rid $ADV))"
check "draft company"       "held_incomplete:company_draft" "$(st $(rid $DRF))"
fl() { q "select array_to_string(public.need_public_text_flags_v1(\$t\$$1\$t\$), '+');"; }
check "flags: plain Lithuanian role"  ""            "$(fl 'Plytelių klojėjas, Vilnius')"
check "flags: a date range is no phone" ""         "$(fl 'from 2026-12-01 to 2027-03-01, 1200-1500 EUR')"
check "flags: e-mail"                 "email"      "$(fl 'write info@firma.lt')"
check "flags: bare domain"            "link"       "$(fl 'see firma.com')"
check "flags: messenger"              "contact_channel" "$(fl 'WhatsApp me')"
check "flags: national phone"         "phone"      "$(fl 'call 612 345 678')"

echo; echo "== Access"
has "anon cannot call the worker board"     "permission denied" "$(anon "select * from public.list_open_demand_for_workers();")"
has "anon cannot call the rule directly"    "permission denied" "$(anon "select * from public.need_public_state_v1('$(rid $UNC)');")"
has "signed-in cannot call the rule directly" "permission denied" "$(as $OUT "select * from public.need_public_state_v1('$(rid $UNC)');")"
has "anon cannot read decisions"            "permission denied" "$(anon "select count(*) from public.customer_request_public_reviews;")"
has "signed-in cannot read decisions"       "permission denied" "$(as $OUT "select count(*) from public.customer_request_public_reviews;")"
has "anon cannot read own-state door"       "permission denied" "$(anon "select * from public.get_my_need_public_states_v1(array['$(rid $SPM)'::uuid]);")"
check "the company reads its own held state" "held_review:phone" "$(as $SPM "select state || ':' || array_to_string(reasons, '+') from public.get_my_need_public_states_v1(array['$(rid $SPM)'::uuid]);")"
check "a stranger reads nothing of it"       "0"                 "$(as $OUT "select count(*) from public.get_my_need_public_states_v1(array['$(rid $SPM)'::uuid]);")"
has "a non-admin cannot read the queue"      "not_admin"         "$(as $OUT "select * from public.list_need_public_review_queue_v1();")"
has "a non-admin cannot decide"              "not_admin"         "$(as $SPM "select public.decide_need_public_review_v1('$(rid $SPM)', 'approved');")"
check "admin queue = the seven held needs" "Advert UAB,Burst UAB,Copy UAB,Disposable UAB,Draft UAB,Incomplete UAB,Spam UAB" \
  "$(as $ADMIN "select string_agg(company_name, ',' order by company_name) from public.list_need_public_review_queue_v1();")"
as $WRK "insert into public.demand_interest_signals(worker_id, status, request_id) select w.id, 'interested', '$(rid $UNC)' from public.workers w where w.profile_id = auth.uid();" >/dev/null
check "worker may raise a hand on a labelled need (policy unchanged)" "1" "$(q "select count(*) from public.demand_interest_signals where request_id = '$(rid $UNC)';")"
has "...but not on a held one"               "row-level security" "$(as $WRK "insert into public.demand_interest_signals(worker_id, status, request_id) select w.id, 'interested', '$(rid $SPM)' from public.workers w where w.profile_id = auth.uid();")"

echo; echo "== Operator decisions bind to content"
check "approve the phone need"           "unconfirmed_public" "$(as $ADMIN "select public.decide_need_public_review_v1('$(rid $SPM)', 'approved', 'checked by phone');")"
check "...now public"                    "1" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Spam UAB';")"
q "update public.customer_requests set role_or_work_type = 'welder, call +370 699 99999' where id = '$(rid $SPM)';" >/dev/null
check "an edit of the shown text re-holds it" "held_review" "$(q "select state from public.need_public_state_v1('$(rid $SPM)');")"
check "reject the incomplete need"       "rejected" "$(as $ADMIN "select public.decide_need_public_review_v1('$(rid $INC)', 'rejected', 'no place');")"
check "...not public"                    "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Incomplete UAB';")"
has "a verified need is not reviewable"  "not_reviewable" "$(as $ADMIN "select public.decide_need_public_review_v1('$(rid $VER)', 'rejected');")"
has "an unknown decision is refused"     "invalid_decision" "$(as $ADMIN "select public.decide_need_public_review_v1('$(rid $DSP)', 'maybe');")"
check "decisions are recorded with the operator" "2|2" "$(q "select count(*) from public.customer_request_public_reviews;")|$(q "select count(*) from public.customer_request_public_reviews where decided_by = '$ADMIN';")"

echo; echo "== Rollback"
apply "$DOWN"
check "board back to verified only"  "Verified UAB:approved_direct_partner" "$(board)"
check "public reader gone"           "0" "$(q "select count(*) from pg_proc where proname in ('list_public_company_needs_v1','need_public_state_v1','get_my_need_public_states_v1','list_need_public_review_queue_v1','decide_need_public_review_v1');")"
check "decisions kept (evidence)"    "2" "$(q "select count(*) from public.customer_request_public_reviews;")"
apply "$MIG"
check "re-apply after rollback works and keeps the decisions" "2|Clean UAB" \
  "$(q "select count(*) from public.customer_request_public_reviews;")|$(anon "select company_name from public.list_public_company_needs_v1('electr');")"
apply "$MIG"
check "applying twice is idempotent" "7" "$(anon "select count(*) from public.list_public_company_needs_v1();")"

echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
