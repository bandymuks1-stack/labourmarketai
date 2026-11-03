# Mobile apps — completion and release readiness — 2026-10-16

Owner direction: extend the controlled release programme with Android and iOS
completion; establish the real state first; no second implementation; no
accounts, paid services, publishing or irreversible production changes.

**Headline.** A native application already exists and is CI-proven on both
platforms: `apps/mobile` (Expo SDK 57 / React Native 0.86, expo-router, 8
routes, ~5,100 lines of TypeScript) plus the shared `packages/client-core`
(transport, session, config, locale and work-figure rules, 51 unit tests).
Data reaches it only through the bearer-authenticated capability door
`/api/mcp`, under the signed-in person's own RLS. The web app is also an
installable PWA (manifest, no service worker by decision). There is no
Capacitor, TWA, Flutter or second codebase, and none should be started.

## A. Android readiness — **51 %** (evidence-weighted)

| # | Item (weight) | State | Evidence |
|---|---|---|---|
| 1 | Codebase, typecheck, JS bundle (10) | ✅ 10 | this session: `client-core` typecheck + 51 tests, `mobile` typecheck clean, `expo export --platform android` → Hermes bundle 3.45 MB |
| 2 | Native release APK in CI (10) | ✅ 10 | `android.yml` run 38610577322 on `main` (2026-10-14): `ANDROID_RELEASE_APK_BUILT`, debug-signed internal build |
| 3 | AAB (Play upload format) builds (5) | ✅ 5 | same run: `ANDROID_RELEASE_AAB_BUILT` (proof only, debug-signed) |
| 4 | Store-policy facts from the built APK (5) | ✅ 5 | minSdk 24, targetSdk 36 (Play floor since 2026-08-31), permissions INTERNET + VIBRATE only; CI refuses storage/camera/mic/location/contacts/AD_ID/overlay/biometric |
| 5 | Emulator launch, auth-failure and airplane-mode journeys (10) | ✅ 10 | `ANDROID_EMU_LAUNCH_PROVEN`, `ANDROID_RUNTIME_JOURNEY_PROVEN`, `ANDROID_OFFLINE_JOURNEY_PROVEN` (API 34, Maestro) |
| 6 | Signed-in product journeys proven on a device/emulator (10) | ❌ 0 | no review identity with a password exists (owner gate P3); production API unreachable while hosting is down |
| 7 | Physical device run (5) | ❌ 0 | never done |
| 8 | Icon, adaptive icon, splash (3) | ◐ 2 | generated from the brand mark (`generate-app-assets.mjs`); owner approval pending |
| 9 | Account controls: public deletion URL, privacy, terms, recovery, pre-register notice (5) | ✅ 5 | `mobile-account-controls.test.ts` (12 tests green this session); routes `/legal/data-deletion`, `/legal/privacy`, `/auth/forgot-password` exist |
| 10 | Data safety answers (3) | ◐ 2 | drafted from code in `../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` §2.1; owner pastes |
| 11 | Listing text, category, rating (3) | ◐ 2 | drafted (EN/LT); owner approval |
| 12 | Upload key + Play App Signing (8) | ❌ 0 | owner credential |
| 13 | Google Play Console account (5) | ❌ 0 | owner; deferred by owner decision 2026-10-14 to the publishing stage |
| 14 | App Links verification (`ANDROID_CERT_FINGERPRINTS` on the web deploy; `/.well-known/assetlinks.json` route exists) (3) | ❌ 0 | needs the signing certificate first |
| 15 | Internal-testing upload (5) | ❌ 0 | after 12–13 |
| 16 | Closed test 12 testers × 14 days (5) | ❌ 0 | Play rule for a new personal account |
| 17 | Backend reachable for the app (5) | ❌ 0 | Vercel blocked (HTTP 402) since 2026-10-15; hosting agent restoring |

## B. iOS readiness — **48 %** (same rubric)

| # | Item (weight) | State | Evidence |
|---|---|---|---|
| 1 | Codebase, typecheck, JS bundle (10) | ✅ 10 | this session: `expo export --platform ios` → Hermes bundle 3.14 MB |
| 2 | Simulator Release build (10) | ✅ 10 | `ios.yml`: `IOS_NATIVE_BUILD_PROVEN` (Xcode 26, macOS 26 runner) |
| 3 | Device (arm64) archive, unsigned (5) | ◐ 4 | `IOS_DEVICE_ARCHIVE_BUILT` on PR run 38623974297 (#2391); the `main` run 38631166349 skipped the step because the Maestro step before it failed (see C-1) |
| 4 | Store answers in the binary (5) | ✅ 5 | archived Info.plist: `ITSAppUsesNonExemptEncryption=false`, iPhone-only, arm64 |
| 5 | Simulator launch + auth-failure journey (10) | ◐ 8 | proven on every PR run; **red on `main` since 2026-10-14** by a driver hang (C-1, fixed in this PR) |
| 6 | Signed-in journeys (10) | ❌ 0 | as Android 6 |
| 7 | Physical iPhone run (5) | ❌ 0 | needs TestFlight or a signed local build |
| 8 | Icon + splash (3) | ◐ 2 | generated; owner approval; iOS icon rendering only proven by the CI build |
| 9 | Account controls (5) | ✅ 5 | 5.1.1(v): Settings → in-account privacy request + public deletion page; review note drafted |
| 10 | App Privacy declaration (3) | ◐ 2 | `app.json` `privacyManifests` (Email, Name, User ID, Other user content; no tracking) pinned by `mobile-release-config.test.ts`; legal completeness is the owner's |
| 11 | Listing text (3) | ◐ 2 | drafted |
| 12 | Distribution certificate + provisioning (8) | ❌ 0 | owner |
| 13 | Apple Developer Program + Team ID (5) | ❌ 0 | owner; `/.well-known/apple-app-site-association` route exists, waits for `APPLE_TEAM_ID` |
| 14 | Universal Links verified (3) | ❌ 0 | after 13 |
| 15 | TestFlight upload (5) | ❌ 0 | after 12–13 |
| 16 | TestFlight external / App Review (5) | ❌ 0 | after 15 |
| 17 | Backend reachable (5) | ❌ 0 | as Android 17 |

The two scores say the same thing: **the engineering half is done and
proven; everything below 50 % is accounts, keys, a review identity, hosting,
and runs on real phones** — none of which an agent may create.

## C. Missing functionality and confirmed defects

### C.1 Confirmed defects (this session)

| Id | Defect | Evidence | Fix |
|---|---|---|---|
| C-1 | `ios.yml` red on `main` since 2026-10-14: the Maestro journey hung on its first `Tap on id: email` after the auth screen had rendered and been screenshotted; the identical commit passed on its PR | run 38631166349 job log; run 38623974297 green | **this PR**: one harness-only retry of the whole flow, mirroring the Android offline journey's retry (`android-emulator-journey.sh`); a real regression still fails twice |
| C-2 | Mobile composer accepted a future work date and only learned of the refusal from the server (web refuses before the round trip since #2432) | `journal-composer.tsx` validated only the pattern | **this PR**: local refusal `journal.compose.futureDate` in all six locales; same-day evening shifts stay valid |
| C-3 | `pnpm -F mobile doctor` could not run (`expo-doctor` is not a dependency) | this session | **this PR**: script runs `npx --yes expo-doctor@latest` |
| C-4 | Web catalogs lv/et/da/no/sv are ~8,900 keys behind EN; the mobile catalogue correctly ships only the six ACTIVE locales, so this is a web fact that bounds any future mobile locale promotion | measured 2026-10-16 | owner decision N-3 (web) |

### C.2 Missing in the native app (by owner decision or by scope — none is a defect)

| Area | Web | Native | Classification |
|---|---|---|---|
| Google / Apple sign-in | Google OAuth | password only | owner decision (keeps Apple 4.8 out of scope) |
| Onboarding / first-run guidance | yes | none | scope (ARCH-6) |
| Jobs board, expressing interest | yes | ● Jobs (`jobs.search`/`jobs.get`, commit 4), ● Opportunities + interest (commit 3) | done in PR #2447 |
| Messaging / conversations | yes | none | scope; `conversation.*` / `message.send_*` ARE published (correction) — a screen is the gap |
| AI chat (conversation as home) | yes | none | scope; no bearer-reachable capability yet |
| Marketplace (listings, service requests, goods) | yes | ● need intake (commit 4); ○ listings, goods, service requests | listings next; `marketplace_listing.*` exists |
| Company operations (projects, roster, assignments, teams) | yes | ● who is free (commit 3); ○ the rest | correction: `roster.list`, `projects.list`, `assignment.*` and more are published; screens are the gap |
| Calendar / availability | yes | ● roster availability (commit 3); ○ own calendar | `calendar.agenda.get` exists for the next step |
| Camera / photo evidence, voice | yes (photos; voice behind COM-6) | none; storage/camera/mic permissions deliberately blocked | owner decision |
| Push notifications | — | none, no vendor | owner decision |
| Offline queue | no service worker on web either | none | owner decision |
| Account deletion | in-account request + public page | links to the same | satisfied (5.1.1(v), Play Data safety) |

## D. Feature-parity matrix (approved spec areas × clients)

Legend: ● implemented and CI-proven · ◐ partial · ○ absent · — not applicable.
"Door" = the capability at `/api/mcp` a native client can call today.

| Area | Web (canonical) | Native app | Door available today | Parity verdict |
|---|---|---|---|---|
| **Work Journal** | 4 transports, photos, supersede, review, metrics, future-date refusal | ● list, ● compose (draft → confirm, context chooser), ● future-date refusal (this PR); ○ photos, ○ edit/supersede, ○ review | `journal.list`, `journal.create_draft`, `journal.confirm`, `journal.work_intelligence.get` | core loop at parity; evidence media and review are web-only by decision |
| **Living CV** | `/cv`, skills with evidence tiers, EU view, export, growth | ● skills read in the web's order (confirmed → journal-backed → declared); ○ CV page, ○ export, ○ recognitions | `living_cv.skills.get`, `profile.get` | read parity on skills only |
| **Marketplace** | listings, goods, service requests, honest failure copy | ◐ need intake (`/need`, commit 4); ○ listings, goods, service requests | `demand.create_draft/confirm`, `marketplace_listing.*`, `service_request.*` | need intake at parity; listings next |
| **Company operations** | projects, stadium, roster, teams, assignments, reports | ◐ who is free (`/availability`, commit 3), need intake; ○ the rest | `workforce.availability`, `roster.list`, `projects.list`, `assignment.*`, `calendar.agenda.get`, `organization.today.get` and more (229 tools published) | doors exist; screens are the gap |
| **AI** | conversation chat, intent → canonical actions, egress gate | ○ | none for chat (the bridged actions exist as tools; the conversation itself does not) | absent by scope; must reuse the one spine, never a second agent |
| **Messaging** | threads, team-offer party, notifications | ○ | `conversation.list`, `conversation.get`, `message.send_draft/confirm`, `notification.list` — correction 2026-10-16: these ARE published | absent on the phone; a reading screen is the next increment after beta |
| **Authentication** | email+password, Google OAuth, recovery, email-verified boundary | ● email+password, ● keychain session, ● recovery via web, ● terms/privacy before register; ○ Google | Supabase Auth (same server) | parity minus OAuth (decision) |
| **Localization** | 6 active UI locales (lt, en, ru, pl, de, nl) + 5 inactive | ● the same six, compiler-enforced parity, previews labelled | — | parity |
| **Privacy / account** | in-account requests, public deletion page, consent ledger | ● links to the canonical pages on the same origin | — | parity by reuse |
| **Weak network** | — | ● every exchange has a deadline; failure ≠ empty list | — | native-specific, proven |

## E. Recommended architecture (unchanged, confirmed economical)

Keep **Expo / React Native + `packages/client-core` + `/api/mcp`**:
- one TypeScript codebase for both platforms, consuming the same Supabase Auth
  server and the same canonical cores the web runs; no second backend, auth,
  permission model or domain logic (invariants M-1…M-9 in
  `MOBILE_ARCHITECTURE.md` §9, all guard-pinned);
- Expo is tooling over bare React Native: `expo prebuild` emits standard
  Gradle/Xcode projects; no EAS account is needed to build (CI proves this);
  EAS is optional for signing convenience only;
- parity grows by **adding capabilities to the registry** (`registry.ts`)
  over existing cores and consuming them from the phone — never by querying
  tables from the device, never by a mobile-only endpoint.

Rejected again, for the record: Capacitor/TWA wrapper of the web app (a
second distribution of a cookie-authenticated client; the 2026-07 packs that
proposed it are superseded), Flutter / Kotlin Multiplatform / native twins
(re-implement the domain), a mobile-only API.

## F. Exact completion tasks, dependencies, effort

Effort is engineering time for one person familiar with the repo; calendar
time depends on the owner gates (O-n) and external reviews (X-n).

| # | Task | Depends on | Effort | Who |
|---|---|---|---|---|
| T1 | Merge this PR (iOS retry, future-date refusal, doctor script); confirm `ios.yml` green on `main` | — | 0.5 d incl. CI wait | agent |
| T2 | Restore hosting so `https://labourmarket.ai/api/mcp` answers with bearer auth; verify `/.well-known/assetlinks.json` and `apple-app-site-association` are served by the restored host | hosting workstream | — | hosting agent |
| T3 | Set `CONVERSATION_TOKEN_SECRET` on the restored host before #2444 merges (the mobile Log-work confirm depends on it) | release N-13 | — | owner |
| O1 | Create ONE synthetic review identity with a password; store as `production-qa` environment secret `MOBILE_QA_PASSWORD` | — | 15 min | owner |
| T4 | `workflow_dispatch`-only signed-in Maestro journey (Today → Journal → Log work → Profile → Settings) in `android.yml` and `ios.yml`, using the environment secret; never on PR runs | O1, T2, T3 | 1.5 d | agent |
| T5 | Real-device walk per `REAL_DEVICE_TEST_PLAN_2026-10-16.md` §2 on two Android phones + one iPhone; log findings | O1, T2, APK artifact; iOS needs O3 or a local signed build | 0.5 d per platform | owner / tester |
| T6 | Fix the findings of T5 (unknown scope; budget) | T5 | 1–3 d | agent |
| O2 | Google Play Console account; upload key + Play App Signing; `ANDROID_CERT_FINGERPRINTS` on the production deploy | — | 1 h + identity verification (X: 1–3 days) | owner |
| O3 | Apple Developer Program; Team ID → `APPLE_TEAM_ID`; distribution cert + profile | — | 1 h + enrolment (X: 1–7 days) | owner |
| T7 | Pin `extra.eas.projectId` (if EAS is chosen) in `mobile-release-config.test.ts`; fill `eas.json` `submit` with non-secret ids | O2/O3 | 0.5 d | agent |
| T8 | Prove App Links / Universal Links in CI (`adb shell pm verify-app-links`, AASA fetch) | O2, O3, T2 | 0.5 d | agent |
| T9 | Owner approves icon/splash, listing text, Data safety / App Privacy answers, age rating | — | 1 h | owner |
| T10 | Android Internal testing upload; iOS TestFlight internal | O2/O3, T7 | 0.5 d | owner + agent |
| T11 | Closed test (≥ 12 testers, 14 days) on Play; TestFlight external beta review | T10 | X: 14 days / 1–2 days | owner + external |
| **Parity increments (after beta, each a GREEN slice over an existing door)** | | | | |
| P1 | Need intake screen (`demand.create_draft/confirm`) | T1 | 2 d | agent |
| P2 | Interest in a job from a shared link (`interest.express_draft/confirm`) + deep-link path `/jobs/[id]` added to the association tables | T1 | 2 d | agent |
| P3 | Availability (`workforce.availability`) read on Today | T1 | 1 d | agent |
| P4 | Journal photo evidence — requires lifting the camera/storage block (owner decision) and a bearer upload capability | owner decision | 3–4 d | agent |
| P5 | Messaging / AI chat — require new bearer capabilities over the one conversation spine; design first (ARCH-6) | owner decision ARCH-6 | 1–2 weeks each | agent |

## G. Earliest technically realistic beta-release path

Critical path = hosting (T2) → review identity (O1) + secret (T3) → signed-in
CI journey (T4) and device walk (T5/T6) → accounts (O2/O3, can start in
parallel on day 1) → upload (T10).

| Milestone | Earliest after the owner starts | Blocking gate |
|---|---|---|
| Android internal-testing build in testers' hands | **~5 working days** after O1 + O2 start, assuming hosting is restored in that window | O2 identity verification, T2 |
| iOS TestFlight internal build | **~5–7 working days** (Apple enrolment is the long pole) | O3 |
| Android production eligibility | internal + **14 days closed test** → ~3–4 weeks | Play rule X |
| iOS App Review submission | after TestFlight external beta review → ~2–3 weeks | Apple review X |

No step on this path requires new product code; the only code work before
beta is T4 (signed-in CI journey) and T6 (device findings).

## H. Store submission blockers (nothing below is agent-closable)

| # | Blocker | Store | Owner action |
|---|---|---|---|
| S1 | No Google Play Console account / no Apple Developer Program membership | both | O2, O3 |
| S2 | No signing material (upload key, distribution certificate, provisioning profile) | both | O2, O3 |
| S3 | No review account with a password (both stores require one for a login-gated app) | both | O1 |
| S4 | Production API unreachable (hosting) — a reviewer would see "could not reach the server" on every screen | both | hosting workstream |
| S5 | `CONVERSATION_TOKEN_SECRET` absent on the restored host would break Log-work saves after #2444 | both | release N-13 |
| S6 | Listing text, icon/splash, Data safety / App Privacy, content rating not yet approved | both | T9 |
| S7 | Privacy policy and terms still carry a "pending legal review" banner | both (and the AI directories) | legal sign-off |
| S8 | App Links / Universal Links unverified until S2 values reach the web deploy | both (not a rejection cause, but a listed capability) | T8 |
| S9 | Play: new personal account must pass a 12-tester × 14-day closed test | Play | T11 |
| S10 | iPad: `supportsTablet: false` keeps the iPad screenshot requirement away; enabling it later needs iPad QA | App Store | decision |

## I. Coordination with the hosting-recovery and security workstreams

- **Hosting (other session):** the app's `EXPO_PUBLIC_API_BASE_URL` is
  `https://labourmarket.ai`; the restored host must serve `/api/mcp` (POST,
  bearer), `/api/health`, the two `.well-known` association routes, and the
  legal pages the app links to. The standalone packaging (#2431) keeps all
  routes; only env values move. No mobile change is needed for the host
  move — nothing in this PR touches hosting, DNS or env.
- **Security / release (PR #2447):** #2444 makes `CONVERSATION_TOKEN_SECRET`
  mandatory for every draft→confirm token, including the mobile Log-work
  path and the `interest`/`demand`/`work_card` doors — so N-13 precedes any
  mobile beta. `/api/mcp` rate limiting is per-instance memory (SEC-8); the
  per-person brake (#2373) applies. The RED PRs (#2439 journal integrity,
  #2442 erasure) change nothing the app calls: the hash chain moves
  server-side (the app never computed hashes) and erasure stays a web/admin
  path.
- **Dependabot:** #1623 (expo 57.0.18 → 57.0.26) and #1625
  (`@expo/metro-runtime` 57.0.16) were green on all seven checks on
  2026-10-07; merge after this PR so the mobile CI stays green on `main`.

## J. What this session changed and proved

Changed (this PR): `ios.yml` Maestro retry; `journal-composer.tsx` +
`messages.ts` future-date refusal in six locales; `package.json` doctor
script. Proved locally: `client-core` typecheck + 51 tests; `mobile`
typecheck; Android and iOS Hermes bundles; web guards
`mobile-release-config`, `mobile-account-controls`, `mobile-weak-network`,
`app-association`, `client-core-vocabulary-mirror`, `app-shared-core` (72
tests). CI on this PR will re-prove `android.yml` (APK/AAB + emulator
journeys) and `ios.yml` (simulator build + journey with the retry + device
archive) because both workflows trigger on `apps/mobile/**`.
