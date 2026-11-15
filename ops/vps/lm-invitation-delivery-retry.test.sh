#!/bin/sh
# Synthetic test of lm-invitation-delivery-retry.sh: a stub curl answers from this file, so it never
# reaches the network, the app, a mailbox or Telegram. The Agentai OS inbox is a temp directory.
# Run from anywhere: sh lm-invitation-delivery-retry.test.sh   (needs jq, as the VPS host has)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
S="$HERE/lm-invitation-delivery-retry.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
R="$T/root"; IN="$T/inbox"; mkdir -p "$R" "$T/bin" "$IN"
printf 'CRON_SECRET=%s\n' "$(printf 'x%.0s' $(seq 1 40))" > "$R/env"; chmod 600 "$R/env"
echo 3200 > "$R/active-port"
FAILS=0; N=0
check() { N=$((N + 1)); if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; FAILS=$((FAILS + 1)); fi; }

# Stub curl: body for ?mode=…; ALERTS / DL / BO / CODE drive the answers; every call recorded.
cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
O=""; U=""
while [ $# -gt 0 ]; do
  case "$1" in -o) O="$2"; shift 2;; -w|--max-time|-X|-H) shift 2;; -s) shift;; *) U="$1"; shift;; esac
done
mode=${U##*mode=}
echo "$mode" >> "$CALLS"
printf '{"ok":true,"mode":"%s","sent":0,"health":{"dead_letter":%s,"bounced":%s,"unknown_outcome_open":0,"failed_last_hour":0},"alerts":[%s]}' \
  "$mode" "${DL:-0}" "${BO:-0}" "$ALERTS" > "$O"
if [ "$mode" = health ]; then printf '%s' "${HCODE:-200}"; else printf '%s' "${CODE:-200}"; fi
STUB
chmod +x "$T/bin/curl"
command -v flock >/dev/null 2>&1 || { printf '#!/bin/sh\nexit 0\n' > "$T/bin/flock"; chmod +x "$T/bin/flock"; }
export PATH="$T/bin:$PATH" LM_ROOT="$R" CALLS="$T/calls" AGENTAI_PROJECT_EVENT_DIR="$IN"
run() { : > "$CALLS"; sh "$S" "$@" >/dev/null 2>&1; echo $?; }
events() { ls "$IN"/*.json 2>/dev/null | wc -l | tr -d ' '; }
last() { ls "$IN"/*.json | sort | tail -1; }

ALERTS=''; DL=0; BO=0; export ALERTS DL BO
check "healthy run: exit 0, no event, no alert line" '[ "$(run retry)" = 0 ] && [ "$(events)" = 0 ] && [ ! -s "$R/invitation-delivery-alerts.log" ]'
check "log line carries counts only" 'grep -q "mode=retry http=200" "$R/invitation-delivery.log"'
check "never calls a notify / send-to-owner mode" '! grep -q notify "$CALLS"'

ALERTS='"repeated_failures"'
check "new alert: exactly one Agentai OS project event" '[ "$(run retry)" = 0 ] && [ "$(events)" = 1 ]'
check "the event is a valid agentai-project-event/v1 (high-signal, flat strings)" \
  'jq -e ".schemaVersion == \"agentai-project-event/v1\" and .project == \"labourmarketai\" and .eventType == \"OWNER_DECISION_REQUIRED\" and .status == \"FAILED\" and (.summary | length) <= 220 and ([.[] | type] | all(. == \"string\"))" "$(last)" >/dev/null'
check "the event file is readable by the ingesting container (0644), no temp left" \
  '[ "$(stat -c %a "$(last)")" = 644 ] && [ -z "$(ls -A "$IN" | grep tmp)" ]'
check "same alert again: NO second event" '[ "$(run retry)" = 0 ] && [ "$(events)" = 1 ]'
check "every run still writes an ALERT line" '[ "$(grep -c " ALERT " "$R/invitation-delivery-alerts.log")" = 2 ]'

ALERTS='"repeated_failures","configuration_failure"'
check "a different alert opens: one more event, naming only the new one" \
  '[ "$(run retry)" = 0 ] && [ "$(events)" = 2 ] && jq -e ".summary | test(\"configuration_failure\") and (test(\"repeated_failures\") | not)" "$(last)" >/dev/null'

ALERTS='"dead_letter_present"'; DL=1
check "a dead letter: event" '[ "$(run retry)" = 0 ] && [ "$(events)" = 3 ] && grep -q "^dead_letter_present 1$" "$R/.invitation-delivery-events"'
check "closed episodes are forgotten (CLEAR logged)" 'grep -q "CLEAR \[repeated_failures,configuration_failure\]" "$R/invitation-delivery-alerts.log"'
check "same dead-letter count: no event" '[ "$(run retry)" = 0 ] && [ "$(events)" = 3 ]'
DL=2
check "a SECOND dead letter is a new unique event" '[ "$(run retry)" = 0 ] && [ "$(events)" = 4 ] && jq -e ".summary | test(\"dead_letter_present=2\")" "$(last)" >/dev/null'
DL=1
check "a falling count is not an event, ledger keeps the high-water mark" '[ "$(run retry)" = 0 ] && [ "$(events)" = 4 ] && grep -q "^dead_letter_present 2$" "$R/.invitation-delivery-events"'

ALERTS=''; DL=0
check "all clear: ledger empty, CLEAR logged" '[ "$(run retry)" = 0 ] && [ ! -s "$R/.invitation-delivery-events" ]'
ALERTS='"repeated_failures"'
check "recurrence after clearing is notified again" '[ "$(run retry)" = 0 ] && [ "$(events)" = 5 ]'

ALERTS=''; CODE=503; export CODE
check "a failing route: exit non-zero AND one event (http_503)" '[ "$(run retry)" != 0 ] && [ "$(events)" = 6 ] && jq -e ".summary | test(\"http_503\")" "$(last)" >/dev/null'
check "still failing: no repeat" '[ "$(run retry)" != 0 ] && [ "$(events)" = 6 ]'
CODE=200

mv "$IN" "$IN.off"; ALERTS='"bounced"'; BO=1
check "inbox missing: NOTIFY_FAILED logged, nothing marked notified" \
  '[ "$(run retry)" = 0 ] && grep -q NOTIFY_FAILED "$R/invitation-delivery-alerts.log" && ! grep -q "^bounced" "$R/.invitation-delivery-events"'
mv "$IN.off" "$IN"
check "inbox back: the pending event is delivered on the next run" '[ "$(run retry)" = 0 ] && [ "$(events)" = 7 ]'

ALERTS=''; BO=0
check "bounces run asks health for the current alert set" '[ "$(run bounces)" = 0 ] && grep -q "^bounces$" "$CALLS" && grep -q "^health$" "$CALLS"'
check "unknown mode refused" '[ "$(run batch)" = 2 ]'
check "the secret never reaches logs or events" '! grep -rq xxxxxxxxxxxxxxxx "$R"/*.log "$IN"'
check "no address or @ in any event" '! grep -rq "@" "$IN"/*.json'
check "no temp dir left behind" '[ -z "$(ls -d "$R"/.delivery.* 2>/dev/null)" ]'

echo "$((N - FAILS))/$N passed"
[ "$FAILS" = 0 ]
