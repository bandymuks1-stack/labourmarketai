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
NOP=b0000000-0000-4000-8000-00000000000c   # unconfirmed, clean, NEVER published (default off)
MGR=b0000000-0000-4000-8000-00000000000d   # a manager of the clean company (not the poster)
EXT=b0000000-0000-4000-8000-00000000000e   # an EXTERNAL manager of the clean company (has demand access)
EXM=b0000000-0000-4000-8000-00000000000f   # a former (ended) admin of the clean company
OAD=b0000000-0000-4000-8000-000000000010   # an active admin of the clean company
OOW=b0000000-0000-4000-8000-000000000011   # a second active owner of the clean company (not the poster)
WMB=b0000000-0000-4000-8000-000000000012   # an active plain member (worker) of the clean company
OUT=b0000000-0000-4000-8000-00000000000a   # signed-in stranger

$PSQL -v ON_ERROR_STOP=1 >/dev/null 2>"$ERR" <<SQL || { echo "seed FAILED"; cat "$ERR"; exit 1; }
insert into public.profiles(id, is_admin) values ('$ADMIN', true), ('$WRK', false), ('$VER', false), ('$UNC', false),
  ('$SPM', false), ('$INC', false), ('$DSP', false), ('$RAT', false), ('$DUP', false), ('$ADV', false), ('$SYN', false), ('$OUT', false), ('$DRF', false), ('$NOP', false), ('$MGR', false), ('$EXT', false), ('$EXM', false), ('$OAD', false), ('$OOW', false), ('$WMB', false);
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
      ('$SYN'::uuid, 'QA-SYNTHETIC UAB', 'active_unverified'), ('$DRF'::uuid, 'Draft UAB', 'draft'), ('$NOP'::uuid, 'Quiet UAB', 'active_unverified')) v(pid, name, st)
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
select pg_temp.need('$NOP', 'roofer', 'Utena', 'Roof repair on a school building, two weeks in spring.');
insert into public.company_memberships
  select '$MGR', o.id, 'active', 'manager' from public.organizations o where o.display_name = 'Clean UAB';
insert into public.company_memberships
  select '$EXT', o.id, 'active', 'external_manager' from public.organizations o where o.display_name = 'Clean UAB';
insert into public.company_memberships
  select '$EXM', o.id, 'ended', 'admin' from public.organizations o where o.display_name = 'Clean UAB';
insert into public.company_memberships select '$OAD', o.id, 'active', 'admin'  from public.organizations o where o.display_name = 'Clean UAB';
insert into public.company_memberships select '$OOW', o.id, 'active', 'owner'  from public.organizations o where o.display_name = 'Clean UAB';
insert into public.company_memberships select '$WMB', o.id, 'active', 'member' from public.organizations o where o.display_name = 'Clean UAB';
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
echo; echo "== Principle C: nothing is public before the company's explicit choice"
check "no need of an unconfirmed company is shown before any choice (worker board)" "Verified UAB:approved_direct_partner" "$(board)"
check "no need at all on the signed-out reader before any choice" "0" "$(anon "select count(*) from public.list_public_company_needs_v1();")"
check "a clean need without a choice is not_published (not held, not in the queue)" "not_published" "$(q "select state from public.need_public_state_v1('$(rid $UNC)');")"
# The companies' explicit choice, seeded as publish events for every unconfirmed need but Quiet UAB's.
$PSQL -c "do \$\$ declare x record; begin
  for x in select cr.id, cr.profile_id from public.customer_requests cr
            where cr.status = 'submitted' and cr.profile_id not in ('$VER', '$NOP')
            order by cr.created_at, cr.id loop
    insert into public.customer_request_publications (request_id, action, actor_id) values (x.id, 'publish', x.profile_id);
  end loop; end \$\$;" >/dev/null
echo; echo "== After the choice: one rule"
check "worker board: verified unchanged + clean unconfirmed labelled; burst shows its first 5" \
  "Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Burst UAB:unconfirmed_company,Clean UAB:unconfirmed_company,Verified UAB:approved_direct_partner" "$(board)"
check "signed-out reader: published unconfirmed only; verified needs keep their visibility (not here)" \
  "Burst UAB:false,Burst UAB:false,Burst UAB:false,Burst UAB:false,Burst UAB:false,Clean UAB:false" \
  "$(anon "select string_agg(company_name || ':' || company_confirmed, ',' order by company_name) from public.list_public_company_needs_v1();")"
check "public reader returns exactly 9 columns, no contact/poster/text" \
  "id,role_text,country,location_label,team_size,start_period,created_at,company_name,company_confirmed" \
  "$(q "select string_agg(a, ',' order by o) from unnest((select proargnames from pg_proc where proname='list_public_company_needs_v1')) with ordinality t(a,o) where a not like 'p\_%';")"
has "public reader leaks no contact e-mail or phone" "^0$" "$(anon "select count(*) from public.list_public_company_needs_v1() x where x::text ~ '(secret@|\\+3706)';")"
check "query filter: 'electr' finds the clean need only" "electrician" "$(anon "select string_agg(role_text, ',') from public.list_public_company_needs_v1('electr');")"
check "country filter: a bad code is ignored, LV finds nothing" "6|0" "$(anon "select count(*) from public.list_public_company_needs_v1(null, 'lt; drop');")|$(anon "select count(*) from public.list_public_company_needs_v1(null, 'LV');")"
check "synthetic QA fixture never public" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name ~ 'SYNTHETIC';")"
check "draft need never public" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where role_text = 'roofer';")"

echo; echo "== The checks (states and reasons)"
st() { q "select s.state || ':' || array_to_string(s.reasons, '+') from public.need_public_state_v1('$1') s;"; }
check "verified"            "verified:"                    "$(st $(rid $VER))"
check "clean unconfirmed"   "unconfirmed_public:"          "$(st $(rid $UNC))"
check "clean but never published" "not_published:"         "$(st $(rid $NOP))"
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

echo; echo "== The company's choice: who may make it, and withdrawal"
has "anon cannot choose"                   "permission denied" "$(anon "select public.set_need_public_publication_v1('$(rid $NOP)', true);")"
has "a stranger cannot publish another company's need" "not_allowed" "$(as $OUT "select public.set_need_public_publication_v1('$(rid $NOP)', true);")"
has "a company cannot write the choice table directly" "permission denied" "$(as $NOP "insert into public.customer_request_publications(request_id, action) values ('$(rid $NOP)', 'publish');")"
check "the poster publishes: shown at once"  "unconfirmed_public" "$(as $NOP "select public.set_need_public_publication_v1('$(rid $NOP)', true);")"
check "...on the signed-out reader"          "1" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Quiet UAB';")"
check "publishing twice records one event"   "unconfirmed_public|1" "$(as $NOP "select public.set_need_public_publication_v1('$(rid $NOP)', true);")|$(q "select count(*) from public.customer_request_publications where request_id = '$(rid $NOP)';")"
has "an external manager (demand access, not owner/admin/manager) cannot choose" "not_allowed" "$(as $EXT "select public.set_need_public_publication_v1('$(rid $UNC)', false);")"
has "a former admin (membership ended) cannot choose" "not_allowed" "$(as $EXM "select public.set_need_public_publication_v1('$(rid $UNC)', false);")"
check "...and nothing was recorded for either" "1" "$(q "select count(*) from public.customer_request_publications where request_id = '$(rid $UNC)';")"
check "an org manager (not the poster) withdraws the clean need" "not_published" "$(as $MGR "select public.set_need_public_publication_v1('$(rid $UNC)', false);")"
check "...gone from the signed-out reader"   "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Clean UAB';")"
check "...and from the worker board"         "0" "$(as $WRK "select count(*) from public.list_open_demand_for_workers() where company_name = 'Clean UAB';")"
check "the manager publishes it again"       "unconfirmed_public" "$(as $MGR "select public.set_need_public_publication_v1('$(rid $UNC)', true);")"
check "an org admin withdraws"               "not_published" "$(as $OAD "select public.set_need_public_publication_v1('$(rid $UNC)', false);")"
check "a second org owner publishes"         "unconfirmed_public" "$(as $OOW "select public.set_need_public_publication_v1('$(rid $UNC)', true);")"
has "a plain member cannot choose"            "not_allowed" "$(as $WMB "select public.set_need_public_publication_v1('$(rid $UNC)', false);")"
check "the author (poster) withdraws and publishes again" "not_published|unconfirmed_public" "$(as $UNC "select public.set_need_public_publication_v1('$(rid $UNC)', false);")|$(as $UNC "select public.set_need_public_publication_v1('$(rid $UNC)', true);")"
check "every event names who chose"          "0" "$(q "select count(*) from public.customer_request_publications where actor_id is null;")"
has "an operator cannot make the company's choice" "not_allowed" "$(as $ADMIN "select public.set_need_public_publication_v1('$(rid $NOP)', false);")"
check "the poster withdraws"                "not_published" "$(as $NOP "select public.set_need_public_publication_v1('$(rid $NOP)', false);")"
has "a not-published need is not reviewable" "not_reviewable" "$(as $ADMIN "select public.decide_need_public_review_v1('$(rid $NOP)', 'approved');")"

echo; echo "== R2 findings (independent review of f4c03ca), each reproduced and closed"
# P1-1: an operator rewrites the author column (allowed by the table's UPDATE policy), then tries
# to publish as the "author". The door also requires an active membership of the need's org.
as $ADMIN "update public.customer_requests set profile_id = '$ADMIN' where id = '$(rid $NOP)';" >/dev/null
NOPID=$(q "select id from public.customer_requests where profile_id = '$ADMIN' and title = 'Need of roofer';")
has "P1-1 an operator who rewrote the author column still cannot publish" "not_allowed" "$(as $ADMIN "select public.set_need_public_publication_v1('$NOPID', true);")"
check "P1-1 ...and the need is not on the signed-out reader" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Quiet UAB';")"
as $ADMIN "update public.customer_requests set profile_id = '$NOP' where id = '$NOPID';" >/dev/null
# P1-2: free text in start_period is screened and never reaches a signed-out caller.
q "update public.customer_requests set start_period = 'call +370 612 34567' where id = '$(rid $UNC)';" >/dev/null
check "P1-2 contact data in the start field holds the need" "held_review:phone" "$(st $(rid $UNC))"
check "P1-2 ...and it is gone from the signed-out reader" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Clean UAB';")"
q "update public.customer_requests set start_period = 'next spring' where id = '$(rid $UNC)';" >/dev/null
check "P1-2 a harmless free-text start is shown as nothing (closed set only)" "unconfirmed_public|" "$(q "select state from public.need_public_state_v1('$(rid $UNC)');")|$(anon "select coalesce(start_period, '') from public.list_public_company_needs_v1() where company_name = 'Clean UAB';")"
q "update public.customer_requests set start_period = 'urgent' where id = '$(rid $UNC)';" >/dev/null
check "P1-2 a closed-set start is shown" "urgent" "$(anon "select start_period from public.list_public_company_needs_v1() where company_name = 'Clean UAB';")"
# P2-3: the poster backdates created_at (the table's UPDATE grant allows it): rate unchanged.
as $RAT "update public.customer_requests set created_at = now() - interval '30 days' where profile_id = auth.uid() and status = 'submitted' and id <> '$(rid $RAT)';" >/dev/null
check "P2-3 backdating created_at does not evade the rate check" "held_review:rate" "$(st $(rid $RAT))"
# P2-3: a third organization copies Clean UAB's text and backdates its own need: Clean stays public.
q "update public.customer_requests set need_summary = (select need_summary from public.customer_requests where id = '$(rid $UNC)'), created_at = now() - interval '400 days' where id = '$(rid $DSP)';" >/dev/null
check "P2-3 a backdated copy cannot push the original off every surface" "unconfirmed_public" "$(q "select state from public.need_public_state_v1('$(rid $UNC)');")"
# P3-5: publish then withdraw inside ONE transaction ends withdrawn (sequence order).
printf '%s\n' "begin; set local role authenticated; set local request.jwt.claim.sub='$NOP'; select public.set_need_public_publication_v1('$(rid $NOP)', true); select public.set_need_public_publication_v1('$(rid $NOP)', false); commit;" | $PSQL -f - >/dev/null 2>&1
check "P3-5 publish then withdraw in one transaction ends not published" "not_published" "$(q "select state from public.need_public_state_v1('$(rid $NOP)');")"
# P3-7: the histories are append-only even for the database owner; a need deletion cascades.
has "P3-7 a consent event cannot be updated (even by the owner role)" "append_only" "$(q "update public.customer_request_publications set action = 'publish' where request_id = '$(rid $NOP)';")"
has "P3-7 a consent event cannot be deleted while its need exists" "append_only" "$(q "delete from public.customer_request_publications where request_id = '$(rid $NOP)';")"
check "P3-7 erasure may blank the person on an event" "ok" "$(q "update public.customer_request_publications set actor_id = null where request_id = '$(rid $NOP)' and actor_id is not null;" >/dev/null && echo ok)"
# P3-9: no dormant choice for a verified company's need.
has "P3-9 a verified company's need takes no publication choice" "verified_company" "$(as $VER "select public.set_need_public_publication_v1('$(rid $VER)', true);")"
# P3-6: approval never lifts a missing required field.
has "P3-6 an incomplete need cannot be approved" "incomplete" "$(as $ADMIN "select public.decide_need_public_review_v1('$(rid $INC)', 'approved');")"
# P2-4: cost with many unpublished needs (the reader looks only at needs with a choice).
$PSQL -c "insert into public.customer_requests(profile_id, organization_id, title, role_or_work_type, country, location, need_summary, status, kind)
  select '$NOP', o.id, 'bulk ' || g, 'helper', 'LT', 'Utena', 'Bulk unpublished need number ' || g || ' with enough text to compare', 'submitted', 'company_request'
    from generate_series(1, 3000) g, public.organizations o where o.display_name = 'Quiet UAB';" >/dev/null
MS=$(printf '%s\n' "set role anon; \\timing on" "select count(*) from public.list_public_company_needs_v1();" | $PSQL -f - 2>&1 | grep -oE 'Time: [0-9.]+' | head -1 | grep -oE '[0-9.]+')
if [ -n "$MS" ] && awk "BEGIN{exit !($MS < 500)}"; then echo "  PASS  P2-4 signed-out call with 3,000 unpublished needs: ${MS} ms (< 500)"; pass=$((pass+1)); else echo "  FAIL  P2-4 signed-out call too slow: [${MS}] ms"; fail=$((fail+1)); fi
MSW=$(printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$WRK'; \\timing on" "select count(*) from public.list_open_demand_for_workers();" | $PSQL -f - 2>&1 | grep -oE 'Time: [0-9.]+' | head -1 | grep -oE '[0-9.]+')
if [ -n "$MSW" ] && awk "BEGIN{exit !($MSW < 500)}"; then echo "  PASS  P2-4 worker board with 3,000 unpublished needs: ${MSW} ms (< 500)"; pass=$((pass+1)); else echo "  FAIL  P2-4 worker board too slow: [${MSW}] ms"; fail=$((fail+1)); fi
q "delete from public.customer_requests where title like 'bulk %';" >/dev/null
check "P3-7 deleting needs cascades their (empty) history; others intact" "0" "$(q "select count(*) from public.customer_requests where title like 'bulk %';")"

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
check "public reader and doors gone"  "0" "$(q "select count(*) from pg_proc where proname in ('list_public_company_needs_v1','need_public_state_v1','get_my_need_public_states_v1','list_need_public_review_queue_v1','decide_need_public_review_v1','set_need_public_publication_v1');")"
check "the companies' choices kept (evidence)" "1" "$(q "select count(*) from pg_class where relname = 'customer_request_publications';")"
check "decisions kept (evidence)"    "2" "$(q "select count(*) from public.customer_request_public_reviews;")"
apply "$MIG"
check "re-apply after rollback works and keeps the decisions" "2|Clean UAB" \
  "$(q "select count(*) from public.customer_request_public_reviews;")|$(anon "select company_name from public.list_public_company_needs_v1('electr');")"
apply "$MIG"
check "applying twice is idempotent (choices kept)" "6" "$(anon "select count(*) from public.list_public_company_needs_v1();")"

echo; echo "== R2 re-review of 0e39e06"
# P2 (2): erasure may blank the operator on a decision; nothing else; deleting an operator works.
DEC=$(q "select id from public.customer_request_public_reviews limit 1;")
if [ -z "$DEC" ]; then as $ADMIN "select public.decide_need_public_review_v1('$(rid $DSP)', 'rejected', 'proof');" >/dev/null; DEC=$(q "select id from public.customer_request_public_reviews limit 1;"); fi
has "P2 a decision cannot be changed" "append_only" "$(q "update public.customer_request_public_reviews set decision = 'approved' where id = '$DEC';")"
check "P2 erasure blanks the operator on a decision" "ok" "$(q "update public.customer_request_public_reviews set decided_by = null where id = '$DEC';" >/dev/null && echo ok)"
OPX=b0000000-0000-4000-8000-0000000000aa
q "insert into public.profiles(id, is_admin) values ('$OPX', true); insert into auth.users(id, email) values ('$OPX', 'opx@firma.lt');" >/dev/null
as $OPX "select public.decide_need_public_review_v1('$(rid $ADV)', 'rejected', 'proof');" >/dev/null
has "P2 ...but cannot blank the operator and change anything else together" "append_only" "$(q "update public.customer_request_public_reviews set decided_by = null, reason = 'x' where decided_by = '$OPX';")"
check "P2 deleting an operator with decisions works (FK set null passes the trigger)" "0|1" "$(q "delete from public.profiles where id = '$OPX';" >/dev/null; q "select count(*) from public.profiles where id = '$OPX';")|$(q "select count(*) from public.customer_request_public_reviews where decided_by is null and reason = 'proof' and request_id = '$(rid $ADV)';")"
# P3-8 ruling: a company whose own checks have not passed is held, never published automatically.
q "update public.companies set verification_status = 'needs_checks' where display_name = 'Clean UAB';" >/dev/null
check "needs_checks company: held for review, not public" "held_review:company_checks_pending" "$(st $(rid $UNC))"
check "...and not on the signed-out reader" "0" "$(anon "select count(*) from public.list_public_company_needs_v1() where company_name = 'Clean UAB';")"
q "update public.companies set verification_status = 'active_unverified' where display_name = 'Clean UAB';" >/dev/null
# P2 (1): scale — 7,000 needs, 100 published.
$PSQL -c "insert into public.customer_requests(profile_id, organization_id, title, role_or_work_type, country, location, need_summary, status, kind)
  select '$NOP', o.id, 'scale ' || g, 'helper', 'LT', 'Utena', 'Scale need number ' || g || ' with enough text to compare', 'submitted', 'company_request'
    from generate_series(1, 7000) g, public.organizations o where o.display_name = 'Quiet UAB';" >/dev/null
$PSQL -c "insert into public.customer_request_publications(request_id, action, actor_id)
  select id, 'publish', profile_id from public.customer_requests where title like 'scale %' order by title limit 100;" >/dev/null
$PSQL -c "analyze;" >/dev/null
T1=$(printf '%s\n' "set role anon; \\timing on" "select count(*) from public.list_public_company_needs_v1();" | $PSQL -f - 2>&1 | grep -oE 'Time: [0-9.]+' | head -1 | grep -oE '[0-9.]+')
if [ -n "$T1" ] && awk "BEGIN{exit !($T1 < 1000)}"; then echo "  PASS  P2 signed-out call, 7,000 needs / 100 published: ${T1} ms (< 1000)"; pass=$((pass+1)); else echo "  FAIL  P2 signed-out call too slow: [${T1}] ms"; fail=$((fail+1)); fi
T2=$(printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$WRK'; \\timing on" "select count(*) from public.list_open_demand_for_workers();" | $PSQL -f - 2>&1 | grep -oE 'Time: [0-9.]+' | head -1 | grep -oE '[0-9.]+')
if [ -n "$T2" ] && awk "BEGIN{exit !($T2 < 1500)}"; then echo "  PASS  P2 worker board, 7,000 needs / 100 published: ${T2} ms (< 1500)"; pass=$((pass+1)); else echo "  FAIL  P2 worker board too slow: [${T2}] ms"; fail=$((fail+1)); fi
PLAN=$($PSQL -c "explain select p.request_id from public.customer_request_publications p where p.action = 'publish' and p.created_at <= now() group by p.request_id;" 2>&1 | tr -d '\r')
has "P2 plan: the earlier-publication probe uses the publication time index" "publish_time_idx|Index|Seq Scan on customer_request_publications" "$PLAN"
q "delete from public.customer_requests where title like 'scale %';" >/dev/null

echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
