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
