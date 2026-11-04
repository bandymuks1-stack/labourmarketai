#!/bin/sh
# Synthetic test of lm-backup-watchdog.sh: its own temporary directory, invented files, mail to a file.
# It never reads or touches real backups and sends no mail. Run from anywhere: sh lm-backup-watchdog.test.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
W="$HERE/lm-backup-watchdog.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
R="$T/root"; B="$R/backups"; M="$T/mail"; mkdir -p "$B"; : > "$M"
NOW=2000000000; HOUR=3600; FAILS=0; N=0

run() { sh "$W" --root "$R" --now "$NOW" --mail-file "$M" >"$T/out" 2>&1; echo $?; }
mails() { grep -c '^Subject:' "$M"; }
expect() { # name, actual, wanted
  N=$((N + 1))
  if [ "$2" = "$3" ]; then echo "ok $N $1"; else echo "FAIL $N $1: got '$2', wanted '$3' ($(cat "$T/out"))"; FAILS=$((FAILS + 1)); fi
}
reset() { rm -f "$R"/backup-watchdog.state "$B"/*; : > "$M"; }
# A pair with its records, recorded $2 hours before NOW.
pair() {
  for f in "lm-db-$1.dump.age" "lm-files-$1.tar.age"; do
    printf 'age-encryption.org/v1 synthetic %s\n' "$f" > "$B/$f"
    printf '%s %s %s %s\n' "$((NOW - $2 * HOUR))" "$f" "$(stat -c %s "$B/$f")" "$(sha256sum "$B/$f" | cut -d' ' -f1)" >> "$B/verified.log"
  done
}

reset; pair A 1
expect "fresh pair: healthy" "$(run)" 0
expect "fresh pair: no mail" "$(mails)" 0

reset
expect "no record: problem" "$(run)" 1
expect "no record: one alert" "$(mails)" 1
expect "same incident, next hour: still a problem" "$(run)" 1
expect "same incident, next hour: no second alert" "$(mails)" 1
pair B 1
expect "new verified pair: healthy" "$(run)" 0
expect "new verified pair: one recovery message" "$(grep -c 'Backup recovered' "$M")" 1
expect "healthy again: nothing more" "$(run)$(mails)" 02

reset; pair C 27
expect "27 h old: problem" "$(run)" 1
expect "27 h old: reason is stale" "$(grep -c 'status=stale' "$T/out")" 1

reset; pair D 25
expect "25 h old: healthy" "$(run)" 0

reset; printf 'age-encryption.org/v1 fresh mtime, no record\n' > "$B/lm-db-E.dump.age"; cp "$B/lm-db-E.dump.age" "$B/lm-files-E.tar.age"
expect "fresh file without a record is not success" "$(run)" 1
expect "fresh file without a record: reason" "$(grep -c 'status=no_record' "$T/out")" 1

reset; pair F 1; printf 'tampered same length\n' > "$T/x"; s=$(stat -c %s "$B/lm-db-F.dump.age"); head -c "$s" /dev/zero > "$B/lm-db-F.dump.age"
expect "changed bytes, same size: problem" "$(run)" 1
expect "changed bytes, same size: reason" "$(grep -c 'status=sha256_mismatch' "$T/out")" 1

reset; pair G 1; rm "$B/lm-files-G.tar.age"
expect "recorded file gone: problem" "$(run)" 1
expect "recorded file gone: reason" "$(grep -c 'status=missing_file' "$T/out")" 1

reset; pair H 1; echo extra >> "$B/lm-db-H.dump.age"
expect "changed size: reason" "$(run; grep -c 'status=size_mismatch' "$T/out")" "$(printf '1\n1')"

reset; pair I 30; printf 'age-encryption.org/v1 x\n' > "$B/lm-db-J.dump.age"
printf '%s lm-db-J.dump.age %s %s\n' "$((NOW - HOUR))" "$(stat -c %s "$B/lm-db-J.dump.age")" "$(sha256sum "$B/lm-db-J.dump.age" | cut -d' ' -f1)" >> "$B/verified.log"
expect "a dump without its files does not count" "$(run)" 1
expect "it is measured from the last whole pair" "$(grep -c 'stamp=I' "$T/out")" 1

reset; pair K 1; f="$B/lm-db-K.dump.age"; printf 'not an age file at all\n' > "$f"
{ grep -v 'lm-db-K' "$B/verified.log"; printf '%s lm-db-K.dump.age %s %s\n' "$((NOW - HOUR))" "$(stat -c %s "$f")" "$(sha256sum "$f" | cut -d' ' -f1)"; } > "$T/v"; cp "$T/v" "$B/verified.log"
expect "recorded file that is not age: reason" "$(run; grep -c 'status=not_age' "$T/out")" "$(printf '1\n1')"

reset
sh "$W" --root "$R" --now "$NOW" --mail-file "$T/no/such/dir/mail" >"$T/out" 2>&1; rc=$?
expect "mail fails: exit 2" "$rc" 2
expect "mail fails: incident not marked as sent" "$(cat "$R/backup-watchdog.state" 2>/dev/null)" ""
expect "mail back: the alert goes out" "$(run; mails)" "$(printf '1\n1')"

reset
sh "$W" --root "$R" --now "$NOW" >"$T/out" 2>&1; rc=$?
expect "no approved address: exit 2, nothing sent" "$rc" 2
expect "no approved address: reason logged" "$(grep -c 'mail=failed:4' "$T/out")" 1
expect "the status line carries no address" "$(grep -c '@' "$T/out")" 0

echo "$N checks, $FAILS failed"
[ "$FAILS" = "0" ]
