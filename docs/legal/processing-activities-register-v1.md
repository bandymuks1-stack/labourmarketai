# Record of Processing Activities (ROPA) — v1 (2026-07-11)

GDPR Art. 30(1) record. Controller: **UAB „Nonstop Group“**, company code
302676973, Mūšos g. 2C, Aukštikalnių k., LT-39103 Pasvalio r. sav.,
Lithuania. Privacy contact: info@labourmarket.ai. DPO: not appointed
(dpo-requirement-assessment-v1.md). Representative: not required (EU
establishment). DRAFT pending lawyer review; retention periods are open
items (see Privacy Policy pending list).

| # | Activity | Purposes | Data subjects | Data categories | Legal basis (working) | Recipients | Transfers outside EEA | Retention | Security measures |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Account + authentication | provide the service | workers, company/agency users | email, sign-in identity, locale | Art. 6(1)(b) | Supabase, Google OAuth | see subprocessor register (VERIFY SCC) | VERIFY (pending) | RLS self-only, MFA available |
| 2 | Worker professional profiles + CV + work journal | worker's own career record; operator coordination | workers | profession, skills, experience, availability, pay expectation, journal texts/photos, documents inventory | Art. 6(1)(b) | Supabase; operator (superadmin) | as above | VERIFY | fail-closed RLS; owner-only documents; private storage, signed URLs |
| 3 | Employer discovery of limited profile | job offers / selection | workers who OPTED IN | limited professional summary (no contacts) | **Art. 6(1)(a) consent** (profile_discoverability, versioned) | registered companies/agencies | none | until withdrawal | consent ledger + RLS gate; withdrawal immediate |
| 4 | Employer-specific data transfer | present a candidate to ONE company | workers who confirmed | only approved whitelist fields | **Art. 6(1)(a) consent** (employer_data_disclosure) | the named company | none | disclosure ledger (append-only) | payload-narrowing guard; admin-gated; currently NO UI executes transfers |
| 5 | Consent + disclosure ledgers | demonstrate consent (Art. 7(1)) | workers | consent events (purpose, action, version, hash, locale, time) | Art. 6(1)(c)+(f) | none external | none | VERIFY (audit-trail retention) | append-only triggers, worker-only read |
| 6 | Company-need intakes + demand records | respond to business demand | company contacts (B2B) | company name, contact person details, need description | Art. 6(1)(b)/(f) | operator; Telegram owner alert (clipped fields) | Telegram infra (VERIFY) | VERIFY | write-only public RPC; admin-gated queue |
| 7 | Messaging | user-to-user coordination | platform users | message content, counterpart display name | Art. 6(1)(b) | participants only | none | VERIFY | participant-only RLS |
| 8 | Operator matching (human) | concierge matching | workers, companies | internal pool view | Art. 6(1)(f) | operator only | none | n/a | superadmin gate; "awaiting worker permission" states |
| 9 | Privacy self-service (export / deletion requests) | data-subject rights | all users | request records | Art. 6(1)(c) | operator | none | VERIFY | RLS-scoped, reviewed deletion |
| 10 | Owner alerts (company-need) | operational notification | company contacts (B2B) | clipped intake fields | Art. 6(1)(f) | owner's Telegram | Telegram infra (VERIFY) | transient | field caps, plain text, no worker data |

NOT a processing activity of Labour Market AI Sp. z o.o.: the IP owner
performs NO processing of platform personal data (entity-role matrix;
licence §5). Automated decision-making incl. profiling: none in production
(matching is human-operated); a DPIA is required before any automated
matching ships (privacy-risk-and-dpia-screening-v1.md).
