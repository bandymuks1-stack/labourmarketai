# Mobile beta execution — 2026-10-16 (evening)

Continues `MOBILE_COMPLETION_AND_RELEASE_READINESS_2026-10-16.md` from PR
#2447. Owner direction: verify CI on the current commit, fix real failures
without weakening coverage, coordinate hosting, prepare and execute a
signed-in journey, finish App Links and release configuration, define the
minimum useful beta, prepare incremental capability PRs; no publishing,
purchases or deploys without approval; no second codebase.

## 1. CI results — commit `2cab9ad` (PR #2447), read from the check runs

| Check | Result | Note |
|---|---|---|
| quality (typecheck, lint, 29.9k unit tests, guards, product gate, product truth, build) | ✅ success | the register correction and the docs pass every gate |
| mobile (client-core typecheck + tests, mobile typecheck, Android + iOS Hermes bundles) | ✅ success | |
| e2e-smoke | ✅ success | |
| migration-safety | ✅ success | no migration in the PR |
| CodeQL / Analyze (javascript-typescript) | ✅ success | |
| Build internal test APK (`android.yml`) | ✅ success | release APK, AAB, store-policy facts — all from `2cab9ad` |
| Emulator launch + Maestro journey (`android.yml`) | see §1a | started 21:18 UTC |
| ios (`ios.yml`, with the retry from this PR) | see §1a | started 21:05 UTC; macOS runs take ~40 min |

The `check_suite.completed` event received at 21:06 UTC referred to the
superseded head `d7fd1d6`, not to `2cab9ad`; it was not counted.

### 1a. Results that landed after this document was written
Recorded in the PR conversation and in the next revision of this file, never
inferred: a run that has not finished is "in progress", not "green".

Remaining failures on `2cab9ad`: **none among the completed checks.**

## 2. Signed-in mobile functionality — what is confirmed and how

| Claim | Level of proof today | Where the proof lives |
|---|---|---|
| Sign-in form renders; a real sign-in attempt runs; a wrong password and an offline attempt surface honestly | CI emulator + CI simulator, every run | `auth-failure-journey.yaml`, `offline-sign-in-journey.yaml` |
| `profile.get`, `journal.list`, `journal.work_intelligence.get`, `living_cv.skills.get`, `context.list/switch`, `journal.create_draft` → `journal.confirm` behave as specified for a bearer caller | unit + registry tests in the web suite (green on `2cab9ad`) | `apps/web/lib/capabilities/*.test.ts`, `lib/guards/mcp-*.test.ts` |
| The SAME calls succeed from a phone signed in as a real identity against production | **NOT YET CONFIRMED** — no signed-in run has ever happened | blocked on O1 (review identity password) and on a reachable API (hosting) |

Prepared in this PR so the confirmation is one owner action away:
- `apps/mobile/.maestro/signed-in-journey.yaml` — sign-in → Today figures
  read → journal draft + confirm → profile skills read → sign-out, by testID
  only (tabs now carry `tab-today`/`tab-journal`/`tab-profile`/`tab-settings`;
  the context chooser's options carry `journal-compose-option-<n>`).
- `.github/scripts/android-emulator-signed-in-journey.sh` — refuses without
  the identity or with a placeholder build; no screenshot, logcat or debug
  output is uploaded; the session is wiped from the emulator afterwards.
- `android.yml` job `signed-in` — `workflow_dispatch` only, GitHub
  environment `production-qa`, secrets `MOBILE_QA_EMAIL` /
  `MOBILE_QA_PASSWORD`. PR runs never receive environment secrets.

To execute: owner creates the two environment secrets (one synthetic identity
from the `prod-qa-guard` allowlist, a password set by the owner), then runs
Android → "Run workflow" on the PR branch or `main`. The run writes ONE
journal entry for the synthetic identity per execution, the same class of
write `prod-qa-walk.yml` already performs.

iOS signed-in: the simulator build in `ios.yml` is compiled with placeholder
(bad-network) config on purpose; a signed-in iOS journey needs a
production-config simulator build behind the same environment gate — the
next CI increment (F-3 below), not done here.

## 3. Hosting coordination

The hosting session (Cloudflare/Hostinger migration, owner's local Cowork
session) was sent the exact list of what the app needs from the restored
origin: `POST /api/mcp` (bearer), `GET /api/health` with build id, the two
`.well-known` association routes, the `/{locale}/legal/*` pages, and the env
NAME `CONVERSATION_TOKEN_SECRET`. It was asked to reply with the reachable
origin and its health build. No reply at the time of writing; this sandbox
cannot probe `labourmarket.ai` itself (egress proxy 403), so reachability is
the hosting session's statement to make. The app's API base URL is a build
input (`EXPO_PUBLIC_API_BASE_URL`), so a staging origin needs no code change:
the APK job's "Resolve public build configuration" step is where it would be
pointed.

## 4. App Links and release configuration

| Item | State | What finishes it |
|---|---|---|
| Deep-link claim tables | ✅ updated for the two new stations (`/opportunities`, `/availability`) in `NATIVE_APP_PATHS`, `app.json` intent filters (both hosts) and the Apple document; guard-pinned | — |
| `/.well-known/assetlinks.json` | route exists; answers once `ANDROID_CERT_FINGERPRINTS` is set on the production deploy | owner: upload certificate + Play App Signing certificate |
| `/.well-known/apple-app-site-association` | route exists; answers once `APPLE_TEAM_ID` is set | owner: Apple Developer Program |
| CI proof of verification (`adb shell pm verify-app-links`, AASA fetch) | not yet; meaningless before the two values exist | agent, after the values |
| `eas.json` | profiles present; `submit` empty by design | owner: `eas init` (project id) or local signing |
| Version numbers | `0.1.0`, `versionCode 1`, `buildNumber 1` | owner bumps per upload |

## 5. Minimum useful mobile beta (Work Journal + Living CV centred)

| In the beta | Why it is enough |
|---|---|
| Sign in / register (e-mail + password), recovery via web, terms + privacy before register | the store minimum and the legal minimum |
| Today: own figures (today / 7 days), recent entries, dominant skill | the person sees that recorded work becomes numbers |
| Work journal: list; Log work: date (past only), site, notes → draft → confirm, context chooser | the one write that feeds everything else |
| Profile: held roles, skills in the web's evidence order | Living CV read: what the entries add up to |
| Settings: six languages, workspace switch, privacy / deletion / terms / support, sign-out | account controls both stores check |
| Weak-network honesty on every read and write | a field worker's reality |
| **New in this PR:** Opportunities — the needs visible to the person, express interest with a note (draft → confirm) | closes the loop from recorded work to the next engagement without a new door |
| **New in this PR:** Who is free — the acting workspace's roster over 7 days, committed ≠ unavailable | the first manager-side read on the phone, same read as web planning |

Deliberately NOT in the beta: messaging, AI chat, marketplace listings,
projects, calendar editing, photo/voice evidence, push, offline queue, Google
sign-in — each is an owner decision or needs a bearer capability that does
not exist yet.

## 6. Incremental implementation — done now and prepared next

Done on this branch (commit 3 of PR #2447; all on the existing doors, no
registry change, no migration, no env):

| Increment | Capabilities used | Files | Proof |
|---|---|---|---|
| Opportunities + express interest | `interest.express_draft` (list = the draft's own option answer), `interest.express_draft` (requestId, note) → `interest.express_confirm` | `app/(shell)/opportunities.tsx`, `src/screens/opportunities.tsx`, shapes, six-locale copy | mobile typecheck; web guards (association, release config, account controls, weak network) 72/72; Android + iOS Hermes bundles |
| Who is free (availability) | `workforce.availability` | `app/(shell)/availability.tsx`, shapes, six-locale copy | same |
| Signed-in journey (prepared) | all read + the journal write | Maestro flow, emulator script, dispatch-only job | YAML parsed, shell syntax checked; execution needs O1 |

Prepared next (each one PR, GREEN class, in dependency order):

| # | PR | Depends on | Effort |
|---|---|---|---|
| F-1 | `jobs.search` read capability in `registry.ts` over the existing core `searchPublicVacancyPreviews({ query, professionSlug, page })` (`lib/vacancy-store/public-vacancy-preview.ts`, cached, 20 per page), `readOnlyHint: true`, plus the toolset-fingerprint register row the `toolset-fingerprint.test.ts` guard demands (a new exposed capability changes the published fingerprint) + a Jobs screen (query, profession, paging) + deep-link `/jobs` | nothing | 2 d |
| F-2 | Interest from a shared public job link: `/jobs/[id]` deep link opens the app on the job, with "I am interested" reusing the Opportunities flow where the job maps to a visible demand | F-1 | 1.5 d |
| F-3 | iOS signed-in journey: `ios.yml` `workflow_dispatch` input `signed_in` → production-config simulator build + the same Maestro flow under `production-qa` | O1 | 1 d |
| F-4 | App Links / Universal Links CI proof once the two env values exist | O2, O3 | 0.5 d |
| F-5 | Need intake on the phone (`demand.create_draft/confirm`) for the acting organization | nothing | 2 d |
| F-6 | Journal entry detail + supersede (needs a `journal.supersede_draft/confirm` pair in the registry over `journal_entry_supersede_v2`) | registry addition | 3 d |

Branching: this session may push only to its own branch, so the increments
above are specified here and the two that are done ride PR #2447; splitting
them into separate PRs is a `git cherry-pick` of commit 3 onto fresh
branches when the owner wants them reviewed apart.

## 7. Store publication readiness (unchanged gates, restated)

Android: technical readiness complete for an internal-testing upload the
moment the owner has a Play Console account, an upload key with Play App
Signing, the fingerprints on the web deploy, and a signed AAB (`eas build`
or local Gradle with the signing config). Then a 12-tester × 14-day closed
test before production (Play rule for new personal accounts).

iOS: technical readiness complete for TestFlight the moment the owner has
the Apple Developer Program, Team ID on the web deploy, a distribution
certificate + profile, and a signed IPA. External TestFlight needs beta
review; App Review needs the notes in the submission pack.

Both: review identity (O1), reachable production API, `CONVERSATION_TOKEN_SECRET`
on the host before #2444 merges, approved listing text / icon / Data safety /
App Privacy, legal sign-off on privacy policy and terms.

Nothing in this PR publishes, purchases, deploys or changes production.
