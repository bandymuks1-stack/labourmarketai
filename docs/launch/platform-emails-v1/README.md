# Company registration e-mails, request alerts and delivery control (v1)

Owner P0, 2026-11-13. Status of this document: **IMPLEMENTED and TESTED in the repository;
NOT deployed, migration NOT applied.** Nothing below was verified in production.

No personal data, no secret and no production value is recorded here. Every rendered e-mail and
screenshot in this folder is built from `QA-SYNTHETIC` values.

## What was built

| # | E-mail | To | When | Language |
|---|---|---|---|---|
| 1 | Notice of a new company | the owner mailbox (`LM_OWNER_NOTIFY_EMAIL`, default `info@labourmarket.ai`) | the save that gives a company its name (`saveCompanySetup`, the one place the web form, the chat and MCP all use) | Lithuanian |
| 2 | Welcome and help | the registering account's own address, only when that address is verified for that account by the platform's existing rule `email_is_verified_v1` (a confirmed address, a verified Google or LinkedIn identity, or a completed mailbox proof) | same moment; if the address is not verified yet it is retried, see T8 point 8 | the language the account chose (LT, EN, RU, PL, DE, NL; English for any other) |
| 3 | Alert about a new request | the owner mailbox | a no-signup request was stored: the three landing request doors and the `/company-need` form | Lithuanian |

Nothing is sent to the person who wrote a no-signup request. No e-mail states a response time, a
price or a payment. None is commercial.

Sender: `LM_SMTP_FROM` (the platform mailbox). Reply-To on the welcome e-mail:
`LM_SUPPORT_REPLY_TO` (default `info@labourmarket.ai`). The three settings are plain addresses in
the server environment; changing one needs no code change.

The Lithuanian welcome text is the owner's, used verbatim
(`apps/web/lib/email/company-registration-emails.test.ts` compares it byte for byte).

## Delivery control

One record per event in `platform_email_deliveries_v1` (migration
`20261113220000_platform_email_deliveries_v1`, RED, not applied).

- **Once.** The event key (`<kind>:<company or request id>`) is unique; inserting it is the claim.
- **Recorded.** `sent`, `retry_wait`, `failed`, `suppressed`, with the attempt count and a short
  machine error code. No address, name, subject or body is stored.
- **Retried, bounded.** Five tries in total, after 5 min, 30 min, 2 h and 12 h
  (`/api/cron/platform-email-retry`, every 10 minutes on the VPS).
- **Visible.** A `failed` row is never deleted. The admin home shows the count under
  "Laukia sprendimo" and lists each failed or waiting e-mail with kind, time, tries and code.
- **Unknown outcome.** If the process dies between sending and recording, the e-mail is not sent
  again (that could be a duplicate); the row becomes `failed / outcome_unknown` for a person to
  decide.

Until the migration is applied: the request alert is still sent once per stored request
(unrecorded, logged as `[email/delivery] RECORD UNAVAILABLE`), the registration notice likewise,
and the welcome e-mail is **not** sent (without the record nothing proves it would not repeat).

## Rollback (changed after the independent security review of 2026-11-14)

- It **refuses** while a delivery record exists, or while any request carries who/when. Nothing is
  deleted to get past the refusal.
- It revokes only privileges on what this migration created (the delivery table, the two new
  columns). The four grants on objects that existed before (three column-scoped reads, one
  function) are left in place; the rollback file lists the exact statements to remove them, to be
  run only where the privilege snapshot taken before the apply shows they were absent.
- Run on a scratch PostgreSQL 16 with a schema of the same shape (not production, not the full
  schema): apply, apply again, rollback refused with a delivery row (row kept), rollback refused
  with a who/when record (record kept), rollback on empty data (table and columns gone, the
  request row and its status kept, a grant that existed before the migration still held), rollback
  again. All as expected.

## Manual steps after deploy (nothing installs these)

1. **The VPS cron line.** The deploy does not install it. On the VPS, as the existing cron
   bundle is installed: `sh ops/vps/lm-cron-install.sh --dry-run`, then `sh ops/vps/lm-cron-install.sh`.
   It adds `*/10 * * * * root sh /root/lm-prod/bin/lm-cron.sh platform-email-retry`. Until then a
   failed e-mail is recorded and visible but **not retried**.
2. The mailbox rule on `X-LabourMarket-Notification` (below).

## Test requests are labelled, never silenced

A request whose company name starts with `QA-SYNTHETIC` (the production walks' mark) gets the
subject `LabourMarket.ai – nauja užklausa: [QA-SYNTHETIC] …`. It is still sent, recorded and counted
as unhandled, and the header value is unchanged. Typing the mark can only label one's own request.

## Telling notices apart from customers' e-mails

Every internal notice carries:

- the header `X-LabourMarket-Notification` with `company-registration`, `request` or
  `company-need`;
- a subject that starts with `LabourMarket.ai – užsiregistravo nauja įmonė:` or
  `LabourMarket.ai – nauja užklausa:`;
- the closing line "Automatinis LabourMarket.ai pranešimas administratoriui. Tai ne kliento
  laiškas."

A customer's reply to the welcome e-mail carries none of these. One mailbox rule on the header
(or on the two subject prefixes) moves notices to their own folder and leaves customers' e-mails
in the inbox. Setting that rule up in the mailbox is an owner action (see "After deploy").

## Request control for the administrator

- Admin home: "Neapdorotos užklausos" with the count and either the age of the oldest or how many
  have waited longer than the threshold.
- `/dashboard/admin/company-need-intakes`: unhandled requests first, **oldest first**, each with
  how long it has waited and an "Vėluoja" marker past the threshold; a handled request shows who
  changed its status and when.
- Threshold: `LM_INTAKE_OVERDUE_HOURS`, default 24. It is an internal control only; no page and no
  e-mail tells a sender when they will be answered.

## Acceptance scenarios

| | Scenario | Proven by |
|---|---|---|
| T1 | Company registration → internal notice attempted once and recorded | `lib/company/company-registration-emails-hook.test.ts`, `lib/email/platform-email-delivery.test.ts`, `lib/email/platform-email-delivery-store.test.ts` |
| T2 | Welcome e-mail in six languages, recorded; LT byte-identical to the owner's | `lib/email/company-registration-emails.test.ts`, `lib/email/platform-email-delivery-store.test.ts` |
| T3 | Request doors → alert recorded | `lib/staffing/intake-alert-paths.test.ts`, `lib/staffing/request-doors.test.ts` |
| T4 | `/company-need` → the same alert recorded | `lib/staffing/intake-alert-paths.test.ts`, `lib/email/platform-email-delivery-store.test.ts` |
| T5 | Failure: failed record, bounded retry, still visible as failed after the last try | `lib/email/platform-email-delivery.test.ts` (each of the three kinds) |
| T6 | One event never sends twice | `lib/email/platform-email-delivery.test.ts` (repeat call, two instances, two sweeps) |
| T7 | Admin sees unhandled count and age; a status change records who and when | `lib/admin/company-need-intake-control.test.ts` |
| T8 | What can only be proven after deploy | this document, next section |

Shape guards: `lib/guards/platform-email-deliveries-migration.test.ts`.

Rendered e-mails: `rendered/*.html`. Screenshots at 390 px (phone) and 1280 px (desktop):
`screenshots/*.png`. In every screenshot the page does not scroll sideways, the logo loads, and the
only links are `mailto:info@labourmarket.ai` (welcome), the admin company list (notice) and the
request queue (alert). Regenerate with
`pnpm -F web exec tsx scripts/render-platform-emails.ts <dir>`.

## T8 — what the repository cannot prove

These need the deployed application, the applied migration and the real mailbox.

1. **Real delivery into the `info@labourmarket.ai` inbox.** Tests stop at "the mail server
   answered 250"; whether a notice lands in the inbox, the spam folder or nowhere is a mailbox
   fact.
2. **SPF, DKIM and DMARC** for `labourmarket.ai` as seen by a receiving provider (the
   `Authentication-Results` header of a delivered e-mail). Not readable from the repository.
3. **How real mail clients draw the HTML** (Gmail, Outlook, Apple Mail, on a phone and on a
   desktop). The screenshots here are a browser rendering of the same HTML. A client that blocks
   remote images shows the alt text "LabourMarket.ai" instead of the logo until images are allowed.
4. **Reply-To works end to end**: a reply to the welcome e-mail arrives in the support mailbox.
5. **That somebody reads the mailbox.** The process for reviewing incoming e-mail is an
   organisational fact; the product side of it is the unhandled-request control above.
6. **The production settings**: `LM_SMTP_*` complete, `CRON_SECRET` set, the cron line installed
   (`ops/vps/lm-cron-install.sh`), the three new settings left at their defaults or set.
7. **The grants**: that production `service_role` can read exactly the granted columns after the
   migration, and that no column was already granted by an earlier change (matters only for the
   rollback).
8. **The verification rule in production.** The welcome e-mail asks
   `email_is_verified_v1` (migration `20261003151000`). Whether that migration is applied in
   production, and whether it accepts a freshly confirmed password account there, is not readable
   from the repository. If the rule is absent or says "not verified", the welcome e-mail is
   retried for about 15 hours and then shown to the administrator as
   `failed / verification_unavailable` or `failed / email_not_confirmed` — never sent to an
   unverified address, never silently dropped. The rule accepts Google and LinkedIn sign-ins;
   another provider counts only once its address is otherwise verified.
9. **Times are UTC.** The notice states the registration time in UTC, as the rest of the platform
   does.

## Proposed QA-SYNTHETIC production check (needs the owner's approval; not run)

Preconditions: this PR merged and deployed, migration applied through the owner channel, cron
installed.

1. Register one company named `QA-SYNTHETIC Laiškų patikra <date>` with a mailbox the owner
   controls (the real QA mailbox, not a `qa.x+y@labourmarket.ai` plus-address: those are
   suppressed by design and would prove nothing).
2. Expect, within a minute: one notice in `info@labourmarket.ai` with the subject
   "LabourMarket.ai – užsiregistravo nauja įmonė: QA-SYNTHETIC …", and one welcome e-mail in the
   registering mailbox in the chosen language.
3. In both, open the original message and record `Authentication-Results` (spf, dkim, dmarc) and
   the `X-LabourMarket-Notification` header of the notice. Open both on a phone and on a desktop.
   Click the admin link. Reply to the welcome e-mail and confirm the reply arrives.
4. Save the company's profile again: no second e-mail of either kind.
5. Send one landing request (`QA-SYNTHETIC` text) and one `/company-need` request: one alert each,
   both visible in the queue with their waiting time; mark both "Atmestas" and check who/when.
6. Read back, without personal data:
   `select kind, status, attempts, last_error from platform_email_deliveries_v1 order by created_at desc limit 4;`
   — four rows, all `sent`, `attempts = 1`.
7. Clean up: reject the two synthetic requests (done in step 5) and archive the synthetic company
   through the existing owner path. The four delivery rows stay; they hold no personal data.

## Found while doing this (reported, not changed)

- **Advertising through `/de/company-need`.** The historical rows came in before the spam guard
  of 2026-11-09 (PR #3177). That guard sits in `persistPublicCompanyNeed`, which every locale and
  both forms use, so the `/de` path is covered now and an advert is neither stored nor alerted.
  What remains: the advert reading (`lib/staffing/intake-advertising.ts`) recognises English
  sales phrases only. A pitch written in German or another language with fewer than three links
  would still be stored. Widening the phrase list risks refusing genuine requests, so it was left
  for a separate, tested change.
- **No per-organization admin page exists.** The notice links to the organization's row in the
  admin company list (`/dashboard/admin/company-verification#company-<id>`), which now carries an
  anchor.
- **The rate ledger caps a recipient at five e-mails a day.** Internal notices therefore do not go
  through it (the owner mailbox would be cut off on a busy day); they are bounded by one per event
  and by the database's own intake ceilings. The welcome e-mail does go through it.
