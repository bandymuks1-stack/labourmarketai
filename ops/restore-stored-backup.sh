#!/usr/bin/env bash
# Restores a STORED backup pair into a throw-away local postgres:17 and compares it with what the
# backup's own run reported. Runs on the owner's PC (Git Bash + Docker Desktop), never on production.
#
#   bash ops/restore-stored-backup.sh --run <run id> --key <age key file> \
#     --db lm-db-<stamp>.dump.age --files lm-files-<stamp>.tar.age
#
# Uses the same image, the same target preparation and the same pg_restore call as the drill in
# db-backup.yml, and reads the proof SQL from that file, so there is one definition of the proof.
# One difference: the drill reads the source's role list, which is not in a dump. Here the roles are
# the ones the dump asks for, found by restoring the schema into a scratch database first.
#
# NEVER A LIVE DATABASE. There is no host, URL or password option: the only target is the container this
# script starts. It stops unless Docker is on this machine, stops on the production host, and checks the
# container before anything is decrypted: its own, postgres:17, no network, nothing published.
#
# The container has no network and nothing is published, so it cannot reach production. Plaintext goes
# straight from age into the container's memory (tmpfs) and is gone when the container is removed.
# --on-disk puts it on Docker's disk instead, if memory runs out; the space is then freed, not wiped.
# --keep leaves the container for a look at /restore/restore.err; the script prints how to remove it.
#
# Prints counts only: never a key, a password, a row, a role or an object name. The run's log holds
# grant counts, not grant hashes, so grants are compared by count per schema and kind.
#
# Exit 0 PASS, 1 FAIL or stopped, 64 usage.
set -uo pipefail
umask 077
export MSYS_NO_PATHCONV=1

RUN=""; RUN_LOG=""; KEY=""; DB=""; FILES=""; ON_DISK=0; KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --run) RUN="$2"; shift 2;;
    --run-log) RUN_LOG="$2"; shift 2;;
    --key) KEY="$2"; shift 2;;
    --db) DB="$2"; shift 2;;
    --files) FILES="$2"; shift 2;;
    --on-disk) ON_DISK=1; shift;;
    --keep) KEEP=1; shift;;
    *) echo "unknown argument: $1"; exit 64;;
  esac
done
[ -n "$KEY" ] && [ -n "$DB" ] && [ -n "$FILES" ] && { [ -n "$RUN" ] || [ -n "$RUN_LOG" ]; } || {
  echo "usage: bash ops/restore-stored-backup.sh --run <id> --key <file> --db <lm-db-*.dump.age> --files <lm-files-*.tar.age> [--on-disk] [--keep]"
  exit 64
}

HERE=$(cd "$(dirname "$0")" && pwd)
WF="$HERE/../.github/workflows/db-backup.yml"
PUB="$HERE/vps/backup.age.pub"
stop() { echo "STOP: $1"; echo "RESULT: FAIL"; exit 1; }
# Docker must be this machine's: a remote endpoint would put the plaintext on that host.
local_docker() { case "$1" in npipe://*|unix://*) return 0;; *) return 1;; esac; }
[ -z "${DOCKER_HOST:-}" ] || local_docker "$DOCKER_HOST" || stop "DOCKER_HOST points away from this machine; this runs only on a local Docker"
[ ! -e /root/lm-prod ] || stop "this looks like the production host; run it on another machine"
for t in docker age age-keygen sha256sum; do command -v "$t" >/dev/null || stop "$t is not installed"; done
[ -f "$WF" ] && [ -f "$PUB" ] || stop "run this from a checkout of the repository"
local_docker "$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null | tr -d '')"   || stop "the Docker context is not this machine's, or Docker is not running"
native() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
KEY=$(native "$KEY"); DB=$(native "$DB"); FILES=$(native "$FILES")
[ -f "$KEY" ] || stop "the key file is missing"
[ -f "$DB" ] && [ -f "$FILES" ] || stop "a backup file is missing"
DB_NAME=$(basename "$DB"); FILES_NAME=$(basename "$FILES")
STAMP=$(printf '%s' "$DB_NAME" | sed -n 's/^lm-db-\(.*\)\.dump\.age$/\1/p')
[ -n "$STAMP" ] && [ "$FILES_NAME" = "lm-files-$STAMP.tar.age" ] || stop "the two files are not one pair"

T=$(mktemp -d); C="lm-restore-check-$$"; STARTED=0
cleanup() {
  rm -rf "$T"
  [ "$STARTED" = "1" ] || return 0
  if [ "$KEEP" = "1" ]; then
    echo "kept. Remove it with: docker rm -fv $C"
  else
    docker rm -fv "$C" >/dev/null 2>&1 && echo "container removed"
  fi
}
trap cleanup EXIT
BAD=0
pass() { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; BAD=1; }
ex() { docker exec -i "$C" "$@"; }
now() { date +%s; }

echo "1. what the run reported"
if [ -n "$RUN" ]; then
  command -v gh >/dev/null || stop "gh is not installed; pass --run-log <file with the run's log>"
  gh run view "$RUN" --log > "$T/log" 2>/dev/null || stop "could not read run $RUN"
else
  cp "$(native "$RUN_LOG")" "$T/log" || stop "could not read the run log"
fi
grep -v '36;1m' "$T/log" | tr -d '\r' | sed -E 's/^.*[0-9]Z //' > "$T/lines"
line() { grep -m1 -E "^$1" "$T/lines" || true; }
enc() { line "encrypted $1 " | sed -n "s/.*$2=\([^ ]*\).*/\1/p"; }
want_db_sha=$(enc "$DB_NAME" sha256); want_db_bytes=$(enc "$DB_NAME" bytes)
want_files_sha=$(enc "$FILES_NAME" sha256); want_files_bytes=$(enc "$FILES_NAME" bytes)
[ -n "$want_db_sha" ] && [ -n "$want_files_sha" ] || stop "that run did not produce this pair"
SCOPE=$(line "dump scope=" | sed -n 's/^dump scope=\([^ ]*\).*/\1/p')
[ -n "$SCOPE" ] || stop "the run's log has no dump scope"
expect() { line "restore proof: $1 " | sed -n 's/.*(\(.*\))$/\1/p' | tr ' ' '\n' | LC_ALL=C sort; }
expect "schema objects equal the source" > "$T/objects.want"
expect "grants equal the source" > "$T/grants.want"
[ -s "$T/objects.want" ] && [ -s "$T/grants.want" ] || stop "the run's log has no object or grant counts"
echo "  backup $STAMP, scope $SCOPE"

echo "2. the stored files against the run"
for f in "$DB|$want_db_sha|$want_db_bytes" "$FILES|$want_files_sha|$want_files_bytes"; do
  p=${f%%|*}; r=${f#*|}; s=${r%%|*}; b=${r#*|}
  have_b=$(wc -c < "$p" | tr -d ' ')
  [ "$(sha256sum "$p" | cut -d' ' -f1)" = "$s" ] || stop "$(basename "$p"): sha256 differs from the run's"
  [ "$have_b" = "$b" ] || stop "$(basename "$p"): size differs from the run's"
  pass "$(basename "$p"): $have_b bytes, sha256 $s"
done

echo "3. the key"
[ "$(age-keygen -y "$KEY" 2>/dev/null | tr -d '\r')" = "$(tr -d '\r' < "$PUB")" ] \
  || stop "this key does not belong to ops/vps/backup.age.pub, or it could not be read"
pass "belongs to ops/vps/backup.age.pub"

echo "4. throw-away postgres:17, no network"
if [ "$ON_DISK" = "1" ]; then
  mounts=()
else
  mounts=(--tmpfs /var/lib/postgresql/data:size=4g --tmpfs /restore:size=1g)
fi
docker run -d --name "$C" --network none -e POSTGRES_HOST_AUTH_METHOD=trust "${mounts[@]}" \
  postgres:17 -c fsync=off -c full_page_writes=off >/dev/null || stop "the container did not start"
STARTED=1
# The target before anything is decrypted: this exact container, no network, nothing published, no other interface.
[ "$(docker inspect --format '{{.Config.Image}} {{.HostConfig.NetworkMode}} {{len .HostConfig.PortBindings}}' "$C" | tr -d '')" = "postgres:17 none 0" ]   || stop "the target is not the expected throw-away container"
[ "$(ex sh -c 'ls /sys/class/net' | tr -d '' | grep -vx lo | wc -l | tr -d ' ')" = "0" ] || stop "the container has a network interface"
pass "the target is this throw-away container: no network, nothing published"
ex mkdir -p /restore/files
# The image's first start also runs a temporary server, on its socket only; TCP answers when it is the real one.
for _ in $(seq 1 60); do ex pg_isready -q -h 127.0.0.1 -U postgres && break; sleep 2; done
ex pg_isready -q -h 127.0.0.1 -U postgres || stop "postgres did not become ready"
pass "ready"

echo "5. decrypt"
t0=$(now)
age -d -i "$KEY" "$DB" | ex sh -c 'cat > /restore/lm.dump' || stop "the database file did not decrypt"
age -d -i "$KEY" "$FILES" | ex tar -C /restore/files -xf - || stop "the files bundle did not decrypt"
DECRYPT_S=$(( $(now) - t0 ))
ex pg_restore -l /restore/lm.dump > "$T/toc" 2>/dev/null || stop "the decrypted database file is not a readable dump"
pass "both files, ${DECRYPT_S} s; dump lists $(grep -cv '^;' "$T/toc") entries"

P=(psql -U postgres -X -q -v ON_ERROR_STOP=1)
prepare() { # the target as the drill prepares it
  ex "${P[@]}" -d "$1" >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions;
create extension btree_gist with schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
SQL
}

echo "6. roles the dump asks for"
for pass_no in 1 2 3; do
  ex "${P[@]}" -c "drop database if exists roles_scratch" -c "create database roles_scratch" >/dev/null 2>&1 || stop "scratch database"
  prepare roles_scratch || stop "could not prepare the scratch database"
  ex sh -c 'pg_restore -U postgres -d roles_scratch --schema-only /restore/lm.dump 2> /restore/roles.err; true'
  ex sh -c "grep -oE 'role \"[^\"]+\" does not exist' /restore/roles.err | sed -E 's/^role \"|\" does not exist\$//g' | sort -u" | tr -d '\r' > "$T/roles"
  [ -s "$T/roles" ] || break
  while IFS= read -r r; do
    printf "select format('create role %%I nologin', :'r')\n\\\\gexec\n" | ex "${P[@]}" -v r="$r" -tA >/dev/null || stop "could not create a role"
  done < "$T/roles"
done
[ ! -s "$T/roles" ] || stop "the dump still asks for roles after three passes"
ex "${P[@]}" -c "drop database roles_scratch" >/dev/null || stop "scratch database"
pass "$(ex "${P[@]}" -tA -c "select count(*) from pg_roles where rolname !~ '^pg_'" | tr -d '\r') roles present"

echo "7. restore"
ex "${P[@]}" -c "create database drill_restore" >/dev/null || stop "could not create the target database"
prepare drill_restore || stop "could not prepare the target database"
t0=$(now)
ex sh -c 'pg_restore -U postgres -d drill_restore /restore/lm.dump 2> /restore/restore.err; true'
RESTORE_S=$(( $(now) - t0 ))
errs=$(ex sh -c 'grep -c ERROR /restore/restore.err || true' | tr -d '\r')
harmless=$(ex sh -c "grep -c 'ERROR: *schema \"public\" already exists' /restore/restore.err || true" | tr -d '\r')
other=$((errs - harmless))
echo "  ${RESTORE_S} s; errors $errs (expected $harmless, other $other)"
ex pg_isready -q -h 127.0.0.1 -U postgres || stop "postgres stopped during the restore; if memory ran out, try --on-disk"

echo "8. compare with the run"
proof_sql() { # the block with this name in db-backup.yml
  tr -d '\r' < "$WF" | awk -v k="      $1: |" '
    $0 == k { f = 1; next }
    f && /[^ ]/ { match($0, /^ */); if (RLENGTH < 8) exit }
    f { print substr($0, 9) }'
}
dq() { proof_sql "$1" | ex "${P[@]}" -d drill_restore -v schemas="$SCOPE" -tA -F "$(printf '\t')" | tr -d '\r'; }
q() { ex psql -U postgres -X -d drill_restore -tAc "$1" < /dev/null | tr -d '\r'; }
counts() { awk -F'\t' 'NF >= 3 { print $1 "." $2 "=" $3 }' | LC_ALL=C sort; }
same_counts() { # what, want file, have file
  if [ -s "$3" ] && cmp -s "$2" "$3"; then
    pass "$1 equal the run ($(wc -l < "$3" | tr -d ' ') groups, $(awk -F= '{ s += $2 } END { print s }' "$3") in all)"
  else
    fail "$1 differ (run < > restored):"
    diff "$2" "$3" | grep '^[<>]' | sed 's/^/        /'
  fi
}
dq PROOF_OBJECTS_SQL | counts > "$T/objects.have"; same_counts "schema objects" "$T/objects.want" "$T/objects.have"
dq PROOF_GRANTS_SQL | counts > "$T/grants.have"; same_counts "grants" "$T/grants.want" "$T/grants.have"

grep -E '^restore proof: [a-z_]+\.[a-z_]+ restored [0-9]+ rows, source window \[[0-9]+, [0-9]+\]$' "$T/lines" | LC_ALL=C sort -u > "$T/keys"
[ -s "$T/keys" ] || fail "the run's log has no key tables"
while IFS= read -r l; do
  table=$(printf '%s' "$l" | awk '{ print $3 }'); lo=$(printf '%s' "$l" | sed -E 's/.*\[([0-9]+), .*/\1/'); hi=$(printf '%s' "$l" | sed -E 's/.*, ([0-9]+)\]$/\1/')
  n=$(q "select count(*) from $table" 2>/dev/null || echo missing)
  if [ "$n" != "missing" ] && [ -n "$n" ] && [ "$n" -ge "$lo" ] && [ "$n" -le "$hi" ]; then pass "$table: $n rows, run's window [$lo, $hi]"; else fail "$table: $n rows, run's window [$lo, $hi]"; fi
done < "$T/keys"

dq PROOF_ROWS_SQL > "$T/rows"
want_tables=$(line "restore proof: [0-9]+ tables compared" | sed -n 's/^restore proof: \([0-9]*\) tables.*/\1/p')
have_tables=$(wc -l < "$T/rows" | tr -d ' ')
[ "$have_tables" = "$want_tables" ] && pass "tables with data proof: $have_tables, as in the run" || fail "tables: $have_tables, the run compared $want_tables"
echo "  rows in all: $(awk -F'\t' '{ s += $2 } END { print s + 0 }' "$T/rows"); empty tables: $(awk -F'\t' '$2 + 0 == 0' "$T/rows" | wc -l | tr -d ' ')"
orphans=$(q "select count(*) from public.journal_entries j where not exists (select 1 from public.workers w where w.id = j.worker_id)")
[ "$orphans" = "0" ] && pass "every journal entry has its worker" || fail "$orphans journal entries without their worker"
echo "  newest migration in the ledger: $(q "select max(version) from supabase_migrations.schema_migrations")"

ex "${P[@]}" -d postgres -tA >/dev/null <<'SQL'
create temp table m(l text);
\copy m from '/restore/files/storage-manifest.jsonl' with (format csv, delimiter E'\x01', quote E'\x02')
\o /restore/sums
select (l::jsonb->>'sha256') || '  storage/' || (l::jsonb->>'b') || '/' || (l::jsonb->>'n') from m;
\o /restore/bytes
select coalesce(sum((l::jsonb->>'s')::bigint), 0) from m;
SQL
[ $? = 0 ] || fail "the Storage manifest could not be read"
objects=$(ex sh -c 'wc -l < /restore/sums' | tr -d '\r ')
broken=$(ex sh -c 'cd /restore/files && sha256sum -c --quiet /restore/sums 2>/dev/null | wc -l' | tr -d '\r ')
bytes=$(ex sh -c 'head -n1 /restore/bytes' | tr -d '\r ')
cron=$(ex sh -c 'echo $(( $(wc -l < /restore/files/cron-jobs.csv) - 1 ))' | tr -d '\r ')
s=$(line "storage files: ")
want_objects=$(printf '%s' "$s" | sed -n 's/.*objects=\([0-9]*\)\/.*/\1/p'); want_bytes=$(printf '%s' "$s" | sed -n 's/.*bytes=\([0-9]*\)\/.*/\1/p'); want_cron=$(printf '%s' "$s" | sed -n 's/.*cron jobs=\([0-9]*\)\/.*/\1/p')
[ "$broken" = "0" ] && [ "$objects" = "$want_objects" ] && [ "$bytes" = "$want_bytes" ] \
  && pass "Storage files: $objects, $bytes bytes, every sha256 intact, as in the run" \
  || fail "Storage files: $objects of $want_objects, $bytes of $want_bytes bytes, $broken with a wrong sha256"
[ "$cron" = "$want_cron" ] && pass "cron job definitions: $cron, as in the run" || fail "cron job definitions: $cron, the run had $want_cron"
db_objects=$(q "select count(*) from storage.objects")
[ "$db_objects" = "$objects" ] && pass "storage.objects rows equal the files" || fail "storage.objects has $db_objects rows, $objects files"

echo
echo "backup date:      $STAMP"
echo "size:             $want_db_bytes + $want_files_bytes bytes"
echo "integrity:        sha256 of both files equals the run's"
echo "decrypt:          OK with the key given, ${DECRYPT_S} s"
echo "restore duration: ${RESTORE_S} s, $other unexpected errors"
if [ "$BAD" = "0" ]; then echo "RESULT: PASS"; exit 0; fi
echo "RESULT: FAIL"
exit 1
