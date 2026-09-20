# Store release readiness — 2026-09-13

**This supersedes the release DIRECTION in
[`mobile-store-readiness-v2.md`](mobile-store-readiness-v2.md) and
[`mobile-store-assets-execution-pack-v1.md`](mobile-store-assets-execution-pack-v1.md)
(both 2026-07-06).** Those packs were written against a product whose mobile
form was a PWA plus an Android Trusted Web Activity, and they say so
explicitly: *"no native wrapper is added"*, *"iOS App Store: DEFERRED"*,
*"PWA-first ... no native rewrite"*.

A native client shipped after they were written. `apps/mobile` is an Expo /
React Native app with `ANDROID_NATIVE_BUILD_PROVEN` (2026-08-30),
`IOS_NATIVE_BUILD_PROVEN` and `IOS_RUNTIME_JOURNEY_PROVEN` (2026-08-31, CI
simulator, Maestro) recorded in
[`NATIVE_READINESS_2026-08-29.md`](NATIVE_READINESS_2026-08-29.md). The TWA
route in the old packs is therefore **not the path any more**; their asset
specs, honesty rules and owner-decision list remain valid and are carried
forward below.

Nothing here submits anything, creates an account, holds a credential, or
claims an approval.

---

## 1. What is actually true today

| | state | evidence |
|---|---|---|
| Web / PWA | installable, **not** offline-capable | manifest live; service worker deliberately absent and guard-enforced |
| Android native build | **PROVEN** | `gradlew assembleDebug` → `app-debug.apk`, 2026-08-30 |
| iOS native build | **PROVEN** (simulator, unsigned) | `ios.yml`, Xcode 26.6, 2026-08-31 |
| iOS runtime journey | **PROVEN** (CI simulator) | Maestro: auth screen renders, real sign-in attempt, failure surfaced honestly, app survives |
| Android runtime on a device | **NOT PROVEN** | no emulator image, no device attached |
| Product data on device | transport **open** — Today / Journal / Profile read live through `/api/mcp` | `DOMAIN_TRANSPORT_STATUS.open === true` |
| Journal writes from the device | **WIRED** — `/(shell)/log-work` → `JournalComposer` → `journal.create_draft` → `journal.confirm` → `createJournalEntryCore`, the one canonical write | the code, read 2026-09-13 |
| Context holdings | ~~**NOT WIRED**~~ → **WIRED** (superseded 2026-09-14, #1737) — `heldRoles` arrive on `profile.get` and `holdingsFromHeldRoles` (client-core) maps them; `unknown` only while loading, `unavailable` on a failed read, never an invented context | `apps/mobile/src/context-provider.tsx` |
| Signing, store listing, submission | **NOT STARTED**, owner-gated | — |

**This paragraph said the opposite when this document was first written, and
it was wrong.** It read: "The mobile client is a reader today. A person can
sign in on a phone and see their work; they cannot yet record work from it.
That is the single largest remaining product gap on the native side." Every
sentence of that is false. `apps/mobile/README.md` had claimed writes were
unwired since before #1648 shipped the composer, and this document copied the
claim instead of reading the code — which is exactly how a capability gets
built a second time. Caught in review on #1732, on the same day, by a reviewer
who read the code.

The truth: a person can sign in on a phone, read their work AND record work
into the journal, through the same `/api/mcp` door, under their own RLS. What
is missing on the native side is **context holdings** and, separately, **any
runtime proof on a real device** — proof, not construction. The README is
corrected and the claim is now pinned by a guard, so this particular lie
cannot be told again.

**Superseded 2026-09-14 (#1737), recorded 2026-09-20:** context holdings are
wired — see the table row above. The sentence "what is missing … is context
holdings" is no longer true; what remains missing is listed honestly in §1a.

---

## 1a. Honest state — 2026-09-20

Recorded against `feat/cc/launch-completion-2026-09-20`. Status words are
the ones the launch register uses; none of them means "in a store".

| | status | meaning |
|---|---|---|
| `IOS_STATUS` | **READY_FOR_INTERNAL_TEST** (simulator) | `ios.yml` builds and launches on a CI simulator and walks the auth-failure journey (green on `main` 2026-09-15, run `34948120288`; again 2026-09-20 on `feat/cc/activate-pl-locale`, run `35513465253`). Unsigned; no device; no TestFlight. |
| `ANDROID_STATUS` | **READY_FOR_INTERNAL_TEST** (debug / emulator) | `gradlew assembleDebug` proven (2026-08-30); on an emulator (2026-08-31) the debug build renders the honest misconfiguration gate, accepts the production config, and completes a real wrong-password auth round-trip against production with the honest refusal. No authenticated session on a device yet; no release signing; no Play upload. |

**Journey matrix — what the native app does today.**

| implemented | not implemented (opens nothing, claims nothing) |
|---|---|
| install / cold start with the four-state entry gate | Google sign-in (mobile is password-only by owner decision) |
| email + password sign-in and registration | onboarding / first-run guidance |
| language choice across the five active locales, previews labelled | jobs / opportunities board |
| profile read (`profile.get`, `living_cv.skills.get`) | expressing interest |
| journal list + compose (`journal.list`, `journal.create_draft` → `journal.confirm`) | messaging / conversations |
| Today figures (`journal.work_intelligence.get`) | push notifications (deliberately no module) |
| settings: workspace switch, participation context, privacy / terms / support links | calendar / availability |
| sign-out | camera or file evidence (storage permissions blocked) |
| network failure rendered as failure, with retry — never as an empty list | account deletion IN-APP — reached by link to `/<locale>/dashboard/privacy` (5.1.1(v) satisfied by the canonical web path, not by a phone-side rule) |

**Gates, by who can close them.**

| EXTERNAL (a third party must grant) | OWNER (a decision, no third party) |
|---|---|
| Apple Developer Program membership, Team ID (`APPLE_TEAM_ID`), distribution certificate / provisioning | App icon and splash art (or approval to derive from `apps/web/public/app-icon.svg`) |
| Google Play Console account, upload key, Play App Signing SHA-256 (`ANDROID_CERT_FINGERPRINTS`) | Final privacy and support URLs for the store listings (the app links `/<locale>/dashboard/privacy`, `/<locale>/legal/terms`, `info@labourmarket.ai` today) |
| EAS project id and owner (`eas.json` `submit` stays empty until then) | Store listing wording, category, content rating answers |
| App Store Connect record; Play Data Safety form; App Privacy declaration (submitted to the store) | Confirmation that the collected-data list in `app.json` is COMPLETE (legal sign-off) |
| A review account the stores can sign in with | Screenshots from a real signed-in session |

Nothing above is agent-closable. Everything the code can carry before those
gates is carried and guard-pinned (`mobile-release-config.test.ts`,
`app-association.test.ts`, `mobile-account-controls.test.ts`).

---

## 2. What this change added (agent-executable, no credential)

- **`apps/mobile/eas.json`** — `development` / `preview` / `production` build
  profiles. Play takes an **app bundle**, so `production` is pinned to
  `app-bundle`; `preview` produces an APK and an iOS simulator build for
  internal testing. The `submit` profile is deliberately EMPTY: every field it
  would carry (Apple id, team id, App Store Connect app id, the Play service
  account) is an owner credential.
- **`app.json` → `android.versionCode` and `ios.buildNumber`.** Both stores
  refuse an upload without them, and Expo defaults each to 1 silently — the
  first release would pass and the second would be rejected.
- **`app.json` → `ios.privacyManifests`.** Two halves:
  - the four **required-reason APIs** the React Native / Expo runtime touches
    (`UserDefaults` CA92.1, file timestamp C617.1, system boot time 35F9.1,
    disk space E174.1). Apple rejects a build that uses one without a reason.
  - the **collected-data declaration**. Expo's template emits
    `NSPrivacyCollectedDataTypes` as an **empty array** — an assertion to
    Apple that this product collects nothing about a person. It collects an
    account, a name, a user id and the journal's own content. The empty array
    was a false declaration and is replaced by the four types the client
    demonstrably handles, each `Linked: true`, `Tracking: false`,
    app-functionality. **See the owner gate in §4 — completeness of that list
    is a legal sign-off, not an agent's call.**
- **`app.json` → `android.blockedPermissions`** for
  `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`. They arrive from the
  React Native template and Google Play makes an app that requests them
  answer for them. This client opens no file, no picker and no download —
  nothing under `apps/mobile` imports a file-system or media module. Verified
  in the generated manifest: both now carry `tools:node="remove"`.
  `SYSTEM_ALERT_WINDOW` is left in place deliberately: it is React Native's
  development overlay, and removing it changes the developer build in a way
  this container cannot test on a device.
- **`apps/web/lib/guards/mobile-release-config.test.ts`** — pins all of the
  above. `apps/mobile/android` and `apps/mobile/ios` are gitignored and
  regenerated on every build, so no reviewer ever sees the plist or the
  manifest in a diff; `app.json` is the only place a store requirement can be
  stated, and the only place it can silently regress.

Verified by regenerating both native projects in this container:
`expo prebuild --platform android` → `versionCode 1`, both storage
permissions marked for removal; `expo prebuild --platform ios` →
`CFBundleVersion 1` and a `PrivacyInfo.xcprivacy` carrying the real
collected-data list instead of the empty one.

---

## 3. What is left that an agent CAN do

In value order. None needs a credential.

1. **Android runtime proof.** An emulator image or an attached device turns
   `ANDROID_NATIVE_BUILD_PROVEN` into a runtime claim, the way `ios.yml`
   already did for iOS. This is now the top item because the one that used to
   sit here — "device writes" — was already built; see §1.
2. **Icons and splash.** `apps/mobile` has no `assets/` directory, so both
   stores would receive the Expo placeholder. The brand source
   (`apps/web/public/app-icon.svg`) exists and generation is mechanical —
   but §4.1 is the owner's approval to use it as-is.
3. ~~**Context holdings.** `context-provider.tsx` performs no holdings read, so
   a person with several contexts is told the app cannot list them. Honest,
   and incomplete.~~ **DONE 2026-09-14 (#1737)** — held roles from
   `profile.get`, mapped by `holdingsFromHeldRoles`; see §1.
4. ~~**Deep links as universal links.**~~ **DONE 2026-09-14** — see
   [`../launch/DISTRIBUTION_SURFACE_READINESS_2026-09-14.md`](../launch/DISTRIBUTION_SURFACE_READINESS_2026-09-14.md)
   §2–3. Both `.well-known` documents are served as route handlers, and
   `app.json` now claims `labourmarket.ai` on both platforms
   (`ios.associatedDomains`, `android.intentFilters` with `autoVerify`).

   The identifiers are read from `APPLE_TEAM_ID` and
   `ANDROID_CERT_FINGERPRINTS` and each document **404s until its variable is
   set** — deliberately, because Apple and Google cache a failed association,
   so a placeholder keeps links broken after the real value arrives. The
   remaining owner action is therefore **one environment variable per
   platform, and no code change** (§4.2, §4.3).

   **Narrowed 2026-09-20.** The first version claimed every path (`/*` /
   the whole host); both sides now claim exactly the native route table
   (`NATIVE_APP_PATHS` in `apps/web/lib/mobile/app-association.ts`), so a
   shared web link keeps opening in the browser where that route exists.
   Guard: `app-association.test.ts`.

---

## 4. Owner gates — genuinely blocked, no agent may settle them

1. **Icon source art.** Provide ≥1024px art, or approve generating the app
   icon and splash from `apps/web/public/app-icon.svg` as-is.
2. **Apple Developer Program** account, team id, and distribution
   certificate. Owner-held.
3. **Google Play developer account** and the upload signing key. Owner-held.
4. **The collected-data declaration and the Play Data Safety form.** A legal
   statement about what this product collects and why. §2 replaced a false
   empty list with a truthful minimum; confirming it is COMPLETE is the
   owner's, and it is the declaration both stores hold the publisher to.
5. **Store metadata wording** — title, short and full description, category,
   the answers to ads / in-app purchase / content rating. The drafts in
   `mobile-store-readiness-v2.md` §"Play Store metadata DRAFT" are still the
   starting text and still need owner approval.
6. **Support contact** — an email, or a public support page (a public
   marketing surface, owner-gated).
7. **Screenshots.** Real product screens in real states; honest empty states
   are fine. Never staged numbers. This needs a signed-in production session
   on a device, which is the owner's.

**No submission may be attempted until 1–7 are done by the owner.** Nothing
in this repository can create a store account, hold a signing key, or answer
a legal declaration, and no document here should ever be read as evidence
that a store has accepted anything.

---

## 5. What the old packs still govern

Carried forward unchanged from `mobile-store-readiness-v2.md` and the
execution pack, because the honesty spine does not depend on the packaging
route:

- Screenshots show REAL product states. A real empty state is fine; staged
  numbers never are.
- Evidence tiers in any store copy stay `self-declared` /
  `journal-supported` / `manager-confirmed`. Never "AI-verified".
- No counters, no "instant", no guarantees in listing text.
- Privacy policy `https://labourmarket.ai/lt/legal/privacy` and terms
  `https://labourmarket.ai/lt/legal/terms` are live and are the URLs both
  stores take.
- The web service worker stays absent and guard-enforced until the owner
  approves an offline strategy. That decision is unchanged by the native
  client and unaffected by this document.
