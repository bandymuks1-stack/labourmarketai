#!/usr/bin/env bash
# Proof for 20261106090000_cv_rows_one_statement_once on a scratch database, never production.
# Builds minimal tables with existing duplicates, applies the migration and its rollback,
# and sends 20 real concurrent connections at each door. Exits non-zero on any wrong count.
#
# Usage: PGPORT=55439 PGUSER=postgres scripts/db-proof/cv-rows-one-statement-once.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261106090000_cv_rows_one_statement_once.sql"
ROLLBACK="$ROOT/supabase/rollbacks/20261106090000_cv_rows_one_statement_once.down.sql"
export PGHOST="${PGHOST:-127.0.0.1}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo "refusing a non-local host"; exit 2 ;; esac
export PGDATABASE=cv_rows_proof
PERSON=11111111-1111-1111-1111-111111111111
fails=0

admin() { psql -qAt -d postgres -c "$1"; }
sql() { psql -qAt -v ON_ERROR_STOP=1 -c "$1"; }
expect() { # label, wanted, got
  if [ "$2" = "$3" ]; then echo "PASS $1: $3"; else echo "FAIL $1: wanted $2, got $3"; fails=$((fails + 1)); fi
}
# The SQLSTATE of one statement, or `ok`.
state() {
  local out code
  out="$(psql -qAt -c "\\set VERBOSITY sqlstate" -c "$1" 2>&1)"
  code="$(grep -oE '^ERROR:  [0-9A-Z]{5}' <<<"$out" | cut -c9-)"
  echo "${code:-ok}"
}
at_once() { # 20 separate connections, the same statement
  local pids=()
  for _ in $(seq 1 20); do psql -qAt -c "$1" >/dev/null 2>&1 & pids+=("$!"); done
  wait "${pids[@]}"
}

held() { # The race on purpose: the first holds its write uncommitted while the second reads.
  psql -qAt -c "begin" -c "$1" -c "select pg_sleep(3)" -c "commit" >/dev/null 2>&1 &
  local first="$!"
  sleep 1
  psql -qAt -c "$1" >/dev/null 2>&1
  wait "$first"
}

admin "drop database if exists cv_rows_proof"
admin "create database cv_rows_proof"
psql -q -v ON_ERROR_STOP=1 <<SQL
create schema auth; create schema extensions;
create extension pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as \$\$ select '$PERSON'::uuid \$\$;
create table public.profiles (id uuid primary key);
insert into public.profiles values ('$PERSON');
create table public.worker_education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  institution_name text not null, program_or_field text, education_type_slug text not null,
  start_year int, end_year int, is_current boolean not null default false, note text,
  created_at timestamptz not null default now());
create table public.worker_achievements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  title text not null, description text, achieved_at date,
  achievement_type_slug text not null default 'achievement',
  created_at timestamptz not null default now());
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id), organization_id uuid,
  relationship_slug text not null, status text, is_primary boolean, title text,
  started_at date, ended_at date, hash_self text);
-- Duplicates that already exist.
insert into public.worker_education (profile_id, institution_name, education_type_slug)
  select '$PERSON', 'Sena mokykla', 'other' from generate_series(1, 3);
insert into public.worker_achievements (profile_id, title)
  select '$PERSON', 'Senas pasiekimas' from generate_series(1, 3);
SQL

psql -q -v ON_ERROR_STOP=1 -f "$MIGRATION" || { echo "FAIL the migration did not apply"; exit 1; }
expect "existing education duplicates untouched" 3 "$(sql "select count(*) from worker_education")"
expect "existing achievement duplicates untouched" 3 "$(sql "select count(*) from worker_achievements")"

EDU="insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year) values ('$PERSON', 'Nauja kolegija', 'Statyba', 'college', 2014, 2017)"
at_once "$EDU"
expect "20 education inserts at once" 1 "$(sql "select count(*) from worker_education where institution_name = 'Nauja kolegija'")"
expect "the same education again answers 23505" 23505 "$(state "$EDU")"
expect "other case and padding are the same statement" 23505 "$(state "insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year) values ('$PERSON', '  NAUJA kolegija ', 'statyba', 'college', 2014, 2017)")"
expect "another period is another row" ok "$(state "insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year) values ('$PERSON', 'Nauja kolegija', 'Statyba', 'college', 2014, 2018)")"

NOYEARS="insert into worker_education (profile_id, institution_name, education_type_slug) values ('$PERSON', 'Be metu', 'other')"
at_once "$NOYEARS"
expect "no years: empty values are the same statement" 1 "$(sql "select count(*) from worker_education where institution_name = 'Be metu'")"

CERT="insert into worker_achievements (profile_id, title, achieved_at, achievement_type_slug) values ('$PERSON', 'Saugos kursai', '2022-01-01', 'declared_certificate')"
at_once "$CERT"
expect "20 certificate inserts at once" 1 "$(sql "select count(*) from worker_achievements where title = 'Saugos kursai'")"
expect "the same words as an achievement are another statement" ok "$(state "insert into worker_achievements (profile_id, title, achieved_at) values ('$PERSON', 'Saugos kursai', '2022-01-01')")"
expect "a 2000-character description fits the index" ok "$(state "insert into worker_achievements (profile_id, title, description) values ('$PERSON', 'Ilgas', repeat(chr(382), 2000))")"
expect "editing into another new row answers 23505" 23505 "$(state "update worker_education set end_year = 2017 where institution_name = 'Nauja kolegija' and end_year = 2018")"

at_once "select save_self_declared_work_history_v1('Statybininkas', 'employee', '2020-01-01', '2021-01-01')"
expect "20 work-history saves at once" 1 "$(sql "select count(*) from engagement_contexts where title = 'Statybininkas'")"

held "select save_self_declared_work_history_v1('Su lock', 'employee', '2020-01-01', '2021-01-01')"
expect "work history: second save during the first's open transaction" 1 "$(sql "select count(*) from engagement_contexts where title = 'Su lock'")"
HELD_EDU="insert into worker_education (profile_id, institution_name, education_type_slug) values ('$PERSON', 'Su indeksu', 'other')"
held "$HELD_EDU"
expect "education: second insert during the first's open transaction" 1 "$(sql "select count(*) from worker_education where institution_name = 'Su indeksu'")"

psql -q -v ON_ERROR_STOP=1 -f "$ROLLBACK" || { echo "FAIL the rollback did not apply"; exit 1; }
expect "rollback: the indexes are gone" 0 "$(sql "select count(*) from pg_indexes where indexname like '%one_statement_once'")"
expect "rollback: the lock is gone" 0 "$(sql "select count(*) from pg_proc where proname = 'save_self_declared_work_history_v1' and prosrc like '%advisory%'")"
expect "rollback: no row removed" 7 "$(sql "select count(*) from worker_education")"
# The same race with the fix rolled back has to store the row twice, or the two checks above prove nothing.
held "select save_self_declared_work_history_v1('Be lock', 'employee', '2020-01-01', '2021-01-01')"
expect "without the lock the race stores two" 2 "$(sql "select count(*) from engagement_contexts where title = 'Be lock'")"
held "${HELD_EDU//Su indeksu/Be indekso}"
expect "without the index the race stores two" 2 "$(sql "select count(*) from worker_education where institution_name = 'Be indekso'")"
psql -q -v ON_ERROR_STOP=1 -f "$MIGRATION" || { echo "FAIL the migration did not apply a second time"; exit 1; }
expect "applies again after a rollback" 2 "$(sql "select count(*) from pg_indexes where indexname like '%one_statement_once'")"

admin "drop database cv_rows_proof"
[ "$fails" -eq 0 ] && echo "ALL PASS" || { echo "$fails FAILED"; exit 1; }
