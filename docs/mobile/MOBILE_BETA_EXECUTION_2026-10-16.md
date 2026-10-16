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

Remaining failures on `2cab9ad`: **none among the completed checks.** The push of `bf64c47` superseded its iOS run (cancelled by the workflow's own concurrency rule); every proof re-ran on `bf64c47` — results in §1b.

### 1b. CI results — commit `bf64c47` (commit 3: opportunities, availability, signed-in journey prepared)

| Check | Result |
|---|---|
| quality | ✅ success |
| mobile | ✅ success |
| e2e-smoke | ✅ success |
| migration-safety | ✅ success |
| CodeQL / Analyze | ✅ success |
| Build internal test APK | ✅ success |
| Emulator launch + Maestro journey | ✅ success |
| Signed-in journey (dispatch only) | skipped on a PR run, by design |
| ios | BF64_IOS |

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

## 6. Incremental implementation — done and prepared

Correction to the readiness document's parity matrix (2026-10-16, this
revision): the registry behind `/api/mcp` publishes **229 tools**, not the 15
in `registry.ts` alone — among them `work.find` (the caller's ranked board),
`jobs.new.list`, `opportunities.saved.list`, `conversation.list` /
`conversation.get` / `message.send_draft` / `message.send_confirm`,
`calendar.agenda.get`, `absence.*`, `notification.*`, `marketplace_listing.*`,
`service_request.*`, `cv.state.get`. Messaging and several company reads ARE
bearer-reachable today; what the phone lacks for them is a screen, not a
door. The matrix's "no bearer-reachable capability" rows for messaging and
company operations are withdrawn; AI chat remains web-only.

### Done on this branch (commit 3 and commit 4 of PR #2447)

| Increment | Capabilities | Registry change | Files | Proof |
|---|---|---|---|---|
| Opportunities + express interest | `interest.express_draft` / `interest.express_confirm` | none | `app/(shell)/opportunities.tsx`, `src/screens/opportunities.tsx` | mobile typecheck; web guards; Hermes bundles |
| Who is free | `workforce.availability` | none | `app/(shell)/availability.tsx` | same |
| **F-1 Jobs** — the PUBLIC vacancy board on the phone | **new** `jobs.search`, `jobs.get` (`lib/capabilities/public-jobs-capabilities.ts`) over the existing `searchPublicVacancyPreviews` / single-preview core, through the caller's own client, anonymous projection only; read-only, idempotent, `page` bounded 1..100; toolset fingerprint `0.1.0+t231.6abffb4c` recorded | +2 exposed reads (231 tools) | `app/(shell)/jobs.tsx`, shapes, six-locale copy; `public-jobs-capabilities.test.ts` (5 tests: exposure/annotations, canonical RPC args, anonymous projection, bounded page, timeout ≠ empty, get/not_found/invalid) | registry suite 36 files / 431 tests; mobile typecheck; bundles |
| **F-2 job deep links (within the claim contract)** | `jobs.get` | — | `labourmarketai://jobs?id=<uuid>` and the claimed `https://labourmarket.ai/jobs` open the Jobs screen; an `id` shows that one job above the board (`not_found` is a sentence); each job's `webPath` opens the member page in the browser | same |
| **F-5 Post a need** | `demand.create_draft` / `demand.create_confirm` | none | `app/(shell)/need.tsx`, `src/screens/need-intake.tsx` — description, role, place, people, urgency → server preview naming the organization → confirm; refusals by name incl. `over_open_need_limit` | mobile typecheck; guards; bundles |
| **F-3 iOS signed-in journey (prepared)** | all reads + the journal write | — | `.github/workflows/ios-signed-in.yml`: `workflow_dispatch` only, `production-qa` environment, production public config from `vars.PROD_QA_ANON_KEY`, `origin` input for a staging URL, same Maestro flow (keyboard dismissal is Android-only in the flow), one driver retry, nothing uploaded, app uninstalled afterwards | YAML parsed; execution needs O1 + reachable origin |
| **F-4 App Links served-half proof (prepared)** | — | — | `.github/scripts/app-links-proof.mjs` + `.github/workflows/app-links-proof.yml` (`workflow_dispatch`, `origin` input): both `.well-known` documents fetched, JSON, our ids, well-formed fingerprints / Team ID, components = `NATIVE_APP_PATHS` exactly; 404 reported by name as the owner gate, never as a fault | `node --check`; execution needs a reachable origin (and O2/O3 for a 200) |
| Signed-in Android journey (prepared, commit 3) | — | — | `signed-in-journey.yaml`, emulator script, `android.yml` job `signed-in` | execution needs O1 |

Per-job https links: website job pages are locale-prefixed
(`/lt/jobs/<id>`); the association tables claim exact screens only
(`app-association.test.ts` forbids wildcards and prefixes) because a claim
is a promise to handle. Claiming `/{locale}/jobs/*` for six locales is an
owner decision — the app can honour it (the Jobs screen reads `id`), but the
claim widens what an installed app intercepts. Until then the custom scheme
and `webPath` carry the link both ways.

### Deferred, with the reason

| # | Increment | Why not now |
|---|---|---|
| F-6 | Journal entry detail + supersede on the phone | no `journal.supersede_*` capability exists; adding one is a registry pair over `journal_entry_supersede_v2` / `supersedeJournalEntry` with its own token binding and hash-chain fingerprint — a slice of its own (3 d) that must not ride a beta PR |
| Messaging screen | `conversation.*` / `message.send_*` exist | a reading screen is 2 d; the write needs the §8.1 contact gate surfaced honestly; after beta |

Branching: this session pushes only to its own branch; commits 3 and 4 are
each self-contained and cherry-pick cleanly onto fresh branches if the owner
wants them reviewed apart.

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
