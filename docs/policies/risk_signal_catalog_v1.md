# Risk Signal Catalog — v1

Doctrine for what counts as a "risk signal" on the platform, what the platform DOES with it, and — equally important — what it never does. Companion implementation doc: `docs/implementation/risk_review_workflow_v1.md`.

Author: platform doctrine layer. Scope: applies to every role (worker, company, agency, customer) and every surface (profile, journal, communication, pilot drafts).

## Why this exists

The platform handles real workers and real organisations. Bad-faith actors will appear. So will misunderstandings. The platform must (a) notice patterns that deserve a human look, (b) never auto-publish accusations or auto-punish, and (c) keep the worker / organisation honestly informed of what the system thinks about them.

## Status vocabulary

Every entity (profile, journal entry, organisation, conversation thread) can carry a `risk_status` chosen from this short, fixed set:

| Status                          | Meaning                                                                                          | Who can read it     | What the UI does                          |
|---------------------------------|--------------------------------------------------------------------------------------------------|---------------------|-------------------------------------------|
| `normal`                        | Nothing flagged. Default.                                                                        | All                 | Nothing — invisible.                      |
| `needs_review`                  | A signal landed; admin should look at it. Subject is NOT informed yet.                           | Admin only          | Admin queue; subject's UI unchanged.      |
| `verification_required`         | After review, the subject must provide additional proof before continuing. Subject is informed.  | Admin + subject     | Subject sees a calm, specific request.    |
| `temporarily_restricted`        | Specific surface temporarily disabled while review is in progress (NOT a ban).                   | Admin + subject     | Subject sees what is restricted and why.  |
| `manually_confirmed_violation`  | Admin has confirmed a real violation after review. Action follows policy, not algorithm.         | Admin + subject     | Subject sees the confirmed finding.       |

`risk_status` is per-entity. A profile in `temporarily_restricted` does not flag the worker's communication threads automatically — every entity carries its own status.

## What is a signal

A signal is any of the following, and ONLY these:

1. **Owner-tagged report.** Another participant uses the support channel to report a concern. The report itself is just a `conversation_message` — the signal is the admin's act of opening a review.
2. **Append-only journal contradiction.** A worker's journal contains two entries that are factually incompatible (same shift, two organisations). Detection is non-automatic in v1 — the admin spots it during normal review.
3. **Organisation rekvizitai mismatch.** Submitted org details don't match the public registry. Detected during the admin verification step (P3 of `org_workspace_foundation_plan_v1.md`).
4. **Repeated authentication anomalies.** Many failed sign-ins from disjoint geographies for the same account. Logs only; no auto-lock in v1.
5. **Telemetry-detected abuse of platform mechanics.** E.g. opening dozens of support threads in minutes, draft spam. Telemetry already caps + truncates; admin sees the rate-limit hits in `pilot_telemetry`.
6. **Direct admin observation.** During any normal admin task, the admin can flip an entity to `needs_review`.

That is the entire list. No "AI sentiment score". No "behavioral risk model". No third-party blacklist sync. No keystroke / typing-cadence / dwell-time fingerprinting.

## What the system NEVER does

- Never assigns `risk_status` automatically from a model output. Every transition above `needs_review` is an admin action.
- Never publishes a violation publicly. Confirmed violations are visible to the subject and to admin only.
- Never deletes or rewrites journal history when restricting an entity. Journal is append-only by RLS doctrine.
- Never auto-locks or auto-suspends accounts. `temporarily_restricted` is a surface-level scope, applied by admin and reversible by admin.
- Never shares a signal with third parties (advertisers, brokers, "fraud networks"). Telemetry stays inside the platform.
- Never explains a restriction with "the algorithm decided" — the subject always sees a human-readable, admin-authored reason.

## Doctrine

- **Honesty over reach.** When unsure, the platform tells the subject "we are reviewing" instead of silently restricting.
- **Reversibility.** Every restriction has a documented unrestrict path; admin who set it documents how to clear it.
- **Single ledger.** All transitions append to `risk_review_log` (planned; see workflow doc) — never overwrite. The subject can request a history copy from the admin.
- **No surveillance creep.** Adding a new signal source requires updating this catalog + a separate PR. New telemetry events follow the existing allowlist policy.

## Out of scope for v1

- Schema for `risk_status` columns (described in `risk_review_workflow_v1.md`, but no migration shipping yet).
- Automatic detection beyond the existing telemetry caps.
- Self-service appeal UI (will exist; routes through the support channel for v1).
- Cross-entity signal propagation.

## Refs

- `docs/implementation/risk_review_workflow_v1.md` — workflow + admin surfaces.
- `docs/policies/journal-evidence-and-correction-policy-v1.md` — append-only doctrine.
- `docs/policies/platform-fairness-and-anti-discrimination-policy-v1.md` (if exists) — adjacent doctrine.
- `apps/web/lib/telemetry/actions.ts` — telemetry allowlist + caps.
