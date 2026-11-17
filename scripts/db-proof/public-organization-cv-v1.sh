#!/usr/bin/env bash
# public-organization-cv-v1 — REAL PostgreSQL proof (throwaway local PG16, no Docker, no Supabase).
#
# Proves 20261117060000_public_organization_cv_v1: the public company Living CV computed
# inside the database — numbers only, k >= 5 people per block, nothing unless the
# organization's public profile is on, internal projects not counted, #3421's
# education rule, the canonical work-time rule, coarse hours — and its rollback.
# Synthetic data only.
#
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=58741 bash scripts/db-proof/public-organization-cv-v1.sh
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261117060000_public_organization_cv_v1
MIG="$REPO/supabase/migrations/$NAME.sql"
DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
HOST=${PGPROOF_HOST:-127.0.0.1}; PORT=${PGPROOF_PORT:-58741}
case "$HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
ADMINP="psql -h $HOST -p $PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $HOST -p $PORT -U postgres -d pcv1 -tA -q"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

$ADMINP -c "drop database if exists pcv1" -c "create database pcv1" >/dev/null 2>&1 \
  || { echo "cannot reach postgres on $PORT"; exit 2; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then printf '  PASS  %-72s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-72s\n        expected=%s\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
checkre() { if echo "$3" | grep -qE "$2"; then printf '  PASS  %-72s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-72s\n        wanted /%s/\n        actual  =%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }
run_file() { $PSQL -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$TMP/e" || { echo "FAILED: $1"; cat "$TMP/e"; exit 1; }; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
anon() { printf "begin;\nset local role anon;\n%s\ncommit;\n" "$1" | $PSQL -v ON_ERROR_STOP=0 -f - 2>&1 \
  | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|$)' | head -1; }
cv() { q "select concat_ws('|', projects_running, projects_completed, journal_people, journal_hours, journal_first_month, journal_last_month, history_people, history_day_hours, history_first_month, history_last_month) from public.get_public_organization_cv_v1('$1')"; }
rows() { q "select count(*) from public.get_public_organization_cv_v1('$1')"; }

# ── minimal schema: only the columns the function reads ─────────────────────
cat > "$TMP/prelude.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create table public.organizations (id uuid primary key, public_profile_enabled boolean not null default false);
create table public.relationship_types (slug text primary key, category text not null);
create table public.projects (id uuid primary key, organization_id uuid, status text, record_state text not null default 'active');
create table public.engagement_contexts (
  id uuid primary key, organization_id uuid, project_id uuid, relationship_slug text not null,
  status text not null default 'active', journal_review_enabled boolean not null default false);
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(), worker_id uuid, engagement_context_id uuid,
  created_at timestamptz not null default now(), deleted_at timestamptz, superseded_by uuid, correction_of uuid);
create table public.journal_entry_metrics (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null, metric_slug text not null,
  value_numeric numeric, value_text text, unit_slug text, created_at timestamptz not null default now());
create table public.productivity_units (slug text primary key, category text not null);
create table public.organization_evidence_records (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, organization_person_id uuid not null,
  activity_date date, period_start date, period_end date, hours numeric, project_id uuid);
create table public.organization_evidence_events (
  id uuid primary key default gen_random_uuid(), record_id uuid not null, event_type text not null,
  created_at timestamptz not null default now());
-- Production posture: RLS on, no table grant to anon.
do $$ declare t text; begin
  foreach t in array array['organizations','relationship_types','projects','engagement_contexts','journal_entries',
    'journal_entry_metrics','productivity_units','organization_evidence_records','organization_evidence_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
  end loop;
end $$;
insert into public.relationship_types values ('employee','employment'), ('student','education'), ('intern','education');
insert into public.productivity_units values ('hours','time'), ('minutes','time'), ('days','time'), ('square_meters','output');
SQL
run_file "$TMP/prelude.sql"

ORGA=20000000-0000-4000-8000-00000000000a   # opted in: the full case
ORGB=20000000-0000-4000-8000-00000000000b   # the same work, profile OFF
ORGC=20000000-0000-4000-8000-00000000000c   # opted in, only 4 people per block
ORGD=20000000-0000-4000-8000-00000000000d   # opted in, journal 5 people, records 4
NOORG=20000000-0000-4000-8000-0000000000ff  # does not exist

# seed_journal <org> <ctx-prefix> <project-for-context|''> <n workers>: the canonical mix per org.
cat > "$TMP/seed.sql" <<SQL
insert into public.organizations values ('$ORGA', true), ('$ORGB', false), ('$ORGC', true), ('$ORGD', true);
-- projects of A: P1 linked via the journal context, P2 linked via a record (completed),
-- P3 internal (no people-backed work), P4 a duplicate fragment linked via a record.
insert into public.projects values
  ('40000000-0000-4000-8000-000000000001', '$ORGA', 'active',    'active'),
  ('40000000-0000-4000-8000-000000000002', '$ORGA', 'completed', 'active'),
  ('40000000-0000-4000-8000-000000000003', '$ORGA', 'active',    'active'),
  ('40000000-0000-4000-8000-000000000004', '$ORGA', 'completed', 'duplicate'),
  ('40000000-0000-4000-8000-0000000000d1', '$ORGD', 'active',    'active'),
  ('40000000-0000-4000-8000-0000000000d2', '$ORGD', 'completed', 'active');

-- A: an employee context on P1, and an ENDED learning context (education rule).
insert into public.engagement_contexts values
  ('50000000-0000-4000-8000-00000000000a', '$ORGA', '40000000-0000-4000-8000-000000000001', 'employee', 'active', false),
  ('50000000-0000-4000-8000-0000000000ea', '$ORGA', '40000000-0000-4000-8000-000000000003', 'student',  'ended',  true),
  ('50000000-0000-4000-8000-00000000000b', '$ORGB', null, 'employee', 'active', false),
  ('50000000-0000-4000-8000-00000000000c', '$ORGC', null, 'employee', 'active', false),
  ('50000000-0000-4000-8000-00000000000d', '$ORGD', '40000000-0000-4000-8000-0000000000d1', 'employee', 'active', false);

-- helper: one entry with one metric
create function pg_temp.e(p_ctx uuid, p_worker uuid, p_slug text, p_val numeric, p_unit text, p_text text default null,
                          p_day date default date '2026-03-10') returns uuid language plpgsql as \$f\$
declare v uuid;
begin
  insert into public.journal_entries (worker_id, engagement_context_id) values (p_worker, p_ctx) returning id into v;
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_text) values (v, 'work_date', p_day::text);
  if p_slug is not null then
    insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, value_text)
    values (v, p_slug, p_val, p_unit, p_text);
  end if;
  return v;
end \$f\$;

do \$d\$
declare a uuid := '50000000-0000-4000-8000-00000000000a'; v uuid; o uuid; n uuid;
begin
  -- W1: 8 h. Plus a FUTURE entry (work date tomorrow) of 100 h: not counted.
  perform pg_temp.e(a, '60000000-0000-4000-8000-000000000001', 'quantity', 8, 'hours');
  perform pg_temp.e(a, '60000000-0000-4000-8000-000000000001', 'quantity', 100, 'hours', null, (now() at time zone 'utc')::date + 1);
  -- W2: 480 minutes = 8 h.
  perform pg_temp.e(a, '60000000-0000-4000-8000-000000000002', 'quantity', 480, 'minutes', null, date '2026-01-05');
  -- W3: fragments 3 h + 2 h win over the entry-level 10 h.
  v := pg_temp.e(a, '60000000-0000-4000-8000-000000000003', 'fragment_time', 3, 'hours', '1');
  insert into public.journal_entry_metrics (entry_id, metric_slug, value_numeric, unit_slug, value_text)
  values (v, 'fragment_time', 2, 'hours', '2'), (v, 'quantity', 10, 'hours', null);
  -- W4: 2 days (never hours) + 6 h; and 30 m2 of output (never work time).
  perform pg_temp.e(a, '60000000-0000-4000-8000-000000000004', 'quantity', 2, 'days');
  perform pg_temp.e(a, '60000000-0000-4000-8000-000000000004', 'quantity', 6, 'hours');
  perform pg_temp.e(a, '60000000-0000-4000-8000-000000000004', 'quantity', 30, 'square_meters');
  -- W5: a confirmed 7 h original, corrected to 6 h: the chain counts once (6).
  o := pg_temp.e(a, '60000000-0000-4000-8000-000000000005', 'quantity', 7, 'hours');
  n := pg_temp.e(a, '60000000-0000-4000-8000-000000000005', 'quantity', 6, 'hours');
  update public.journal_entries set correction_of = o where id = n;
  -- W6: a superseded 100 h and a deleted 50 h do not count; the live 4 h does.
  o := pg_temp.e(a, '60000000-0000-4000-8000-000000000006', 'quantity', 100, 'hours');
  n := pg_temp.e(a, '60000000-0000-4000-8000-000000000006', 'quantity', 4, 'hours', null, date '2026-06-20');
  update public.journal_entries set superseded_by = n where id = o;
  o := pg_temp.e(a, '60000000-0000-4000-8000-000000000006', 'quantity', 50, 'hours');
  update public.journal_entries set deleted_at = now() where id = o;
  -- W7: 50 h under the ENDED learning context: excluded (and not a person here).
  perform pg_temp.e('50000000-0000-4000-8000-0000000000ea', '60000000-0000-4000-8000-000000000007', 'quantity', 50, 'hours');
  -- B: the same six people's kind of work, profile off.
  for i in 1..6 loop
    perform pg_temp.e('50000000-0000-4000-8000-00000000000b', ('61000000-0000-4000-8000-00000000000' || i)::uuid, 'quantity', 8, 'hours');
  end loop;
  -- C: 4 people.
  for i in 1..4 loop
    perform pg_temp.e('50000000-0000-4000-8000-00000000000c', ('62000000-0000-4000-8000-00000000000' || i)::uuid, 'quantity', 8, 'hours');
  end loop;
  -- D: 5 people, 3 h each = 15 -> 20 rounded.
  for i in 1..5 loop
    perform pg_temp.e('50000000-0000-4000-8000-00000000000d', ('63000000-0000-4000-8000-00000000000' || i)::uuid, 'quantity', 3, 'hours');
  end loop;
end \$d\$;

-- A's own imported records: 5 people count; one withdrawn person and one corrected record do not.
insert into public.organization_evidence_records (id, organization_id, organization_person_id, activity_date, period_start, period_end, hours, project_id) values
  ('70000000-0000-4000-8000-000000000001', '$ORGA', '71000000-0000-4000-8000-000000000001', '2025-01-10', null, null, 10, '40000000-0000-4000-8000-000000000002'),
  ('70000000-0000-4000-8000-000000000002', '$ORGA', '71000000-0000-4000-8000-000000000002', '2025-02-10', null, null, 20, '40000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000003', '$ORGA', '71000000-0000-4000-8000-000000000003', '2025-03-10', null, null, 30, null),
  ('70000000-0000-4000-8000-000000000004', '$ORGA', '71000000-0000-4000-8000-000000000004', '2025-04-10', null, null, 40, null),
  ('70000000-0000-4000-8000-000000000005', '$ORGA', '71000000-0000-4000-8000-000000000005', '2025-06-10', null, null, 50, null),
  ('70000000-0000-4000-8000-000000000015', '$ORGA', '71000000-0000-4000-8000-000000000005', null, '2024-12-01', '2025-07-31', 100, null),
  ('70000000-0000-4000-8000-000000000006', '$ORGA', '71000000-0000-4000-8000-000000000006', '2025-05-10', null, null, 60, null),
  ('70000000-0000-4000-8000-000000000007', '$ORGA', '71000000-0000-4000-8000-000000000007', '2025-05-11', null, null, 70, null);
insert into public.organization_evidence_events (record_id, event_type, created_at) values
  ('70000000-0000-4000-8000-000000000004', 'withdrawn',  now() - interval '2 days'),
  ('70000000-0000-4000-8000-000000000004', 'reinstated', now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000006', 'reinstated', now() - interval '2 days'),
  ('70000000-0000-4000-8000-000000000006', 'withdrawn',  now() - interval '1 day'),
  ('70000000-0000-4000-8000-000000000007', 'corrected',  now());
-- D: 4 record people (below k), one linked to D2.
insert into public.organization_evidence_records (organization_id, organization_person_id, activity_date, hours, project_id)
select '$ORGD', ('72000000-0000-4000-8000-00000000000' || i)::uuid, date '2025-01-01', 10, '40000000-0000-4000-8000-0000000000d2'
  from generate_series(1, 4) i;
-- C: 4 record people.
insert into public.organization_evidence_records (organization_id, organization_person_id, activity_date, hours)
select '$ORGC', ('73000000-0000-4000-8000-00000000000' || i)::uuid, date '2025-01-01', 10 from generate_series(1, 4) i;
-- B: 6 record people (profile off).
insert into public.organization_evidence_records (organization_id, organization_person_id, activity_date, hours)
select '$ORGB', ('74000000-0000-4000-8000-00000000000' || i)::uuid, date '2025-01-01', 10 from generate_series(1, 6) i;
SQL
run_file "$TMP/seed.sql"

COUNTS0="$(q "select (select count(*) from public.journal_entries) || '|' || (select count(*) from public.organization_evidence_records) || '|' || (select count(*) from public.journal_entry_metrics) || '|' || (select count(*) from public.organization_evidence_events)")"
echo "── before apply"
check "function absent before apply" "" "$(q "select to_regprocedure('public.get_public_organization_cv_v1(uuid)')")"

run_file "$MIG"
echo "── shape and security"
check "SECURITY DEFINER" "t" "$(q "select prosecdef from pg_proc where proname = 'get_public_organization_cv_v1'")"
checkre "search_path fixed" "search_path=public, pg_temp" "$(q "select array_to_string(proconfig, ',') from pg_proc where proname = 'get_public_organization_cv_v1'")"
check "STABLE" "s" "$(q "select provolatile from pg_proc where proname = 'get_public_organization_cv_v1'")"
check "anon may execute" "t" "$(q "select has_function_privilege('anon', 'public.get_public_organization_cv_v1(uuid)', 'execute')")"
check "authenticated may execute" "t" "$(q "select has_function_privilege('authenticated', 'public.get_public_organization_cv_v1(uuid)', 'execute')")"
check "PUBLIC may not execute" "f" "$(q "select bool_or(a.grantee = 0) is true from pg_proc p, aclexplode(p.proacl) a where p.proname = 'get_public_organization_cv_v1' and a.privilege_type = 'EXECUTE'")"
check "returns numbers and month texts only (10 columns)" \
  "projects_running:integer,projects_completed:integer,journal_people:integer,journal_hours:numeric,journal_first_month:text,journal_last_month:text,history_people:integer,history_day_hours:numeric,history_first_month:text,history_last_month:text" \
  "$(q "select string_agg(n || ':' || format_type(t, null), ',' order by o) from pg_proc p, unnest(p.proargnames[2:], p.proallargtypes[2:]) with ordinality as x(n, t, o) where p.proname = 'get_public_organization_cv_v1'")"
checkre "anon cannot read the tables themselves" "permission denied" "$(anon "select count(*) from public.journal_entries;")"
checkre "anon cannot read imported records" "permission denied" "$(anon "select count(*) from public.organization_evidence_records;")"

echo "── gate 1: the public profile"
check "profile OFF: no row, though 6 people per block" "0" "$(rows "$ORGB")"
check "unknown organization: no row" "0" "$(rows "$NOORG")"
check "null organization: no row" "0" "$(q "select count(*) from public.get_public_organization_cv_v1(null)")"

echo "── gate 2: k >= 5"
check "4 people in each block: no row at all" "0" "$(rows "$ORGC")"
check "journal 5 people, records 4: journal shown, projects from the journal only" \
  "1|0|5|20|2026-03|2026-03" "$(cv "$ORGD")"
check "  ... and the records block is entirely NULL" "t" \
  "$(q "select history_people is null and history_day_hours is null and history_first_month is null and history_last_month is null from public.get_public_organization_cv_v1('$ORGD')")"

echo "── the full case (organization A)"
# journal: 8 + 8 + 5 + 6 + 6 + 4 = 37 h -> 40; 6 people (the learner excluded); months 2026-01 .. 2026-06
# records: 10 + 20 + 30 + 40 + 50 = 150 (period total excluded); 5 people; months 2024-12 .. 2025-07
# projects: P1 (journal) running, P2 (records) completed; P3 internal and P4 duplicate not counted
check "A: projects, journal and records" "1|1|6|40|2026-01|2026-06|5|150|2024-12|2025-07" "$(cv "$ORGA")"
check "anon gets the same numbers through the function" "1" "$(anon "select count(*) from public.get_public_organization_cv_v1('$ORGA');")"

echo "── the education rule (#3421)"
q "update public.engagement_contexts set status = 'active', journal_review_enabled = true where id = '50000000-0000-4000-8000-0000000000ea'" >/dev/null
# the learner's 50 h now counts: 87 -> 90, 7 people, and P3 is now linked
check "active learning link with review on: counted" "2|1|7|90|2026-01|2026-06|5|150|2024-12|2025-07" "$(cv "$ORGA")"
q "update public.engagement_contexts set journal_review_enabled = false where id = '50000000-0000-4000-8000-0000000000ea'" >/dev/null
check "active learning link with review off: not counted" "1|1|6|40|2026-01|2026-06|5|150|2024-12|2025-07" "$(cv "$ORGA")"
q "update public.engagement_contexts set relationship_slug = 'intern' where id = '50000000-0000-4000-8000-0000000000ea'" >/dev/null
check "intern is education too: not counted" "1|1|6|40|2026-01|2026-06|5|150|2024-12|2025-07" "$(cv "$ORGA")"

echo "── gate 4: coarse hours"
check "hours are multiples of 10" "0|0" "$(q "select (journal_hours % 10)::int || '|' || (history_day_hours % 10)::int from public.get_public_organization_cv_v1('$ORGA')")"

echo "── no data changed"
COUNTS="select (select count(*) from public.journal_entries) || '|' || (select count(*) from public.organization_evidence_records) || '|' || (select count(*) from public.journal_entry_metrics) || '|' || (select count(*) from public.organization_evidence_events)"
check "no row added, changed or removed by any call (entries|records|metrics|events)" "$COUNTS0" "$(q "$COUNTS")"

echo "── rollback"
run_file "$DOWN"
check "function gone after rollback" "" "$(q "select to_regprocedure('public.get_public_organization_cv_v1(uuid)')")"
check "data untouched by rollback" "$COUNTS0" "$(q "$COUNTS")"
run_file "$MIG"
check "re-apply after rollback works" "1|1|6|40|2026-01|2026-06|5|150|2024-12|2025-07" "$(cv "$ORGA")"

echo
echo "=============================================================================="
echo " RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
