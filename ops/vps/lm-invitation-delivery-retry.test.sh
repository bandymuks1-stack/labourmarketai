#!/bin/sh
# Synthetic test of lm-invitation-delivery-retry.sh: a stub curl answers from this file, so it never
# reaches the network, the app or a mailbox. Run from anywhere: sh lm-invitation-delivery-retry.test.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
S="$HERE/lm-invitation-delivery-retry.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
R="$T/root"; mkdir -p "$R" "$T/bin"
printf 'CRON_SECRET=%s\n' "$(printf 'x%.0s' $(seq 1 40))" > "$R/env"; chmod 600 "$R/env"
echo 3200 > "$R/active-port"
FAILS=0; N=0
check() { N=$((N + 1)); if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; FAILS=$((FAILS + 1)); fi; }

# Stub curl: writes the body for ?mode=…, records every call; ALERTS / CODE drive the answers.
cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
O=""; U=""
while [ $# -gt 0 ]; do
  case "$1" in -o) O="$2"; shift 2;; -w|--max-time|-X|-H) shift 2;; -s) shift;; *) U="$1"; shift;; esac
done
mode=${U##*mode=}
echo "$mode" >> "$CALLS"
case "$mode" in
  notify) printf '{"ok":true,"mode":"notify","alerts":[%s],"delivered":["telegram"]}' "$ALERTS" > "$O"; printf 200;;
  *) printf '{"ok":true,"mode":"%s","sent":0,"alerts":[%s]}' "$mode" "$ALERTS" > "$O"; printf '%s' "${CODE:-200}";;
esac
STUB
chmod +x "$T/bin/curl"
# flock may be missing on dev machines: a stub that always grants the lock.
command -v flock >/dev/null 2>&1 || { printf '#!/bin/sh\nexit 0\n' > "$T/bin/flock"; chmod +x "$T/bin/flock"; }
export PATH="$T/bin:$PATH" LM_ROOT="$R" CALLS="$T/calls"
run() { : > "$CALLS"; sh "$S" "$@" >/dev/null 2>&1; echo $?; }

ALERTS='' ; export ALERTS
check "healthy run: exit 0, no notify, no alert line" '[ "$(run retry)" = 0 ] && ! grep -q notify "$CALLS" && [ ! -s "$R/invitation-delivery-alerts.log" ]'
check "log line carries counts only" 'grep -q "mode=retry http=200" "$R/invitation-delivery.log"'

ALERTS='"repeated_failures"'
check "new alert set: owner notified once" '[ "$(run retry)" = 0 ] && [ "$(grep -c notify "$CALLS")" = 1 ]'
check "state remembers the notified set" 'grep -q repeated_failures "$R/.invitation-delivery-alert-state"'
check "same set again within 6 h: NOT notified again" '[ "$(run retry)" = 0 ] && ! grep -q notify "$CALLS"'
check "but every run still writes an ALERT line" '[ "$(grep -c ALERT "$R/invitation-delivery-alerts.log")" = 2 ]'

printf '%s\n%s\n' "repeated_failures" "$(( $(date -u +%s) - 21601 ))" > "$R/.invitation-delivery-alert-state"
check "same set older than 6 h: notified again" '[ "$(run retry)" = 0 ] && grep -q notify "$CALLS"'

ALERTS='"repeated_failures","configuration_failure"'
check "changed set: notified at once" '[ "$(run retry)" = 0 ] && grep -q notify "$CALLS"'

ALERTS=''
check "all clear: state forgotten, CLEAR logged" '[ "$(run retry)" = 0 ] && [ ! -f "$R/.invitation-delivery-alert-state" ] && grep -q CLEAR "$R/invitation-delivery-alerts.log"'

CODE=503; export CODE
check "a failing route: exit non-zero AND the owner is notified (http_503)" '[ "$(run retry)" != 0 ] && grep -q notify "$CALLS" && grep -q "http_503" "$R/invitation-delivery-alerts.log"'
CODE=200

check "bounces run asks health for the current alert set" '[ "$(run bounces)" = 0 ] && grep -q "^bounces$" "$CALLS" && grep -q "^health$" "$CALLS"'
check "unknown mode refused" '[ "$(run batch)" = 2 ]'
check "the secret never reaches the logs" '! grep -q xxxxxxxxxxxxxxxx "$R"/*.log'
check "no temp dir left behind" '[ -z "$(ls -d "$R"/.delivery.* 2>/dev/null)" ]'

echo "$((N - FAILS))/$N passed"
[ "$FAILS" = 0 ]
