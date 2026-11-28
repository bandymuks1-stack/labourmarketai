#!/usr/bin/env bash
# Runs inside the throwaway container of cv-rows-one-statement-once-pg17.sh. Never run it elsewhere.
set -uo pipefail
A=aaaaaaaa-0000-4000-8000-000000000001
B=bbbbbbbb-0000-4000-8000-000000000002
PROD_BODY_MD5=f6d73088cae42e1dfc8f081ca1e1fe33
PROD_ACL='{postgres=X/postgres,authenticated=X/postgres}'
FN='public.save_self_declared_work_history_v1(text, text, date, date)'
fails=0
expect() { if [ "$2" = "$3" ]; then echo "PASS $1: $3"; else echo "FAIL $1: wanted $2, got $3"; fails=$((fails + 1)); fi; }
sql() { psql -qAt -v ON_ERROR_STOP=1 -c "$1"; }
ms() { date +%s%3N; }
as() { psql -qAt -c "\\set VERBOSITY sqlstate" -c "set role authenticated" -c "set request.jwt.claim.sub = '$1'" -c "$2" 2>&1; }
state() { local code; code="$(as "$1" "$2" | grep -oE '^ERROR:  [0-9A-Z]{5}' | cut -c9- || true)"; echo "${code:-ok}"; }
at_once() { local pids=(); for _ in $(seq 1 20); do as "$1" "$2" >/dev/null & pids+=("$!"); done; wait "${pids[@]}"; }
held() { # The first holds its write uncommitted while the second reads.
  psql -qAt -c "set role authenticated" -c "set request.jwt.claim.sub = '$1'" -c "begin" -c "$2" -c "select pg_sleep(2)" -c "commit" >/dev/null 2>&1 &
  local first="$!"; sleep 0.7; as "$1" "$2" >/dev/null; wait "$first"
}

psql -q -v ON_ERROR_STOP=1 <<SQL
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable as \$\$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$\$;
create function public.is_admin() returns boolean language sql stable as \$\$ select false \$\$;
create table public.profiles (id uuid primary key);
create table public.education_types (slug text primary key);
create table public.achievement_types (slug text primary key);
create table public.relationship_types (slug text primary key);
create table public.journal_entries (id uuid primary key);
insert into public.education_types values ('other'), ('college'), ('university');
insert into public.achievement_types values ('achievement'), ('declared_certificate');
insert into public.relationship_types values ('employee'), ('freelancer'), ('consultant'), ('collaborator'), ('student'), ('volunteer');
insert into public.profiles values ('$A'), ('$B');
insert into public.profiles select gen_random_uuid() from generate_series(1, 60);

create table public.worker_education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  institution_name text not null check (char_length(btrim(institution_name)) >= 2 and char_length(btrim(institution_name)) <= 200),
  program_or_field text check (program_or_field is null or char_length(program_or_field) <= 200),
  education_type_slug text not null references public.education_types(slug),
  start_year integer check (start_year is null or (start_year >= 1900 and start_year <= 2100)),
  end_year integer check (end_year is null or (end_year >= 1900 and end_year <= 2100)),
  is_current boolean not null default false,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_current and end_year is not null)),
  check (start_year is null or end_year is null or end_year >= start_year));
create index worker_education_profile_idx on public.worker_education (profile_id);
create table public.worker_achievements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) >= 2 and char_length(btrim(title)) <= 160),
  description text check (description is null or char_length(description) <= 2000),
  achieved_at date,
  achievement_type_slug text not null default 'achievement' references public.achievement_types(slug),
  source_journal_entry_id uuid references public.journal_entries(id) on delete set null,
  confirmed_by_manager boolean not null default false,
  created_at timestamptz not null default now());
create index worker_achievements_profile_idx on public.worker_achievements (profile_id);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid, project_id uuid,
  relationship_slug text not null references public.relationship_types(slug),
  country_code text,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  started_at date, ended_at date, title text, description text,
  is_primary boolean not null default false, hash_prev text, hash_self text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index idx_engagement_contexts_profile on public.engagement_contexts (profile_id, status, is_primary desc);

alter table public.worker_education enable row level security;
alter table public.worker_achievements enable row level security;
create policy worker_education_select on public.worker_education for select using (profile_id = auth.uid() or is_admin());
create policy worker_education_insert on public.worker_education for insert with check (profile_id = auth.uid());
create policy worker_education_update on public.worker_education for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy worker_education_delete on public.worker_education for delete using (profile_id = auth.uid());
create policy worker_achievements_select on public.worker_achievements for select using (profile_id = auth.uid() or is_admin());
create policy worker_achievements_insert on public.worker_achievements for insert with check (profile_id = auth.uid());
create policy worker_achievements_update on public.worker_achievements for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy worker_achievements_delete on public.worker_achievements for delete using (profile_id = auth.uid());
grant select, delete on public.worker_education, public.worker_achievements to authenticated;
grant insert (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year, is_current, note) on public.worker_education to authenticated;
grant update (institution_name, program_or_field, education_type_slug, start_year, end_year, is_current, note, updated_at) on public.worker_education to authenticated;
grant insert (profile_id, title, description, achieved_at, achievement_type_slug, source_journal_entry_id) on public.worker_achievements to authenticated;
grant update (title, description, achieved_at, achievement_type_slug) on public.worker_achievements to authenticated;

-- Synthetic rows, with existing duplicates: every sixth row repeats a statement.
insert into public.worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year, created_at)
  select (select id from public.profiles order by id offset (g % 60) limit 1),
         'QA-SYNTHETIC mokykla ' || case when g % 6 = 0 then 0 else g end, 'Statyba', 'college', 2010, 2014,
         now() - interval '30 days'
  from generate_series(1, $EDU_ROWS) g;
insert into public.worker_achievements (profile_id, title, achievement_type_slug, created_at)
  select (select id from public.profiles order by id offset (g % 60) limit 1),
         'QA-SYNTHETIC pasiekimas ' || case when g % 6 = 0 then 0 else g end, 'declared_certificate',
         now() - interval '30 days'
  from generate_series(1, $ACH_ROWS) g;
insert into public.worker_education (profile_id, institution_name, education_type_slug, created_at)
  select '$A', 'QA-SYNTHETIC sena', 'other', now() - interval '30 days' from generate_series(1, 3);
analyze;
SQL
echo "server: $(sql "select split_part(version(), ' on ', 1)"); locale provider: $(sql "select datlocprovider from pg_database where datname = current_database()"); rows: $EDU_ROWS + $ACH_ROWS"

# The function as production has it today, from the rollback file: the file IS production's body.
psql -q -v ON_ERROR_STOP=1 -f /tmp/down.sql 2>&1 | grep -v 'does not exist, skipping'
sql "revoke execute on function $FN from public, anon; grant execute on function $FN to authenticated"
BODY="select md5(prosrc) from pg_proc where proname = 'save_self_declared_work_history_v1'"
ACL="select proacl::text from pg_proc where proname = 'save_self_declared_work_history_v1'"
INDEXES="select count(*) from pg_indexes where indexname like '%one_statement_once'"
expect "rollback file's function is production's, byte for byte" "$PROD_BODY_MD5" "$(sql "$BODY")"

# 1. A stuck writer: the apply gives up, nothing changes, and it can run again.
psql -qAt -c "begin" -c "insert into worker_education (profile_id, institution_name, education_type_slug) values ('$A', 'QA-SYNTHETIC stuck', 'other')" -c "select pg_sleep(9)" -c "commit" >/dev/null 2>&1 &
stuck="$!"; sleep 0.5
t0="$(ms)"; out="$(psql -q -1 -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f /tmp/up.sql 2>&1)"; t1="$(ms)"
expect "stuck writer: the apply fails with lock_not_available" 1 "$(grep -c 55P03 <<<"$out")"
echo "INFO stuck writer: the apply gave up after $((t1 - t0)) ms"
expect "stuck writer: no index left behind" 0 "$(sql "$INDEXES")"
expect "stuck writer: the function is unchanged" "$PROD_BODY_MD5" "$(sql "$BODY")"
wait "$stuck"
expect "stuck writer: its own row was saved" 1 "$(sql "select count(*) from worker_education where institution_name = 'QA-SYNTHETIC stuck'")"

# 2. The same without a wrapping transaction, in case the apply tool doesn't open one.
psql -qAt -c "begin" -c "insert into worker_achievements (profile_id, title) values ('$A', 'QA-SYNTHETIC stuck')" -c "select pg_sleep(8)" -c "commit" >/dev/null 2>&1 &
stuck="$!"; sleep 0.5
sed -n '/^do \$migration\$/,/^\$migration\$;/p' /tmp/up.sql >/tmp/do.sql
psql -q -v VERBOSITY=sqlstate -f /tmp/do.sql >/tmp/noxact.out 2>&1
expect "no wrapping transaction: lock_timeout still applies" 1 "$(grep -c 55P03 /tmp/noxact.out)"
expect "no wrapping transaction: no index left behind" 0 "$(sql "$INDEXES")"
wait "$stuck"

# 3. The apply itself, with people writing and reading, as production would see it.
stop=/tmp/stop-load; rm -f "$stop"
load() { # label, statement: one connection per call, the slowest round in ms
  local worst=0 n=0 t0 t1 d
  while [ ! -e "$stop" ]; do
    t0="$(ms)"; psql -qAt -c "$2" >/dev/null 2>&1; t1="$(ms)"; d=$((t1 - t0)); [ "$d" -gt "$worst" ] && worst="$d"; n=$((n + 1))
  done
  echo "INFO $1: $n rounds, slowest $worst ms"
}
sql "create sequence load_n"
W="insert into worker_education (profile_id, institution_name, education_type_slug) values ('$B', 'QA-SYNTHETIC load ' || nextval('load_n'), 'other')"
R="select count(*) from worker_education where profile_id = '$A'"
load "before the apply, writer" "$W" & l1="$!"; sleep 2; touch "$stop"; wait "$l1"; rm -f "$stop"
load "during the apply, writer" "$W" > /tmp/w.out & lw="$!"
load "during the apply, reader" "$R" > /tmp/r.out & lr="$!"
sleep 0.7
t0="$(ms)"; psql -q -1 -v ON_ERROR_STOP=1 -f /tmp/up.sql; applied="$?"; t1="$(ms)"
sleep 0.7; touch "$stop"; wait "$lw" "$lr"; rm -f "$stop"; cat /tmp/w.out /tmp/r.out
expect "the apply succeeds beside live writers" 0 "$applied"
echo "INFO the apply took $((t1 - t0)) ms including the connection"
expect "both indexes exist" 2 "$(sql "$INDEXES")"
expect "both indexes are valid and unique" 2 "$(sql "select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname like '%one_statement_once' and i.indisvalid and i.indisunique")"
expect "existing duplicates untouched" 3 "$(sql "select count(*) from worker_education where institution_name = 'QA-SYNTHETIC sena'")"
expect "the function's grants are production's" "$PROD_ACL" "$(sql "$ACL")"
expect "SECURITY DEFINER and search_path kept" "t|{search_path=public}" "$(sql "select prosecdef, proconfig from pg_proc where proname = 'save_self_declared_work_history_v1'")"
expect "anon cannot run the function" f "$(sql "select has_function_privilege('anon', '$FN', 'execute')")"

# 4. Security: under RLS, as the real role.
EA="insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year) values ('$A', 'Kolegija Ž', 'Statyba', 'college', 2014, 2017)"
EB="${EA//$A/$B}"
expect "person A saves a statement" ok "$(state "$A" "$EA")"
expect "the same words by person B are B's own row" ok "$(state "$B" "$EB")"
expect "no probing: A writing for B answers 42501, never 23505" 42501 "$(state "$A" "$EB")"
expect "A repeating it answers 23505" 23505 "$(state "$A" "$EA")"
expect "Lithuanian letters fold: other case is the same statement" 23505 "$(state "$A" "${EA//Kolegija Ž/  KOLEGIJA ž }")"
expect "the error carries nothing of another person" 0 "$(psql -qAt -c "set role authenticated" -c "set request.jwt.claim.sub = '$A'" -c "$EA" 2>&1 | grep -c "$B")"
expect "created_at cannot be set on insert" 42501 "$(state "$A" "insert into worker_education (profile_id, institution_name, education_type_slug, created_at) values ('$A', 'Sena data', 'other', '2000-01-01')")"
expect "created_at cannot be changed" 42501 "$(state "$A" "update worker_education set created_at = '2000-01-01' where profile_id = '$A'")"
expect "profile_id cannot be changed" 42501 "$(state "$A" "update worker_education set profile_id = '$B' where profile_id = '$A'")"
expect "created_at cannot be set on an achievement" 42501 "$(state "$A" "insert into worker_achievements (profile_id, title, created_at) values ('$A', 'Sena data', '2000-01-01')")"

# 5. Every writer's statement, as its code sends it.
at_once "$A" "insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year, is_current, note) values ('$A', 'Forma', 'Prog', 'university', 2015, 2019, false, null)"
expect "profile form, CV import, chat, MCP: 20 at once store one" 1 "$(sql "select count(*) from worker_education where institution_name = 'Forma'")"
ONB="insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year, is_current, note) values ('$A', 'Studijuoju', null, 'other', null, null, true, null)"
expect "onboarding: first answer stores" ok "$(state "$A" "$ONB")"
expect "onboarding: a repeat answers 23505, which it logs and carries on" 23505 "$(state "$A" "$ONB")"
expect "onboarding: one row" 1 "$(sql "select count(*) from worker_education where institution_name = 'Studijuoju'")"
expect "studying now and finished are different statements" ok "$(state "$A" "${ONB//true/false}")"
expect "a repeat of an OLD row can still be stored once" ok "$(state "$A" "insert into worker_education (profile_id, institution_name, education_type_slug) values ('$A', 'QA-SYNTHETIC sena', 'other')")"
expect "and not twice" 23505 "$(state "$A" "insert into worker_education (profile_id, institution_name, education_type_slug) values ('$A', 'QA-SYNTHETIC sena', 'other')")"
expect "another period is another row" ok "$(state "$A" "${EA//2017/2018}")"
expect "edit into another new row answers 23505" 23505 "$(state "$A" "update worker_education set end_year = 2017 where profile_id = '$A' and institution_name = 'Kolegija Ž' and end_year = 2018")"
expect "edit of an OLD row is not stopped" ok "$(state "$A" "update worker_education set note = 'QA-SYNTHETIC' where profile_id = '$A' and institution_name = 'QA-SYNTHETIC sena' and created_at < now() - interval '1 day'")"
expect "remove" ok "$(state "$A" "delete from worker_education where profile_id = '$A' and institution_name = 'Forma'")"
expect "then the row can be saved again" ok "$(state "$A" "insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug, start_year, end_year) values ('$A', 'Forma', 'Prog', 'university', 2015, 2019)")"
held "$A" "insert into worker_education (profile_id, institution_name, education_type_slug) values ('$A', 'Lenktynes', 'other')"
expect "forced race, education: one row" 1 "$(sql "select count(*) from worker_education where institution_name = 'Lenktynes'")"
CERT="insert into worker_achievements (profile_id, title, achieved_at, achievement_type_slug) values ('$A', 'Saugos kursai', '2022-01-01', 'declared_certificate')"
held "$A" "$CERT"
expect "forced race, certificate: one row" 1 "$(sql "select count(*) from worker_achievements where title = 'Saugos kursai'")"
expect "a repeat answers 23505" 23505 "$(state "$A" "$CERT")"
expect "the same words as an achievement are another statement" ok "$(state "$A" "${CERT//declared_certificate/achievement}")"

# 6. The largest key a person can send, in characters that don't compress.
big() { echo "(select string_agg(chr(65536 + (random() * 60000)::int + g * 0), '') from generate_series(1, $1) g)"; }
expect "largest education key fits" ok "$(state "$A" "insert into worker_education (profile_id, institution_name, program_or_field, education_type_slug) values ('$A', $(big 200), $(big 200), 'other')")"
expect "largest achievement key fits" ok "$(state "$A" "insert into worker_achievements (profile_id, title, description) values ('$A', $(big 160), $(big 2000))")"

# 7. The function under the lock.
RPC() { echo "select save_self_declared_work_history_v1('$1', 'employee', '2020-01-01', '2021-01-01')"; }
at_once "$A" "$(RPC Statybininkas)"
expect "work history: 20 at once store one" 1 "$(sql "select count(*) from engagement_contexts where title = 'Statybininkas'")"
held "$A" "$(RPC Lenktynes)"
expect "work history: forced race stores one" 1 "$(sql "select count(*) from engagement_contexts where title = 'Lenktynes'")"
psql -qAt -c "set role authenticated" -c "set request.jwt.claim.sub = '$A'" -c "begin" -c "$(RPC Laukia)" -c "select pg_sleep(2)" -c "commit" >/dev/null 2>&1 &
holder="$!"; sleep 0.5
t0="$(ms)"; as "$B" "$(RPC Kitas)" >/dev/null; t1="$(ms)"
wait "$holder"
[ $((t1 - t0)) -lt 1000 ] && other=yes || other=no
expect "another person does not wait for that lock" yes "$other"
for i in $(seq 1 58); do as "$B" "$(RPC "Eilute-$i")" >/dev/null; done
pids=(); for i in $(seq 1 20); do as "$B" "$(RPC "Virs-$i")" >/dev/null & pids+=("$!"); done; wait "${pids[@]}"
expect "the 60-row bound also holds at once" 60 "$(sql "select count(*) from engagement_contexts where profile_id = '$B' and organization_id is null")"

# 8. Reads, removal, dump.
expect "reads don't choose the new index" 0 "$(sql "explain select * from worker_education where profile_id = '$A'" | grep -c one_statement_once)"
pg_dump -s -t public.worker_education -t public.worker_achievements >/tmp/dump.sql
expect "a dump keeps the cutover as a literal" 2 "$(grep -c 'one_statement_once.*WHERE (created_at >= .*timestamp with time zone' /tmp/dump.sql)"
expect "erasure: deleting a person cascades past the index" 0 "$(psql -qAt -c "begin" -c "delete from profiles where id = '$A'" -c "rollback" 2>&1 | grep -c ERROR)"
ROWS_NOW="$(sql "select count(*) from worker_education where institution_name not like 'QA-SYNTHETIC load%'")"

# 9. The rollback: behind a long reader it gives up, otherwise it restores production.
psql -qAt -c "begin" -c "select count(*) from worker_education" -c "select pg_sleep(8)" -c "commit" >/dev/null 2>&1 &
reader="$!"; sleep 0.5
t0="$(ms)"; out="$(psql -q -v VERBOSITY=sqlstate -f /tmp/down.sql 2>&1)"; t1="$(ms)"
expect "long reader: the rollback fails with lock_not_available" 1 "$(grep -c 55P03 <<<"$out")"
echo "INFO long reader: the rollback gave up after $((t1 - t0)) ms"
expect "long reader: the indexes stand" 2 "$(sql "$INDEXES")"
expect "long reader: the function keeps its lock" 1 "$(sql "select count(*) from pg_proc where proname = 'save_self_declared_work_history_v1' and prosrc like '%advisory%'")"
wait "$reader"
load "during the rollback, reader" "$R" > /tmp/r.out & lr="$!"
load "during the rollback, writer" "$W" > /tmp/w.out & lw="$!"
sleep 0.7
t0="$(ms)"; psql -q -v ON_ERROR_STOP=1 -f /tmp/down.sql; rolled="$?"; t1="$(ms)"
sleep 0.7; touch "$stop"; wait "$lw" "$lr"; rm -f "$stop"; cat /tmp/w.out /tmp/r.out
expect "the rollback succeeds beside live load" 0 "$rolled"
echo "INFO the rollback took $((t1 - t0)) ms including the connection"
expect "rollback: the indexes are gone" 0 "$(sql "$INDEXES")"
expect "rollback: the function is production's, byte for byte" "$PROD_BODY_MD5" "$(sql "$BODY")"
expect "rollback: the grants are production's" "$PROD_ACL" "$(sql "$ACL")"
expect "rollback: no row removed" "$ROWS_NOW" "$(sql "select count(*) from worker_education where institution_name not like 'QA-SYNTHETIC load%'")"
# The same race with the fix rolled back has to store twice, or the checks above prove nothing.
held "$A" "insert into worker_education (profile_id, institution_name, education_type_slug) values ('$A', 'Be indekso', 'other')"
expect "without the index the forced race stores two" 2 "$(sql "select count(*) from worker_education where institution_name = 'Be indekso'")"
held "$A" "$(RPC Be-lock)"
expect "without the lock the forced race stores two" 2 "$(sql "select count(*) from engagement_contexts where title = 'Be-lock'")"
sleep 1
psql -q -1 -v ON_ERROR_STOP=1 -f /tmp/up.sql; expect "applies again after the rollback" 0 "$?"
expect "both indexes are back" 2 "$(sql "$INDEXES")"

# 10. How long writers wait: from the first lock to the commit, without the connection.
psql -q -v ON_ERROR_STOP=1 -f /tmp/down.sql
held_ms="$(psql -qAt -v ON_ERROR_STOP=1 -c "begin" -c "create temp table lock_clock on commit drop as select clock_timestamp() as t" -f /tmp/up.sql -c "select round(extract(epoch from clock_timestamp() - t) * 1000, 1) from lock_clock" -c "commit")"
echo "INFO the locks are held for $held_ms ms on $EDU_ROWS + $ACH_ROWS rows"
echo
[ "$fails" -eq 0 ] && echo "ALL PASS" || { echo "$fails FAILED"; exit 1; }
