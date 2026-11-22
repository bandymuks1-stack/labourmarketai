# Owner store checklist — 2026-11-16

Owner order 2026-11-16, register 8.13 / 8.14 / 8.15 / 8.17 / 8.18: full Android and iOS apps on the shared client in `apps/mobile`. The agent prepares everything that needs no account. This page lists **exactly** what only the owner can create or approve, in order.

It does not repeat the existing packs; it points into them:
- [`../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md`](../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md) ("the pack"): build route, owner steps O-1…O-10, listing drafts, Data safety answers, review notes;
- [`SIGNING_AND_SUBMISSION_RUNBOOK_2026-10-15.md`](SIGNING_AND_SUBMISSION_RUNBOOK_2026-10-15.md): every Android / iOS step marked DONE, OWNER or EXTERNAL.

Nothing on this page is done until the owner says so. No store has accepted anything.

---

## 1. What the owner must create (accounts, keys, values)

| # | What | Where it goes afterwards | Pack ref |
|---|---|---|---|
| 1 | **Apple Developer Program** membership (individual is the faster route) | — | O-1 |
| 2 | **App Store Connect** app record, bundle id `ai.labourmarket.app`, plus an **App Store Connect API key** (App Manager) | uploaded to EAS (`eas credentials`), never to GitHub | O-2 |
| 3 | **Google Play Console** account (personal: 12 testers × 14 days closed test before production; organization: D-U-N-S) | — | O-3 |
| 4 | **Expo account**, then `cd apps/mobile && npx eas-cli@latest init` | writes the public `extra.eas.projectId` into `app.json`; the agent commits it | O-4 |
| 5 | **`EXPO_TOKEN`** (expo.dev → Access tokens) | GitHub secret `EXPO_TOKEN`, used only by the owner-approved `store-release` environment | O-4 |
| 6 | **EAS public variables** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL=https://labourmarket.ai` (plain text, `production`). **Never** the service-role key | EAS environment `production` | O-5 |
| 7 | **First interactive signed build** on each platform, so EAS creates the iOS certificate + profile and the Android upload keystore; keep **Play App Signing** on | EAS credentials | O-6 |
| 8 | **First Play upload by hand** (Internal testing), then a Play **service account** JSON for later uploads | EAS credentials | O-7 |
| 9 | **App links:** `ANDROID_CERT_FINGERPRINTS` (Play App Signing SHA-256, plus the upload key's when sideloading) and `APPLE_TEAM_ID` | production web deploy environment; `/.well-known/assetlinks.json` and `apple-app-site-association` then answer for every path in `apps/web/lib/mobile/app-association.ts` | O-8 |
| 10 | **ONE synthetic review account** with a password, one confirmed journal entry and one workspace | the store consoles' review fields and the `production-qa` secret `MOBILE_QA_PASSWORD`; never the repo | O-9, §6 item 4 |
| 11 | **Testers**: TestFlight internal (≤100 App Store Connect users), Play internal testing (≤100 e-mails) | the consoles | O-10 |

## 2. What the owner must approve (wording, art, legal)

| # | What | Draft |
|---|---|---|
| A | Icon and splash source art (≥1024 px), or approval to generate them from `apps/web/public/app-icon.svg` | [`mobile-store-assets-owner-pack-v1.md`](mobile-store-assets-owner-pack-v1.md) §1–2 |
| B | Listing text (title, short and full description), category, 18+ / 17+ rating | the pack §2 (Play), §3 (App Store) |
| C | Data safety (Play) and App Privacy (Apple) answers; the privacy manifest in `app.json` must match | the pack §2.1, plus §3 below |
| D | Real signed-in screenshots on a phone, real states only | owner pack §3–4 |
| E | Lawyer-reviewed privacy policy / terms and retention periods | the pack §6 item 8 |
| F | Whether account deletion must start **inside** the app (Apple 5.1.1(v)) — it needs a new privacy capability; held as an owner decision | the pack §0.3 |

## 3. Store answers for the new screens — DRAFT for the owner (updated 2026-11-18)

**These screens are on `main`** (#3451, #3453, #3471, #3485, #3497; the booking answer is proven by #3502). The drafts below are what the Play **Data safety** form and the Apple **App Privacy** label must say once a build with them ships. They are drafts: the owner approves them (item C above). Nothing here is submitted.

### 3.1 Screen by screen

| Screen | What a person does (capability) | Data type touched | New for the store answers? |
|---|---|---|---|
| Profile → Work history, Education, Languages | Add their own past jobs, schooling and languages (`worker.add-work-history`, `worker.add-education`, `worker.add-language`) | Other user-generated content (their own statements) | no: already declared; shown as the person's own statement, never as confirmed |
| Find candidates (organization workspace) | See the organization's needs and the **anonymized** ranked candidates for one need (`demand.list`, `candidate.search`) | none collected: candidates carry no name and no contact | no |
| Shortlist / Not a fit | Put a candidate on the organization's shortlist, or take them off with a short reason (`shortlist.add_*`, `shortlist.remove_*`) | Other user-generated content (the reason, kept as the organization's history) | no: same type |
| Propose a booking | Send dates and an optional note to a candidate who may be contacted (`company.propose-booking.*`) | Other in-app messages (the note, delivered only to that person's Offers) | no: *Messages → Other in-app messages* is already declared (#2928) |
| Close / reopen a need | Change a need's state (`demand.close_*`, `demand.reopen_*`) | none new | no |
| Agency offers | Accept / decline an agency's candidate; agree in principle to or decline a brigade / company (`company.respond-offer.*`, `company.respond-team-offer.*`) | none new: the agency's note is shown, nothing new is collected | no |
| Programmes & cohorts (training providers) | Create a programme or cohort; assign an accepted learner (`company.create-programme.*`, `company.create-cohort.*`, `company.assign-learner.*`) | Other user-generated content (programme and cohort names) | no |
| Invite a learner | Send an invitation e-mail to a learner (`company.invite-learner.*`) | **Email address and an optional name of ANOTHER person**, entered by the institution | **wording only:** *Email address* and *Name* are already declared (App functionality). The privacy policy must say that an institution can enter a learner's address to invite them and that the address is used only for that invitation. |
| Today | Organization stations shown only in an organization workspace (`context.list`) | none | no |
| Post a need (#3485) | The work's country is now a required field (`demand.create_*`) | Other user-generated content (the organization's need) | no: a typed country of the work is not device location; no location permission is asked |
| Agency (#3497) | An agency proposes one of **its own** people for a need a client shared, with an optional note (`agency.clients.get`, `agency.propose-candidate.*`) | Other user-generated content (the proposal); Other in-app messages (the note, shown to that client) | no: same types |
| Offers → a proposed start (#3502) | The worker accepts or declines a start a company proposed (`booking.list`, `worker.respond-booking.*`) | none new: the answer is the person's own record | no |

### 3.2 Resulting answers (unchanged types, one wording addition)

- **Play Data safety:** the same five rows as the pack §2.1: Email address, Name, User IDs, Other user-generated content, Other in-app messages. All are *collected*, *not shared*, purpose *App functionality* (+ *Account management* for e-mail), encrypted in transit, deletable on request. **No new row.**
- **Apple App Privacy:** Data Linked to You is Contact Info (Email), Identifiers (User ID), User Content (Other; Emails or Text Messages), Name. **Data Used to Track You: none.** It matches `ios.privacyManifests` in `app.json` on `main`, which already declares all five types, including `NSPrivacyCollectedDataTypeEmailsOrTextMessages`. The pack §2.1 "code gap" is **closed**.
- **Owner text to approve:** one sentence in the privacy policy about learner invitations (above). It is a lawyer-reviewed text (item E), so the agent does not write it.

### 3.3 Icon and splash

Already generated from `apps/web/public/app-icon.svg` (the LM mark) by `apps/mobile/scripts/generate-app-assets.mjs` (#2368), wired in `app.json` (`icon`, `android.adaptiveIcon` with monochrome, `expo-splash-screen`). The SVG has not changed since then (2026-09-09), so re-running the script produces the same files. **Only the owner's approval of the art is open (item A).**

### 3.4 Screenshots

Store screenshots must show real screens (pack rule 5: no staged or fake states). The isolated Android job (`android-need-isolated.yml`) walks the new screens on a throwaway local stack with **synthetic** data only. It deliberately uploads nothing today.

**Open question to the coordinator:** may that job save screenshots of the new screens as a short-lived artifact? These would be drafts, synthetic data only, never production. Real store screenshots still come from the owner's signed-in device (item D).

**Pack corrections for the owner's copy:**
- §1 Settings: the app has **7** languages (en, lt, ru, nl, de, pl, sv), not 6.
- §0.3 "No offers screen" is outdated: Offers (booking and invitation answers) is in the app.
- The IARC answer "users can interact" stays **yes**.
- The "not in the app" list still holds: no calendar, no AI chat, no marketplace, no push, no camera, no offline queue, no Google / Apple sign-in.

### 3.5 Versions and permissions (checked 2026-11-18)

- **Build numbers:** `eas.json` sets `appVersionSource: "remote"` and `autoIncrement` for `production`, so EAS owns the iOS build number and the Android version code. The `buildNumber: "1"` / `versionCode: 1` in `app.json` are only the starting point the release guard pins.
- **Marketing version:** `app.json` `version` is **`0.1.0`**. Both stores accept it. **Owner decision:** keep `0.1.0` for the first internal / TestFlight builds, or set **`1.0.0`** for the first public release. The agent changes it only on the owner's word.
- **Permissions:** the app asks for **no runtime permission**: no camera, photos, location, contacts, microphone or notifications dependency, so no iOS usage-description text is needed. Android blocks the legacy storage, overlay and biometric permissions (`android.blockedPermissions`, pinned by `mobile-release-config.test.ts`).
- **Privacy manifest:** `ios.privacyManifests` declares the five collected types of §3.2 and the four required-reason APIs; `NSPrivacyTracking` is `false` (no analytics or advertising dependency, also pinned by the guard).

## 4. What the agent does after each owner step

- **After #4 (`eas init`):** commit `extra.eas.projectId`, pin it in `mobile-release-config.test.ts`, and set the `eas.json` `submit.production` profile to internal track only, with no secret in the repository.
- **After #9:** prove App Links / Universal Links in CI (`adb shell pm verify-app-links`, an AASA fetch).
- **After #10:** run the signed-in Maestro journeys (`ios-signed-in.yml`, `android.yml` `signed-in`) and extend them to the new screens.
- **#3217 (`eas-release.yml`) is merged** and the owner has configured `store-release` (owner as required reviewer, `main` only, `EXPO_TOKEN` as its secret). The workflow is build-only. **The first real build runs only on the owner's separate permission; nothing is uploaded to a store.**
