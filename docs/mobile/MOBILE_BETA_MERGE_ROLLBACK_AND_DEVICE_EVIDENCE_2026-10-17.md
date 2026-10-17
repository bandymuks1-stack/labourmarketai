# Mobile beta — merge plan, rollback plan, device evidence, owner actions (2026-10-17)

| Field | Value |
|---|---|
| Scope | Owner direction 2026-10-17: PR #2447 (head `9234e80`) is technically ready for final integration review. This document is the deterministic merge and rollback plan, the compatibility verdict against `main` and the pending security fixes, the signed-in journey execution procedure with its evidence template, and the short list of owner actions that distribute the first Android and iOS beta builds |
| Rule | Nothing was merged, published, deployed, applied, purchased or changed in production. No credential was created or handled. Every production probe was a read of a public URL |
| Base | `main` at `100fef1` (unchanged since #2447 branched: #2447 is 0 commits behind, 5 ahead) |
| Companions | `MOBILE_BETA_EXECUTION_2026-10-16.md` (what #2447 contains) · `REAL_DEVICE_TEST_PLAN_2026-10-16.md` · `SIGNING_AND_SUBMISSION_RUNBOOK_2026-10-15.md` · `../launch/RELEASE_PREPARATION_2026-10-16.md` (GREEN order for the web PRs) · `../launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` (listing text, Data safety, App Privacy, review notes) |

Nothing here repeats the readiness audits. Those documents stay the record of
what the app is and what CI proves; this one only adds what was not yet
written down: the merge/rollback mechanics, the integration verdict, the
execution recipe for the signed-in journeys, and the evidence table to fill.

## 1. Compatibility verdict — #2447 against `main` and the pending fixes

Trial merges done locally on 2026-10-17 on throw-away branches from
`origin/main` `100fef1`, each PR merged by its fetched head, in this order.
"CLEAN" means git produced a merge commit with no conflict markers.

| Step | Merge | Result | Resulting tree |
|---|---|---|---|
| 0 | `main 100fef1` + #2447 `9234e80` | CLEAN (fast-forward: #2447 is already based on `100fef1`) | `9234e80` |
| 1a | + #2448 `4721f17` (production confirmation tokens require a dedicated secret) | CLEAN | `c5086f4` |
| 1b | + #2444 `18abe06` (the earlier variant of the same fix) instead of #2448 | CLEAN | `98aa06e` |
| 2 | 1a + #2437 → #2436 → #2435 → #2434 → #2432 → #2433 (the GREEN order of `RELEASE_PREPARATION_2026-10-16.md` §A) → #2446 → #2445 → #2443 (the hosting session's three fixes) | CLEAN at every step | `dc4bcfc` |

**#2444 and #2448 conflict with each other** (same four files:
`confirmable.ts`, `dispatch.ts`, `env.ts`, `.env.example`). They are two
implementations of the same owner direction (P5, dedicated confirmation
secret); exactly one may merge and the other must be closed.
Recommendation, technical and reversible: **merge #2448, then the
follow-up PR that removes the remaining non-production fallback
(`fix/cc/confirmation-secret-no-fallback-anywhere`, stacked on #2448), and
close #2444 as superseded.** Why not #2444 alone: it lacks #2448's
blank-value handling (an empty hPanel field crashed the whole app at import
time), its 32-character floor and its single rule module. Why not #2448
alone: it keeps the service-role fallback outside `NODE_ENV === "production"`,
and the owner's invariant (2026-10-17) is that **no service-role fallback
remains anywhere**. The follow-up keeps #2448's structure, makes the rule
environment-free (the `production` flag and the service-role input are no
longer read), carries the local-harness change #2444 needed
(`patches/2444-local-harness-secret.patch`: `dev-acceptance.ts` and
`e2e-local.ts` pass a loopback-only value when none is exported), and rewrites
the tests so the refusal is asserted with the flag true, false and absent.
The hosting session is already tracking #2448 as the one to deploy. What the mobile app depends on
is identical in both: `journal.confirm`, `interest.express_confirm`,
`demand.create_confirm` through `POST /api/mcp` are signed by
`confirmable.ts`, so **after either PR merges, every confirm from the phone
refuses on a host that lacks `CONVERSATION_TOKEN_SECRET`** (named error, no
silent failure). That is owner action 1 below, and it must land before the
security PR merges, not after.

### 1.1 Local checks on the integrated tree

Run on `dc4bcfc` — a SUPERSET of the merge target: `main 100fef1` + #2447 +
#2448 + the nine web PRs of step 2 above. A pass on the superset covers the
narrower `main` + #2447 + #2448 tree (`c5086f4`). Outcome lines in §1.2 are
copied from the terminal, not inferred.

### 1.2 Outcome lines

| Check | Tree | Outcome |
|---|---|---|
| `pnpm -F web typecheck` | `dc4bcfc` | **exit 0** |
| `pnpm -F mobile typecheck` | `dc4bcfc` | **exit 0** |
| `pnpm -F @labourmarket/client-core test` | `dc4bcfc` | **6 files, 91/91 passed**, exit 0 |
| `vitest run lib/capabilities lib/conversation lib/security lib/guards lib/mobile` (web) | `dc4bcfc` | **1,237 files, 21,576 passed, 1 skipped, 0 failed** (28 min). Process exit 1 from ONE worker fork that crashed before running (`ERR_MODULE_NOT_FOUND: pathe` resolved from the hoisted vitest chunk — an artefact of this worktree's offline `pnpm install`, not a test); vitest counted it as 1 error and re-ran nothing. Treated as infrastructure; the per-PR CI runs of the same suites are green |
| `pnpm -F web lint` | `dc4bcfc` | **exit 0** (0 errors, 75 pre-existing warnings) |

CI on #2447 `9234e80` (read from the check runs, 2026-10-17): quality,
mobile, e2e-smoke, migration-safety, CodeQL, Build internal test APK,
Emulator launch + Maestro journey, ios — all **success**; "Signed-in journey"
skipped by design on a PR run; **Vercel: fail, "Account is blocked"** — the
hosting incident, not the code; it is the only reason the PR shows
`UNSTABLE`. #2448 `4721f17`: the same set green, Vercel the same failure.

## 2. Deterministic merge plan

Preconditions (all must hold; none holds today):

| # | Precondition | How to verify without exposing anything | State 2026-10-17 |
|---|---|---|---|
| P1 | Owner lifts the merge hold (N-11 in `RELEASE_PREPARATION_2026-10-16.md`) | the owner's word | hold stands |
| P2 | A host runs the web app and `GET /api/health` answers with a current `build` | one public GET | **none public.** `https://labourmarket.ai` answers HTTP 402 everywhere (Vercel blocked since 2026-10-15). An ISOLATED staging exists (hosting session, 2026-10-17): a container on the VPS bound to loopback only, build of PR #2452, health ok with `build: null` (`GIT_SHA` unset), production Supabase read-only (no service role) — usable for anonymous conformance reads, never for signed-in journeys. The owner's hosting cutover decides the public origin |
| P3 | `CONVERSATION_TOKEN_SECRET` present on that host (name only) | `node -e 'console.log(process.env.CONVERSATION_TOKEN_SECRET ? "present" : "MISSING")'` in the service's environment | present on the isolated staging (a test value); **absent on production**. After #2448 + #2451 it is required wherever a confirmation is signed |
| P4 | #2444 closed in favour of #2448 (or the reverse — one of them) | PR state | both open |

Order, one squash merge at a time, `quality` + `migration-safety` green on
`main` after each before the next (`gh pr checks` on the merge commit's run),
then `GET /api/health` on the host shows the new build:

| Step | PR | Why this position | Post-step check |
|---|---|---|---|
| M1 | #2447 (mobile + release docs) | no env dependency; additive only (two exposed reads, screens, dispatch-only workflows, docs); publishes the toolset fingerprint `0.1.0+t231.6abffb4c` | `GET /api/mcp` on the host → `toolCount` 231, fingerprint `0.1.0+t231.6abffb4c`; `android.yml` and `ios.yml` run on the `main` push (paths filter matches) — both must be green on the merge commit |
| M2 | the web GREEN order #2437 → #2436 → #2435 → #2434 → #2432 → #2433 → #2446 → #2445 → #2443 | as planned in `RELEASE_PREPARATION_2026-10-16.md` §A plus the hosting session's three fixes; each independent of P3 | smoke block 0 after each (that document) |
| M3 | #2448 (security) | **only after P3** — the first confirm on the host proves it: one `journal.confirm` succeeds, a replay of the same token is refused | smoke row 7 of `PRODUCTION_SMOKE_20MIN_2026-10-16.md` |
| M4 | #2438 (master audit docs) | after owner decision D-1 | — |

Why #2447 goes first: it is the only PR in the set whose `main` run produces
the artefacts the beta needs (release APK, AAB, store-policy facts, the iOS
device archive), and nothing in it reads `CONVERSATION_TOKEN_SECRET`. Putting
it after M3 would mean the first signed-in device run happens on a tree that
already refuses confirms without the secret — a worse place to diagnose from.

Auto-merge stays OFF on every PR while the hold stands; when the owner lifts
it, GREEN-class PRs may use `gh pr merge --auto --squash` in this order.

## 3. Rollback plan

Every PR above is a single squash commit with no migration, no env change and
no data effect, so rollback is one `git revert` per step, in reverse order of
merging, pushed to `main` through an ordinary PR (CI runs on the revert):

| Rolled back | Command | Effect | What it does NOT undo |
|---|---|---|---|
| #2447 | `git revert <squash-sha-of-2447>` | removes `jobs.search` / `jobs.get` from the registry (fingerprint returns to `0.1.0+t229.105ffae5`), the five mobile screens, the dispatch-only workflows, the docs; `android.yml` loses the `signed-in` job | nothing persisted: no table, no row, no env. An installed beta build keeps working for sign-in, Today, journal, profile; its Jobs / Opportunities / Who is free / Post a need screens would show the capability's named refusal (`unknown_tool`) until updated. **No build has been distributed yet, so there is no device population to roll back** |
| #2448 | `git revert <squash-sha-of-2448>` | restores the service-role fallback for confirmation signing | pending tokens (TTL 5 min) signed with the dedicated secret stop verifying — the person re-confirms. The secret may stay on the host; nothing reads it after the revert |
| any web GREEN PR | `git revert <squash-sha>` | per `RELEASE_PREPARATION_2026-10-16.md` §A | none |

Partial rollback inside #2447 is not needed and not planned: the two exposed
reads are read-only, idempotent, anonymous-projection only; if one must go,
its registry pair is removed in a follow-up PR, not by reverting the screens.

Distributed builds (once they exist): Play Internal testing and TestFlight
both allow halting a release and pushing a higher `versionCode` /
`buildNumber`; a store build is never "reverted", it is superseded. Until the
first upload, rollback is purely a `main` matter.

## 4. Signed-in Android and iOS journeys — execution recipe (blocked today)

Blocked on P2 (no reachable origin) and on owner action 2 (no password for
the review identity, no `production-qa` secrets). Everything else is in
#2447. When both exist:

1. **Android**: Actions → "Android" → Run workflow on `main` (after M1) or on
   the #2447 branch. Set `origin` to the reachable origin if it is not
   `https://labourmarket.ai` (this input is added by this document's PR; the
   iOS and App Links workflows already have it). The `signed-in` job builds the
   release APK with the production public config (`vars.PROD_QA_ANON_KEY`),
   installs it on an API 34 x86_64 emulator and runs
   `.maestro/signed-in-journey.yaml`: sign in → Today figures read → one
   journal entry drafted and confirmed for yesterday → profile skills read →
   sign out. One journal row for the synthetic identity per run; nothing
   uploaded (public repository).
2. **iOS**: Actions → "iOS signed-in journey" → Run workflow with the same
   `origin`. Release simulator build with the production public config; same
   flow; app uninstalled afterwards.
3. **App Links served half**: Actions → "App Links proof" → Run workflow with
   `origin`. Expected today: both documents **404, named as the owner gate**
   (`ANDROID_CERT_FINGERPRINTS` / `APPLE_TEAM_ID` unset) — that is a correct
   result, not a defect.
4. **Physical devices** (owner, per `REAL_DEVICE_TEST_PLAN_2026-10-16.md`):
   install the CI APK (`android.yml` artefact) on one Android phone; the iOS
   device run needs a signed build (TestFlight) and cannot happen before owner
   actions 4–5.

The `production-qa` environment exists with **no protection rules and no
secrets** (read 2026-10-17): a dispatch will start immediately once the two
secrets are set, with no reviewer step in between.

### 4.1 Device evidence — to fill, never pre-filled

| Run | Platform / target | Origin | Build SHA | Workflow run URL | Duration | Result | Claim token | Defects (id → §4.2) |
|---|---|---|---|---|---|---|---|---|
| A-1 | Android emulator, API 34 x86_64 | | | | | not run | `ANDROID_SIGNED_IN_JOURNEY_PROVEN` | |
| I-1 | iOS simulator (newest Xcode, Release) | | | | | not run | `IOS_SIGNED_IN_JOURNEY_PROVEN` | |
| L-1 | App Links served half | | | | | not run | — | |
| A-P1 | Android phone (model, OS) — owner | | | | | not run | — | |
| I-P1 | iPhone (model, iOS) — owner, via TestFlight | | | | | not run | — | |

### 4.2 Defects found on devices

| Id | Run | Step | Observed | Expected | Severity | Fix PR |
|---|---|---|---|---|---|---|
| — | | | | | | |

## 5. Store submission preparation — state, not intent

Technical readiness is complete and proven in CI (`SIGNING_AND_SUBMISSION_RUNBOOK_2026-10-15.md`
A1–A6, I1–I6). What this pass adds and what it deliberately does not:

| Item | State | Note |
|---|---|---|
| Signing material kept out of the repository | **added by this PR**: `.gitignore` refuses keystores, `.p8/.p12`, provisioning profiles and Play service-account JSON anywhere in the tree | the upload key and the ASC API key live only in EAS credentials or on the owner's machine |
| `eas.json` submit profile | **not added, on purpose** | `mobile-release-config.test.ts` pins that `eas.json` holds no `serviceAccount…`, `ascAppId`, `appleId`, `appleTeamId` — a submit profile needs exactly those. The owner's `eas submit` call passes them interactively or via `EXPO_*` environment variables, never through the repository |
| App Links / Universal Links | code complete; **served half 404 until the owner sets `ANDROID_CERT_FINGERPRINTS` and `APPLE_TEAM_ID` on the host** | proof workflow ready (#2447) |
| Privacy declarations | iOS privacy manifest in `app.json` (Email, Name, User ID, Other user content; no tracking), pinned by guard; Play Data safety answers drafted in the submission pack §2.1 | the owner pastes §2.1 into the Play form; Apple's App Privacy questionnaire mirrors the manifest |
| Store listings | drafted in the submission pack §2 (Play) and §3 (App Store) | owner approves wording, icon, rating; real signed-in screenshots can only be taken after P2 + owner action 2 |
| Versions | `0.1.0`, `versionCode 1`, `buildNumber 1` | first upload uses these; the owner bumps per upload (`eas.json` production profile has `autoIncrement: true`) |
| Android closed-test rule | 12 testers × 14 days before production for a new personal Play account | plan the internal-testing track first; it has no such rule |
| **Voice Work Journal** (owner direction 2026-10-17: part of the final feature audit) | **not in the beta.** The voice door exists on the web only (`/dashboard/journal/voice`; `docs/VOICE_DOOR_ADAPTER_V1.md`, owner decision U-26) and is OFF in production until the self-hosted STT service is deployed (`VOICE_TRANSCRIBE_URL` + `VOICE_TRANSCRIBE_TOKEN`; bundle and runbook in PR #2198, host not deployed). The phone has no microphone permission, no capture screen and no STT client (the APK requests INTERNET + VIBRATE only; `app.json` blocks nothing voice-related because nothing asks). Adding it later is the same adapter contract: mic → STT → editable text → the SAME `journal.create_draft` → `journal.confirm`; it would add `RECORD_AUDIO` / `NSMicrophoneUsageDescription` to the store declarations and a Data safety row (audio, processed, not stored) | owner: deploy the STT host first (hosting lane), then a mobile slice of its own; never before the first beta |

## 6. Owner actions required to distribute the first Android and iOS beta builds

In the order they unblock each other. Agents cannot do any of these.

| # | Action | Unblocks |
|---|---|---|
| 1 | **Hosting**: enable SSH in Hostinger hPanel so the hosting session can deploy the standalone build; then set `CONVERSATION_TOKEN_SECRET` (≥ 32 chars, `openssl rand -hex 32`) in that host's environment, same value on every instance. Confirm with the name-only check in §2 P3 | P2, P3 → merges M1–M3, every signed-in journey, every confirm from the phone |
| 2 | **Review identity**: give the synthetic worker `qa.worker+goal3@labourmarket.ai` a password (Supabase dashboard → Authentication → Users → that user → reset password; the account already exists in production and is `app_metadata.qa_synthetic`); then create the two `production-qa` environment secrets `MOBILE_QA_EMAIL` and `MOBILE_QA_PASSWORD` (`gh secret set MOBILE_QA_EMAIL --env production-qa`, same for the password; values never typed into chat or a file) | Android and iOS signed-in CI journeys; the reviewer account Google and Apple ask for |
| 3 | **Merge hold**: lift it, or merge in the order of §2 (M1 first); close #2444 in favour of #2448 (or state the reverse) | M1–M4 |
| 4 | **Google Play**: developer account; upload key + Play App Signing (`eas credentials` or a local keystore kept off the repo); set `ANDROID_CERT_FINGERPRINTS` (upload cert **and** Google's app-signing cert, comma-separated) on the host; `eas init` or local `./gradlew :app:bundleRelease`; upload the signed AAB to **Internal testing**; paste listing §2 and Data safety §2.1; content rating | first Android beta build on a tester's phone; App Links verification |
| 5 | **Apple**: Developer Program; set `APPLE_TEAM_ID` on the host; App Store Connect record for `ai.labourmarket.app`; distribution certificate + profile (`eas credentials`); `eas build --platform ios --profile production`; upload to **TestFlight** (internal testers need no beta review); App Privacy answers mirror the manifest; review notes from pack §3 | first iOS beta build on an iPhone; Universal Links |
| 6 | **Approvals**: listing text, icon, 17+/18+ rating; lawyer sign-off on privacy policy and terms (the pending banner) before external testers | public beta (closed test / external TestFlight) |

Items 1–3 need no payment and no account creation; items 4–5 are the paid,
identity-bound store accounts and the signing keys; item 6 is sign-off.
After 1 and 2 the agent runs §4 steps 1–3 and fills §4.1 and §4.2; after 4
and 5 the agent adds the App Links CI proof and the `eas` project id guard
named in the runbook §3.
