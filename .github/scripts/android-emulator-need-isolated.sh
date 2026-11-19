#!/usr/bin/env bash
# ISOLATED Android need journey for .github/workflows/android-need-isolated.yml.
# Runs INSIDE reactivecircus/android-emulator-runner, on a runner whose only
# backend is the job's own LOCAL Supabase + web app (reached from the emulator
# as 10.0.2.2). Usage: android-emulator-need-isolated.sh <apk>
#
# Signs in as the job's seeded QA-SYNTHETIC company, searches jobs, has an
# empty need refused, then drafts, confirms and sends a need (NEED_SUBMIT=1),
# returns, and sends a SECOND need from a fresh form (need-second-journey.yaml),
# then walks the employer screens (employer-screens-journey.yaml): Today's
# organization stations, close → reopen a need, one candidate list, Agency
# offers and Programmes & cohorts.
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

# The SECOND need: Done → Today → a fresh form (not the first need's sent state)
# → drafted, confirmed, sent. The next workflow step expects two rows.
maestro test apps/mobile/.maestro/need-second-journey.yaml
echo "ANDROID_SECOND_NEED_ON_DEVICE: Done returned to Today; Post a need opened a fresh form; second need sent"

# The EMPLOYER SCREENS (#3471): Today's organization stations, close → reopen a
# need (draft → confirm each), one need's candidates, Agency offers (none),
# Programmes & cohorts (not a training provider). The next workflow step checks
# the close and reopen in the local database.
maestro test apps/mobile/.maestro/employer-screens-journey.yaml
echo "ANDROID_EMPLOYER_SCREENS_ON_DEVICE: organization stations shown; a need closed and reopened; candidates, agency offers and programmes opened"

# The LIVING CV FORMS (#3451, #3453): the company signs out and the job's
# synthetic WORKER signs in, then adds work history, a language and a school.
# The next workflow step finds one row of each in the local database.
: "${MOBILE_WORKER_EMAIL:?worker seed address missing}"
: "${MOBILE_WORKER_PASSWORD:?worker seed password missing}"
maestro test \
  -e MOBILE_WORKER_EMAIL="$MOBILE_WORKER_EMAIL" \
  -e MOBILE_WORKER_PASSWORD="$MOBILE_WORKER_PASSWORD" \
  apps/mobile/.maestro/cv-forms-journey.yaml
echo "ANDROID_CV_FORMS_ON_DEVICE: worker signed in; work history, language and education saved and shown on the profile"

: "${BOOK_WORKER_ID:?booking worker id missing}"
: "${NOT_FIT_WORKER_ID:?not-a-fit worker id missing}"
maestro test \
  -e MOBILE_QA_EMAIL="$MOBILE_QA_EMAIL" \
  -e MOBILE_QA_PASSWORD="$MOBILE_QA_PASSWORD" \
  -e MOBILE_WORKER_EMAIL="$MOBILE_WORKER_EMAIL" \
  -e MOBILE_WORKER_PASSWORD="$MOBILE_WORKER_PASSWORD" \
  -e BOOK_WORKER_ID="$BOOK_WORKER_ID" \
  -e NOT_FIT_WORKER_ID="$NOT_FIT_WORKER_ID" \
  apps/mobile/.maestro/booking-journey.yaml
echo "ANDROID_BOOKING_ON_DEVICE: company shortlisted two workers, marked one not a fit, proposed a start to the other; that worker accepted it under Offers"

: "${REVIEW_ENTRY_ID:?review entry id missing}"
maestro test \
  -e MOBILE_QA_EMAIL="$MOBILE_QA_EMAIL" \
  -e MOBILE_QA_PASSWORD="$MOBILE_QA_PASSWORD" \
  -e REVIEW_ENTRY_ID="$REVIEW_ENTRY_ID" \
  apps/mobile/.maestro/review-journey.yaml
echo "ANDROID_REVIEW_ON_DEVICE: company opened Work review, approved its employee's entry with a note; the entry left the queue"

: "${MOBILE_AGENCY_EMAIL:?agency seed address missing}"
: "${MOBILE_AGENCY_PASSWORD:?agency seed password missing}"
maestro test \
  -e MOBILE_QA_EMAIL="$MOBILE_QA_EMAIL" \
  -e MOBILE_QA_PASSWORD="$MOBILE_QA_PASSWORD" \
  -e MOBILE_AGENCY_EMAIL="$MOBILE_AGENCY_EMAIL" \
  -e MOBILE_AGENCY_PASSWORD="$MOBILE_AGENCY_PASSWORD" \
  apps/mobile/.maestro/agency-clients-journey.yaml
echo "ANDROID_AGENCY_CLIENTS_ON_DEVICE: agency invited the company; the company accepted and shared one of its needs"
