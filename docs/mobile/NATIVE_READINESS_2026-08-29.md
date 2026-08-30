# Native readiness audit — 2026-08-29 (Windows build machine)

Honest state per the §20 proof vocabulary. Nothing below claims
`ANDROID_NATIVE_PROVEN` or `IOS_BUILD_PROVEN` — neither is true yet.

## Android — everything provable without installing a toolchain: DONE

`expo prebuild --platform android` runs clean on this machine (no JDK/SDK
needed for generation) and the generated project was audited:

- **Application id** `ai.labourmarket.app`; version 0.1.0; portrait;
  New Architecture on.
- **Deep-link auth guard**: `labourmarketai://` intent filter
  (VIEW + DEFAULT + BROWSABLE) on the single-task MainActivity — matches
  `scheme` in `app.json` and the expo-router auth guard.
- **Secure store**: `expo-secure-store` backup exclusion rules are wired into
  the manifest (`secure_store_backup_rules`, `secure_store_data_extraction_rules`)
  — keychain material is excluded from Android backup/data extraction, so a
  device backup cannot exfiltrate the session.
- **Permissions**: INTERNET, VIBRATE, legacy storage capped at SDK ≤ 32,
  SYSTEM_ALERT_WINDOW (React Native dev overlay). No location, no camera, no
  contacts — nothing the product does not use yet.
- **Secret audit**: zero hits for service-role / secret-key material in the
  generated tree; `extra."//"` in `app.json` documents the PUBLIC-only rule
  and client-core refuses an RLS-bypassing key at runtime.
- **Toolchain pins**: Gradle 9.3.1 (needs JDK 17+); SDK versions resolve from
  the `expo-root-project` plugin (RN 0.86 line).
- Prebuild advisories fixed: obsolete `edgeToEdgeEnabled` removed (Android 16
  makes edge-to-edge mandatory); `expo-system-ui` added so the declared
  `userInterfaceStyle: "automatic"` is actually enforceable on device.

`android/` stays **gitignored** (continuous native generation — `app.json` is
the source of truth; the project is regenerated, never hand-maintained).

**The one blocker to a debug APK** is machine tooling: this PC has a JRE 1.8
only, no JDK, no Android SDK. The exact minimal owner-approved install (and
its rollback) is [`ANDROID_NATIVE_TOOLCHAIN.md`](ANDROID_NATIVE_TOOLCHAIN.md)
— ≈0.7 GB without an emulator. After it: `expo prebuild` → `gradlew
assembleDebug` → `expo run:android`.

## UPDATE 2026-08-30 — ANDROID_NATIVE_BUILD_PROVEN: YES

The toolchain from `ANDROID_NATIVE_TOOLCHAIN.md` is installed (Temurin
JDK 17, cmdline-tools, platform android-36, build-tools 35/36, NDK, CMake;
no emulator). With two repo changes — `node-linker=hoisted` in the root
`.npmrc` (the Expo-documented monorepo layout) and the two Expo-bundled
native pins below — the full native build passes on this machine:

```
expo prebuild --platform android   → clean
gradlew assembleDebug --no-daemon  → BUILD SUCCESSFUL in 35m 10s
                                     458 tasks: 434 executed, 24 up-to-date
app-debug.apk                      → 225,656,648 bytes
                                     applicationId ai.labourmarket.app, v0.1.0
sha256 4829f14faddd768597268e599b1c536256936bfb0634dc90b01664ecda00e920
```

Root cause of the historical worklets/screens C++ failure, measured: with
fresh resolution, `react-native-reanimated` 4.6.0 pulled
`react-native-worklets` 0.12.1, which `expo-modules-core` 57.0.14 does not
support (peer `^0.7.4 || ^0.8 || ^0.9 || ^0.10`) — the compile error was
`no member named 'executeSync' in 'worklets::WorkletRuntime'`. The fix pins
the Expo SDK 57 bundled pair (`react-native-reanimated` 4.5.1,
`react-native-worklets` 0.10.1) as direct dependencies of `apps/mobile`.
Both satisfy every peer range (expo-router accepts reanimated `*`).

**Still NO:** `ANDROID_NATIVE_RUNTIME_PROVEN` — no emulator/system image is
installed (deliberately excluded from the minimal footprint) and no device
was attached; install+launch remains the next proof step.

## UPDATE 2026-08-30 — IOS_NATIVE_BUILD_PROVEN: YES (simulator)

The "macOS-only" gap below is closed without owner infrastructure: GitHub's
hosted `macos-26` runners (free on this public repo) run
`.github/workflows/ios.yml` — prebuild → `pod install` → `xcodebuild`
(scheme `LabourMarketai`, Debug, unsigned, Xcode 26.6) → **BUILD
SUCCEEDED** → `simctl` install + launch → process alive after 15s
(`IOS_SIM_LAUNCH_PROVEN`). Six measured iterations got there: x86_64
slice off (arm64 runner), toolchain floor **Xcode 26.4+/Swift 6.3**
(16.4 lacks Swift tools 6.2; 26.0–26.3 trip the Swift/C++ interop rules
in expo-modules-jsi `RuntimeScheduler.h` — upstream expo/expo#46242),
and the app scheme selected by `.xcodeproj` name (schemes[0] is a Pods
scheme). Still NOT claimed: device builds, signing, store readiness,
real-backend auth/deep-link E2E.

## iOS — everything provable from Windows: DONE; the rest is macOS-only

`expo prebuild --platform ios` **refuses on Windows by design** ("Run npx
expo prebuild again from macOS or Linux"). No pretending otherwise. What IS
proven from here:

- The iOS **Hermes bundle** builds in CI on every PR (`mobile.yml`) — the
  JavaScript half of an iOS build.
- Config that will drive plist generation is validated: bundle id
  `ai.labourmarket.app`, `labourmarketai://` URL scheme, `supportsTablet`,
  no permission-gated APIs in use (no camera/mic/location plist strings
  needed yet), `expo-secure-store` → iOS Keychain
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`).

**Exact macOS sequence when a Mac is available** (Expo SDK 57 / RN 0.86):
Xcode 16.x + CocoaPods (`sudo gem install cocoapods` or brew), then:

```bash
pnpm install
pnpm -F mobile exec expo prebuild --platform ios
cd apps/mobile/ios && pod install
pnpm -F mobile exec expo run:ios        # simulator debug build
```

Same app, same domain client — there is no Apple-specific fork anywhere in
`apps/mobile` or `packages/client-core`.

## What flips the product-data gate

Not tooling: `DOMAIN_TRANSPORT_STATUS.open` (packages/client-core) stays
`false` until the auth-core bearer boundary (PR #1331 reconciliation) merges
and is deployed. The mobile shell, auth, session keychain and locale flows
are already real; Today/Journal/Profile show the honest not-connected state
until then.
