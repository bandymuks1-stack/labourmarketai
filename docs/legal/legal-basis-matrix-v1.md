# Legal Basis Matrix — v1 (2026-07-11)

Working mapping of processing activities to GDPR Art. 6 bases. DRAFT for
owner/legal review — the data-controller identity is not yet fixed (see
"Controller identity" below), so no basis here is legally confirmed; the
technical controls are live regardless.

| Processing activity | Data | Basis (working) | Where enforced |
|---|---|---|---|
| Account, login, own profile/CV/journal storage | account + self-entered content | Art. 6(1)(b) contract (service the user signed up for) | RLS self-only defaults |
| Employer DISCOVERY of a limited professional summary | profession, experience, skills, region, availability, languages, pay expectation, chosen name | **Art. 6(1)(a) consent** — `profile_discoverability`, opt-in, versioned, withdrawable | `can_view_worker` RLS + consent ledger |
| Transfer of contacts / CV / selected fields to ONE company | only the approved whitelist fields | **Art. 6(1)(a) consent** — `employer_data_disclosure`, per recipient+context+fields | `record_personal_data_disclosure` guard + disclosure ledger |
| Visibility inside an ACCEPTED work relationship (company/agency roster, accepted-booking engagement, engagement journal review, managed-project operations) | display name, professional data (skills, professions, languages, availability), journal entries under the org's engagement | Art. 6(1)(b) contract / 6(1)(f) legitimate interest of an ACTIVE, worker-accepted relationship (invitation accepted / `engagement_contexts` active / `company_worker_engagements` active / assignment active) | relationship clauses in `can_view_worker`; engagement-gated journal RPCs |
| Operator (superadmin) internal candidate pool / matching | worker names + professional data | Art. 6(1)(f) legitimate interest (operating the concierge service), scoped to vetted operator role; NO outward transfer without consent | superadmin gates + disclosure guard |
| Consent/disclosure ledgers themselves | consent events, disclosure records | Art. 6(1)(c) legal obligation (Art. 7(1) demonstrability) + 6(1)(f) | append-only tables, worker-visible history |
| Messaging between participants | message content, counterpart display name | Art. 6(1)(b) | participant-only RLS |
| Anonymous company-need / leads intake | company contact data (B2B, entered by the company) | Art. 6(1)(b)/(f) pre-contract | write-only funnels, service-role-read admin queue |
| Docs-readiness aggregate for the worker's own agency | category COUNTS only | Art. 6(1)(a) — existing `docs_aggregate_consent` toggle (default off) | existing S6 RPC |

Special-category data (Art. 9): not requested anywhere; free-text fields
(bio, journal) may incidentally contain what a user writes — mitigations:
default-private, no indexing, disclosure whitelist has no free-text field.

### Accepted-booking engagement — factual basis note (row 4, added 2026-08-12)

Row 4 above says "ACTIVE, worker-accepted relationship". This note records,
factually, what the `company_worker_engagements` arm of that row actually is,
because the row predates the table.

**The relationship-forming act is the worker's.** A `company_worker_engagements`
row is minted only by `respond_booking_request_v3`, which refuses any caller who
is not the addressed worker (`workers.profile_id = auth.uid()`) and any booking
not in `proposed`. No employer action, and no accumulation of employer actions,
mints an engagement. Declining or ignoring a proposal produces nothing.

**Who the basis admits.** Exactly one party: `owns_company(e.company_id)` —
`companies.profile_id = auth.uid()`, the owner of the company that holds that
one engagement row. Not org managers, not other company members, not the
agency, not sibling companies under the same owner, not any other employer.

**What it admits.** The professional summary already scoped to row 4 —
the `public.workers` row, `worker_skills`, `worker_professions`,
`worker_languages`. It does NOT admit `profiles` (email, phone),
`worker_documents`, `worker_external_profiles`, or journal entries; those are
gated by separate predicates that this arm does not touch.

**How it ends.** `can_view_worker` is `stable` and evaluated per query. When
`end_company_worker_engagement_v2` sets `status='ended'`, the arm is false on the
next statement — no cached or materialised grant exists. Worker erasure sets
`worker_id` NULL (`on delete set null`, the #856 model-A detach rule), which
fails the arm's first condition. Known caveat, recorded rather than hidden:
ending an engagement does not end a `project_worker_assignments` row created
while it was active, and that separate arm keeps its own read alive until the
assignment is also ended (follow-up F2 in the gate memo).

**Relation to discovery consent.** This arm is a distinct purpose from
`profile_discoverability` (Art. 6(1)(a) consent for open discovery by any
employer, row 3). Withdrawing discovery consent is purpose-bound under Art. 7(3)
and does not terminate an engagement the worker separately accepted; conversely,
an active engagement grants nothing beyond the one engaging company and does not
restore that worker to scouting. Per condition C3 of the gate memo, no further
branch is added to `can_view_worker` without a paired entry in this matrix in
the same PR.

**Where the worker is told.** `conversation.booking.confirmAcceptDisclosure`,
shown on the accept-confirmation screen before the worker accepts, and the
public data-access matrix row `legal.dataAccess.matrix.rows.workerCard.seeNote`.

## Controller identity (RESOLVED 2026-07-11 — owner directive, pending lawyer confirmation)

The owner designated **UAB „Nonstop Group“** (company code 302676973,
Mūšos g. 2C, Aukštikalnių k., LT-39103 Pasvalio r. sav., Lithuania) as the
PRIMARY DATA CONTROLLER of the LabourMarket.ai platform, and
**Labour Market AI Sp. z o.o.** (KRS 0001218752, Warsaw) as IP owner and
licensor WITHOUT any routine access to platform personal data (see
corporate-identity-source-of-truth-v1.md and
entity-role-and-data-access-matrix-v1.md). The Privacy Policy, the consent
text registry (version 2026-07-11.v2) and the public legal notice now name
the controller. Remaining for the lawyer: confirm the wording and the
final legal-basis mapping; retention periods still open.

Historical note: until 2026-07-11 the controller identity was undeclared
and this document blocked outward disclosure execution. The technical
fail-closed gate (record_personal_data_disclosure with no UI caller)
REMAINS until the lawyer review completes — naming the controller does not
by itself switch on data transfers.
