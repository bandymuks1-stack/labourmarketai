# Backend proof plan for register rows a browser walk cannot prove (2026-11-18)

Companion to `apps/web/tests/e2e/prod-register-walk-gaps.spec.ts`. The function rows in
[`FUNCTION_REGISTER.md`](FUNCTION_REGISTER.md) stay the one status; this file changes none of them.

These rows rest on a backend job or a database fact. A browser walk on synthetic accounts cannot see them
without writing business data or reading production tables, so each needs a separate, safe check run by
the owner (or a session the owner gives read access to).

**Rules for every check below**

- Read only: `SELECT` and log reads. No `INSERT`, `UPDATE`, `DELETE`, no schema change, no re-run of a job.
- Counts and timestamps only. No names, e-mail addresses, amounts or partner identifiers are copied into
  the repository, the register or a PR (the repository is public). The evidence line names the check, its
  date and the build, and keeps any volume as "[volume withheld]" as the register already does.
- An earlier proof stays evidence for its own date and build; a new read is recorded with its own date.
- A check that cannot be run safely is left NOT VERIFIED; it is never written as a pass.

| Row | What would prove it | Safe check (read only) | Not proven by it |
|---|---|---|---|
| 4.29 interest → vacancy hand-off | A consented interest reached the partner, and a non-consented one was withheld, on a recent day | Read the delivery log of the hand-off job for one named run (the register row cites the daily 06:00 call) and, in `demand_interest_signals`, count the rows that run marked delivered and the rows withheld for missing consent | That the partner acted on it |
| 6.16 commercial hand-off to the partner organization | The `commercial-handoffs` job (daily 06:00, `ops/vps/labourmarket.cron`) delivered its due rows | Read the job's log line for one named run, then count `commercial_handoffs` rows by delivery state for that run's window | Content quality on the partner side |
| 7.3 entitlement resolver | A paid state changes the organization's effective rights | For the pilot organization: read its current `billing_subscriptions` row (status, plan) and the plan the app resolves for it (the account billing section shows it to a signed-in billing manager) and confirm they agree | A fresh payment; payment testing is stopped by the owner decision of 2026-11-16 |
| 7.16 webhook signature verification | Only signed provider events are recorded | Count `payment_webhook_events` rows since the last live event and read the app log for refused (bad-signature) webhook calls in the same window | A forged event sent on purpose (that would be a write to production) |
| 7.17 no double charge / processing | One row per provider event; stale checkout operations closed | `SELECT provider, event_id, count(*) FROM payment_webhook_events GROUP BY 1,2 HAVING count(*) > 1` must return no rows (the table is `unique (provider, event_id)`); list `billing_checkout_operations` still open and older than a day | Closing the two stale operations named in the register: that is a write, owner decision |
| 9.6 GDPR erasure executor | A confirmed request past its wait was executed and receipted | Count `privacy_erasure_receipts_v3` rows with an executed state in the last 30 days, and read the `privacy-erasure` job log (every 10 minutes) for one named run | Erasure of a specific real person (never named here) |

**Rows that need setup first, then a walk (writes, so not part of the read-only spec)**

| Row | Missing setup | Then |
|---|---|---|
| 7.2 free organization limit, 1 open need | A synthetic QA organization that is not on the pilot | A walk that submits a second open need and sees the refusal, then closes its own need |
| 7.13 plan-gated `booking_requests` | A synthetic QA organization at its booking limit | A walk that sends one proposal and sees the gate speak |
| 7.21 billing portal for every billing manager | A second billing manager in the same synthetic organization | That person opens the portal (this creates a provider portal session, so the owner decides when) |

Each setup is an owner decision; none is made by this plan.
