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

## 3. What changes in the store answers with the new screens (#3451–#3455)

These apply **once those PRs are merged**. Until then the pack's §1 scope stands.

| Screen | What a person does | Data safety / App Privacy |
|---|---|---|
| Profile → Work history, Education, Languages | Add their own past jobs, schooling and languages to the Living CV (`worker.add-work-history`, `worker.add-education`, `worker.add-language`) | already covered: *Other user-generated content* and *Name*, App functionality; the person's own statements, never shown as confirmed |
| Find candidates (employers) | See the organization's needs and the **anonymized** candidates the web scouting search ranks for one need; shortlist one (`demand.list`, `candidate.search`, `shortlist.add_*`) | no new data type: candidates carry no name and no contact; the shortlist is the organization's own record |
| Propose a booking (employers) | Send a booking proposal with optional dates and a note to a candidate who may be contacted (`company.propose-booking.*`) | *Other in-app messages / user content*: the note reaches only that person, in their Offers |

**Pack corrections for the owner's copy:**
- §1 Settings: the app has **7** languages (en, lt, ru, nl, de, pl, sv), not 6.
- §0.3 "No offers screen" is outdated: Offers (booking and invitation answers) is in the app.
- The IARC answer "users can interact" stays **yes**.
- The "not in the app" list still holds: no calendar, no AI chat, no marketplace, no push, no camera, no offline queue, no Google / Apple sign-in.

## 4. What the agent does after each owner step

- **After #4 (`eas init`):** commit `extra.eas.projectId`, pin it in `mobile-release-config.test.ts`, and set the `eas.json` `submit.production` profile to internal track only, with no secret in the repository.
- **After #9:** prove App Links / Universal Links in CI (`adb shell pm verify-app-links`, an AASA fetch).
- **After #10:** run the signed-in Maestro journeys (`ios-signed-in.yml`, `android.yml` `signed-in`) and extend them to the new screens.
- **Merging #3217 (`eas-release.yml`)** is the owner's call: it builds only behind the `store-release` environment's required reviewer.
