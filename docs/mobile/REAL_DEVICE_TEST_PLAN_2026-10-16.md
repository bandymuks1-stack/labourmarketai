# Real-device test plan and beta release process — 2026-10-16

Companion to `MOBILE_COMPLETION_AND_RELEASE_READINESS_2026-10-16.md`. Nothing
here creates an account, buys anything, or publishes. The plan is written so
that one person with one Android phone and one iPhone can execute it in about
two hours per platform once the owner gates in §0 are open.

## 0. Preconditions (owner gates — none is agent-closable)

| # | Gate | Why the plan cannot start without it |
|---|---|---|
| P1 | Production hosting answers `https://labourmarket.ai/api/health` with a current build (hosting workstream) | the app reads and writes only through `https://labourmarket.ai/api/mcp` |
| P2 | `CONVERSATION_TOKEN_SECRET` set on the restored host (release workstream N-13) | `journal.create_draft → journal.confirm` mints and spends a confirmation token signed with it; without it every Log-work save refuses |
| P3 | One synthetic review identity with a PASSWORD, stored as the `production-qa` environment secret `MOBILE_QA_PASSWORD` (the app is password-only by owner decision) | signed-in journeys; store review accounts |
| P4 | A debug-signed APK from `android.yml` (artifact `labourmarket-android-internal-<sha>`) — exists today; and, for iOS, a TestFlight build (needs the Apple account) or a locally signed build on the owner's Mac | installation |

## 1. Device matrix (minimum)

| Platform | Device class | OS | Why |
|---|---|---|---|
| Android | one low-mid phone (e.g. 4 GB RAM, Android 13–14, 360×800) | API 33–34 | the workforce's real devices; minSdk 24 |
| Android | one current phone | Android 15/16 (API 35/36) | targetSdk 36 behaviour (edge-to-edge, predictive back) |
| iOS | iPhone with a notch/Dynamic Island | iOS 17 or 18 | safe-area, keyboard, Universal Links |
| iOS | one older iPhone (SE/8 class) if available | iOS 16/17 | smallest supported viewport |
| Both | the same phone in airplane mode and on a throttled connection (3G profile) | — | the weak-network rules (`mobile-weak-network.test.ts`) in real life |

## 2. Scripted walk (record PASS / FAIL / BLOCKED with a screenshot per row)

| # | Step | Expected | Evidence file |
|---|---|---|---|
| D1 | Cold start, no account | sign-in form renders in the device language (one of the six) within 3 s; no blank screen | `01-cold-start.png` |
| D2 | Wrong password | the honest failure block (`auth-failure`), form still usable | `02-auth-failure.png` |
| D3 | Airplane mode, sign in | "could not reach the server", not "wrong password" | `03-offline.png` |
| D4 | Sign in with the review identity | lands on Today; figures or an honest "not read" state, never `0 h` for a failed read | `04-today.png` |
| D5 | Work journal tab | the identity's entries newest first, or an honest empty state when it has none | `05-journal.png` |
| D6 | Log work → tomorrow's date | refused locally with the future-date sentence, nothing sent (this PR) | `06-future-refused.png` |
| D7 | Log work → yesterday, a site, ≥ 10 characters of notes → Draft | preview with the resolved work context, or the context chooser | `07-preview.png` |
| D8 | Confirm | entry appears in Work journal; a second confirm with the same token is refused (single use) | `08-saved.png` |
| D9 | Profile | name, held roles, skills in the web's order; a failed read says so | `09-profile.png` |
| D10 | Settings → language | every label changes; no raw key | `10-language.png` |
| D11 | Settings → workspace switch (identity with ≥ 2 contexts) | the switch takes effect on Today | `11-switch.png` |
| D12 | Settings → privacy / deletion / terms / support | open in the browser on the SAME origin the build talks to | `12-links.png` |
| D13 | Deep link `https://labourmarket.ai/journal` from a note while signed out | app opens on sign-in, then lands on journal; while signed in, straight to journal (only after App Links / Universal Links env is set, else opens the browser — record which) | `13-deeplink.png` |
| D14 | Background the app 10 min, return | session still valid; no re-login | `14-resume.png` |
| D15 | Kill the app, relaunch | still signed in (keychain), lands on Today | `15-relaunch.png` |
| D16 | Sign out | returns to sign-in; relaunch stays signed out | `16-signout.png` |
| D17 | Rotate (Android), font size XL (both) | layouts readable, no clipped primary button | `17-a11y.png` |
| D18 | Throttled 3G: open Today | spinner ends within the transport deadline with an honest failure or data — never an endless spinner | `18-throttled.png` |

Pass criterion for a beta build: D1–D12 and D14–D16 PASS on both platforms;
D13 BLOCKED is acceptable until the association env values exist; D17–D18
failures are logged, not blocking.

## 3. Beta release process (after the owner gates)

Android:
1. Owner: Play Console account; upload key via `eas credentials` or a local keystore kept off the repo; enrol Play App Signing.
2. Build: `eas build --platform android --profile production` (AAB) or local `./gradlew :app:bundleRelease` with the signing config; versionCode comes from `app.json` (owner bumps per upload).
3. Upload to **Internal testing** (up to 100 testers, no review wait). Testers: the owner, two pilot companies' managers, three workers.
4. Run §2 on the internal build; fix; re-upload.
5. **Closed testing** with ≥ 12 testers for 14 days (Play's rule for personal developer accounts created after 2023-11-13) → production access request → production.

iOS:
1. Owner: Apple Developer Program; `APPLE_TEAM_ID` on the web deploy; distribution certificate + provisioning profile via `eas credentials` or Xcode.
2. Build: `eas build --platform ios --profile production`; upload with `eas submit -p ios` or Transporter.
3. **TestFlight internal testers** (up to 100 team members, no beta review). Run §2.
4. **TestFlight external testers** (beta review, usually 1–2 days) → App Review submission with the notes in `../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` §3.

Both: one beta build per week at most; every build's `app.json` version/build
numbers recorded in `MOBILE_STATUS_*.md`; a CI-built artifact SHA quoted in
the tester note so a bug report names a commit.
