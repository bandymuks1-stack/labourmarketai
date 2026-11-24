# Signing & store submission runbook — 2026-10-15

This is the last step between a **technically proven** app and a store listing.

Every line is marked one of three ways:
- **DONE** — proven by CI on main; the run name is given.
- **OWNER** — needs the owner's account, identity, payment or legal sign-off.
- **EXTERNAL** — decided by Google or Apple.

Nothing marked OWNER or EXTERNAL is claimed as done.

Sources:
- [`STORE_RELEASE_READINESS_2026-09-13.md`](STORE_RELEASE_READINESS_2026-09-13.md);
- [`MOBILE_STATUS_2026-10-14.md`](MOBILE_STATUS_2026-10-14.md);
- [`../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md`](../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md) — listing text, Data safety / App Privacy answers, review notes.

---

## 1. Android — Google Play

| # | Step | State | Proof / who |
|---|---|---|---|
| A1 | Release build compiles, Hermes bundle embedded | **DONE** | `android.yml` → `ANDROID_RELEASE_APK_BUILT` |
| A2 | **AAB** (the Play upload format) builds | **DONE** | `ANDROID_RELEASE_AAB_BUILT` (43.6 MB, debug-signed proof — not uploadable) |
| A3 | targetSdk ≥ 36 (Play floor since 2026-08-31), read from the BUILT APK | **DONE** | `ANDROID_STORE_POLICY_FACTS_OK`: minSdk 24, targetSdk 36 |
| A4 | Only used permissions | **DONE** | built APK requests `INTERNET`, `VIBRATE` only (#2375); CI refuses storage, camera, mic, location, contacts, media, AD_ID, overlay, biometric |
| A5 | Launch + honest failure + airplane-mode journeys on an emulator (API 34) | **DONE** | `ANDROID_EMU_LAUNCH_PROVEN`, `ANDROID_RUNTIME_JOURNEY_PROVEN`, `ANDROID_OFFLINE_JOURNEY_PROVEN` |
| A6 | In-app recovery, terms/privacy before register, public deletion URL | **DONE** | #2371 + `mobile-account-controls.test.ts` |
| A7 | Google Play developer account | **OWNER** | Play Console. A NEW personal account must run a **closed test with 12 testers for 14 days** before production (EXTERNAL rule). |
| A8 | Upload key + Play App Signing | **OWNER** | Create the key with EAS (`eas credentials`), or a local keystore kept off the repo. Enrol in Play App Signing. |
| A9 | App Links verification | **OWNER** → then automatic | Set `ANDROID_CERT_FINGERPRINTS` on the production web deploy, comma-separated: **both** the upload cert and Google's app-signing cert. `/.well-known/assetlinks.json` then answers (it is a 404 until set). |
| A10 | Signed release AAB | **OWNER** | Either:<br>• `cd apps/mobile && eas init`, which writes `extra.eas.projectId` — then `eas build --platform android --profile production`;<br>• or a local `./gradlew :app:bundleRelease` with the upload key. |
| A11 | Upload to Internal testing → closed test → production | **OWNER** + **EXTERNAL** review | `eas submit -p android` (needs a Play service-account JSON), or a manual upload |
| A12 | Listing, Data safety form, content rating, 18+ audience | **OWNER** (paste) | Text and answers drafted in the submission pack §2 |
| A13 | Real phone run, signed in | **OWNER** | Needs the synthetic review account with a password (`MOBILE_QA_PASSWORD` in the `production-qa` environment). After that, the agent can add the signed-in CI journey. |

## 2. iOS — App Store

| # | Step | State | Proof / who |
|---|---|---|---|
| I1 | Release build for the simulator + launch + journey | **DONE** | `ios.yml` → `IOS_NATIVE_BUILD_PROVEN`, `IOS_SIM_LAUNCH_PROVEN`, `IOS_RUNTIME_JOURNEY_PROVEN` |
| I2 | **Device (arm64) archive** builds | **DONE** | `IOS_DEVICE_ARCHIVE_BUILT` — unsigned (#2391, run 38623974297) |
| I3 | Export compliance and device family are in the BINARY | **DONE** | archived Info.plist: `ITSAppUsesNonExemptEncryption=false`, `UIDeviceFamily=[1]` (iPhone-only), `arm64` |
| I4 | Privacy manifest (Email, Name, User ID, Other user content; no tracking) | **DONE** (technical) / **OWNER** (legal completeness) | `app.json` `privacyManifests`, pinned by `mobile-release-config.test.ts` |
| I5 | Sign in with Apple | **not required** | Guideline 4.8 applies only with third-party login; the app is e-mail + password only |
| I6 | Account deletion reachable in-app (5.1.1(v)) | **DONE** | Settings → privacy (in-account request) + public deletion page; `submit_privacy_request_v1` live |
| I7 | Apple Developer Program + Team ID | **OWNER** | Then set `APPLE_TEAM_ID` on the web deploy; `/.well-known/apple-app-site-association` then answers |
| I8 | Distribution certificate + provisioning profile | **OWNER** | `eas credentials` (managed) or Xcode |
| I9 | Signed IPA | **OWNER** | `eas build --platform ios --profile production` |
| I10 | App Store Connect record, TestFlight, review | **OWNER** + **EXTERNAL** | `eas submit -p ios`. Review notes (incl. the deletion path) are in the submission pack §3. |
| I11 | Physical iPhone run | **OWNER** | via TestFlight, once I9–I10 exist |

## 3. What the agent can still do once an owner step lands

- **After A13 / the review account** — add a `workflow_dispatch`-only signed-in journey (Today → Journal → Log work → Profile → Settings) to `android.yml` and `ios.yml`, using the `production-qa` environment secret.
- **After `eas init`** — pin `extra.eas.projectId` in a guard, and switch `eas.json` `submit` from `{}` to a profile with no secrets in the repo.
- **After the fingerprints / Team ID are set** — prove App Links / Universal Links in CI with `adb shell pm verify-app-links` and an AASA fetch.
