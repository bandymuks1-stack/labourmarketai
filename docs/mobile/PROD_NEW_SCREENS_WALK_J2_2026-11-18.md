# Production walk of the new mobile screens — spec for J-2 (2026-11-18)

**Status: prepared, not run.** J-2 dispatches it **only after the owner approves**. Lane F does not dispatch production walks.

## What it is

A read-only walk of the screens that #3451, #3453 and #3471 added. It runs on a real Android emulator and a real iOS simulator, signed in as the owner's **one synthetic review identity**. This is the same identity, the same one-run password and the same `production-qa` environment as the existing dispatch journeys (android.yml `signed-in`, ios-signed-in.yml; owner approval 2026-10-28, runs of 2026-11-02).

- Flow: `apps/mobile/.maestro/new-screens-walk.yaml`
- Switch: the dispatch input **`new_screens_walk`** (boolean, default **false**). Without it, the jobs behave exactly as before.
- It runs **after** the existing three flows (signed-in, jobs / need with `NEED_SUBMIT=0`, parity with `MESSAGE_SEND=0`). It signs in itself and signs out at the end.

## What it reads, and what it writes

| Step | Capability (read) | Writes |
|---|---|---|
| Profile → Living CV sections | `cv.verified.get` | none |
| Work history form opened, then **Cancel** | — | none (no `worker.add-work-history`) |
| Education form opened, then **Cancel** | — | none (no `worker.add-education`) |
| Language form opened, then **Cancel** | — | none (no `worker.add-language`) |
| Today: organization stations shown or absent | `context.list` | none |
| *Organization workspace only:* Find candidates | `demand.list` | none (no close / reopen, no shortlist) |
| *Organization workspace only:* one open need's candidates | `candidate.search` | none (no shortlist, no proposal) |
| *Organization workspace only:* Agency offers | `client.agency_offers.get` | none (no answer) |
| *Organization workspace only:* Programmes & cohorts | `education.workspace.get` | none (no programme, cohort, assignment or invitation) |
| Sign-out | — | — |

**The walk itself writes nothing.** The flows that run before it in the same job are unchanged and already approved: one journal entry drafted and confirmed, its correction drafted and confirmed. No reply is sent (`MESSAGE_SEND=0`) and no need is posted (`NEED_SUBMIT=0`).

Personal or organization workspace: the walk passes both ways and says which in the log (`PERSONAL_WORKSPACE` / `ORGANIZATION_WORKSPACE`). In an organization workspace, each screen must show its loaded view or a named refusal (`capability-failed`, new in this PR), **never a spinner**.

## How J-2 runs it (after the owner's approval)

1. Actions → **Android** → Run workflow → branch `main` → `origin` empty (production) → **`new_screens_walk` ✓**.
2. When that job has ended (the review identity is shared; the jobs queue on `mobile-qa-review-identity`): Actions → **iOS signed-in journey** → Run workflow → branch `main` → **`new_screens_walk` ✓**.
3. Green claims to record: `ANDROID_NEW_SCREENS_WALK_PROVEN` / `IOS_NEW_SCREENS_WALK_PROVEN`, plus which workspace the identity was in.

No screenshot, simulator log or Maestro debug output is uploaded (public repository). On failure, the jobs print only the test ids on screen, as they already do.

## Why the isolated proof is Android only

The **writes** on the new screens (close / reopen a need, and later the CV forms) are proven on Android against a throwaway local Supabase stack (`android-need-isolated.yml`, no secrets, production hosts blackholed). GitHub's macOS runners cannot run Docker, so the local stack cannot start next to an iOS simulator. iOS therefore gets this read-only production walk instead. Its writes are the same capabilities the Android isolated job proves.
