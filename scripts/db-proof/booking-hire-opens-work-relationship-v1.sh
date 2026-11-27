#!/usr/bin/env bash
# Proof for 20261123113700_booking_hire_opens_work_relationship_v1 (HIRE-5, RED, NOT applied).
# Runs on the LOCAL Supabase stack only, in ONE transaction that is rolled back at the end:
# synthetic rows only, nothing is kept. Applies the migration inside the transaction when the
# stack does not carry it yet.
#   - a hire of a person with no relationship opens ONE 'collaborator' relationship from the
#     hire's start (never 'employee'), and the hire's end ends it;
#   - a hire of a person already related to the company reuses that relationship and its end
#     leaves it as it was;
#   - a company with two organizations and a need without one opens nothing (no guess);
#   - app roles cannot call the trigger functions;
#   - the rollback refuses once a hire has opened or reused a relationship.
set -euo pipefail
cd "$(dirname "$0")/../.."
N=20261123113700_booking_hire_opens_work_relationship_v1
UP="supabase/migrations/${N}.sql"; DOWN="supabase/rollbacks/${N}.down.sql"
PSQL=${PSQL:-"docker exec -i supabase_db_labourmarketai psql -U postgres -X -q -tA"}
body() { grep -viE '^\s*(begin|commit);\s*$' "$1"; }

OWNER=0c0c0000-0000-4000-8000-0000000000a1
P1=0c0c0000-0000-4000-8000-0000000000b1   # new person: no relationship yet
P2=0c0c0000-0000-4000-8000-0000000000b2   # already the company's employee
P3=0c0c0000-0000-4000-8000-0000000000b3   # hired by the two-organization company
W1=0c0c0000-0000-4000-8000-0000000000c1; W2=0c0c0000-0000-4000-8000-0000000000c2; W3=0c0c0000-0000-4000-8000-0000000000c3
CO=0c0c0000-0000-4000-8000-0000000000d1;  ORG=0c0c0000-0000-4000-8000-0000000000e1
CO2=0c0c0000-0000-4000-8000-0000000000d2; ORG2A=0c0c0000-0000-4000-8000-0000000000e2; ORG2B=0c0c0000-0000-4000-8000-0000000000e3
NEED=0c0c0000-0000-4000-8000-0000000000f1; NEED2=0c0c0000-0000-4000-8000-0000000000f2
B1=0c0c0000-0000-4000-8000-000000000101; B2=0c0c0000-0000-4000-8000-000000000102; B3=0c0c0000-0000-4000-8000-000000000103
H1=0c0c0000-0000-4000-8000-000000000201; H2=0c0c0000-0000-4000-8000-000000000202; H3=0c0c0000-0000-4000-8000-000000000203
EC2=0c0c0000-0000-4000-8000-000000000302
P4=0c0c0000-0000-4000-8000-0000000000b4; W4=0c0c0000-0000-4000-8000-0000000000c4
B4=0c0c0000-0000-4000-8000-000000000104; H4=0c0c0000-0000-4000-8000-000000000204
AO=0c0c0000-0000-4000-8000-000000000401

check() { echo "\\echo __N|$1~$2"; echo "select '__R|' || coalesce(($3)::text, '');"; }

{
cat <<SQL
begin;
set local timezone = 'UTC';
select (to_regprocedure('public.booking_hire_open_relationship_v1()') is not null) as hire5 \\gset
\\if :hire5
\\echo __NOTE|the stack already carries the migration
\\else
SQL
body "$UP"
cat <<SQL
\\endif
set session_replication_role = replica;
insert into public.profiles(id, full_name) values ('$OWNER','Hire Owner'), ('$P1','Hire One'), ('$P2','Hire Two'), ('$P3','Hire Three'), ('$P4','Agency Person');
insert into public.workers(id, profile_id) values ('$W1','$P1'), ('$W2','$P2'), ('$W3','$P3'), ('$W4','$P4');
insert into public.companies(id, profile_id, display_name, legal_name) values ('$CO','$OWNER','Hire Co','Hire Co UAB'), ('$CO2','$OWNER','Hire Co Two','Hire Co Two UAB');
insert into public.organizations(id, organization_type, display_name, legacy_company_id, owner_profile_id)
  values ('$ORG','company','Hire Co','$CO','$OWNER'), ('$ORG2A','company','Hire Two A','$CO2','$OWNER'), ('$ORG2B','company','Hire Two B','$CO2','$OWNER');
insert into public.customer_requests(id, profile_id, organization_id, title, status) values ('$NEED','$OWNER','$ORG','Hire need','submitted'), ('$NEED2','$OWNER',null,'Hire need two','submitted');
insert into public.booking_requests(id, owner_id, request_id, worker_id, status) values ('$B1','$OWNER','$NEED','$W1','accepted'), ('$B2','$OWNER','$NEED','$W2','accepted'), ('$B3','$OWNER','$NEED2','$W3','accepted'), ('$B4','$OWNER','$NEED','$W4','accepted');
insert into public.agency_candidate_offers(id, connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id, status, booking_id)
  values ('$AO','$CO','$NEED','$CO2','$CO','$NEED','$W4','accepted','$B4');
insert into public.engagement_contexts(id, profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values ('$EC2','$P2','$ORG','employee','active',true,'proof-ec2');
set session_replication_role = origin;
insert into public.company_worker_engagements(id, company_id, worker_id, subject_key, source_booking_id, status, started_at, created_by)
  values ('$H1','$CO','$W1','$W1','$B1','active','2026-11-01T08:00:00Z','$OWNER'),
         ('$H2','$CO','$W2','$W2','$B2','active','2026-11-01T08:00:00Z','$OWNER'),
         ('$H3','$CO2','$W3','$W3','$B3','active','2026-11-01T08:00:00Z','$OWNER'),
         ('$H4','$CO','$W4','$W4','$B4','active','2026-11-01T08:00:00Z','$OWNER');
\\echo __PHASE|HIRE
SQL
check "a new person: ONE collaborator relationship with the company, from the hire start" "collaborator|active|2026-11-01" \
  "select string_agg(relationship_slug || '|' || status || '|' || to_char(started_at at time zone 'UTC','YYYY-MM-DD'), ',') from public.engagement_contexts where profile_id = '$P1' and organization_id = '$ORG'"
check "never typed employee" "0" "select count(*) from public.engagement_contexts where profile_id in ('$P1','$P3') and relationship_slug = 'employee'"
check "already the employee: the relationship is reused, nothing new" "1|employee" \
  "select count(*) || '|' || string_agg(relationship_slug, ',') from public.engagement_contexts where profile_id = '$P2' and organization_id = '$ORG'"
check "two organizations, no need organization: nothing opened (no guess)" "0" "select count(*) from public.engagement_contexts where profile_id = '$P3'"
check "each opening and reuse leaves one audit row" "opened:1,reused:1" \
  "select string_agg(replace(action,'booking_hire_relationship_','') || ':' || n, ',' order by action) from (select action, count(*) n from public.audit_logs where action like 'booking_hire_relationship_%' and payload->>'company_worker_engagement_id' in ('$H1','$H2','$H3') group by action) s"
check "app roles cannot call the trigger functions" "false|false" \
  "select has_function_privilege('authenticated', 'public.booking_hire_open_relationship_v1()', 'execute')::text || '|' || has_function_privilege('anon', 'public.booking_hire_close_relationship_v1()', 'execute')::text"
check "agency booking stays with the existing placement lifecycle" "0|0" \
  "select (select count(*) from public.engagement_contexts where profile_id='$P4') || '|' || (select count(*) from public.audit_logs where action like 'booking_hire_relationship_%' and payload->>'company_worker_engagement_id'='$H4')"
cat <<SQL
update public.engagement_contexts set lifecycle_stage='probation', journal_review_enabled=true, is_primary=true where profile_id='$P1' and status='active';
SQL
cat <<SQL
\\echo __PHASE|END
update public.company_worker_engagements set status = 'ended', ended_at = '2026-11-20T17:00:00Z', ended_by = '$OWNER' where id in ('$H1','$H2');
SQL
check "the hire ends: the relationship it opened ends with it" "ended|2026-11-20" \
  "select status || '|' || to_char(ended_at at time zone 'UTC','YYYY-MM-DD') from public.engagement_contexts where profile_id = '$P1' and organization_id = '$ORG'"
check "the reused relationship stays as it was" "active" "select status from public.engagement_contexts where id = '$EC2'"
check "ending clears review and primary state and ends the explicit lifecycle stage" "ended|false|false" \
  "select lifecycle_stage || '|' || journal_review_enabled::text || '|' || is_primary::text from public.engagement_contexts where profile_id='$P1'"
check "ending preserves the actual former lifecycle stage in history" "probation|ended" \
  "select before_stage || '|' || after_stage from public.engagement_lifecycle_events where engagement_context_id in (select id from public.engagement_contexts where profile_id='$P1')"
# Re-acceptance is an UPDATE of the existing hire, not a second INSERT.
check "a reused employee keeps its actual relationship type in the audit" "employee" \
  "select payload->>'relationship_slug' from public.audit_logs where action='booking_hire_relationship_reused' and payload->>'company_worker_engagement_id'='$H2'"
cat <<SQL
\\echo __PHASE|REACCEPT
update public.company_worker_engagements set status='active', ended_at=null, ended_by=null where id in ('$H1','$H2');
SQL
check "re-accepting restores ONE active work relationship" "1" \
  "select count(*) from public.engagement_contexts where profile_id='$P1' and organization_id='$ORG' and status='active'"
check "re-accepting preserves the former ended relationship" "1" \
  "select count(*) from public.engagement_contexts where profile_id='$P1' and organization_id='$ORG' and status='ended'"
check "the new interval does not backdate a re-accepted agreement" "true" \
  "select started_at>=current_date from public.engagement_contexts where profile_id='$P1' and organization_id='$ORG' and status='active'"
check "re-accepting an existing employee still creates no second relationship" "1|employee" \
  "select count(*) || '|' || string_agg(relationship_slug,',') from public.engagement_contexts where profile_id='$P2' and organization_id='$ORG'"
cat <<SQL
update public.company_worker_engagements set status='active' where id='$H1';
SQL
check "repeating active status does not create another relationship or opening event" "2|2" \
  "select (select count(*) from public.engagement_contexts where profile_id='$P1' and organization_id='$ORG') || '|' || (select count(*) from public.audit_logs where action='booking_hire_relationship_opened' and payload->>'company_worker_engagement_id'='$H1')"
cat <<SQL
update public.company_worker_engagements set status='ended', ended_at=now(), ended_by='$OWNER' where id in ('$H1','$H2');
SQL
check "ending the re-accepted hire closes its current interval, keeping both historical rows" "2|0" \
  "select count(*) filter(where status='ended') || '|' || count(*) filter(where status='active') from public.engagement_contexts where profile_id='$P1' and organization_id='$ORG'"
check "each end event names the interval it actually ended" "2" \
  "select count(distinct entity_id) from public.audit_logs where action='booking_hire_relationship_ended' and payload->>'company_worker_engagement_id'='$H1'"
check "the employee relationship is still active after the second end" "active" \
  "select status from public.engagement_contexts where id='$EC2'"

check "each ended interval has exactly one lifecycle history event" "2|2" \
  "select count(*) || '|' || count(distinct engagement_context_id) from public.engagement_lifecycle_events where engagement_context_id in (select id from public.engagement_contexts where profile_id='$P1')"
cat <<SQL
\\echo __PHASE|ROLLBACK
savepoint pnp_refuse;
\\set ON_ERROR_STOP off
SQL
awk '/^do \$\$/{f=1} f{print} /^end \$\$;/{if(f) exit}' "$DOWN"
cat <<SQL
\\set ON_ERROR_STOP on
rollback to savepoint pnp_refuse;
\\echo __N|the rollback refuses once a hire opened or reused a relationship~hires already opened work relationships - forward-fix, do not roll back
\\echo __R|:LAST_ERROR_MESSAGE
rollback;
SQL
} > /tmp/hire5_proof.sql

$PSQL -v ON_ERROR_STOP=1 -f - < /tmp/hire5_proof.sql 2>/tmp/hire5_err.txt | tr -d '\r' > /tmp/hire5_out.txt || { echo "the run itself failed"; grep -v "ERROR:  hires already" /tmp/hire5_err.txt | head -20; exit 1; }
pass=0; fail=0; name=""; exp=""
while IFS= read -r line; do
  case "$line" in
    __PHASE\|*) echo "${line#__PHASE|}";;
    __NOTE\|*) echo "  NOTE  ${line#__NOTE|}";;
    __N\|*) rest="${line#__N|}"; name="${rest%%~*}"; exp="${rest#*~}";;
    __R\|*) got="${line#__R|}"
      if [ "$got" = "$exp" ]; then pass=$((pass+1)); echo "  PASS  $name"; else fail=$((fail+1)); echo "  FAIL  $name (expected [$exp], got [$got])"; fi;;
  esac
done < /tmp/hire5_out.txt
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
