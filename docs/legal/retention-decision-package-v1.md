# PACKAGE A — RETENTION LEGAL DECISIONS (owner/legal, one sitting)

Basis: docs/legal/data-retention-matrix-v1.md (#1145, DRAFT), W4-C audit 2026-08-13.
Professional lawyer sign-off: RECOMMENDED for decisions 1 and 2 (statutory-period questions);
decision 3 is an operational approval the owner can take alone.

## DECISION 1 — Contract/claim retention horizon

QUESTION: How long are engagement/booking/contract records kept after an engagement ends,
given possible legal claims (LT civil claims: general limitation 10y, typical commercial 3y/6y)?
CURRENT IMPLEMENTATION: kept forever — no deletion path exists for bookings/engagements/contracts.
DATA AFFECTED: booking_requests (+events), company_worker_engagements, engagement_contexts,
contracts, finance_records; today 0/0/…/17 real rows — decision is cheap NOW.
WHY DECISION REQUIRED: retention matrix recommends 6y (LEGAL GATE row); public privacy policy
currently promises no period ("part of final legal wording being prepared") — C2 forbids
launching with "TBD" as if final.
KNOWN CONSTRAINT: Lithuanian statutory limitation periods; bookings may evidence wage/contract
disputes (worker-protection value in KEEPING them).
RECOMMENDED: 6 years after engagement end (matches matrix recommendation + accounting horizon).
ALTERNATIVE: 10 years (maximum limitation cover; more storage, more privacy exposure).
USER IMPACT: deletion requests get honest "kept N years for legal defence" exception wording.
IMPLEMENTATION CHANGE: none immediate (0 engagements in prod); add matrix row as APPROVED;
future rolling-delete job is a separate owner-gated migration.
PUBLIC COPY CHANGE: privacy policy retention section gains the concrete period.
REVERSIBILITY: period can be lengthened freely; shortening later requires re-notice.

## DECISION 2 — Invoice/billing statutory retention

QUESTION: Statutory bookkeeping retention for invoices/billing records (LT: 10y for accounting
documents under Buhalterinės apskaitos įstatymas).
CURRENT IMPLEMENTATION: no invoices exist (payments off; billing tables 0 rows).
DATA AFFECTED: billing_customers, billing_subscriptions, payment_webhook_events, future invoices.
WHY DECISION REQUIRED: must be stated in Terms/privacy BEFORE payments activate; Terms currently
have NO payment/refund/cancellation clause at all (separate W4-C copy task depends on this number).
KNOWN CONSTRAINT: statutory — not actually discretionary; needs lawyer confirmation of the exact
period (10y accounting documents is the standard reading).
RECOMMENDED: 10 years, stated as statutory obligation, excluded from deletion requests.
ALTERNATIVE: none realistic (statutory floor).
USER IMPACT: deletion exception copy ("billing records kept N years by law").
IMPLEMENTATION CHANGE: none now; copy only.
REVERSIBILITY: n/a (statutory).

## DECISION 3 — Rolling-delete approval semantics

QUESTION: May the platform run automatic rolling deletes (ai_runs 90d redaction; notification_events
12mo; absence reason text 12mo; inactive external vacancies [NEW - see decision 3b]) without
per-run owner approval?
CURRENT IMPLEMENTATION: NOTHING auto-deletes. Two DRAFT migrations exist unapplied
(20260808130000_ai_runs_retention_redaction_v1, 20260808140000_ai_runs_retention_schedule_v1);
notification_events has no retention; absence reason redaction job does not exist.
WHY DECISION REQUIRED: destructive production DML is owner-gated by doctrine; a standing approval
converts each job from per-run gate to audited routine.
RECOMMENDED: approve the PRINCIPLE (standing approval per data class with fixed period, each
class's first migration still individually reviewed), starting with ai_runs 90d + notification_events
12mo + absence reasons 12mo.
ALTERNATIVE: per-run approval forever (safe but guarantees drift — jobs simply won't run).
USER IMPACT: privacy policy can state real bounded periods; less stale personal data.
IMPLEMENTATION CHANGE: apply the two draft ai_runs migrations (after gate review); author
notification_events + absence-reason jobs as owner-gated migrations.
REVERSIBILITY: deletion irreversible by nature — that is the point; periods can be lengthened.

## DECISION 3b (NEW, from external supply audit) — inactive external vacancy retention

QUESTION: How long to keep withdrawn/expired external ads (CC0 content, not personal data per
migration header)?
CURRENT: kept forever, invisible to users (soft-deactivated). No provider-recorded purge duty.
RECOMMENDED: 12 months after deactivation (dedup/re-publish detection window), then rolling delete
under Decision 3 semantics. Add public_vacancies row to the retention matrix either way.
