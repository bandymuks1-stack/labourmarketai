#!/bin/sh
# Arm or disarm Stripe billing on the production VPS for the PILOT organizations only
# (owner 2026-10-21). OWNER-RUN, interactive. Every secret is read with the echo off and
# handed to lm-env-set.sh on stdin: it never appears in argv, the shell history, a log,
# chat, a file or GitHub.
#
#   sh lm-stripe-arm.sh test   # Stripe TEST keys + the pilot organization id(s)
#   sh lm-stripe-arm.sh live   # Stripe LIVE keys + the owner token + the pilot id(s)
#   sh lm-stripe-arm.sh off    # PAYMENTS_ENABLED=false (keys stay; billing reads off)
#   sh lm-stripe-arm.sh restore [FILE]  # put back the env exactly as it was before an arm/off run
#
# KEEP WHAT IS THERE (owner 2026-10-21): at every prompt, Enter keeps the value already in
# /root/lm-prod/env when it is valid for the mode being armed (secret key prefix; webhook
# secret and price only when STRIPE_MODE already equals that mode, because neither carries
# its mode in its own text). Nothing is re-typed, nothing new is created in Stripe.
#
# SNAPSHOT + RESTORE: every arm/off run first copies the whole env file to
# /root/lm-prod/env.prearm-<UTC> (600). lm-env-set.sh prunes its per-change env.bak-* to the
# newest 10, so a single run could otherwise push the pre-run state out; the prearm
# snapshot is never pruned by any script. `restore` (no FILE = the newest snapshot) saves
# the current env as env.prerestore-<UTC>, puts the snapshot back and restarts once.
#
# Billing is DENY BY DEFAULT in the app (BILLING_PILOT_ORGANIZATION_IDS): only the ids
# typed here see checkout, the order button and plan limits. The pilot is written BEFORE
# PAYMENTS_ENABLED, and the container restarts once, at the end.
#
# LIVE also needs the LIVE publishable key (pk_live_..., public by design, not a secret) in the
# GitHub repository VARIABLE NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and one redeploy BEFORE `live`:
# Next.js inlines NEXT_PUBLIC_* at build time, so a runtime value is not read.
set -eu
umask 077
BIN="$(cd "$(dirname "$0")" && pwd)"
SET="$BIN/lm-env-set.sh"
MODE="${1:?usage: lm-stripe-arm.sh test|live|off|restore [FILE]}"
[ -f "$SET" ] || { echo "STOP: $SET missing"; exit 1; }
grep -q BILLING_PILOT_ORGANIZATION_IDS "$SET" || { echo "STOP: $SET is older than the pilot validation; update it first"; exit 1; }

ENVF=/root/lm-prod/env
put() { printf '%s' "$2" | sh "$SET" "$1"; }
cur() { sed -n "s/^$1=//p" "$ENVF" | head -n1; }   # value stays in a shell variable, never printed
restart() {
  CUR=$(readlink /root/lm-prod/current | sed 's#.*/##')
  sh "$BIN/lm-prod-run.sh" "$CUR"
  sleep 20
  echo "health=$(docker inspect --format '{{.State.Health.Status}}' labourmarket-prod)"
}
[ "$(stat -c %a "$ENVF")" = "600" ] || { echo "STOP: $ENVF is not 600"; exit 1; }

if [ "$MODE" = restore ]; then
  SNAP="${2:-$(ls -1t /root/lm-prod/env.prearm-* 2>/dev/null | head -n1)}"
  [ -n "$SNAP" ] && [ -f "$SNAP" ] || { echo "STOP: no prearm snapshot to restore"; exit 1; }
  [ "$(stat -c %a "$SNAP")" = "600" ] || { echo "STOP: $SNAP is not 600"; exit 1; }
  printf 'Restore %s over %s? Type RESTORE: ' "$SNAP" "$ENVF" >&2
  IFS= read -r OK; [ "$OK" = RESTORE ] || { echo "not restored"; exit 1; }
  KEEP="/root/lm-prod/env.prerestore-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$ENVF" "$KEEP"; chmod 600 "$KEEP"
  cp -p "$SNAP" "$ENVF.new"; chmod 600 "$ENVF.new"; mv "$ENVF.new" "$ENVF"
  echo "restored $SNAP (the env before restore is in $KEEP)"
  restart
  echo "restore: done. Nothing secret was printed."
  exit 0
fi

SNAP="/root/lm-prod/env.prearm-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$ENVF" "$SNAP"; chmod 600 "$SNAP"
echo "snapshot: $SNAP (undo: sh $BIN/lm-stripe-arm.sh restore $SNAP)" >&2
OLDMODE=$(cur STRIPE_MODE)
secret() { # $1 prompt → the value on stdout; echo off while typing
  printf '%s: ' "$1" >&2; stty -echo; IFS= read -r v; stty echo; printf '\n' >&2; printf '%s' "$v"
}

case "$MODE" in
  off)
    put PAYMENTS_ENABLED false
    ;;
  test|live)
    printf 'Pilot organization id(s), comma-separated (owner-confirmed; Enter keeps the current list): ' >&2
    IFS= read -r PILOT
    [ -n "$PILOT" ] || { PILOT=$(cur BILLING_PILOT_ORGANIZATION_IDS); echo "pilot: keeping the current list" >&2; }
    case "$PILOT" in ""|ALL_ORGANIZATIONS) echo "STOP: name the pilot organization id(s); the public launch is not this script"; exit 1;; esac
    # The publishable key is baked into the build (NEXT_PUBLIC_*): a live key in the build
    # keeps test mode blocked, and live mode needs one. Check the release before arming.
    BUILD=$(readlink -f /root/lm-prod/current)
    if grep -rlq 'pk_live_' "$BUILD" 2>/dev/null; then BAKED=live; else BAKED=none-or-test; fi
    if [ "$MODE" = test ] && [ "$BAKED" = live ]; then
      echo "STOP: this release was built with a LIVE publishable key, so test mode cannot activate. Remove the GitHub variable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (or set a pk_test_ key), redeploy, then run this again."; exit 1
    fi
    if [ "$MODE" = live ] && [ "$BAKED" != live ]; then
      echo "STOP: this release has no LIVE publishable key. Set the GitHub variable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_..., redeploy, then run this again."; exit 1
    fi
    if [ "$MODE" = test ]; then PFX=sk_test_; WPFX=whsec_; else PFX=sk_live_; WPFX=whsec_; fi
    SK=$(secret "Stripe $MODE secret key ($PFX...; Enter keeps the current one)")
    if [ -z "$SK" ]; then SK=$(cur STRIPE_SECRET_KEY); KEPT_SK=1; else KEPT_SK=0; fi
    case "$SK" in "$PFX"*|rk_live_*) ;; *) echo "STOP: $([ "$KEPT_SK" = 1 ] && echo 'the current' || echo 'that') value is not a $MODE secret key"; exit 1;; esac
    [ "$MODE" = live ] || case "$SK" in rk_live_*) echo "STOP: a live key in test mode"; exit 1;; esac
    WH=$(secret "Stripe $MODE webhook signing secret ($WPFX...; Enter keeps the current one)")
    if [ -z "$WH" ]; then
      [ "$OLDMODE" = "$MODE" ] || { echo "STOP: the current webhook secret was set for STRIPE_MODE=${OLDMODE:-unset}, not $MODE; type the $MODE one"; exit 1; }
      WH=$(cur STRIPE_WEBHOOK_SECRET); KEPT_WH=1
    else KEPT_WH=0; fi
    case "$WH" in "$WPFX"*) ;; *) echo "STOP: no valid webhook signing secret ($WPFX...)"; exit 1;; esac
    printf 'Stripe %s price id of ORGANIZATION EUR 99/month (price_...; Enter keeps the current one): ' "$MODE" >&2
    IFS= read -r PRICE
    if [ -z "$PRICE" ]; then
      [ "$OLDMODE" = "$MODE" ] || { echo "STOP: the current price was set for STRIPE_MODE=${OLDMODE:-unset}, not $MODE; type the $MODE one"; exit 1; }
      PRICE=$(cur STRIPE_PRICE_COMPANY_PILOT); KEPT_PRICE=1
    else KEPT_PRICE=0; fi
    case "$PRICE" in price_*) ;; *) echo "STOP: no valid price id (price_...)"; exit 1;; esac
    # 1. the pilot first: from here on, nobody else can ever see billing
    put BILLING_PILOT_ORGANIZATION_IDS "$PILOT"
    [ "$KEPT_SK" = 1 ] && echo "STRIPE_SECRET_KEY: kept" || put STRIPE_SECRET_KEY "$SK"
    [ "$KEPT_WH" = 1 ] && echo "STRIPE_WEBHOOK_SECRET: kept" || put STRIPE_WEBHOOK_SECRET "$WH"
    [ "$KEPT_PRICE" = 1 ] && echo "STRIPE_PRICE_COMPANY_PILOT: kept" || put STRIPE_PRICE_COMPANY_PILOT "$PRICE"
    SK=""; WH=""
    put BILLING_PROVIDER stripe
    # Owner 2026-10-21: the first paying customer pays from day one (no automatic
    # 14-day trial); test mirrors it so the charge, refund and cancellation are real.
    put BILLING_TRIAL_ENABLED false
    put STRIPE_MODE "$MODE"
    if [ "$MODE" = live ]; then
      put STRIPE_LIVE_ACTIVATION approved-by-owner
    else
      grep -q '^STRIPE_LIVE_ACTIVATION=' "$ENVF" && sh "$SET" STRIPE_LIVE_ACTIVATION --unset || true
    fi
    put PAYMENTS_ENABLED true
    ;;
  *) echo "STOP: usage: lm-stripe-arm.sh test|live|off|restore [FILE]"; exit 1;;
esac

restart
echo "billing $MODE: done. Nothing secret was printed. Tell the agent: 'Stripe $MODE armed'."
