#!/bin/sh
# Installs variant B on the VPS: users lmwatch and lmseo, the watchdog and SEO watch as systemd timers, group read
# on the encrypted backups, and the receiver's group-read lines. Run once as root, only after the owner's separate
# approval of the install:
#   sh install-backup-watchdog.sh <owner-approved alert address>
#
# It stops until the pins below are filled in by a separate reviewed PR (merging this file changes nothing live;
# nothing on the VPS updates itself from this repository).
#
# Takes no secret. Before this runs, the owner creates /var/lib/lm-watch and /var/lib/lm-seo (root, 700) and puts the
# alerts-only credential (LM_SMTP_* lines, never the main mailbox's) in env in each. This hands them to their service users.
# The mail test is separate: test-backup-watchdog-mail.sh. The first check may send one mail: see step 8.
# Removal: VPS_PRODUCTION_RUNBOOK section 9.1.0b.
set -eu
umask 077
PIN=UNSET
RECEIVER_BEFORE=UNSET
RECEIVER_AFTER=UNSET
WATCHDOG=UNSET
WATCHDOG_TEST=UNSET
SEO=UNSET
WATCHDOG_UNIT=UNSET
WATCHDOG_TIMER=UNSET
SEO_UNIT=UNSET
SEO_TIMER=UNSET

stop() { echo "STOP: $1"; exit 1; }
TO="${1:-}"
[ "$PIN" != "UNSET" ] || stop "not pinned: installing needs the owner's separate approval and a reviewed PR that sets the pins"
[ "$(id -u)" = "0" ] || stop "run as root"
case "$TO" in ?*@?*.?*) ;; *) stop "usage: sh install-backup-watchdog.sh <owner-approved alert address>";; esac
case "$TO" in *[!A-Za-z0-9.@_+-]*) stop "the address has characters it should not have";; esac
systemctl --version >/dev/null 2>&1 || stop "this host has no systemd"

D=/root/lm-prod; BIN="$D/bin"; BK="$D/backups"; REC="$BK/verified.log"; OPT=/opt/lm-watch
RAW="https://raw.githubusercontent.com/bandymuks1-stack/labourmarketai/$PIN/ops/vps"
sha() { sha256sum "$1" | cut -d' ' -f1; }
[ ! -L "$BK" ] && [ -d "$BK" ] || stop "$BK is not a plain folder"
for d in /var/lib/lm-watch /var/lib/lm-seo; do [ -s "$d/env" ] || stop "$d/env is missing: the owner puts the alerts-only credential there first"; done
if ls "$BK"/*.part >/dev/null 2>&1; then stop "a backup is arriving right now; try again in a few minutes"; fi
now_receiver=$(sha "$BIN/lm-deploy-receive.sh")
[ "$now_receiver" = "$RECEIVER_AFTER" ] || [ "$now_receiver" = "$RECEIVER_BEFORE" ] || stop "the installed receiver is neither the expected old version nor the new one"

echo "1. download pinned commit $PIN"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
get() { curl -fsS --max-time 60 -o "$T/$1" "$RAW/$1"; [ "$(sha "$T/$1")" = "$2" ] || stop "$1 does not match its pinned sha256"; echo "   $1 ok"; }
get lm-deploy-receive.sh "$RECEIVER_AFTER"
get lm-backup-watchdog.sh "$WATCHDOG"
get lm-backup-watchdog.test.sh "$WATCHDOG_TEST"
get lm-seo-watch.sh "$SEO"
get lm-backup-watchdog.service "$WATCHDOG_UNIT"
get lm-backup-watchdog.timer "$WATCHDOG_TIMER"
get lm-seo-watch.service "$SEO_UNIT"
get lm-seo-watch.timer "$SEO_TIMER"

echo "2. users with no login and no other group"
getent group lmwatch >/dev/null || groupadd -r lmwatch
id lmwatch >/dev/null 2>&1 || useradd -r -g lmwatch -G "" -d /nonexistent -M -s /usr/sbin/nologin lmwatch
getent group lmseo >/dev/null || groupadd -r lmseo
id lmseo >/dev/null 2>&1 || useradd -r -g lmseo -G "" -d /nonexistent -M -s /usr/sbin/nologin lmseo
[ "$(id -nG lmwatch)" = "lmwatch" ] && [ "$(id -nG lmseo)" = "lmseo" ] || stop "a service user is in another group"

echo "3. scripts and units, after the synthetic test as the new user"
install -d -m 755 -o root -g root "$T.test"
cp "$T/lm-backup-watchdog.sh" "$T/lm-backup-watchdog.test.sh" "$T.test/"; chmod 755 "$T.test"/*
runuser -u lmwatch -- sh "$T.test/lm-backup-watchdog.test.sh" > "$T/test.out" 2>&1 || { tail -5 "$T/test.out"; rm -rf "$T.test"; stop "the synthetic test failed; nothing installed"; }
tail -1 "$T/test.out"; rm -rf "$T.test"
install -d -m 755 -o root -g root "$OPT"
for f in lm-backup-watchdog.sh lm-backup-watchdog.test.sh lm-seo-watch.sh; do install -m 755 -o root -g root "$T/$f" "$OPT/$f"; done
for f in lm-backup-watchdog.service lm-backup-watchdog.timer lm-seo-watch.service lm-seo-watch.timer; do install -m 644 -o root -g root "$T/$f" "/etc/systemd/system/$f"; done
install -d -m 700 -o lmwatch -g lmwatch /var/lib/lm-watch /var/lib/lm-watch/backups
install -d -m 700 -o lmseo -g lmseo /var/lib/lm-seo
chown lmwatch:lmwatch /var/lib/lm-watch/env; chmod 600 /var/lib/lm-watch/env
chown lmseo:lmseo /var/lib/lm-seo/env; chmod 600 /var/lib/lm-seo/env

echo "4. receiver, old copy kept"
if [ "$now_receiver" = "$RECEIVER_BEFORE" ]; then
  mode=$(stat -c %a "$BIN/lm-deploy-receive.sh")
  [ -e "$BIN/lm-deploy-receive.sh.bak-variant-b" ] || cp -p "$BIN/lm-deploy-receive.sh" "$BIN/lm-deploy-receive.sh.bak-variant-b"
  cp "$T/lm-deploy-receive.sh" "$BIN/lm-deploy-receive.sh.new"; chmod "$mode" "$BIN/lm-deploy-receive.sh.new"; mv "$BIN/lm-deploy-receive.sh.new" "$BIN/lm-deploy-receive.sh"
fi

echo "5. group read: the folder, the backup files and the record only; never a link, no recursion"
chgrp -h lmwatch "$BK"; chmod u=rwx,g=rx,o=,g-s "$BK"
find "$BK" -maxdepth 1 -type f \( -name 'lm-db-*.dump.age' -o -name 'lm-files-*.tar.age' -o -name verified.log \) -exec chgrp -h lmwatch {} + -exec chmod 640 {} +

echo "6. the network rule on this host: what answers on a private address from here must be refused inside both units"
# Containers on their internal ports, and this host's private addresses on the ports open on them.
private_targets() {
  priv='^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)'
  if command -v docker >/dev/null 2>&1; then
    for c in $(docker ps -q 2>/dev/null); do
      ports=$(docker inspect -f '{{range $p, $_ := .Config.ExposedPorts}}{{$p}} {{end}}' "$c" 2>/dev/null | sed 's#/[a-z]*##g')
      for a in $(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$c" 2>/dev/null); do
        for p in $ports; do echo "$a:$p"; done
      done
    done
  fi
  addrs=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | grep -E "$priv" || true)
  ss -ltnH 2>/dev/null | awk '{print $4}' | while read -r l; do
    a=${l%:*}; p=${l##*:}
    case "$a" in
      0.0.0.0|\*) for h in $addrs; do echo "$h:$p"; done;;
      *) if printf '%s\n' "$a" | grep -qE "$priv"; then echo "$a:$p"; fi;;
    esac
  done
}
answering=""
for t in $(private_targets | sort -u | head -n 12); do
  rc=0; curl -s --max-time 3 -o /dev/null "http://$t/" || rc=$?
  case "$rc" in 6|7|28) ;; *) answering="$answering $t";; esac
done
[ -n "$answering" ] || stop "nothing answers on a private address here, so the network rule can't be proven; timers not started"
cat > "$OPT/lm-net-check.sh" <<'CHECK'
#!/bin/sh
out=$1; shift
for t in "$@"; do
  rc=0; curl -s --max-time 4 -o /dev/null "http://$t/" || rc=$?
  case "$rc" in 6|7|28) echo refused;; *) echo reached;; esac
done > "$out"
if getent hosts github.com >/dev/null; then echo dns-works >> "$out"; fi
if curl -s --max-time 15 -o /dev/null https://api.github.com/zen; then echo tls-works >> "$out"; fi
CHECK
chmod 755 "$OPT/lm-net-check.sh"
prove_network() { # service, its folder
  mkdir -p "/etc/systemd/system/$1.d"
  printf '[Service]\nExecStart=\nExecStart=/bin/sh %s/lm-net-check.sh %s/net-check.out%s\n' "$OPT" "$2" "$answering" > "/etc/systemd/system/$1.d/net-check.conf"
  systemctl daemon-reload
  systemctl start "$1" || true
  rm -f "/etc/systemd/system/$1.d/net-check.conf"; rmdir "/etc/systemd/system/$1.d" 2>/dev/null || true
  systemctl daemon-reload
  r=$(cat "$2/net-check.out" 2>/dev/null || true); rm -f "$2/net-check.out"
  refused=$(printf '%s\n' "$r" | grep -c '^refused$' || true)
  reached=$(printf '%s\n' "$r" | grep -c '^reached$' || true)
  [ "$reached" = 0 ] && [ "$refused" -gt 0 ] || stop "$1: private addresses are not refused inside the unit ($refused refused, $reached reached), so IPAddressDeny isn't enforced here; timers not started"
  case "$r" in *dns-works*tls-works*) ;; *) stop "$1: DNS or TLS doesn't work inside the unit; timers not started";; esac
  echo "   $1: $refused private addresses refused, DNS and TLS work"
}
prove_network lm-backup-watchdog.service /var/lib/lm-watch
prove_network lm-seo-watch.service /var/lib/lm-seo
rm -f "$OPT/lm-net-check.sh"

echo "7. address"
printf 'ALERT_TO=%s\n' "$TO" > /var/lib/lm-watch/backup-watchdog.conf; chown lmwatch:lmwatch /var/lib/lm-watch/backup-watchdog.conf; chmod 600 /var/lib/lm-watch/backup-watchdog.conf
printf 'ALERT_TO=%s\n' "$TO" > /var/lib/lm-seo/backup-watchdog.conf; chown lmseo:lmseo /var/lib/lm-seo/backup-watchdog.conf; chmod 600 /var/lib/lm-seo/backup-watchdog.conf

echo "8. the real check through its unit: it must say ok or no_record before any timer starts"
since=$(date '+%F %T')
systemctl start lm-backup-watchdog.service || true
journalctl --sync 2>/dev/null || true
line=$(journalctl -u lm-backup-watchdog.service --since "$since" -o cat --no-pager | grep ' status=' | tail -n 1 || true)
case "$line" in
  *" status=ok "*) echo "   status=ok";;
  *" status=no_record "*)
    echo "   status=no_record. This is expected, not a fault: the receiver that was live until step 4 kept no record,"
    echo "   so nothing is verified until the first backup through the new one. It stays no_record until a whole pair"
    echo "   has arrived. Expect one alert mail now and one recovery mail then.";;
  *) stop "the check reported neither ok nor no_record; timers not started";;
esac
case "$line" in *" mail=failed"*) echo "   The alert could not be handed to the mail server. Fix that before relying on this: the mail test below shows it.";; esac

echo "9. timers"
systemctl enable --now lm-backup-watchdog.timer lm-seo-watch.timer
systemctl list-timers 'lm-*' --no-pager

cat <<EOF

DONE. Next: runuser -u lmwatch -- sh test-backup-watchdog-mail.sh <address> sends the two test mails; someone must see them arrive.
EOF
