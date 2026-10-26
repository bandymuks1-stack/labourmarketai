#!/bin/sh
# Set or change ONE variable in /root/lm-prod/env without the value ever appearing in argv, logs or chat.
# OWNER-APPROVED STEP ONLY (each change = one approval).
#   printf '%s' "$VALUE" | sh lm-env-set.sh NAME            # value on stdin (from a file, a setter, `read -s`)
#   sh lm-env-set.sh NAME --from-file /path/to/file         # first line of a 600 file; the file is shredded after
#   sh lm-env-set.sh NAME --unset                            # remove the variable
#   add --restart to recreate the container afterwards (lm-prod-run.sh <current sha>); otherwise restart later.
# Known enum variables are validated against apps/web/lib/env.ts so a typo can never take production down
# (the 2026-07-22 incident: an empty BILLING_PROVIDER failed every deploy for 19 h).
set -eu
umask 077
ENVF=/root/lm-prod/env; NAME="${1:?usage: lm-env-set.sh NAME [--from-file F|--unset] [--restart]}"; shift
case "$NAME" in *[!A-Z0-9_]*|"") echo "STOP: bad variable name"; exit 1;; esac
MODE=stdin; FILE=""; RESTART=0
while [ $# -gt 0 ]; do case "$1" in --from-file) MODE=file; FILE="$2"; shift;; --unset) MODE=unset;; --restart) RESTART=1;; *) echo "STOP: unknown option $1"; exit 1;; esac; shift; done
[ "$(stat -c %a "$ENVF")" = "600" ] || { echo "STOP: $ENVF is not 600"; exit 1; }
if [ "$MODE" = unset ]; then VALUE=""; else
  if [ "$MODE" = file ]; then [ -f "$FILE" ] || { echo "STOP: $FILE missing"; exit 1; }; VALUE=$(head -n1 "$FILE" | tr -d '\r\n'); shred -u "$FILE" 2>/dev/null || rm -f "$FILE"; else VALUE=$(cat | tr -d '\r\n'); fi
  [ -n "$VALUE" ] || { echo "STOP: empty value (use --unset to remove)"; exit 1; }
  case "$VALUE" in *"\\n"*|*'$'*) echo "STOP: value contains \\n or \$ (docker env-file takes it literally)"; exit 1;; esac
fi
enum() { case " $2 " in *" $VALUE "*) ;; *) echo "STOP: $NAME must be one of: $2"; exit 1;; esac; }
if [ "$MODE" != unset ]; then case "$NAME" in
  PAYMENTS_ENABLED|AI_GEMINI_ENABLED|AI_OPENAI_ENABLED|AI_XAI_ENABLED|AI_DEEPL_ENABLED|AI_LIBRETRANSLATE_ENABLED|AI_CLOUDFLARE_ENABLED|AI_MISTRAL_ENABLED|AI_GROQ_ENABLED|AI_LOCAL_ENABLED|OWNER_TELEGRAM_ALERTS_ENABLED|AGENTAI_OS_ALERTS_ENABLED|NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS) enum "$NAME" "true false";;
  BILLING_PROVIDER) enum "$NAME" "stripe none";;
  BILLING_TRIAL_ENABLED) enum "$NAME" "true false";;
  BILLING_PILOT_PASS_ENABLED) enum "$NAME" "true false";;
  STRIPE_MODE) enum "$NAME" "test live";;
  AI_PROVIDER_MODE) enum "$NAME" "disabled mock live";;
  AI_PROVIDER) enum "$NAME" "local anthropic openai gemini xai cloudflare mistral groq";;
  AI_GEMINI_PAID_TIER_CONFIRMED) enum "$NAME" "1";;
  AI_DAILY_RUN_BUDGET|AI_MAX_RETRIES|AI_MAX_OUTPUT_TOKENS|AI_REQUEST_TIMEOUT_MS) case "$VALUE" in *[!0-9]*) echo "STOP: $NAME must be an integer"; exit 1;; esac;;
  CONVERSATION_TOKEN_SECRET|CRON_SECRET|VOICE_TRANSCRIBE_TOKEN) [ "${#VALUE}" -ge 32 ] || { echo "STOP: $NAME must be >= 32 chars"; exit 1; };;
  STRIPE_SECRET_KEY) case "$VALUE" in sk_test_*|sk_live_*|rk_live_*) ;; *) echo "STOP: STRIPE_SECRET_KEY must start sk_test_, sk_live_ or rk_live_"; exit 1;; esac;;
  STRIPE_WEBHOOK_SECRET) case "$VALUE" in whsec_*) ;; *) echo "STOP: STRIPE_WEBHOOK_SECRET must start whsec_"; exit 1;; esac;;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) case "$VALUE" in pk_test_*|pk_live_*) ;; *) echo "STOP: the publishable key must start pk_test_ or pk_live_"; exit 1;; esac;;
  STRIPE_PRICE_COMPANY_PILOT|STRIPE_PRICE_WORKER_PLUS|STRIPE_PRICE_AGENCY_PILOT) case "$VALUE" in price_*) ;; *) echo "STOP: $NAME must be a Stripe price id (price_...)"; exit 1;; esac;;
  STRIPE_LIVE_ACTIVATION) enum "$NAME" "approved-by-owner";;
  BILLING_PILOT_ORGANIZATION_IDS) [ "$VALUE" = ALL_ORGANIZATIONS ] || printf '%s' "$VALUE" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})*$' || { echo "STOP: $NAME must be organization uuids separated by commas (or ALL_ORGANIZATIONS)"; exit 1; };;
  SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY) printf '%s' "$VALUE" | grep -qE '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' || { echo "STOP: $NAME is not a JWT"; exit 1; };;
esac; fi
BAK="$ENVF.bak-$(date -u +%Y%m%dT%H%M%SZ)"; cp -p "$ENVF" "$BAK"; chmod 600 "$BAK"
grep -v "^$NAME=" "$ENVF" > "$ENVF.new" || true
[ "$MODE" = unset ] || printf '%s=%s\n' "$NAME" "$VALUE" >> "$ENVF.new"
sort -o "$ENVF.new" "$ENVF.new"; chmod 600 "$ENVF.new"; mv "$ENVF.new" "$ENVF"
echo "$NAME: $([ "$MODE" = unset ] && echo removed || echo "set (len=${#VALUE})"); backup=$BAK; lines=$(wc -l < "$ENVF")"
ls -1t /root/lm-prod/env.bak-* 2>/dev/null | tail -n +11 | xargs -r rm -f
if [ "$RESTART" = 1 ]; then CUR=$(readlink /root/lm-prod/current | sed 's#.*/##'); sh /root/lm-prod/bin/lm-prod-run.sh "$CUR"; sleep 15; echo "health=$(docker inspect --format '{{.State.Health.Status}}' labourmarket-prod)"; else echo "not restarted: run lm-prod-run.sh <current sha> to apply"; fi
