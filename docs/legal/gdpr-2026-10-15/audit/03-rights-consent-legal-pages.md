# GDPR data-subject rights and legal pages: audit (2026-10-15)

Repo: `recursing-morse-a88402` @ `063f864fb` (origin/main). Production: Supabase `gorgitwvdzxbnaxhrsrw`. Read-only; no personal values were printed.
Active locales (`apps/web/lib/i18n/config.ts:46`): lt (default), en, ru, nl, de, pl. lv/et/da/no/sv are not routed.

> Scope note: the planned subagent for item 1 (the rights) did not return before hand-off. Item 1 therefore rests on my own direct checks of `privacy-request-model.ts`, `admin/privacy-requests.ts`, `deletion-plan.ts`, `export-data.ts` and prod. Restriction (Art. 18), objection (Art. 21) and Art. 22 UI were checked less deeply and are marked so.

## 0. Production facts (counts only)

| Fact | Value |
|---|---|
| auth.users / profiles | 113 / 113 |
| Privacy requests (`customer_requests` where payload source `privacy_self_service`) | **1 ever**: `account_deletion`, status `in_review`, filed 2026-10-14, real (non-synthetic-looking) account still exists. One-month deadline ≈ 2026-11-14. No `data_export` requests (export is self-serve). |
| `privacy_consent_purposes` | `profile_discoverability` 2026-07-11.v2, `employer_data_disclosure` 2026-07-11.v2, `partner_supply_representation` 2026-09-04.v1 |
| `privacy_consent_events` | discoverability 29 granted / 7 withdrawn; partner_supply_representation 3 granted / 1 withdrawn (first on 2026-10-14); employer_data_disclosure 0 |
| `personal_data_disclosures` | 0 |
| legacy `consents` | 0 rows |
| `organization_people` | 43, all in ONE org (19f47e78…). 41 unlinked, 1 link_proposed, 1 linked. Kinds: 35 `other`, 6 employee, 1 former_employee. |
| `organization_evidence_records` | 2,944; `organization_evidence_events` 158 `attested`, 0 disputes |
| `public_vacancies` | Arbetsförmedlingen 143,027 (114,883 active), **41,353 descriptions contain an e-mail address**, 22,500 contain contact-person wording. NAV 11,894; 0 e-mails, 3,809 with phone-like numbers. |
| `ai_runs` (Gemini) | translate_message 236, propose_conversation_intent 86, translate_vacancy 13, explain_market_demand 6, **extract_cv 2 (both 2026-10-15, data_categories_sent = [bio], unblocked)** |
| `pilot_events` (first-party telemetry) | 13,376 rows across 77 profiles (profile_id + session_id + route + metadata) |
| `consented_login_location_signals` | 1 |
| `commercial_handoffs` (worker interest → Nonstop Group partner door, `lib/commercial/handoff-dispatch.ts`) | 2 (1 closed, 1 queued) |
| Billing | 3 Stripe customers. 3 **live-mode** (`test_mode=false`) `company_pilot` checkouts: 1 expired, 2 open. 0 subscriptions, 0 webhook events. |
| `respond_to_roster_link_v1` | present in prod (the consent subagent's worry that it was unapplied is resolved) |

## 1. Rights, against real behaviour

| Right | What exists | Self-serve or queue | Admin can execute? | Gap |
|---|---|---|---|---|
| Art. 15 access | Logged-in JSON export (`lib/privacy/export-data.ts`; covers profile, workers, relations registered in `personal-relations.ts`, linked roster/evidence rows `:399-424`) and journal CSV, from `/dashboard/privacy` | self-serve | n/a | Export is a data copy only. It lacks the Art. 15(1)(a)-(h) information: purposes, recipients, retention, source, automated decisions. No export for people without accounts. `pilot_events` and `ai_runs` (profile-linked) are not confirmed in the bundle. |
| Art. 16 rectification | Users edit their own profile. Journal entries "cannot be rewritten after saving" (`en.json:5921`). Org evidence corrections are org-only and append-only (`record-correction.ts`, `20260930140000_evidence_correction_integrity_v1.sql`). | partly self-serve | admins "can correct records" (copy only) | No request type for rectification (types are only `data_export`, `account_deletion`, `privacy-request-model.ts:9-12`). A subject cannot get an org record corrected, only disputed, and only once linked. |
| Art. 17 erasure | `submit_privacy_request_v1` → `customer_requests`. The admin queue (`lib/admin/privacy-requests.ts:108-181`) only changes **status**. `deletion-plan.ts` is explicitly a READ-ONLY preview ("issues ZERO writes"). | queue | **No executor.** No `auth.admin.deleteUser` in code. Deletion is a manual owner operation outside the app. | The FK `on delete cascade` from `privacy_consent_events` / `personal_data_disclosures` conflicts with their append-only triggers, so deleting a profile would raise an error. The deletion plan has no class for org evidence or roster rows. Org evidence has no DELETE path at all. |
| Art. 18 restriction | Nothing found. No "restrict" request type or state. | none | none | Missing. The policy says you can ask "to restrict how it is used" (`en.json:5710`), but there is no mechanism. |
| Art. 20 portability | JSON export (machine-readable) | self-serve | n/a | Mostly fine. No controller-to-controller transfer (optional). |
| Art. 21 objection | Discoverability is opt-in and withdrawable. Nothing for legitimate-interest processing: operator matching pool (6(1)(f)), the org's own matching of roster people, first-party telemetry. | none | none | Missing. The right to object is not named in the privacy policy. |
| Art. 22 automated decisions | ROPA says "none in production (matching is human-operated)" (`processing-activities-register-v1.md:27`). AI output is labelled a suggestion. | n/a | n/a | Probably no 22(1) decisions. But `extract_cv` now runs on Gemini (2 runs today) with `human_review_state=pending`, which is undisclosed. The policy does not state the "no solely-automated decisions" position. Not deeply verified. |
| Art. 7(3) withdrawal | One-step withdraw RPCs for every purpose. Ledger is append-only. | self-serve | n/a | Withdrawals hardcode locale `'lt'` (`20260711130000_…sql:399,547`). The `partner_supply_representation` purpose is not described in the privacy policy at all. |

Other request-handling findings:
- **Response time:** no due-date or SLA field or computation in `admin/privacy-requests.ts`. The 1-month promise ("a person answers within one month", `en.json:6018`) is not tracked.
- **Identity verification:** the in-app path relies on the session. The e-mail path says "we may need to verify" (`en.json:6023`), with no procedure.
- **Confirmation to the person:** status is visible in-app (`privacySelfService.requests.status.*`). No completion e-mail or notice was found. After an actual deletion the account is gone, so there is no channel at all.

## 2. Consent management
Strong for account holders:
- `privacy_consent_purposes` stores version + SHA-256 hash of all locale texts (`lib/privacy/consent-definitions.ts:444-451`).
- Grants fail with `stale_consent_version` unless version and hash match.
- The ledger `privacy_consent_events` is append-only for every role and stores version, hash, locale, source, recipient, context and fields. No IP or user agent is stored (a minimisation choice).
- No admin consent on a user's behalf.

Weaknesses:
- **"Current" checks compare version only.** The PL hash was re-pinned under the same version (`20260920173000_…`).
- Legacy unversioned stores remain: `workers.docs_aggregate_consent` boolean, and speech consent kept only in localStorage.
- **No cookie or consent banner.** First-party attribution and telemetry write to the device without consent (ePrivacy Art. 5(3)):
  - `lm.attr.first` UTM data (`lib/telemetry/attribution.ts:25`);
  - `lm.funnel.*` keys (`session-telemetry.tsx`);
  - UTM copied into `auth.users` metadata at signup (`signup-form.tsx:244`).
- **No Terms or Privacy version recorded at signup.** No column exists; the notice is acknowledgement-only (`auth-legal-notice.tsx`).
- **Legal bases:** consent is used for discovery, per-company transfer, partner-supply representation and docs aggregate. Contract or legitimate interest covers everything else (`docs/legal/legal-basis-matrix-v1.md`). The matrix and ROPA do not cover:
  - org-imported history;
  - the vacancy corpus;
  - telemetry;
  - Gemini processing;
  - commercial hand-offs to Nonstop.

## 3. People without accounts
- **Org history** (43 roster people, 2,944 records, one org):
  - Used before any claim with "no consent gate" (`docs/DECISIONS/0020-…:25`).
  - Readable by managers of the importing org, and by managers of any *party* org named on a record (`20260907114500_…import_v1.sql:734-751`).
  - **No Art. 14 notice.** The only contact is an optional manager-sent claim invite with generic text.
  - **No rights path.** Requests need `auth.uid()` (`20260706150000_privacy_request_intake.sql:56-58`). Workers cannot claim by themselves (anti-enumeration). Dispute needs a linked account. Records are insert-only with no erasure or redaction.
  - **No controller designation** (independent / joint Art. 26 / processor Art. 28) anywhere in docs or Terms.
  - **No DPA, no import attestation** (`import-actions.ts:156-299`, `evidence-import-section.tsx`).
  - **No retention row.** Staging `evidence_import_rows.source_fact` is kept indefinitely.
- **Vacancy contacts:**
  - The parsers drop structured contacts (`nav-parse.ts:22-23`, `arbetsformedlingen-parse.ts:291`).
  - But `description_raw` holds names, e-mails and phones (41k SE ads with e-mails). It is shown verbatim to every signed-in user (`jobs/[id]/page.tsx:63-73`), and removed ads keep their last content forever (`vacancy-repository.ts:324-343`; retention Decision 3b open).
  - Redaction applies only to the translation call.
  - No Art. 14 statement in the policy. Art. 14(5)(b) may apply, but this is not argued anywhere.

## 4. Second-party confirmations
- A manager review or attestation of a worker's journal or evidence record is data about **both** people. The worker is the subject of the fact; the confirmer's identity and act are also personal data.
- **Visibility:** the worker sees their own entries. Managers of the organisation that owns the entry can read it for review (`en.json:5920-5921`). Evidence records are visible to the importing org and party orgs.
- **Correction:** journal entries cannot be edited; managers add review results, not edits. Org evidence uses append-only `correction_of`, at most one correction per record. A linked subject can contest (`dispute-actions.ts`) and withdraw the contest. There is no path for the *confirmer* to retract an attestation except a new event. 0 disputes in prod.
- **Gap:** after a deletion request, the retention matrix says "employer-confirmed entries tied to a real engagement: keep detached evidence". That is undisclosed to both the worker and the confirmer.

## 5. Minors and age
- No age gate or minimum age at signup (`signup-form.tsx`, `auth-legal-notice.tsx`).
- No birth-date column in any public table (catalog scan).
- No age statement in Terms (`en.json:5626-5653`) or the Privacy Policy.
- The platform targets work, apprenticeships and learners, so 15–17-year-olds are plausible. No Art. 8 handling, and no statement on youth employment.

## 6. Published legal pages

Pages: privacy, terms, cookies, legal-notice, data-protection, data-access, data-deletion, marketplace-rules (`apps/web/app/[locale]/(marketing)/legal/*`). Copy is in `messages/<locale>.json` → `legal` (en lines 5606-6037).

**Locale parity:**
- lt/en/ru/nl/de/pl each have all 240 legal keys, with no `[EN]` placeholders.
- Spot-checked key facts (controller, VDAI, rights, AI, deletion, subprocessors, payments) are semantically consistent across all six.
- Unrouted lv/et/da/no/sv have 4 keys only. This matters because 155k Norwegian and Swedish vacancies are served and the policy is not available in no/sv; Nordic users fall back to EN/LT.
- NL mixes formal "u" and informal "je" within the same pages (LOW).

**Controller identity vs `docs/legal/corporate-identity-source-of-truth-v1.md`:**
- Name, code 302676973, VAT and address are correct.
- The privacy and deletion copy omit "Pasvalio apylinkių sen." (`en.json:5661, 6032`; LOW).
- The legal notice renders **director "Ramūnas Šukys"** (`legal-notice/page.tsx:109`, `lib/legal/entity-identity.ts:52`). The source-of-truth doc classes this VERIFY-BEFORE-SIGNING, "NOT allowed in production public text" (§4 #2). The final-report doc says it is shown "per owner direction". This is an internal contradiction (LOW–MEDIUM).
- The data-deletion copy says "ask **LabourMarket.ai** to delete" (`en.json:6018`), treating the brand as an entity. That breaks the brand-is-not-an-entity rule (LOW).
- The DPO line ("not appointed") and the contact info@labourmarket.ai are consistent with the DPO assessment.

**False, stale or missing statements (EN line numbers; the same keys hold in all six active locales):**

| # | Statement | File:line | Problem | Sev |
|---|---|---|---|---|
| L1 | AI section lists only translation and chat-intent | en.json:5726, 5824 | `extract_cv` (CV/bio text) ran on Gemini twice on 2026-10-15. Not disclosed. Gemini tier (processor vs free tier) is still UNVERIFIED per `subprocessor-register-v2.md` row 3. | HIGH (CRITICAL if free tier) |
| L2 | "No other email, AI, translation or payment provider is active" | en.json:5826 | Also missing: Google OAuth (an independent controller, and the primary sign-in), the Telegram owner-alert bot (if the token is set), OpenStreetMap tiles (visitor IP), and possibly Resend/Postmark (`lib/email/transactional.ts`; the register says the ledger is empty). | MEDIUM |
| L3 | "does not build behavioural profiles"; cookies "no analytics" | en.json:5684, 5756, 5790 | First-party funnel telemetry: 13,376 profile-linked events and UTM first-touch in localStorage and auth metadata. Undisclosed; no consent; no objection path. | MEDIUM-HIGH |
| L4 | Cookie page "lists what the platform actually stores" (only sign-in, NEXT_LOCALE, lm_hide_admin_ui; theme in localStorage) | en.json:5740-5756 | Missing: `lm_tz` cookie (1 year), `lm.attr.first`, `lm.funnel.*`, recently-viewed, location store, speech consent, composer language and others. | MEDIUM |
| L5 | Data categories list | en.json:5670-5675 | Missing: login location signals, data received from organisations about you (history imports), vacancy-interest hand-offs, AI-run logs, telemetry. | HIGH |
| L6 | Consent: "two different choices" | en.json:5701 | A third purpose, `partner_supply_representation` (live, 3 grants), and the hand-off of interest to Nonstop Group's partner system are not described. | HIGH |
| L7 | "Payments are not active yet; no payments run through the platform" | en.json:5621; Terms 5608 "before any paid services … begins" | Live-mode Stripe checkout sessions for `company_pilot` exist (2 still open). The Terms are 3 short sections: no price, withdrawal right, liability, termination, acceptable use, organisations' duties for uploaded data, or age. | HIGH |
| L8 | Retention: "exact periods … still being prepared" | en.json:5720, 5734 | No periods published; the draft matrix exists but is unapproved. Art. 13(2)(a) is unmet. | HIGH |
| L9 | Legal bases | privacy page | No Art. 6 basis is named per purpose (pending item 5735). Art. 13(1)(c) is unmet. | HIGH |
| L10 | Transfers | privacy page | No section on third-country transfers. Vercel, Google, Stripe and Supabase have US parents; SCC/DPF is unstated. | MEDIUM |
| L11 | Rights list | en.json:5710 | Objection (Art. 21), portability as a right, and automated decision-making (Art. 22 / 13(2)(f)) are not named. Restriction is promised but has no mechanism. | MEDIUM |
| L12 | Third-party-sourced data | absent | No Art. 14 content: org imports, public vacancy corpus, source categories. | HIGH |
| L13 | "Signed DPAs pending" | en.json:5839 | Honest, but it means Art. 28 contracts are unconfirmed for every processor. | MEDIUM |
| L14 | "Deletion … a person answers within one month" | en.json:6018 | There is no executor or due-date tracking to back this. One request is open now. | MEDIUM |
| L15 | Privacy page is labelled "not the final legal document" | `pendingLegal.body` en.json:5760 | The whole policy declares itself non-binding while the platform processes data of 113 accounts, 43 non-users and 155k vacancies. | HIGH (structural) |
| L16 | Facebook sign-in paragraph | en.json:6029-6030 | The Facebook provider is disabled by default (`enabled-providers-core.ts:37`). Stale if not enabled. | LOW |

## 7. Controller and processor roles
- Platform: UAB „Nonstop Group“ is the sole controller. Labour Market AI Sp. z o.o. is IP licensor only, with no access (`entity-role-and-data-access-matrix-v1.md:17`, licence §5). This is consistent across legal-notice, privacy and terms in all locales.
- Not designated anywhere:
  - The role of **organisations that upload staff or ex-staff data** (independent controller vs Art. 26 joint vs platform as their processor).
  - Org-scoped processing run on their behalf (projects, journals reviewed by managers).
  No DPA or controller-to-controller terms exist. The Terms do not mention it.
- **Dual role of Nonstop Group.** It is both the platform controller and a staffing business receiving worker hand-offs (`commercial_handoffs` → nonstopgroup.eu). That is a purpose change within one controller, so purpose limitation and transparency are needed. Consent gating exists (`proposition_consent`), but the privacy policy is silent on it.
- **Gemini:** processor status depends on the unverified paid tier.

## Severity-ranked gaps

### Legal-text gaps
- **CRITICAL (conditional):** L1, if the Gemini key is free tier. CV/bio and message text are then going to a non-processor, undisclosed.
- **HIGH:**
  - L15: the policy declares itself non-final.
  - L9: no legal bases named.
  - L8: no retention periods.
  - L12: no Art. 14 content for org-imported people or vacancy contacts.
  - L5: incomplete data categories.
  - L6: partner-supply purpose and Nonstop hand-off undisclosed.
  - L1: `extract_cv` on Gemini undisclosed.
  - L7: live-mode checkout against "payments not active" and skeletal Terms.
  - Terms do not define what organisations must do about personal data they upload.
- **MEDIUM:**
  - L3: telemetry undisclosed / "no behavioural profiles".
  - L4: incomplete cookie and storage list.
  - L2: missing recipients (Google OAuth, Telegram, OSM, e-mail provider).
  - L10: no transfers section.
  - L11: objection and Art. 22 not named.
  - L13: DPAs pending.
  - L14: one-month promise not backed.
  - No no/sv privacy text for the Nordic audience.
- **LOW:**
  - Address omits the seniūnija.
  - Director name vs VERIFY-BEFORE-SIGNING rule.
  - "ask LabourMarket.ai" names the brand as an entity.
  - Facebook paragraph possibly stale.
  - NL u/je mix.

### Missing product functions
- **CRITICAL:** no erasure executor. Deletion requests can only change status; `deletion-plan.ts` is preview-only, and the cascade-vs-append-only trigger conflict would block a profile delete. A real deletion request is open, due about 2026-11-14.
- **HIGH:**
  - No rights path for people without accounts (org-imported history): no notice, no request channel, no self-claim, dispute only when linked, no erasure or redaction for insert-only evidence.
  - No controller designation, DPA or legal-basis attestation at org import.
  - No retention or purge for imported evidence, staging rows, or removed vacancies whose text holds contact data. Vacancy free text with e-mails and phones is shown verbatim to all signed-in users.
- **MEDIUM:**
  - No Art. 18 restriction or Art. 21 objection mechanism.
  - No request-deadline (1-month) tracking, verification procedure, or completion notice.
  - No consent gate or banner for first-party attribution and telemetry storage.
  - No Terms/Privacy version recorded at signup.
  - Export lacks the Art. 15 meta-information, and its coverage of telemetry and `ai_runs` is unverified.
  - No age gate or minimum-age rule.
- **LOW:**
  - Withdrawal events hardcode locale `lt`.
  - "Is consent current?" checks compare version but not hash (PL re-pin).
  - Speech consent stored only in localStorage.
  - Legacy unversioned `docs_aggregate_consent`.

## Addendum: rights-subagent findings (arrived after the main write-up; code-level, not yet checked against prod migrations)

Each point below was confirmed or added by the rights subagent.

**Privacy self-service flow** (`/dashboard/privacy`):
- UI: `app/[locale]/dashboard/privacy/page.tsx`.
- Action: `lib/privacy/actions.ts:40-66` calls `submit_privacy_request_v1`. Limits: 3 open requests, note ≤500 chars.
- Admin side: `components/admin/privacy-requests-section.tsx`, superadmin-only, mounted at `dashboard/admin/page.tsx:592`. It can change status, add a note, and show a read-only deletion preview.
- The audit log is kept in `payload.privacy_review_log[]`.

**`data_export` request type is never used.** No UI submits it; only `account_deletion` can be filed (`components/app/privacy-deletion-request.tsx:56-58`).

**Deletion copy promises an e-mail that is never sent.** The copy says "After review you will be contacted at your account email" (`privacySelfService.deletion.*`). No code sends anything on submit or on a status change.

**The requester cannot cancel their own request.**

**Export gaps (Art. 15):**
- Signed file links cover only the `journal-entry-photos` and `profile-avatars` buckets (`export-data.ts:285-335`).
- Files in these buckets are missing from the export: document-files, conversation-attachments, evidence-media, customer-request-attachments.
- Some data is held back with a stated reason (`personal-relations.ts:562-680`):
  - all messages and conversations;
  - `customer_requests`, including the person's own privacy requests;
  - `demand_shortlist` (an employer shortlisting the person).
- The export says the assistant transcript "has its own complete export". The RPCs `export_assistant_transcript` / `erase_assistant_transcript` exist, but no UI calls them.
- Confirmations other people made on the worker's entries are not exported as part of those entries.
- The export description in the copy undersells what is actually included.

**Erasure blockers:**
- `journal_entry_confirmations.confirmer_id` (`0013_work_journal_m1.sql:181-182`) has no `ON DELETE` rule. Deleting any user who ever confirmed an entry fails with a foreign-key error.
- `customer_requests.profile_id` uses `on delete cascade` (`0028:40`). A deletion would destroy the privacy request itself, against the plan to keep requests for 3 years.
- `privacy_consent_events` also cascades, which would destroy the consent proof the plan says to keep.

**No e-mail change path (Art. 16).** The account page only shows the address.

**Art. 21 / AI.**
- No "opt out of AI" control.
- `notification_preferences` exists, with e-mail off by default.
- There is no marketing feature.

**Art. 22 (automated decisions).**
- The deterministic matcher (`lib/market/match-v1.ts`) ranks candidates and sets `eligible=false`.
- Employers see only the top `EMPLOYER_CANDIDATES_LIMIT` (`lib/conversation/employer-workspace.ts:159-186`). That cut-off is automated, is not explained in the policy, and cannot be contested.
- `apply_learning_auto_confirmation` (`20260720150000_…:628-781`) writes a real skill confirmation when an organisation's confidence-threshold policy fires. The worker gets no notice and no explanation.
- `trust_score` / `matches.score` columns exist but are unused.

**Second-party confirmations.**
- The confirmer cannot retract a confirmation.
- The worker cannot dispute a confirmation; the only option is to add a correction entry.
- No unique constraint on `entry_id`.
- The latest guard (`20261003150500_journal_counterparty_review_authority_v1.sql`) is self-marked NOT APPLIED.
- Subject contest (`20260915180000`) is self-marked PREPARED / NOT APPLIED; contest-withdraw has no owner approval. **Verify in prod**, since dispute counts are 0.

**Minors.** `20260827210000_learner_visibility_least_privilege_v1.sql:86-88` itself states that linked students are "very often a minor". There is no age verification and no parental-consent path, which strengthens §5.
