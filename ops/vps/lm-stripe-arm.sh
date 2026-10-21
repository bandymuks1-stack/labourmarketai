#!/bin/sh
# Arm or disarm Stripe billing on the production VPS for the PILOT organizations only
# (owner 2026-10-21). OWNER-RUN, interactive. Every secret is read with the echo off and
# handed to lm-env-set.sh on stdin: it never appears in argv, the shell history, a log,
# chat, a file or GitHub.
#
#   sh lm-stripe-arm.sh test   # Stripe TEST keys + the pilot organization id(s)
#   sh lm-stripe-arm.sh live   # Stripe LIVE keys + the owner token + the pilot id(s)
#   sh lm-stripe-arm.sh off    # PAYMENTS_ENABLED=false (keys stay; billing reads off)
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
MODE="${1:?usage: lm-stripe-arm.sh test|live|off}"
[ -f "$SET" ] || { echo "STOP: $SET missing"; exit 1; }
grep -q BILLING_PILOT_ORGANIZATION_IDS "$SET" || { echo "STOP: $SET is older than the pilot validation; update it first"; exit 1; }

put() { printf '%s' "$2" | sh "$SET" "$1"; }
secret() { # $1 prompt → the value on stdout; echo off while typing
  printf '%s: ' "$1" >&2; stty -echo; IFS= read -r v; stty echo; printf '\n' >&2; printf '%s' "$v"
}

case "$MODE" in
  off)
    put PAYMENTS_ENABLED false
    ;;
  test|live)
    printf 'Pilot organization id(s), comma-separated (owner-confirmed): ' >&2
    IFS= read -r PILOT
    case "$PILOT" in ""|ALL_ORGANIZATIONS) echo "STOP: name the pilot organization id(s); the public launch is not this script"; exit 1;; esac
    if [ "$MODE" = test ]; then PFX=sk_test_; WPFX=whsec_; else PFX=sk_live_; WPFX=whsec_; fi
    SK=$(secret "Stripe $MODE secret key ($PFX...)")
    case "$SK" in "$PFX"*|rk_live_*) ;; *) echo "STOP: not a $MODE secret key"; exit 1;; esac
    [ "$MODE" = live ] || case "$SK" in rk_live_*) echo "STOP: a live key in test mode"; exit 1;; esac
    WH=$(secret "Stripe $MODE webhook signing secret ($WPFX...)")
    printf 'Stripe %s price id of ORGANIZATION EUR 99/month (price_...): ' "$MODE" >&2
    IFS= read -r PRICE
    # 1. the pilot first: from here on, nobody else can ever see billing
    put BILLING_PILOT_ORGANIZATION_IDS "$PILOT"
    put STRIPE_SECRET_KEY "$SK"
    put STRIPE_WEBHOOK_SECRET "$WH"
    put STRIPE_PRICE_COMPANY_PILOT "$PRICE"
    SK=""; WH=""
    put BILLING_PROVIDER stripe
    put STRIPE_MODE "$MODE"
    if [ "$MODE" = live ]; then
      put STRIPE_LIVE_ACTIVATION approved-by-owner
    else
      grep -q '^STRIPE_LIVE_ACTIVATION=' /root/lm-prod/env && sh "$SET" STRIPE_LIVE_ACTIVATION --unset || true
    fi
    put PAYMENTS_ENABLED true
    ;;
  *) echo "STOP: usage: lm-stripe-arm.sh test|live|off"; exit 1;;
esac

CUR=$(readlink /root/lm-prod/current | sed 's#.*/##')
sh "$BIN/lm-prod-run.sh" "$CUR"
sleep 20
echo "health=$(docker inspect --format '{{.State.Health.Status}}' labourmarket-prod)"
echo "billing $MODE: done. Nothing secret was printed. Tell the agent: 'Stripe $MODE armed'."
