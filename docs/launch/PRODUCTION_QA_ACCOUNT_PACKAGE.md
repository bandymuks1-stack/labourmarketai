# Production QA Account Package — OWNER APPROVAL REQUIRED

Status: `PRODUCTION_QA_ACCOUNT_PACKAGE_READY_PENDING_OWNER_APPROVAL`
Prepared: 2026-08-05 (launch-critical completion train)
Nothing in this package has been executed. No account exists yet.

## Purpose

The launch standard (§14 of the train) requires a full production customer
journey proven with **synthetic** accounts before any real user touches the
system. Production write proof cannot use real people, real companies, or
real business data. This package defines the exact accounts, fixtures and
constraints so the owner can approve creation with one decision.

## Proposed accounts

| Account | Email | Display name | Role |
|---|---|---|---|
| `PROD_QA_WORKER` | `qa-worker-01@qa.labourmarket.ai` | "QA Worker One (synthetic)" | worker |
| `PROD_QA_EMPLOYER` | `qa-employer-01@qa.labourmarket.ai` | "QA Employer One (synthetic)" | employer / organization owner |
| `PROD_QA_MANAGER` | `qa-manager-01@qa.labourmarket.ai` | "QA Manager One (synthetic)" | org manager — **create only if the org-membership journey step requires a second member** |

Notes:

- Domain `qa.labourmarket.ai` (or an owner-chosen equivalent) so QA identity
  is self-evident in every table and log. If the auth provider requires a
  deliverable mailbox, the owner supplies plus-addressed variants of an
  owner-controlled mailbox instead (e.g. `owner+qa-worker-01@…`); never a
  real person's address.
- No real PII anywhere: names, phone numbers, addresses, CV content and
  journal entries are all clearly synthetic ("QA", "synthetic", fictional
  streets). No real photos.

## Organization / fixtures

- One synthetic organization: **"QA Statyba UAB (synthetic)"** owned by
  `PROD_QA_EMPLOYER`. No real company code, no real VAT number.
- One demand, one project, one booking window — all clearly marked
  `[QA]` in titles.
- Worker profile completed to the minimum the funnel requires (skills,
  availability, location) with synthetic values.

## Hard constraints

- **No billing**: no Stripe customer, no checkout, no entitlement change.
  QA accounts stay on the free plan.
- **No discoverability side effects**: QA demand/profile must not be
  surfaced to any real user. Mitigation: the pilot has no real users yet;
  additionally every title carries the `[QA]` marker and cleanup is
  scheduled (below). If any real user is onboarded before cleanup, QA rows
  are removed first.
- **Analytics**: QA account ids are recorded in this document after
  creation and excluded (or explicitly tagged `qa=true`) in any funnel
  query used for pilot metrics.
- **No outreach**: QA accounts never message, email or contact anyone
  outside the QA set.

## Exact production journey to execute (after approval)

Employer: login → organization context → create demand → confirm → receive
candidates → shortlist → open candidate → contact → propose booking.
Worker: login → profile → see booking → accept → calendar → engagement.
Execution: project create → assign → lifecycle → complete (only project
assignment ends) → end engagement separately → membership remains → no
billing side effect.
Experience: eligibility → submit → admin moderation → publish → response →
public count-only.

Evidence captured: browser proof 1440/375, before/after row counts, actor
identity per write, audit trail rows, cross-tenant negative checks.

## Cleanup / retention

- Default: **retain** the QA accounts as permanent production smoke fixtures,
  tagged and analytics-excluded (preferred — allows re-proof after future
  deploys).
- Alternative: full cleanup script deletes QA rows bottom-up (experiences →
  engagements → bookings → projects → demand → org membership → org →
  profiles) after the proof, with row counts before/after.
- Owner picks one at approval time.

## Security implications

- Accounts are ordinary-privilege (no admin), so blast radius equals one
  worker + one employer tenant.
- Passwords: generated long-random, stored only in the owner's password
  manager; never committed, never printed in logs or PRs.
- The moderation step requires an existing admin identity — the owner's own
  admin account performs moderation; no new admin account is created.

## The one owner decision required

> Approve creation of `PROD_QA_WORKER`, `PROD_QA_EMPLOYER`
> (+ `PROD_QA_MANAGER` only if needed) with the constraints above —
> **yes / no / with changes**, and pick **retain** vs **cleanup**.
