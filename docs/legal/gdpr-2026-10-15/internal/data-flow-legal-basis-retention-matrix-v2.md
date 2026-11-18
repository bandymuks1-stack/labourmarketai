# Data-flow, legal-basis and retention matrix — v2

- **Status:** DRAFT v2, 2026-10-15. Internal. **Requires lawyer review.**
- **Supersedes:** for planning purposes, `legal-basis-matrix-v1.md` (2026-07-11) and the
  retention columns of `data-retention-matrix-v1.md` (2026-08-13). Both are kept as history.
- **Sources:**
  - audits A1/A2/A3 (`../audit/01-03`);
  - `legal-basis-matrix-v1.md`;
  - `data-retention-matrix-v1.md`;
  - `retention-decision-package-v1.md` (Package A);
  - `deletion-process-design-v1.md`;
  - `subprocessor-register-v2.md`;
  - code on `origin/main` 2026-10-15.

> **LT santrauka.** Ši lentelė yra pagrindinė duomenų srautų matrica. Kiekviena eilutė yra viena
> duomenų kategorija ir vienas tikslas. Kiekvienai eilutei nurodyta:
> - subjektai, šaltinis ir sistemos (lentelės, saugyklos);
> - teisinis pagrindas;
> - saugojimo terminas;
> - gavėjai ir perdavimas už EEE ribų;
> - elgesys ištrynimo atveju.
>
> Patvirtintų saugojimo terminų nėra. Rekomenduoti terminai paimti iš retencijos matricos v1 ir
> paketo A ir pažymėti [OWNER DECISION]. Perdavimo mechanizmo įrodymų nėra nė vienam tiekėjui,
> todėl visur pažymėta [NOT EVIDENCED]. Pseudonimizuoti duomenys niekur nevadinami anoniminiais.

## Conventions

**Legal basis.** Each basis cites a GDPR article: `6(1)(a)` consent · `(b)` contract ·
`(c)` legal obligation · `(f)` legitimate interests. Article 9 is named only where
special-category data is plausible. Every basis is a working basis until the lawyer confirms it.

**Retention.** Only one rule is implemented and owner-approved: the `ai_runs.output_excerpt`
90-day redaction. It was applied in 2026-08 as migrations 20260808130000 and 20260808140000, and
`data-retention-matrix-v1.md` records it as APPLIED. The older `retention-decision-package-v1.md`
still describes those migrations as drafts; the matrix is the newer record. Every other period
below is a recommendation that no one has approved yet, so it is marked
**[OWNER DECISION — rec. X]**. Where a period depends on statute, it is also marked [LAWYER].

**Transfer.** A transfer outside the EEA is written as a fact (for example, "US parent") followed
by **[NOT EVIDENCED]**. No DPA, SCCs or DPF certification is on file for any vendor (G-07).

**Erasure treatment.** This is what an Art. 17 account erasure should do with the row. Where today's
cascade does something different, the row says so.

| Treatment | Meaning |
|---|---|
| **DELETE** | Remove the row or object. |
| **RETAIN-pseudonymised** | Keep the row under a named Art. 17(3) exception and replace the identity link. The data is still personal data (Recital 26). It is never called anonymous. |
| **REASSIGN** | The row belongs to an organisation and the person only authored it. Replace the actor with a shared "erased person" sentinel, or NULL. |
| **PSEUDONYMISE** | Replace the identity link but keep the provenance state (for example, "verifier erased"). |
| **REFER** | The organisation is the controller. Forward the request to it and delete only what the platform derived. |

Per-FK detail: A1 §2 (66 FKs).

## Matrix

### 1. Account, identity and profile

| ID | Data category | Purpose | Data subjects | Source | Systems / tables / buckets | Legal basis | Retention | Recipients / processors | Transfer outside EEA | Erasure treatment |
|---|---|---|---|---|---|---|---|---|---|---|
| M01 | Account identity: e-mail, password hash, OAuth identity, Google picture URL and subject id | sign-in, account security | all account holders | the person; Google (OAuth) | `auth.users` (incl. `raw_user_meta_data`), `profiles` | 6(1)(b) | account life; fraud/abuse hold [OWNER DECISION, no period proposed] | Supabase (processor); Google (independent controller) | Supabase US parent [NOT EVIDENCED] | DELETE (last step). Blocked today (G-01) |
| M02 | Verification e-mails and links | confirm the e-mail address | account holders | system | `email_verifications_v1` (70); Resend + Amazon SES | 6(1)(b) | account life; provider retention not evidenced | Resend, Amazon SES (sub-processor) | Resend (US) [NOT EVIDENCED] | DELETE (cascade) |
| M03 | Profile contact (phone, e-mail), country, avatar | own profile | account holders | the person | `profiles`; bucket `profile-avatars` (25 objects) | 6(1)(b) | account life | Supabase | Supabase [NOT EVIDENCED] | DELETE row and **storage object**. The object is orphaned today (G-17) |
| M04 | Professional profile: professions, skills, languages, education, achievements, pay expectation, availability, driving licence, bio | Living CV; own career record | workers | the person | `workers`, `worker_*`, `profile_skill_claims`, `worker_education`, `worker_achievements` | 6(1)(b) | account life | Supabase | Supabase [NOT EVIDENCED] | DELETE (cascade) |
| M05 | **Inferred capabilities** (direct, indirect, potential; decision 0023) and competency signals | show growth and reskilling paths; evidence-based CV | workers; roster people | derived by the platform | `skill_candidate_clarifications`, `learning_signals`, `organization_evidence_competency_signals` (1,094), `competency_recognitions` | 6(1)(b) for the person's own record. Use in employer ranking: see M12 [LAWYER] | account life | Supabase | Supabase [NOT EVIDENCED] | DELETE, because derived data has no retention need. A recognition granted by another organisation: RETAIN-pseudonymised (assessor RESTRICT, A1 #8) [OWNER DECISION] |
| M06 | Journal entries: free text, metrics, skills | living work record | workers | the person (typed or voice) | `journal_entries` (155) and child tables | 6(1)(b) | account life. Rec. "detach, keep" (matrix E1) **cannot be done on the current schema** | Supabase; reviewing managers of the engagement organisation | Supabase [NOT EVIDENCED] | Today: DELETE by cascade. Employer-confirmed entries "keep detached evidence" = RETAIN-pseudonymised; needs a schema change [OWNER DECISION + LAWYER] (G-16) |
| M07 | Journal photos (may show third persons or places) | evidence of work | workers; people in the photo | the person | `journal_entry_photos`; bucket `journal-entry-photos` (16) | 6(1)(b) | account life | Supabase | Supabase [NOT EVIDENCED] | DELETE row and object. The object is orphaned today |
| M08 | Worker documents (ID documents, certificates) | readiness for work | workers | the person | `worker_documents` (1), `document_files`; bucket `document-files` | 6(1)(b); national rules on ID numbers [LAWYER] | [OWNER DECISION — rec. account life or 24 mo after last activity] | Supabase | Supabase [NOT EVIDENCED] | DELETE row and object |

### 2. Visibility, matching and alerts

| ID | Data category | Purpose | Data subjects | Source | Systems / tables / buckets | Legal basis | Retention | Recipients / processors | Transfer outside EEA | Erasure treatment |
|---|---|---|---|---|---|---|---|---|---|---|
| M09 | Limited professional summary | **employer discovery** | workers who opted in | the person | `workers` and children, via `can_view_worker` + `privacy_consent_events` | **6(1)(a)** `profile_discoverability` | until withdrawal | registered companies and agencies (independent controllers once they see it) | none from the platform | withdrawal stops it; erasure: DELETE |
| M09b | Limited professional summary (anonymous label) | **employer discovery — free-worker default** (20261025100000) | free workers who never decided, after the recorded notice | the person | the same projection, via `worker_profile_discoverable` → `discoverability_state_v1` + `privacy_consent_events` (`notice_shown`) | **6(1)(f)** — `lia-free-worker-discoverability-v1.md` | until objection (switch-off), employment through the platform, a learner link, or disarming | registered companies and agencies | none from the platform | one-tap objection stops it for good; erasure: DELETE |
| M10 | Whitelisted fields for ONE company | per-company disclosure | workers who confirm | the person | `personal_data_disclosures` (0) | **6(1)(a)** `employer_data_disclosure` | disclosure record: [OWNER DECISION — rec. 6 y] | the named company | none | ledger: RETAIN-pseudonymised (Art. 5(2)). PR #2412 currently refuses here |
| M11 | Relationship-scoped worker data (accepted engagement, roster, managed project) | run an accepted work relationship | workers in a relationship | the person; the organisation | `can_view_worker` relationship arms; `company_worker_engagements`, `project_worker_assignments` | 6(1)(b) / 6(1)(f) | the relationship; records [OWNER DECISION — rec. 6 y after end, Package A D1] | the engaging organisation | Supabase [NOT EVIDENCED] | relationship rows are deleted by cascade today. Rec.: RETAIN-pseudonymised to the D1 horizon [OWNER DECISION] |
| M12 | Match inputs and outputs: **auto-match receipt, ranking order, top-N cut-off, staffing fit** | profiling to show employers relevant candidates | discoverable workers | derived | `customer_requests.payload.auto_match_receipt`; `lib/scouting/*`; `lib/market/match-v1.ts` | 6(1)(a) discoverability (does the consent text cover ranking? [LAWYER]) + 6(1)(f) employer search | the need's life (receipt) [OWNER DECISION] | the employer that owns the need | none | the receipt holds anonymised refs and counts. When a worker is erased, nothing personal remains in the receipt once the worker rows are gone. Refs are per-demand hashes, so they are **pseudonymous until the worker rows are deleted** |
| M13 | Job-alert inputs (profession, countries, salary) and notification events | job alerts; new-job badge | workers | the person; derived | `notification_events` (229), `notification_preferences`, `worker_opportunity_seen` (71) | 6(1)(b) | **no automatic retention.** [OWNER DECISION — rec. 12-month rolling delete, Package A D3] | Supabase | Supabase [NOT EVIDENCED]; GitHub cron trigger (no personal data) | DELETE (cascade) |

### 3. Communication, AI and voice

| ID | Data category | Purpose | Data subjects | Source | Systems / tables / buckets | Legal basis | Retention | Recipients / processors | Transfer outside EEA | Erasure treatment |
|---|---|---|---|---|---|---|---|---|---|---|
| M14 | Message bodies, attachments | user-to-user messaging | participants; people named | the participants | `conversations`, `conversation_messages` (65), `conversation_participants`; bucket `conversation-attachments` | 6(1)(b) | [OWNER DECISION — rec. 36 mo after close]; legal-hold exception | participants | Supabase [NOT EVIDENCED] | **DELETE content** (null body and translated text; keep a "message removed" shell; author → sentinel). Legal-hold exception per conversation (A1 #10) |
| M15 | Message text sent for translation | **AI translation** | message authors; people named | message body | Gemini API via `lib/ai/runtime`; `ai_runs` | 6(1)(f) / (b) [LAWYER]. **Suspended since #2399** | the provider's retention under its terms (paid: limited logging; free: used to improve products) [NOT EVIDENCED]; `ai_runs.output_excerpt` redacted at 90 d (**implemented**) | Google (processor only if on the paid tier, which is unverified) | Google global [NOT EVIDENCED] | the copy at Google cannot be recalled by the platform. Historical exposure: G-02 |
| M16 | Typed chat sentence + locale + coarse role | **AI intent proposal** | users | the person | Gemini; `ai_runs` | as M15. **Suspended** | as M15 | as M15 | as M15 | as M15 |
| M17 | Public market aggregates | AI market explanation | none (aggregate) | public statistics | Gemini; `ai_runs` | n/a (not personal) | `ai_runs` 90 d excerpt redaction | Google | Google global | n/a |
| M18 | CV / bio text | AI CV extraction (`extract_cv`) | workers | the person | `ai_runs` shows 2 runs on 2026-10-15 (`[bio]`). The code refuses PERSONAL tasks for cloud providers | 6(1)(b) [LAWYER] | as M15 | **[VERIFY] provider and `blocked_reason` of those two rows** (G-09) | [VERIFY] | DELETE the `ai_runs` linkage |
| M19 | Assistant chat transcripts | in-product assistant memory | users | the person | `assistant_conversations` (16), `assistant_messages` (166, hash-chained), `assistant_message_attachments` | 6(1)(b) | [OWNER DECISION — no period proposed] | Supabase | Supabase [NOT EVIDENCED] | DELETE (cascade from owner). `erase_assistant_transcript` exists |
| M20 | Data returned to an external AI assistant: own data | user-operated MCP connector | the caller | platform tables via ~92–229 tools | `app/api/mcp/route.ts`; Supabase OAuth server | 6(1)(b) at the user's request | OAuth grant until revoked; no platform copy | the user's chosen AI provider (independent controller) | US (OpenAI / Anthropic). This is the user's own transfer | revoke grants; DELETE grants on erasure |
| M21 | Data returned to an **employer's** AI assistant: candidates, roster, **absence reasons**, journal review queue, shortlist | employer-operated MCP connector | **workers and candidates who did not choose the recipient** | platform tables under the employer's RLS | same | **[LAWYER]**: the employer as controller of its onward transfer; the platform's disclosure basis = the underlying visibility basis (M09/M11). Art. 9 for absence reasons | none on the platform | the employer's AI provider (employer's processor or independent controller) | US [NOT EVIDENCED]. An Art. 44 analysis is needed (G-03) | n/a (no platform copy). Worker notice owed |
| M22 | Audio for dictation | speech-to-text | users; bystanders | microphone | the browser's Web Speech API (Google / Apple); optional whisper host | text: 6(1)(b). Audio: the browser vendor as independent controller [LAWYER] | the platform stores no audio; draft text in sessionStorage | browser speech vendor; whisper host (not deployed per memory 2026-10-08) | vendor infrastructure [NOT EVIDENCED] | n/a (not stored) |

### 4. Organisation operations and history

| ID | Data category | Purpose | Data subjects | Source | Systems / tables / buckets | Legal basis | Retention | Recipients / processors | Transfer outside EEA | Erasure treatment |
|---|---|---|---|---|---|---|---|---|---|---|
| M23 | Absence fact | the organisation's scheduling | workers | the worker; the manager | `worker_absences` (10) | the organisation is controller: 6(1)(b)/(c). The platform is processor (no DPA) | absence fact kept as an engagement record [OWNER DECISION + LAWYER] | the organisation's managers | Supabase [NOT EVIDENCED] | own row: DELETE via cascade today. Employer's record: rec. RETAIN-pseudonymised [LAWYER] |
| M24 | **Absence reason text** (may reveal health) | private reason for the absence | workers | the worker | `worker_absences` reason / note | **Art. 9(2)(b)** + 6(1)(b)/(c) for the organisation [LAWYER] | [OWNER DECISION — rec. 12 mo, then redact, Package A D3] | the reviewing manager; **employer AI assistant via `absence.review`** (M21) | as M21 | DELETE / redact text |
| M25 | Working-time records: timesheets, events, work-hour allocations | employer statutory working-time records; billing basis | workers; entering managers | the worker; the manager | `timesheets` (2), `timesheet_events` (6, append-only), `work_hour_allocations` (5, RESTRICT) | the organisation: 6(1)(c) | [OWNER DECISION + LAWYER: LT statutory period] | the organisation | Supabase [NOT EVIDENCED] | RETAIN-pseudonymised (employer statutory duty). **Blocks erasure today** (RESTRICT; append-only cascade) |
| M26 | OHS acknowledgements, training, performance reviews | the organisation's compliance and HR | workers | the organisation; the worker | `document_acknowledgements`, `training_assignments(+events)`, `performance_reviews(+events)` (0 rows) | the organisation: 6(1)(c)/(b) | [OWNER DECISION + LAWYER] | the organisation | Supabase [NOT EVIDENCED] | RETAIN-pseudonymised. **Conflict:** the assignee CASCADE deletes the proof (A1 #16, #38) |
| M27 | Roster persons and imported work history of **people without accounts** | the organisation's record of past work; later claim by the person | 43 roster people (41 unlinked), ex-staff | **the organisation** (import, attestations) | `organization_people`, `organization_evidence_records` (2,944), `organization_evidence_events`, `organization_evidence_media`; bucket `evidence-media` | the organisation is controller (its own basis). Platform storage = processor. Linking and inference = controller, 6(1)(f) [LAWYER]. **Art. 14 notice missing** | [OWNER DECISION — no period proposed] | the importing organisation; party organisations named on records | Supabase [NOT EVIDENCED] | account erasure: the link is SET NULL and the organisation's record survives (identified). A no-account person: **REFER** to the organisation + DELETE platform-derived signals. No technical path today (G-05) |
| M28 | Import staging rows (`person_label`, `activity_text`) | the import process | roster people | the organisation | `evidence_import_rows` (2,967), `evidence_import_sessions/events` | as M27 | [OWNER DECISION — rec. delete once the session is finalised] | the importing organisation | Supabase [NOT EVIDENCED] | DELETE |
| M29 | Second-party confirmations (confirmer identity, act, scope) | evidence for the worker | the worker; the confirmer | the confirmer | `journal_entry_confirmations` (42), `worker_skills.verified_by`, `worker_documents.verified_by` | 6(1)(f) | as long as the evidence | worker; organisation | Supabase [NOT EVIDENCED] | confirmer erased: RETAIN-pseudonymised / PSEUDONYMISE ("verifier erased", honest label). Worker erased: DELETE with the entry |

### 5. Commercial: bookings, intake, vacancies, hand-offs, billing

| ID | Data category | Purpose | Data subjects | Source | Systems / tables / buckets | Legal basis | Retention | Recipients / processors | Transfer outside EEA | Erasure treatment |
|---|---|---|---|---|---|---|---|---|---|---|
| M30 | Bookings, engagements, agency offers, service and marketplace deals | form and run work relationships | workers; employers; providers | the parties | `booking_requests(+events)`, `engagement_contexts(+lifecycle events)`, `agency_candidate_offers`, `service_offering*`, `marketplace_*` | 6(1)(b) | [OWNER DECISION + LAWYER — rec. 6 y after end, Package A D1; alt. 10 y] | counterparties | Supabase [NOT EVIDENCED] | rec. RETAIN-pseudonymised to the horizon. Today: cascade deletes, or fails on append-only events |
| M31 | B2B contact person in a company-need intake | respond to demand | B2B contacts | the contact (public form) | `company_need_public_intakes` (6), `customer_requests`, `leads`, `waitlist` (3) | 6(1)(b) pre-contract / (f) | [OWNER DECISION — rec. 24 mo after close] | operator | Supabase [NOT EVIDENCED] | DELETE on request (no account link; match by e-mail) |
| M32 | Clipped intake fields in owner alerts | operational notification | B2B contacts | intake | Telegram bot (`OWNER_TELEGRAM_*`) or Agentai OS bridge (`AGENTAI_OS_ALERT_*`); prod activation not evidenced | 6(1)(f) | transient on our side; Telegram and Agentai OS retention [NOT EVIDENCED] | Telegram; Agentai OS (owner-run, hosting unknown) | Telegram (non-EEA, no DPA) [NOT EVIDENCED] | delete messages in the chat manually [OWNER] |
| M33 | Employer name, org number (sole traders), **contact persons, e-mails, phones in ad text** | show public vacancies; demand intelligence | employers; contact persons | Arbetsförmedlingen (SE), NAV (NO) | `public_vacancies` (SE 143,027 / NO 11,894) | 6(1)(f) [LAWYER]; Art. 14(5)(b) reasoning needed | kept with no end date after deactivation. [OWNER DECISION — rec. 12 mo after deactivation, Package A D3b] | all signed-in users (verbatim); GitHub runners (write) | GitHub runners (US) [NOT EVIDENCED] | DELETE / redact the description on request; no subject key exists, so search the text [E] |
| M34 | Worker interest hand-off envelope (pseudonymous refs + professional facts + consent version) | **Nonstop Group staffing service** (same legal entity, new purpose) | workers who consented | the person | `commercial_handoffs` (2), `first_party_supply_declarations` (1), `privacy_consent_events` (`partner_supply_representation`) | **6(1)(a)** `proposition_consent` / `partner_supply_representation` | [OWNER DECISION — no period proposed] | UAB „Nonstop Group“ staffing door (nonstopgroup.eu), inert unless env set | hosting of the receiving system [NOT EVIDENCED] | DELETE the platform copy; the staffing side copy: separate request handling (roles doc §6) |
| M35 | Billing contact, billing address, VAT id, Stripe ids, metadata | subscriptions and checkout | organisation billing contacts; sole traders | the payer | `billing_customers` (3), `billing_checkout_operations` (3), `billing_subscriptions`, `payment_webhook_events` (0); Stripe | 6(1)(b) + 6(1)(c) | [OWNER DECISION + LAWYER — rec. 10 y, LT accounting law, Package A D2] | Stripe (processor + independent controller) | Stripe group [NOT EVIDENCED] | RETAIN (statutory, Art. 17(3)(b)); pseudonymise the profile link |
| M36 | LMC credit ledger (0 rows) | credit accounting | users | system | `lmc_*` (immutable, RESTRICT) | 6(1)(b)/(c) | as M35 [OWNER DECISION] | — | — | RETAIN-pseudonymised; `recipient_email_at_grant` must be hashed or nulled (design needed) |

### 6. Telemetry, ledgers, logs, invitations and other

| ID | Data category | Purpose | Data subjects | Source | Systems / tables / buckets | Legal basis | Retention | Recipients / processors | Transfer outside EEA | Erasure treatment |
|---|---|---|---|---|---|---|---|---|---|---|
| M37 | Telemetry events (profile id, session id, route, UTM, referrer host, organisation id) | product analytics, funnel | users (77 profiles); visitors | device + server | `pilot_events` (13,376) | 6(1)(f) [LAWYER] | [OWNER DECISION — rec. 24 mo] | Supabase; admin viewer | Supabase [NOT EVIDENCED] | **DELETE** the person's rows. Nulling `profile_id` is not anonymisation (A1 #40) |
| M38 | Device storage: `lm.attr.first`, `lm.funnel.*`, `lm.pilot.session`; UTM in auth metadata | attribution, DAU | users; visitors | device | localStorage / sessionStorage; `auth.users` metadata | **consent required** (ePrivacy 5(3); LT ERĮ 61(3)). **Absent** (G-10) | first-touch: no end date [OWNER DECISION] | — | — | DELETE metadata with the account; device keys are cleared by the user |
| M39 | Consent events | prove consent | workers | the person | `privacy_consent_events` (40) | 6(1)(c) + Art. 7(1) | [OWNER DECISION — rec. account life + 6 y after deletion] | none | Supabase [NOT EVIDENCED] | **RETAIN-pseudonymised** (identity detached; per-subject tombstone keeps linkability). PR #2412 is NOT approved |
| M40 | Privacy request records | handle Art. 12–22 requests; defend | requesters | the person | `customer_requests` (`source=privacy_self_service`); Hostinger mailbox | 6(1)(c) | [OWNER DECISION — rec. 3 y after completion] | operator | Supabase; Hostinger [NOT EVIDENCED] | RETAIN-pseudonymised. **Today the cascade destroys it**, so it must be detached first (G-16) |
| M41 | Audit and security logs (actor id; payload with subject ids and `display_name`) | security, accountability | users; subjects named in payloads | system | `audit_logs` (1,097), `historical_consolidation_decisions` (180), Vercel and Supabase logs | 6(1)(f); 6(1)(c) + Art. 32 | `audit_logs` [OWNER DECISION — rec. 6 y]; provider log windows [NOT EVIDENCED] | Supabase, Vercel | US parents [NOT EVIDENCED] | RETAIN-pseudonymised **after scrubbing the person keys in the payload** (G-18) |
| M42 | AI run records and cost events | quality, debugging, cost control | users | system | `ai_runs` (418), `usage_cost_events` (382, immutable) | 6(1)(f) | **implemented:** `output_excerpt` redacted at 90 d; 0 rows profile-linked today | Supabase | Supabase [NOT EVIDENCED] | DELETE the linkage. `usage_cost_events` SET NULL fails on its immutability guard (design needed) |
| M43 | Invited third party: e-mail, name, personal message | invitations and claim invites | invitees | the inviter | `invitations` (79), `company_worker_invitations` (12), `agency_worker_invitations` | 6(1)(f) [LAWYER] | [OWNER DECISION — rec. expire pending invites] | the invitee (e-mail inactive at app level) | Supabase [NOT EVIDENCED] | DELETE the invitee's personal fields |
| M44 | Location: precise search location, login-location signal, work-object addresses and lat/lng, map viewport + IP | local relevance; logistics; base map | users; site occupants | the person; the organisation; the browser | localStorage `lm.search-location.v1`; `consented_login_location_signals` (1); `work_objects` (230); OSM tile requests | 6(1)(b); 6(1)(a) for the login signal | [OWNER DECISION] | **OpenStreetMap Foundation** (tile server) | UK (adequacy decision); no DPA (tile usage policy only) | DELETE own signals; work objects belong to the organisation (REASSIGN) |
| M45 | Learner and cohort data (possibly minors) | education programmes | learners | the institution; the learner | `education_cohort_members` (4), `education_cohorts`, `learning_*` | [LAWYER]; Art. 8 where consent is used | [OWNER DECISION] | institution staff | Supabase [NOT EVIDENCED] | DELETE (own); REFER to the institution for its records |
| M46 | Backup copies of everything | disaster recovery | everyone | system | Supabase provider backups / PITR (plan and window not evidenced) | 6(1)(f); Art. 32 | provider window [NOT EVIDENCED] | Supabase | Supabase [NOT EVIDENCED] | erased data persists until rotation. State this to the person; do not restore erased rows after a restore [procedure needed] |
| M47 | One-off migration backup of display names | none (artefact) | 22 people | migration | `worker_display_name_backfill_20260805` | no ongoing purpose | **should be dropped** [OWNER DECISION] | — | — | DELETE (G-19) |

## Open decisions collected from this matrix

| # | Decision | Owner | Rows |
|---|---|---|---|
| R-1 | Contract-claim horizon for engagements, bookings and contracts. Recommended 6 y; alternative 10 y. | Owner + Lawyer | M11, M30 |
| R-2 | Accounting retention for billing. Recommended 10 y (LT). | Lawyer confirms | M35, M36 |
| R-3 | Standing approval for rolling deletes: notifications 12 mo, absence reason 12 mo, analytics 24 mo, staging rows at finalisation, inactive vacancies 12 mo. | Owner | M13, M24, M28, M33, M37 |
| R-4 | Consent-ledger and audit-log horizon (rec. 6 y) and privacy-request horizon (rec. 3 y). | Owner + Lawyer | M39–M41 |
| R-5 | Working-time and OHS statutory periods. | Lawyer | M25, M26 |
| R-6 | Whether employer-confirmed journal entries survive erasure. Needs a schema change. | Owner + Lawyer | M06 |
| R-7 | Periods with no proposal yet: transcripts, documents, organisation history, hand-offs, invitations, location signals, learners, fraud hold. | Owner | M01, M08, M19, M27, M34, M43–M45 |
| R-8 | Device analytics: add a consent banner, or drop the non-essential keys. | Owner | M38 |
