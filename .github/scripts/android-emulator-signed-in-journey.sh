#!/usr/bin/env bash
# Android SIGNED-IN runtime proof for .github/workflows/android.yml (job
# `signed-in`, workflow_dispatch only, GitHub environment `production-qa`).
#
# Runs INSIDE reactivecircus/android-emulator-runner. Usage:
#   android-emulator-signed-in-journey.sh <apk> <build-config-mode>
#
# Refuses, loudly and before touching the emulator, when:
#   - the review identity is not configured (MOBILE_QA_EMAIL / MOBILE_QA_PASSWORD
#     empty — the owner has not created the production-qa secrets yet);
#   - the APK was built with PLACEHOLDER config (it cannot sign anyone in).
#
# No screenshot, no logcat and no Maestro debug output leave the runner: the
# repository is public and the screens belong to a signed-in session. The only
# outputs are the claim token and the step summary. The session is wiped from
# the emulator at the end (pm clear), whatever the outcome.
set -euo pipefail

APK="$1"
MODE="${2:-}"
PKG="ai.labourmarket.app"
FLOW="apps/mobile/.maestro/signed-in-journey.yaml"

summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$1" >> "$GITHUB_STEP_SUMMARY" || true; }

if [ -z "${MOBILE_QA_EMAIL:-}" ] || [ -z "${MOBILE_QA_PASSWORD:-}" ]; then
  echo "::error::MOBILE_QA_EMAIL / MOBILE_QA_PASSWORD are not set in the production-qa environment — the signed-in journey cannot run (owner gate O1, docs/mobile/MOBILE_COMPLETION_AND_RELEASE_READINESS_2026-10-16.md)"
  summary "- ANDROID_SIGNED_IN_JOURNEY_PROVEN: **NOT RUN** — review identity not configured"
  exit 1
fi
case "$MODE" in
  *PLACEHOLDER*) echo "::error::the APK was built with placeholder config (vars.PROD_QA_ANON_KEY missing) and cannot sign in"; exit 1 ;;
esac

wipe() { adb shell pm clear "$PKG" >/dev/null 2>&1 || true; }
trap wipe EXIT

summary "## Android signed-in journey (API 34, x86_64, production-qa)"

adb wait-for-device
adb install -r "$APK"
echo "ANDROID_APK_INSTALLED"

# No --debug-output: nothing from a signed-in session is written to disk.
maestro test \
  -e MOBILE_QA_EMAIL="$MOBILE_QA_EMAIL" \
  -e MOBILE_QA_PASSWORD="$MOBILE_QA_PASSWORD" \
  "$FLOW"

# The beta screens: jobs search → loaded board → open a job; an empty need is refused.
# The need SUBMIT runs only with NEED_SUBMIT=1 (isolated runs): cross-org readers are not
# yet proven to exclude synthetic needs, so production writes no need.
maestro test \
  -e MOBILE_QA_EMAIL="$MOBILE_QA_EMAIL" \
  -e MOBILE_QA_PASSWORD="$MOBILE_QA_PASSWORD" \
  -e NEED_SUBMIT="${NEED_SUBMIT:-0}" \
  apps/mobile/.maestro/jobs-need-journey.yaml
if [ "${NEED_SUBMIT:-0}" = "1" ]; then
  echo "ANDROID_JOBS_NEED_JOURNEY_PROVEN: jobs.search loaded; job opened; empty need refused; need drafted, confirmed, sent"
  summary "- ANDROID_JOBS_NEED_JOURNEY_PROVEN: jobs search (read) → job opened → empty need refused → need draft + confirm (write)"
else
  echo "ANDROID_JOBS_READ_JOURNEY_PROVEN: jobs.search loaded; job opened; empty need refused (no need written)"
  summary "- ANDROID_JOBS_READ_JOURNEY_PROVEN: jobs search (read) → job opened → empty need refused; need submit NOT run (NEED_SUBMIT=0)"
fi

echo "ANDROID_SIGNED_IN_JOURNEY_PROVEN: sign-in, Today figures read, journal entry drafted and confirmed, profile skills read, sign-out"
summary "- ANDROID_SIGNED_IN_JOURNEY_PROVEN: sign-in → Today figures (read) → journal draft + confirm (write) → profile skills (read) → sign-out"
