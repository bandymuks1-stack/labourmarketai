#!/usr/bin/env bash
# ISOLATED Android need journey for .github/workflows/android-need-isolated.yml.
# Runs INSIDE reactivecircus/android-emulator-runner, on a runner whose only
# backend is the job's own LOCAL Supabase + web app (reached from the emulator
# as 10.0.2.2). Usage: android-emulator-need-isolated.sh <apk>
#
# Signs in as the job's seeded QA-SYNTHETIC company, searches jobs, has an
# empty need refused, then drafts, confirms and sends ONE need (NEED_SUBMIT=1).
# The stored row is checked by the next workflow step, in the local database.
# Nothing from the session is written to disk or uploaded.
set -euo pipefail

APK="$1"
PKG="ai.labourmarket.app"
: "${MOBILE_QA_EMAIL:?seed address missing}"
: "${MOBILE_QA_PASSWORD:?seed password missing}"

wipe() { adb shell pm clear "$PKG" >/dev/null 2>&1 || true; }
trap wipe EXIT

adb wait-for-device
adb install -r "$APK"
echo "ANDROID_APK_INSTALLED"
# The flow starts on the sign-in form: open the app from its launcher entry.
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null

maestro test \
  -e MOBILE_QA_EMAIL="$MOBILE_QA_EMAIL" \
  -e MOBILE_QA_PASSWORD="$MOBILE_QA_PASSWORD" \
  -e NEED_SUBMIT=1 \
  apps/mobile/.maestro/jobs-need-journey.yaml
echo "ANDROID_NEED_JOURNEY_ON_DEVICE: jobs search loaded; empty need refused; need drafted, confirmed, sent"
