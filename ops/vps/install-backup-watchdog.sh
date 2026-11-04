#!/bin/sh
# Installs the backup watchdog on the VPS (owner approval 2026-11-04). Run once as root:
#   sh install-backup-watchdog.sh <owner-approved alert address>
#
# Takes no secret. Downloads one pinned commit and checks every file's sha256 before using it. Sends no
# mail: the real check runs before the address is set. Changes only: the receiver (one record line, the
# old copy kept), three new files in bin/, backups/verified.log, one cron file, one config file.
# The mail test is separate: test-backup-watchdog-mail.sh.
# --root and --cron-dir exist only to try this somewhere other than the VPS.
set -eu
umask 077
PIN=8ebb43e93408e0ac1a0ef898bc017c52833f2b5a
RAW="https://raw.githubusercontent.com/bandymuks1-stack/labourmarketai/$PIN/ops/vps"
RECEIVER_BEFORE=bf3f7031427c0642fdb433d7ef7c24f77aa26d1b54974bb7c89c25b0b435447d
RECEIVER_AFTER=2efbb369baa7df62d9a5f1143efe34fa943b6b3a928f9c0f1949088cc37a600f
WATCHDOG=eddae5d0aa5781139378c4983627a29dae50d71cf7ef68762a99ef4f527158b2
WATCHDOG_TEST=8791d602f809c25c7b6be9454892ecd8049e8d03567a6ccbe82b6356bf1a8c82
CRON=66b86ad1e4728a652530eb62fff4412aa43c51781933b1aa7524910e47a83850
# The newest pair stored before the receiver kept a record: full run 41824425911, from that run's log.
SEED_STAMP=20261104T115318Z
SEED_DB_BYTES=336902952
SEED_DB_SHA=3efd828668f9f477b2b52cecafd2aef04beec1832bdf49394c0154b28298c331
SEED_FILES_BYTES=29693192
SEED_FILES_SHA=4b0f12c9c9733cae05a44533ab3ee1c729ae99e437e9060d0266be6d4f4d42cb

ROOT=/root/lm-prod; CRON_DIR=/etc/cron.d; TO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2;;
    --cron-dir) CRON_DIR="$2"; shift 2;;
    *) TO="$1"; shift;;
  esac
done
BIN="$ROOT/bin"; BK="$ROOT/backups"; REC="$BK/verified.log"; CONF="$ROOT/backup-watchdog.conf"
stop() { echo "STOP: $1"; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

case "$TO" in ?*@?*.?*) ;; *) stop "usage: sh install-backup-watchdog.sh <owner-approved alert address>";; esac
case "$TO" in *[!A-Za-z0-9.@_+-]*) stop "the address has characters it should not have";; esac
[ -f "$BIN/lm-deploy-receive.sh" ] || stop "$BIN/lm-deploy-receive.sh is missing"
if ls "$BK"/*.part >/dev/null 2>&1; then stop "a backup is arriving right now; try again in a few minutes"; fi
now_receiver=$(sha "$BIN/lm-deploy-receive.sh")
if [ "$now_receiver" != "$RECEIVER_AFTER" ] && [ "$now_receiver" != "$RECEIVER_BEFORE" ]; then
  stop "the installed receiver is neither the expected old version nor the new one: $now_receiver"
fi

echo "1. download pinned commit $PIN"
T=$(mktemp -d "$ROOT/.wdinstall.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
get() { curl -fsS --max-time 60 -o "$T/$1" "$RAW/$1"; [ "$(sha "$T/$1")" = "$2" ] || stop "$1 does not match its pinned sha256"; echo "   $1 $2"; }
get lm-deploy-receive.sh "$RECEIVER_AFTER"
get lm-backup-watchdog.sh "$WATCHDOG"
get lm-backup-watchdog.test.sh "$WATCHDOG_TEST"
get labourmarket-backup-watchdog.cron "$CRON"

echo "2. synthetic test (temporary directory, no real backups, no mail)"
sh "$T/lm-backup-watchdog.test.sh" > "$T/test.out" 2>&1 || { tail -5 "$T/test.out"; stop "the synthetic test failed; nothing installed"; }
tail -1 "$T/test.out"

echo "3. install the files"
cp "$T/lm-backup-watchdog.sh" "$BIN/lm-backup-watchdog.sh.new"; chmod 700 "$BIN/lm-backup-watchdog.sh.new"; mv "$BIN/lm-backup-watchdog.sh.new" "$BIN/lm-backup-watchdog.sh"
cp "$T/lm-backup-watchdog.test.sh" "$BIN/lm-backup-watchdog.test.sh"; chmod 700 "$BIN/lm-backup-watchdog.test.sh"
cp "$T/labourmarket-backup-watchdog.cron" "$BIN/labourmarket-backup-watchdog.cron"; chmod 600 "$BIN/labourmarket-backup-watchdog.cron"
if [ "$now_receiver" = "$RECEIVER_BEFORE" ]; then
  mode=$(stat -c %a "$BIN/lm-deploy-receive.sh")
  [ -e "$BIN/lm-deploy-receive.sh.bak-20261104" ] || cp -p "$BIN/lm-deploy-receive.sh" "$BIN/lm-deploy-receive.sh.bak-20261104"
  cp "$T/lm-deploy-receive.sh" "$BIN/lm-deploy-receive.sh.new"; chmod "$mode" "$BIN/lm-deploy-receive.sh.new"; mv "$BIN/lm-deploy-receive.sh.new" "$BIN/lm-deploy-receive.sh"
  echo "   receiver replaced, mode $mode, old copy lm-deploy-receive.sh.bak-20261104"
else
  echo "   receiver already current"
fi

echo "4. record for the newest existing pair"
if [ -s "$REC" ]; then
  echo "   $REC already has records; not seeding"
else
  db="lm-db-$SEED_STAMP.dump.age"; files="lm-files-$SEED_STAMP.tar.age"
  [ "$(sha "$BK/$db")" = "$SEED_DB_SHA" ] || stop "$db does not match the sha256 in the run's log; not recorded"
  [ "$(sha "$BK/$files")" = "$SEED_FILES_SHA" ] || stop "$files does not match the sha256 in the run's log; not recorded"
  {
    printf '%s %s %s %s seeded-run-41824425911\n' "$(stat -c %Y "$BK/$db")" "$db" "$SEED_DB_BYTES" "$SEED_DB_SHA"
    printf '%s %s %s %s seeded-run-41824425911\n' "$(stat -c %Y "$BK/$files")" "$files" "$SEED_FILES_BYTES" "$SEED_FILES_SHA"
  } >> "$REC"
  chmod 600 "$REC"
  echo "   recorded $SEED_STAMP from the sha256 values of run 41824425911"
fi

echo "5. one real check (no address set yet, so it cannot send mail)"
[ ! -e "$CONF" ] || echo "   note: $CONF already exists; a real problem found now would send one alert"
sh "$BIN/lm-backup-watchdog.sh" --root "$ROOT" || stop "the check did not report ok; cron and address not installed"

echo "6. cron"
cp "$BIN/labourmarket-backup-watchdog.cron" "$CRON_DIR/labourmarket-backup-watchdog"; chmod 644 "$CRON_DIR/labourmarket-backup-watchdog"
[ "$(id -u)" != "0" ] || chown root:root "$CRON_DIR/labourmarket-backup-watchdog"
grep -v '^#' "$CRON_DIR/labourmarket-backup-watchdog"

echo "7. address"
printf 'ALERT_TO=%s\n' "$TO" > "$CONF"; chmod 600 "$CONF"
echo "   $CONF set, mode $(stat -c %a "$CONF")"

cat <<EOF

DONE. No mail was sent.
Next: sh test-backup-watchdog-mail.sh <address> sends the two test mails; someone must see them arrive.
Check after minute 7: tail -3 $ROOT/backup-watchdog.log; journalctl -u cron --since '2 hours ago' | grep lm-backup-watchdog
Remove: rm $CRON_DIR/labourmarket-backup-watchdog $CONF $ROOT/backup-watchdog.state $BIN/lm-backup-watchdog.sh $BIN/lm-backup-watchdog.test.sh $BIN/labourmarket-backup-watchdog.cron
Old receiver, if needed: cp -p $BIN/lm-deploy-receive.sh.bak-20261104 $BIN/lm-deploy-receive.sh
EOF
