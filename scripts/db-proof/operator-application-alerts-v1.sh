#!/usr/bin/env bash
# ============================================================================
# operator-application-alerts-v1 -- REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
# The REAL migration and rollback over stand-ins with the production column shapes. Synthetic data only.
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/operator-application-alerts-v1.sh
# Uses database `oaa1` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261112090000_operator_application_alerts_v1
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-58741}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d oaa1 -tA -q"
$ADMINP -c "drop database if exists oaa1" -c "create database oaa1" >/dev/null 2>&1 || { echo "cannot reach postgres on $PGPROOF_PORT"; exit 2; }

$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || exit 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, email text, active_role text);
create table public.profile_roles (profile_id uuid not null, role text not null);
create table public.platform_capability_grants (profile_id uuid not null, capability text not null, revoked_at timestamptz);
create table public.organizations (id uuid primary key, country text);
create table public.organization_claims (id uuid primary key, organization_id uuid not null, state text not null, created_at timestamptz not null default now());
create table public.companies (id uuid primary key, verification_status text not null, requested_at timestamptz,
  country text, updated_at timestamptz not null default now());
create table public.company_need_public_intakes (id uuid primary key, created_at timestamptz not null default now(),
  status text not null default 'new', country text not null, source_path text, company_name text, contact_email text);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text,
  entity_id uuid, payload jsonb, occurred_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
-- production: audit_logs is append-only
create function public.audit_immutable() returns trigger language plpgsql as $f$ begin raise exception 'audit_logs is append-only'; end $f$;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.audit_immutable();

insert into public.profiles values
 ('a0000000-0000-4000-8000-000000000001', 'opa@ops.example', 'worker'),        -- operator
 ('a0000000-0000-4000-8000-000000000002', 'revoked@ops.example', 'worker'),    -- revoked operator
 ('a0000000-0000-4000-8000-000000000003', null, 'worker'),                     -- operator without e-mail
 ('a0000000-0000-4000-8000-000000000004', 'admin1@ops.example', 'admin'),      -- admin by active role
 ('a0000000-0000-4000-8000-000000000005', 'admin2@ops.example', 'worker'),     -- admin by profile role
 ('a0000000-0000-4000-8000-000000000006', 'worker@x.example', 'worker');       -- nobody
insert into public.platform_capability_grants values
 ('a0000000-0000-4000-8000-000000000001', 'marketplace_company_ingest', null),
 ('a0000000-0000-4000-8000-000000000002', 'marketplace_company_ingest', now() - interval '1 day'),
 ('a0000000-0000-4000-8000-000000000003', 'marketplace_company_ingest', null);
insert into public.profile_roles values ('a0000000-0000-4000-8000-000000000005', 'admin');

insert into public.company_need_public_intakes (id, created_at, status, country, source_path, company_name, contact_email) values
 ('10000000-0000-4000-8000-000000000001', now() - interval '1 hour',   'new',       'SE', '/sv/company-need', 'QA-SYNTHETIC Alfa', 'a@x.example'),
 ('10000000-0000-4000-8000-000000000002', now() - interval '30 hours', 'new',       'LT', '/lt/company-need', 'QA-SYNTHETIC Beta', 'b@x.example'),
 ('10000000-0000-4000-8000-000000000003', now() - interval '50 hours', 'new',       'PL', '/pl/company-need', 'QA-SYNTHETIC Gama', 'c@x.example'),
 ('10000000-0000-4000-8000-000000000004', now() - interval '10 days',  'new',       'LT', '/lt/company-need', 'QA-SYNTHETIC Old',  'd@x.example'),
 ('10000000-0000-4000-8000-000000000005', now() - interval '30 hours', 'contacted', 'LT', '/lt/company-need', 'QA-SYNTHETIC Done', 'e@x.example'),
 ('10000000-0000-4000-8000-000000000006', now() - interval '1 hour',   'new',       'LT', '/lt/request/staff', 'QA-SYNTHETIC Door', 'f@x.example'),
 ('10000000-0000-4000-8000-000000000007', now() - interval '30 hours', 'new',       'LT', '/lt/request/staff', 'QA-SYNTHETIC Door2', 'g@x.example');
insert into public.organizations values ('20000000-0000-4000-8000-000000000001', 'IT');
insert into public.organization_claims (id, organization_id, state, created_at) values
 ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'requested', now() - interval '2 hours'),
 ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'invited', now() - interval '30 hours'),
 ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'representative_verified', now() - interval '30 hours');
insert into public.companies (id, verification_status, requested_at, country, updated_at) values
 ('40000000-0000-4000-8000-000000000001', 'pending_verification', now() - interval '3 hours', 'SE', now()),
 ('40000000-0000-4000-8000-000000000002', 'pending_verification', now() - interval '30 hours', 'LT', now()),
 ('40000000-0000-4000-8000-000000000003', 'pending_verification', now() - interval '30 hours', 'LT', now()),
 ('40000000-0000-4000-8000-000000000004', 'needs_checks', now() - interval '30 hours', 'LT', now()),
 ('40000000-0000-4000-8000-000000000005', 'pending_verification', null, 'LT', now());
-- an admin already decided company 3 after its request (kept pending with a note)
insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at) values
 ('a0000000-0000-4000-8000-000000000004', 'admin_set_company_verification', 'companies', '40000000-0000-4000-8000-000000000003', '{}', now() - interval '1 hour');
SQL

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | paste -sd'|' -; }
as_role() { printf 'set role %s;\n%s\n' "$1" "$2" | $PSQL -f - 2>&1 | tr -d '\r' | paste -sd'|' -; }
svc() { as_role service_role "$1"; }
rec() { svc "select record_operator_alert_v1($1) ->> 'outcome'"; }

$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null || { echo "apply failed"; exit 1; }
I1=10000000-0000-4000-8000-000000000001; OPA=a0000000-0000-4000-8000-000000000001

echo "== what waits, and at which stage"
check "exactly the applications waiting on a human, staged by age" \
  "company_need_public_intakes:10000000-0000-4000-8000-000000000001:immediate|organization_claims:30000000-0000-4000-8000-000000000001:immediate|companies:40000000-0000-4000-8000-000000000001:immediate|company_need_public_intakes:10000000-0000-4000-8000-000000000002:reminder_24h|company_need_public_intakes:10000000-0000-4000-8000-000000000007:reminder_24h|companies:40000000-0000-4000-8000-000000000002:reminder_24h|company_need_public_intakes:10000000-0000-4000-8000-000000000003:escalation_48h" \
  "$(svc "select entity||':'||entity_id||':'||stage from operator_alerts_due_v1() order by case stage when 'immediate' then 1 when 'reminder_24h' then 2 else 3 end, age_hours, entity_id")"
check "a reviewed intake (status contacted) is not chased" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id='10000000-0000-4000-8000-000000000005'")"
check "older than 7 days is never mailed (no backlog on switch-on)" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id='10000000-0000-4000-8000-000000000004'")"
check "a request-door intake gets no immediate alert (the door already mailed)" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id='10000000-0000-4000-8000-000000000006'")"
check "an invited or already verified claim is not chased" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id in ('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003')")"
check "needs_checks waits on the company, not the operator" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id='40000000-0000-4000-8000-000000000004'")"
check "an admin decision after the request stops the reminders" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id='40000000-0000-4000-8000-000000000003'")"
check "no requested_at, no clock" "0" "$(svc "select count(*) from operator_alerts_due_v1() where entity_id='40000000-0000-4000-8000-000000000005'")"
check "age comes from requested_at; a fresh updated_at does not reset it" "30" "$(svc "select age_hours from operator_alerts_due_v1() where entity_id='40000000-0000-4000-8000-000000000002'")"
check "no name, contact or free text column" "entity,entity_id,stage,age_hours,country,from_door" \
  "$(q "select string_agg(a, ',' order by n) from (select unnest(proargnames) a, generate_subscripts(proargnames,1) n from pg_proc where proname='operator_alerts_due_v1') x")"

echo "== who receives it, from the rights valid now"
check "immediate and reminder: active operators with an address only" "a0000000-0000-4000-8000-000000000001" "$(svc "select profile_id from operator_alert_recipients_v1('immediate')")"
check "escalation: admins by either signal" "a0000000-0000-4000-8000-000000000004|a0000000-0000-4000-8000-000000000005" "$(svc "select profile_id from operator_alert_recipients_v1('escalation_48h')")"
check "an unknown stage has no recipient" "0" "$(svc "select count(*) from operator_alert_recipients_v1('everyone')")"
$PSQL -c "update platform_capability_grants set revoked_at = now() where profile_id='$OPA'" >/dev/null
check "a right revoked a moment ago removes the recipient at once" "0" "$(svc "select count(*) from operator_alert_recipients_v1('immediate')")"
$PSQL -c "update platform_capability_grants set revoked_at = null where profile_id='$OPA'" >/dev/null

echo "== the ledger: reserved, sent, failed, skipped"
r=$(svc "select record_operator_alert_v1('reserve','company_need_public_intakes','$I1','immediate','$OPA')"); T1=$(echo "$r" | sed -E 's/.*"token": "([^"]+)".*/\1/')
check "the first reserve holds the key" "reserved" "$(echo "$r" | sed -E 's/.*"outcome": "([^"]+)".*/\1/')"
check "a second run while it is held is told it is in flight" "in_flight" "$(rec "'reserve','company_need_public_intakes','$I1','immediate','$OPA'")"
check "sent is recorded against the token" "recorded" "$(rec "'sent','company_need_public_intakes','$I1','immediate','$OPA','$T1'")"
check "the same outcome twice is refused" "already_recorded" "$(rec "'sent','company_need_public_intakes','$I1','immediate','$OPA','$T1'")"
check "once sent, never reserved again" "already_sent" "$(rec "'reserve','company_need_public_intakes','$I1','immediate','$OPA'")"
check "another stage of the same application is its own key" "reserved" "$(rec "'reserve','company_need_public_intakes','$I1','reminder_24h','$OPA'")"
check "a made-up token records nothing" "unknown_token" "$(rec "'sent','company_need_public_intakes','$I1','immediate','$OPA','$(uuidgen 2>/dev/null || echo 00000000-0000-4000-8000-0000000000ff)'")"

I2=10000000-0000-4000-8000-000000000002
for n in 1 2 3 4 5; do
  t=$(svc "select record_operator_alert_v1('reserve','company_need_public_intakes','$I2','reminder_24h','$OPA') ->> 'token'")
  rec "'failed','company_need_public_intakes','$I2','reminder_24h','$OPA','$t','smtp 451'" >/dev/null
done
check "after a failure the next run retries; after 5 it stops" "gave_up" "$(rec "'reserve','company_need_public_intakes','$I2','reminder_24h','$OPA'")"
check "five failures, five attempts, all in the audit log" "5" "$(q "select count(*) from audit_logs where action='operator_alert.failed' and entity_id='$I2'")"

I3=10000000-0000-4000-8000-000000000003
$PSQL -c "insert into audit_logs (action, entity, entity_id, payload, occurred_at) values ('operator_alert.reserved','company_need_public_intakes','$I3', jsonb_build_object('stage','escalation_48h','recipient','a0000000-0000-4000-8000-000000000004','token','dead0000-0000-4000-8000-000000000000'), now() - interval '20 minutes')" >/dev/null
check "a reservation older than 15 minutes without an outcome expires (a dead sender)" "reserved" "$(rec "'reserve','company_need_public_intakes','$I3','escalation_48h','a0000000-0000-4000-8000-000000000004'")"

check "no recipient: logged once" "logged" "$(rec "'skipped_no_recipient','companies','40000000-0000-4000-8000-000000000001','immediate'")"
check "no recipient again: not logged twice" "already_logged" "$(rec "'skipped_no_recipient','companies','40000000-0000-4000-8000-000000000001','immediate'")"
check "a skip leaves the stage open for a recipient added later" "reserved" "$(rec "'reserve','companies','40000000-0000-4000-8000-000000000001','immediate','$OPA'")"
check "an unknown entity is refused" "1" "$(rec "'reserve','profiles','$OPA','immediate','$OPA'" | grep -c 'unknown entity')"
check "an unknown stage is refused" "1" "$(rec "'reserve','companies','$OPA','soon','$OPA'" | grep -c 'unknown stage')"
check "the ledger is append-only" "1" "$(q "update audit_logs set action='x' where action like 'operator_alert.%'" | grep -c 'append-only')"

echo "== concurrency: two runs reserve the same key at the same moment"
C=30000000-0000-4000-8000-000000000001
( printf "set role service_role;\nbegin;\nselect record_operator_alert_v1('reserve','organization_claims','$C','immediate','$OPA') ->> 'outcome';\nselect pg_sleep(2);\ncommit;\n" | $PSQL -f - 2>&1 | tr -d '\r' | head -1 > /tmp/oaa1-a.txt ) &
sleep 0.5
( printf "set role service_role;\nselect record_operator_alert_v1('reserve','organization_claims','$C','immediate','$OPA') ->> 'outcome';\n" | $PSQL -f - 2>&1 | tr -d '\r' | head -1 > /tmp/oaa1-b.txt ) &
wait
check "exactly one run holds it, the other waits for the lock and backs off" "reserved|in_flight" "$(cat /tmp/oaa1-a.txt)|$(cat /tmp/oaa1-b.txt)"
check "one reservation row for that key" "1" "$(q "select count(*) from audit_logs where action='operator_alert.reserved' and entity_id='$C'")"
rm -f /tmp/oaa1-a.txt /tmp/oaa1-b.txt

echo "== who may call"
for f in "operator_alerts_due_v1()" "operator_alert_recipients_v1('immediate')"; do
  check "anon cannot call $f" "1" "$(as_role anon "select count(*) from $f" | grep -c 'permission denied')"
  check "a signed-in user cannot call $f" "1" "$(as_role authenticated "select count(*) from $f" | grep -c 'permission denied')"
done
check "a signed-in user cannot write the ledger" "1" "$(as_role authenticated "select record_operator_alert_v1('skipped_no_recipient','companies','$OPA','immediate')" | grep -c 'permission denied')"
check "every function pins search_path" "3" "$(q "select count(*) from pg_proc where proname in ('operator_alerts_due_v1','operator_alert_recipients_v1','record_operator_alert_v1') and prosecdef and array_to_string(proconfig, ',') like 'search_path=public, pg_temp'")"

echo "== rollback"
AUD=$(q "select count(*) from audit_logs")
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null || { echo "rollback failed"; exit 1; }
check "rollback removes the three functions" "0" "$(q "select count(*) from pg_proc where proname in ('operator_alerts_due_v1','operator_alert_recipients_v1','record_operator_alert_v1')")"
check "rollback keeps every audit row" "$AUD" "$(q "select count(*) from audit_logs")"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null && $PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null
check "re-apply twice is idempotent" "3" "$(q "select count(*) from pg_proc where proname in ('operator_alerts_due_v1','operator_alert_recipients_v1','record_operator_alert_v1')")"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
