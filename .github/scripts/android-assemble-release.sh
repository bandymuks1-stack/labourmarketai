#!/usr/bin/env bash
# THE Android release build (debug-signed internal test APK), shared by
# android.yml and android-need-isolated.yml so there is one build, not two.
# Run from apps/mobile/android after `expo prebuild --platform android`.
#
# Two ABIs, not the template's four: arm64-v8a for real phones, x86_64 for
# the emulator jobs. 32-bit ABIs only double the C++ build time.

# Leading newline: the generated gradle.properties has NO trailing newline,
# and a bare append glued this onto the last property
# (expo.inlineModules.watchedDirectories) — run 3 proved it.
printf '\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m\n' >> gradle.properties
# pipefail: the diagnostic greps below pipe into tail/head; the build's own
# status is captured explicitly in STATUS either way.
set -o pipefail
set +e
./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,x86_64 \
  --no-daemon --stacktrace --info > gradle.log 2>&1
STATUS=$?
if [ $STATUS -ne 0 ]; then
  # A failing configuration-time `node` call prints its stderr BEFORE the
  # FAILURE block — show what led up to it, not just the trace.
  echo "===== configuration-time node invocations ====="
  grep -n -A 3 "Starting process 'command 'node''" gradle.log | tail -40
  echo "===== output leading up to FAILURE ====="
  sed -n '1,/FAILURE:/p' gradle.log | tail -150
  echo "===== error regions ====="
  grep -n -B 3 -A 25 -E "FAILURE:|error:|What went wrong" gradle.log | head -400
  echo "===== last 120 lines ====="
  tail -120 gradle.log
else
  tail -30 gradle.log
  echo "ANDROID_RELEASE_APK_BUILT"
fi
exit $STATUS
