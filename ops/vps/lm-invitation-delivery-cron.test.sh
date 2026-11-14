#!/bin/sh
# Synthetic test of lm-invitation-delivery-cron.sh: temp LM root, temp cron file, temp Agentai OS inbox and a
# stub curl, so it never touches /etc/cron.d, the app or the network. Needs jq (as the VPS host has).
# Run from anywhere: sh lm-invitation-delivery-cron.test.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
S="$HERE/lm-invitation-delivery-cron.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
R="$T/root"; mkdir -p "$R/bin" "$T/bin" "$T/inbox"
printf 'CRON_SECRET=%s\n' "$(printf 'x%.0s' $(seq 1 40))" > "$R/env"; chmod 600 "$R/env"
echo 3200 > "$R/active-port"
cp "$HERE/lm-invitation-delivery-retry.sh" "$R/bin/lm-invitation-delivery-retry.sh"
FAILS=0; N=0
check() { N=$((N + 1)); if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; FAILS=$((FAILS + 1)); fi; }

# Stub curl: /api/health -> $HEALTH; the cron route -> 401 without a header file, else 200 with an empty alert set.
cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
O=/dev/null; U=""; AUTH=0
while [ $# -gt 0 ]; do
  case "$1" in -o) O="$2"; shift 2;; -H) case "$2" in @*) AUTH=1;; esac; shift 2;; -w|--max-time|-X) shift 2;; -s) shift;; *) U="$1"; shift;; esac
done
case "$U" in
  */api/health) printf '%s' "${HEALTH:-200}";;
  *invitation-delivery-retry*) if [ "$AUTH" = 1 ]; then printf '{"ok":true,"alerts":[]}' > "$O"; printf 200; else printf '%s' "${NOAUTH:-401}"; fi;;
esac
STUB
chmod +x "$T/bin/curl"
command -v flock >/dev/null 2>&1 || { printf '#!/bin/sh\nexit 0\n' > "$T/bin/flock"; chmod +x "$T/bin/flock"; }
export PATH="$T/bin:$PATH" LM_ROOT="$R" CRON_DST="$T/cron.d-labourmarket-invitation-delivery" AGENTAI_PROJECT_EVENT_DIR="$T/inbox"
run() { sh "$S" "$@" > "$T/out" 2>&1; echo $?; }

check "status before install: not installed" '[ "$(run status)" = 0 ] && grep -q "not installed" "$T/out"'
check "dry-run passes every check and installs NOTHING" '[ "$(run --dry-run)" = 0 ] && grep -q "dry-run OK" "$T/out" && [ ! -f "$CRON_DST" ]'
check "dry-run made one read-only health call" 'grep -q "mode=health http=200" "$R/invitation-delivery.log"'
check "install writes exactly the two schedule lines" '[ "$(run install)" = 0 ] && [ "$(grep -vc "^#" "$CRON_DST")" = 3 ] && grep -q "^\*/10 \* \* \* \* root sh $R/bin/lm-invitation-delivery-retry.sh retry$" "$CRON_DST" && grep -q "^7,37 \* \* \* \* root sh $R/bin/lm-invitation-delivery-retry.sh bounces$" "$CRON_DST"'
check "the cron file is 0644 and never schedules health-only or a send-to-owner mode" '[ "$(stat -c %a "$CRON_DST")" = 644 ] && ! grep -qE "notify|batch|control" "$CRON_DST"'
check "status shows it" '[ "$(run status)" = 0 ] && grep -q "retry" "$T/out"'
check "re-install is idempotent (same content)" 'cp "$CRON_DST" "$T/before" && [ "$(run install)" = 0 ] && cmp -s "$CRON_DST" "$T/before"'
check "--remove (rollback) deletes only its own file" 'touch "$T/other-cron" && [ "$(run --remove)" = 0 ] && [ ! -f "$CRON_DST" ] && [ -f "$T/other-cron" ]'
check "--remove again is harmless" '[ "$(run --remove)" = 0 ]'

chmod 644 "$R/env"
check "STOP when env is not 0600" '[ "$(run --dry-run)" = 1 ] && grep -q "env not 600" "$T/out"'
chmod 600 "$R/env"
HEALTH=502; export HEALTH
check "STOP when the container is unhealthy" '[ "$(run install)" = 1 ] && [ ! -f "$CRON_DST" ]'
HEALTH=200; NOAUTH=404; export NOAUTH
check "STOP when the route is not deployed (404 instead of 401)" '[ "$(run install)" = 1 ] && grep -q "expected 401" "$T/out" && [ ! -f "$CRON_DST" ]'
NOAUTH=401
mv "$T/inbox" "$T/inbox.off"
check "STOP when the Agentai OS inbox is missing (alerts would not arrive)" '[ "$(run install)" = 1 ] && grep -q "inbox" "$T/out" && [ ! -f "$CRON_DST" ]'
mv "$T/inbox.off" "$T/inbox"
mv "$R/bin/lm-invitation-delivery-retry.sh" "$T/run.off"
check "STOP when the run script is not installed" '[ "$(run install)" = 1 ] && [ ! -f "$CRON_DST" ]'
check "unknown argument refused" '[ "$(run enable)" = 2 ]'
check "the secret never reaches output or logs" '! grep -rq xxxxxxxxxxxxxxxx "$T/out" "$R"/*.log 2>/dev/null'

echo "$((N - FAILS))/$N passed"
[ "$FAILS" = 0 ]
