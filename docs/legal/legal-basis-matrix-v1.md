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
| Visibility inside an ACCEPTED work relationship (company/agency roster, engagement journal review, managed-project operations) | display name, professional data, journal entries under the org's engagement | Art. 6(1)(b) contract / 6(1)(f) legitimate interest of an ACTIVE, worker-accepted relationship (invitation accepted / engagement active / assignment active) | relationship clauses in `can_view_worker`; engagement-gated journal RPCs |
| Operator (superadmin) internal candidate pool / matching | worker names + professional data | Art. 6(1)(f) legitimate interest (operating the concierge service), scoped to vetted operator role; NO outward transfer without consent | superadmin gates + disclosure guard |
| Consent/disclosure ledgers themselves | consent events, disclosure records | Art. 6(1)(c) legal obligation (Art. 7(1) demonstrability) + 6(1)(f) | append-only tables, worker-visible history |
| Messaging between participants | message content, counterpart display name | Art. 6(1)(b) | participant-only RLS |
| Anonymous company-need / leads intake | company contact data (B2B, entered by the company) | Art. 6(1)(b)/(f) pre-contract | write-only funnels, service-role-read admin queue |
| Docs-readiness aggregate for the worker's own agency | category COUNTS only | Art. 6(1)(a) — existing `docs_aggregate_consent` toggle (default off) | existing S6 RPC |

Special-category data (Art. 9): not requested anywhere; free-text fields
(bio, journal) may incidentally contain what a user writes — mitigations:
default-private, no indexing, disclosure whitelist has no free-text field.

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
