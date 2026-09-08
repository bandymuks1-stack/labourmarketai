# Android native toolchain — minimal install proposal (owner decision)

> Status 2026-08-30: **INSTALLED and PROVEN.** Temurin JDK 17 +
> `C:\Android\sdk` (cmdline-tools, platform android-36, build-tools 35/36,
> platform-tools, NDK, CMake) are present; `JAVA_HOME` is set machine-wide,
> `ANDROID_HOME` is passed per-build. `gradlew assembleDebug` produced a
> debug APK — see the 2026-08-30 update in
> [`NATIVE_READINESS_2026-08-29.md`](NATIVE_READINESS_2026-08-29.md).
> The emulator remains NOT installed (optional footprint below).
> Original proposal text kept for the rollback path:

## What is actually required

Android Studio is NOT required. Command-line tools are sufficient for
`expo run:android` / Gradle debug builds. The emulator is optional (a
physical device over USB debugging works with `platform-tools` alone).

| Component | Exact item | Disk |
|---|---|---|
| JDK | Eclipse Temurin JDK **17** (LTS; the version Expo SDK 57 / AGP 8.x documents) | ~300 MB |
| Android cmdline-tools | `commandlinetools-win-*_latest.zip` from developer.android.com | ~150 MB |
| SDK platform | `platforms;android-36` (compileSdk for RN 0.86; accept `android-35` if prebuild pins it) | ~150 MB |
| Build tools | `build-tools;36.0.0` (or the version `expo prebuild` writes into gradle) | ~60 MB |
| Platform tools | `platform-tools` (adb) | ~10 MB |
| NDK (pulled automatically by Gradle if a module needs it) | `ndk;27.*` — only if the build demands it | ~2 GB |
| Emulator (OPTIONAL) | `emulator` + one `system-images;android-36;google_apis;x86_64` | ~8 GB |

Minimal footprint without emulator/NDK: **≈ 0.7 GB**. With emulator: ≈ 9 GB.
Free disk today: 203 GB.

## Install commands (winget available: v1.29.290)

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
# unzip cmdline-tools to C:\Android\sdk\cmdline-tools\latest
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17<exact>"
setx ANDROID_HOME "C:\Android\sdk"
# then, in a NEW shell:
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
sdkmanager --licenses
```

## Commands after installation (from repo root)

```bash
pnpm -F mobile exec expo prebuild --platform android --no-install
cd apps/mobile/android && ./gradlew assembleDebug   # debug APK, no signing secrets
# device attached:
pnpm -F mobile exec expo run:android
```

## Rollback / removal

- `winget uninstall EclipseAdoptium.Temurin.17.JDK`
- delete `C:\Android\sdk` (plain directory, no services, no registry)
- remove the two environment variables.
- Gradle caches live in `%USERPROFILE%\.gradle` (delete to reclaim).

Nothing above touches the repo, signing keys, or Google Play. The JRE 1.8
already present is left alone (some other software owns it).
