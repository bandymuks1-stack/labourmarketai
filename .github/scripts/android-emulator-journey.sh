#!/usr/bin/env bash
# Android emulator runtime proof for .github/workflows/android.yml.
#
# Runs INSIDE reactivecircus/android-emulator-runner (whose `script:` executes
# each line separately with `sh -c`, hence one script file instead of inline
# multi-line shell). Usage:
#   android-emulator-journey.sh <apk> <evidence-dir>
#
# Stages (each prints its claim token only once it is actually proven):
#   1. install the APK                  -> ANDROID_APK_INSTALLED
#   2. launch, alive 15s later          -> ANDROID_EMU_LAUNCH_PROVEN
#   3. Maestro auth-failure journey     -> ANDROID_RUNTIME_JOURNEY_PROVEN
set -euo pipefail

APK="$1"
OUT="$2"
PKG="ai.labourmarket.app"
mkdir -p "$OUT"

summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$1" >> "$GITHUB_STEP_SUMMARY" || true; }

dump_evidence() {
  adb exec-out screencap -p > "$OUT/99-final-screen.png" 2>/dev/null || true
  adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
}
trap dump_evidence EXIT

summary "## Android emulator journey (API 34, x86_64)"

adb wait-for-device
adb shell getprop ro.build.version.release
adb install -r "$APK"
echo "ANDROID_APK_INSTALLED"
summary "- ANDROID_APK_INSTALLED: \`$(basename "$APK")\`"

adb logcat -c || true
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 15
PID=$(adb shell pidof "$PKG" || true)
if [ -z "$PID" ]; then
  echo "app not running 15s after launch — startup crash"
  adb logcat -d -b crash > "$OUT/logcat-crash.txt" || true
  summary "- ANDROID_EMU_LAUNCH_PROVEN: **FAILED** (process not alive after 15s)"
  exit 1
fi
adb exec-out screencap -p > "$OUT/00-post-launch.png"
echo "ANDROID_EMU_LAUNCH_PROVEN: pid $PID alive after 15s"
summary "- ANDROID_EMU_LAUNCH_PROVEN: pid alive after 15s"

if maestro test apps/mobile/.maestro/auth-failure-journey.yaml \
  --debug-output "$OUT/maestro-debug"; then
  echo "ANDROID_RUNTIME_JOURNEY_PROVEN: auth screen rendered, sign-in attempted, failure state surfaced, app interactive after failure"
  summary "- ANDROID_RUNTIME_JOURNEY_PROVEN: auth screen rendered, sign-in attempted, failure surfaced (testID auth-failure), app interactive after"
else
  summary "- ANDROID_RUNTIME_JOURNEY_PROVEN: **FAILED** (see android-runtime-journey artifact)"
  exit 1
fi
