# Pilot terms & responsibility — v1

Plain language. Not a contract. The legal terms live in `messages/{lt,en}.json` under `legal.terms` + `legal.privacy` + `legal.cookies` and are owner-controlled; this doc explains what those mean operationally.

## What a pilot tester is signing up for

By signing in and using the pilot, you:

- agree your **session id**, **route paths**, **task durations**, and **event codes** are recorded in `pilot_events` for product debugging. None of these include your text content or PII.
- agree your **language-feedback reports** (highlighted text + your comment) are stored in `language_feedback` and visible only to the admin.
- agree your **journal entries**, **profile text**, and **skill claims** are stored in your owner-private tables, visible only to you and the admin.

You are NOT signing up for:

- public visibility of any data you enter;
- a marketing opt-in;
- newsletter / SMS / email outside the product;
- a paid product;
- a binding employment / contracting relationship of any kind.

## What the platform commits to

For the duration of the pilot:

- **No public exposure** of your text content, your profile, your journal, your drafts, your feedback. Pinned by RLS at the database layer + tests in `lib/guards/*`.
- **No external analytics SDK.** Telemetry is first-party (`public.pilot_events`).
- **No keystroke logging, screen recording, or hidden tracking.**
- **No `service_role` in app runtime.** Every read/write goes through the authenticated user's session and is scoped by RLS.
- **No autonomous merge / deploy / migration bot.** Every production change is owner-gated.
- **Manual incident response.** If you report something private or sensitive, a human (the owner) responds — there is no auto-classification.

If any of these is violated, the right response is: tell the owner directly, and file it in `language_feedback` with "PRIVACY:" prefix so it's findable.

## What the platform does NOT commit to (yet)

- **Real-time notifications.** v1 has no push / email / SMS notifications. Internal communication (PR landing this sprint) is poll-on-page.
- **Uptime SLA.** Pilot = pilot. The product can be down for short windows during a deploy.
- **Long-term data retention guarantees.** Pilot data may be migrated or purged when the pilot phase closes. Anything important should be exported / copied locally.
- **Cross-device sync of in-progress work.** SessionStorage caches (e.g. OAuth trace id, telemetry session id) are per-tab.
- **A formal "I quit the pilot" button.** Email the owner to revoke and have your rows deleted; the admin does it manually.

## How you can stop

- Sign out — your session ends. Data stays on your account.
- Email the owner — they remove your rows from `journal_entries`, `profile_skill_claims`, `language_feedback`, `pilot_drafts`, `pilot_events`, `language_feedback`, and any future-tier rows. Personal account deletion (`profiles`) cascades to the rest.

There is no "Delete my account" button in v1. This is intentional — a misclick at this stage would lose work and we don't want that until the surface is mature.

## See also

- `docs/policies/account-and-role-model-v1.md`
- `docs/policies/risk-monitoring-and-fraud-response-v1.md`
- `docs/pilot/TESTER_START_HERE_LT.md` / `TESTER_START_HERE_EN.md` — what testers should actually do.
