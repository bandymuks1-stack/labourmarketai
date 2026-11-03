# GDPR gap register — 2026-10-15

- **Status:** DRAFT v1, 2026-10-15. Internal record. **Requires lawyer review.** This is not a statement of compliance or a certification.
- **Controller:** UAB „Nonstop Group“ (302676973).
- **Sources:**
  - `../audit/01-personal-data-inventory-and-erasure-classes.md` (A1)
  - `../audit/02-processors-transfers-cookies-ai.md` (A2)
  - `../audit/03-rights-consent-legal-pages.md` (A3)
  - `docs/legal/*-v1.md` / `subprocessor-register-v2.md`
  - `docs/ai/GEMINI_SAFE_OPERATION_2026-10-15.md` and `docs/ai/LOCAL_LLM_EVALUATION_2026-10-15.md`
  - code spot checks under `apps/web/lib/**` on `origin/main`, 2026-10-15
- **Companion records in this folder:** `ropa-v2.md`, `data-flow-legal-basis-retention-matrix-v2.md`, `processor-and-transfer-register-v3.md`, `dpia-v1-matching-and-profiling.md`, `security-and-incident-procedures-v1.md`, `data-subject-request-procedure-v1.md`, `roles-and-responsibilities-v1.md`, `minors-and-age-policy-v1.md`.

> **LT santrauka.** Vienas bendras, pagal rimtumą surikiuotas GDPR spragų sąrašas, sujungiantis visas tris 2026-10-15 auditų ataskaitas. Tai juodraštis, kurį turi peržiūrėti teisininkas.
>
> Kritinės spragos:
> - nėra ištrynimo vykdytojo, o vienas tikras prašymas ištrinti paskyrą turi būti įvykdytas iki ~2026-11-14;
> - neišspręstas istorinio asmens duomenų siuntimo į Gemini vertinimas (galimai nemokamas lygis);
> - darbdavio prijungtas AI asistentas (MCP) gauna darbuotojų duomenis.
>
> Kiekviena eilutė nurodo teisinį pagrindą, įrodymą, spragos tipą, atsakingą asmenį ir būseną.

## How to read this register

- **Severity**
  - **CRITICAL**: unlawful processing or an unmet statutory deadline is happening now, or is likely, for real people.
  - **HIGH**: a false or missing mandatory statement, or a live processing operation with no documented basis or safeguards.
  - **MEDIUM**: an incomplete record, or a missing mechanism with limited present exposure.
  - **LOW**: hygiene.
- **Type:** `legal-text` · `product-function` · `organisational` · `vendor-contract`.
- **Owner of fix:** Engineering (E) · Owner (O) · Lawyer (L). Every Engineering item that changes production data, RLS or auth is still owner-gated under the repo's RED class.
- **Status:** OPEN · IN PR #… · DONE · IN DRAFT (this pack). IN DRAFT means only that a draft document exists here; the gap stays open until the draft is reviewed and adopted.
- **Evidence:** given as file:line or a production count. "A1 §x" points to the audit report section. Counts are from 2026-10-15 read-only queries made by the auditors; they were not re-run for this register.

## CRITICAL

| ID | Gap | Legal ref | Evidence | Type | Owner of fix | Status |
|---|---|---|---|---|---|---|
| G-01 | **No erasure executor exists, and one real account-deletion request is open.** The request was filed 2026-10-14 and is `in_review`; the one-month deadline is about 2026-11-14. Admin tooling only changes the status. `deletion-plan.ts` is preview-only. `auth.admin.deleteUser` appears only in tests. A plain account delete would fail for up to 81/113 profiles, because of 66 NO ACTION/RESTRICT FKs onto `profiles` and cascades into 24 append-only tables. | Art. 12(3), 17, 5(2) | A1 §0, §2, §3.2; A3 §1 row Art. 17; `apps/web/lib/privacy/deletion-plan.ts:16`; `customer_requests` 1 privacy request | product-function | E + O + L | OPEN. PR #2412 (`erase_user_account_v1`, consent-ledger detach) is a RED draft, **not approved**: the owner refused prod apply on 2026-10-15, and it is being redesigned as **erasure v2**. The interim manual procedure is in `data-subject-request-procedure-v1.md` §6 [OWNER + LAWYER] | IN PR (RED draft, NOT applied): erasure executor v2 `erase_user_account_v2` (migration 20261015200000, supersedes #2412) — dry run by default, decision registry for all 66 FKs, append-only receipt, admin rehearse/execute flow; tested on local PG16. The open request is executable under v2 once the owner approves the migration. See `erasure-v2-technical-plan.md`. 
| G-02 | **Historical sending of personal free text to Gemini, possibly on the free tier, has not been assessed.** Measured 2026-10-15 by calls that reached the vendor (input_tokens > 0): `translate_message` 145 (2026-09-28 → 10-09), `propose_conversation_intent` 79 (2026-09-05 → 2026-10-14 21:28 UTC). 0 since PR #2399 (2026-10-15 05:02). `extract_cv`/`translate_vacancy`: 0 reached the vendor. 83 `429 … check your plan and billing` errors 10-01 → 10-09 suggest the free tier (not proof). | Art. 4(12), 5(1)(a),(f), 28, 33, 34, 44 | `docs/ai/GEMINI_SAFE_OPERATION_2026-10-15.md:11,15`; `docs/ai/LOCAL_LLM_EVALUATION_2026-10-15.md` §2.3; `apps/web/lib/ai/runtime/data-egress.ts:124-172`; A2 D2 | organisational + vendor-contract | O + L | OPEN. Containment is DONE: PR #2399 gates both personal-data grants on `AI_GEMINI_PAID_TIER_CONFIRMED=1`, which is unset. The breach assessment is an open item in `security-and-incident-procedures-v1.md` §7 |

## HIGH

| ID | Gap | Legal ref | Evidence | Type | Owner of fix | Status |
|---|---|---|---|---|---|---|
| G-03 | **An employer-connected AI assistant (MCP / ChatGPT / Claude) receives other people's data**: candidate search, roster, absence review (reasons possibly health-related), journal review queue, shortlist, people ingest. The workers did not choose that recipient. Register v2 and the public page say the recipient is "chosen by the data subject". There is no notice and no transfer analysis. The whole of this row becomes CRITICAL if any employer-side OAuth grant exists. That has not been verified, because no count of grants by role exists. | Art. 5(1)(a), 6, 9, 13/14, 26/28, 44 | A2 §1.1 row 14, D4; `apps/web/lib/capabilities/marketplace-capabilities.ts:69`, `employer-operations-capabilities.ts:366`, `domain-action-capabilities.ts:630-652` | legal-text + product-function | L + O + E | OPEN |
| G-04 | **Automated profiling is live without a DPIA:** auto-match on need publish, candidate ranking with an automated top-N cut-off, job alerts, the new-job-matches badge, and `apply_learning_auto_confirmation`. ROPA v1 says "none in production". The DPIA trigger in screening v1 has been passed. | Art. 35, 13(2)(f), 21, 22 | `apps/web/lib/scouting/auto-match.ts:18-36`; A2 D6, §4; A3 addendum Art. 22 (`lib/conversation/employer-workspace.ts:159-186`; migration `20260720150000` :628-781) | organisational | O + L (E for measures) | IN DRAFT (`dpia-v1-matching-and-profiling.md`) |
| G-05 | **People without accounts in organisation-supplied history** (43 roster people, 41 unlinked; 2,944 evidence records): no Art. 14 notice, no request channel (the RPC needs `auth.uid()`), no controller designation and no DPA with the importing organisation, records are insert-only with no redaction, and there is no retention rule. | Art. 14, 12, 15-17, 26/28, 5(1)(e) | A1 §1c, §3.3; A3 §3; `supabase/migrations/20260706150000_privacy_request_intake.sql:56-58` | product-function + legal-text + vendor-contract | L + O + E | OPEN |
| G-06 | **Vacancy corpus holds third-party contact data.** 41,353 SE descriptions contain an e-mail address and 22,500 contain contact-person wording. They are shown verbatim to every signed-in user. Removed ads keep their content with no end date. There is no Art. 14 statement and no Art. 14(5)(b) reasoning. | Art. 14, 5(1)(c),(e) | A3 §0, §3; `apps/web/lib/vacancy-sources/providers/arbetsformedlingen-parse.ts:205-249`; `vacancy-repository.ts:324-343` | product-function + legal-text | E + O + L | OPEN (retention Decision 3b open) |
| G-07 | **No DPA or transfer mechanism is evidenced for any processor:** Supabase, Vercel, Stripe, Resend (+SES), Hostinger, Google (Gemini), GitHub. Every "transfer basis" cell is an assertion. | Art. 28(3), 44-46 | A2 D17; `subprocessor-register-v2.md` VERIFY column; `en.json:5839` | vendor-contract | O | OPEN |
| G-08 | **Resend is live but undisclosed.** It has been the Supabase Auth custom SMTP since 2026-09-02. The public page says "No other email … provider is active". | Art. 13(1)(e), 28 | `docs/audits/evidence/final-completion/g1-resend-smtp-state-2026-09-02.md:5-7`; `en.json:5826`; A2 D3 | legal-text + vendor-contract | O + E (copy) | OPEN |
| G-09 | **The public AI disclosure is wrong.** It names job-ad translation (never granted), and message translation and intent (both suspended since #2399). The paid/free tier status is not disclosed. `extract_cv` produced 2 `ai_runs` rows on 2026-10-15 with `data_categories_sent=[bio]`, which conflicts with the code, where `extract_cv` is PERSONAL and refused for every cloud provider. The rows must be checked for provider and `blocked_reason`. | Art. 13(1)(c),(e), 5(1)(a) | `en.json:5726,5824`; `apps/web/lib/ai/runtime/data-sensitivity.ts:111-112,162-170`; A3 §0 (ai_runs), L1; A2 D1 | legal-text + product-function (verify) | E + O | OPEN |
| G-10 | **Non-essential device storage for analytics has no consent.** Keys: `lm.attr.first`, `lm.funnel.*`, `lm.pilot.session`. UTM data is copied into auth metadata. 13,376 profile-linked `pilot_events`. The public copy says "no analytics trackers / no behavioural profiles". | ePrivacy Art. 5(3) / LT Law on Electronic Communications Art. 61(3); GDPR 5(1)(a), 13, 21 | A2 §2.2-2.4, D5; `apps/web/lib/telemetry/attribution.ts:25`; `apps/web/lib/telemetry/actions.ts` header; `en.json:5684,5756,5790` | product-function + legal-text | O decides (banner vs drop); E; L | OPEN |
| G-11 | **The dual role of UAB „Nonstop Group“ is undisclosed.** The partner-supply representation consent (3 grants) and worker-interest hand-offs to Nonstop Group's staffing door (`commercial_handoffs` 2) are not described in the privacy policy. | Art. 5(1)(b), 13(1)(c),(e), 13(3) | A3 §2, §7, L6; `apps/web/lib/commercial/handoff-dispatch.ts:13-44` | legal-text | L + O | OPEN |
| G-12 | **Retention periods are not approved and no rolling deletion exists**, except the `ai_runs` 90-day excerpt redaction. The privacy page says the periods are "being prepared". Package A Decisions 1, 2, 3 and 3b are all open. | Art. 5(1)(e), 13(2)(a) | `data-retention-matrix-v1.md`; `retention-decision-package-v1.md`; `en.json:5720,5734` | organisational + product-function | O + L, then E | OPEN |
| G-13 | **The privacy policy declares itself "not the final legal document"**, names no Art. 6 basis per purpose, has no transfers section and no Art. 14 content, and lists incomplete data categories (no telemetry, imported history, hand-offs, AI logs, login location). | Art. 12(1), 13, 14 | A3 L5, L8-L12, L15; `en.json:5670-5675,5760` | legal-text | L + O | OPEN |
| G-14 | **Payments are live, but the Terms say they are not.** Three live-mode `company_pilot` checkouts exist (2 open) and 3 Stripe customers, yet the copy says "payments not active". The Terms are skeletal: nothing on organisations' duties for uploaded personal data, nothing on age. | Art. 13; consumer/contract law [LAWYER] | A3 §0 billing, L7; `en.json:5621` | legal-text | L + O | OPEN |
| G-15 | **Absence reasons may be health data (Art. 9).** They are visible to the reviewing employer and reachable by an employer-connected AI assistant (`absence.review`). The legal-basis matrix says no special-category data is requested. | Art. 9(1),(2)(b), 35 | A1 §1a `worker_absences` (10 rows, SC); A2 D4 | legal-text + product-function | L + O + E | OPEN |

## MEDIUM

| ID | Gap | Legal ref | Evidence | Type | Owner of fix | Status |
|---|---|---|---|---|---|---|
| G-16 | **Erasure design contradicts the schema.** `journal_entries.worker_id` is NOT NULL + CASCADE, so design E1 "detach, keep evidence" is impossible and the cascade deletes. `work_hour_allocations` has RESTRICT on both FKs. `customer_requests` is CASCADE, so the privacy request is destroyed by the erasure it records (E4 says keep 3 y). `document_acknowledgements.assignee` CASCADE deletes OHS proof. | Art. 17(3)(b),(e), 5(2) | A1 §0 findings 4-5, §2 #16, §3.1, §5 | product-function | E + O | OPEN (input to erasure v2) |
| G-17 | **Storage objects are orphaned on account delete.** There is no FK. 25 avatars (at least 4 already stale) and 16 journal photos. | Art. 17, 5(1)(e) | A1 §1d, finding 6 | product-function | E | OPEN |
| G-18 | **`audit_logs` payload carries subject identifiers** (`display_name`, `profile_id`, `worker_id`, `confirmed_by`, before/after). It is registered as ACTOR_ONLY, and erasure would leave these values in place. | Art. 17, 5(1)(c) | A1 finding 7, §4 | product-function | E | OPEN |
| G-19 | **The backup table `worker_display_name_backfill_20260805`** (22 people, no FK) survives erasure. | Art. 5(1)(e), 17 | A1 §1b, §4 | product-function | E + O | OPEN |
| G-20 | **The personal-data registry (`personal-relations.ts`) is incomplete.** `assistant_messages`, `assistant_message_attachments`, `email_send_ledger_v1` and `payment_webhook_events` are unregistered. 7 registry entries do not exist in prod. There is no erasure-treatment field. `deletion-plan.ts` covers only 13 classes. | Art. 5(2), 30 | A1 §4 | product-function | E | OPEN |
| G-21 | **No mechanism for restriction (Art. 18) or objection (Art. 21).** Objection is not named in the policy. Restriction is promised but has no mechanism. There is no rectification request type and no e-mail change path. | Art. 16, 18, 21, 13(2)(b) | A3 §1, L11; `apps/web/lib/privacy/privacy-request-model.ts:9-12` | product-function + legal-text | E + L | OPEN |
| G-22 | **DSR handling has no due-date tracking, no verification procedure for e-mail requests, and no completion notice.** The copy promises an e-mail that is never sent. The requester cannot cancel. | Art. 12(3),(4),(6) | A3 §1 "Other findings", addendum | product-function + organisational | E + O | IN DRAFT (`data-subject-request-procedure-v1.md`) |
| G-23 | **The Art. 15 export is incomplete.** It has no 15(1)(a)-(h) meta-information. Messages and own `customer_requests` are withheld. Files in 4 buckets are not linked. `pilot_events` / `ai_runs` coverage is unverified. The assistant transcript export RPC has no UI. | Art. 15, 20 | A3 §1, addendum "Export gaps"; `apps/web/lib/privacy/export-data.ts:285-335` | product-function | E | OPEN |
| G-24 | **Minors.** There is no age gate and no birth-date field. Learners are "very often a minor" per the code's own comment. There is no Art. 8 handling and no youth-employment statement. | Art. 8, 24, 25; LT Labour Code (minors) | `supabase/migrations/20260827210000_learner_visibility_least_privilege_v1.sql:86-88`; A3 §5 | product-function + legal-text | O + L + E | IN DRAFT (`minors-and-age-policy-v1.md`); HIGH if a minor account is confirmed |
| G-25 | **Backups and disaster recovery are not evidenced.** The Supabase plan, the PITR window and any restore are unknown. There is no DR runbook. The behaviour of erased data in backups has not been stated. | Art. 32(1)(b),(c) | `docs/audits/labourmarketai-security-privacy-data-audit-v1.md` SEC-12 (:41, :597-608, :673) | organisational | O + E | OPEN |
| G-26 | **The incident response has no named roles or thresholds, and no breach register exists.** | Art. 33(5), 24 | `docs/security/incident-response-v1.md` §5; SEC-12 | organisational | O + L | IN DRAFT (`security-and-incident-procedures-v1.md`) |
| G-27 | **GitHub Actions holds the production `SUPABASE_SERVICE_ROLE_KEY`** in 5 workflows, and US-hosted runners write to prod. Register v2 says GitHub is "not a processor". | Art. 28, 32, 44 | `.github/workflows/{ingestion-freshness,nav-supply-cadence,prod-qa-walk,product-monitor,sweden-supply-cadence}.yml`; A2 D15 | vendor-contract + organisational | O + E | OPEN |
| G-28 | **Vercel middleware has no runtime pin**, so it can run at Edge PoPs outside the EEA with auth cookies (a JWT that includes the e-mail). | Art. 44 | `apps/web/middleware.ts:398`; A2 D11 | vendor-contract + product-function | O + E + L | OPEN |
| G-29 | **The Telegram owner-alert register is wrong, and the Agentai OS bridge is an undocumented recipient.** The register names the variable `TELEGRAM_BOT_TOKEN`; the real variables are `OWNER_TELEGRAM_*`. The `AGENTAI_OS_ALERT_*` bridge is not recorded. Telegram has no DPA. Activation in prod is not evidenced. | Art. 28, 30, 44 | `apps/web/lib/env.ts:143-157`; A2 D8 | vendor-contract + organisational | O | OPEN |
| G-30 | **Cookie / storage page is incomplete.** It omits `lm_active_workspace`, `lm_tz` and about 20 storage keys, and states no lifetimes. | ePrivacy 5(3); GDPR 13 | A2 §2.5, D12 | legal-text | E + L | OPEN |
| G-31 | **Undisclosed recipients:** OpenStreetMap tile servers (viewer IP), Hostinger (privacy mailbox), browser speech vendors (in-context notice only), the whisper host if deployed, Google OAuth (picture URL and subject id). | Art. 13(1)(e) | A2 rows 6, 8, 10, 11; D9, D18; `apps/web/components/app/market-map/leaflet-engine.ts:24` | legal-text | E + L | OPEN |
| G-32 | **Second-party confirmations.** The confirmer cannot retract and the worker cannot dispute a confirmation. After erasure, "keep detached evidence" is undisclosed. Two guard migrations are self-marked NOT APPLIED; prod state is unverified. | Art. 5(1)(d), 13, 16, 21 | A3 §4 and addendum; migrations `20261003150500`, `20260915180000` | product-function + legal-text | E + O | OPEN |
| G-33 | **The DPO assessment was not redone after its trigger #1 (automated matching) fired.** | Art. 37 (internal process) | `dpo-requirement-assessment-v1.md` §5.1 | organisational | O + L | OPEN |
| G-34 | **No-account people cannot be reached in the request channel**, and Nordic users have no no/sv privacy text (155k NO/SE vacancies served). | Art. 12(1) | A3 §6 | legal-text | O + L | OPEN |
| G-35 | **The Stripe register row omits fields.** Missing: billing address (required), VAT id, `owner_id`/`organization_id` metadata. `payment_webhook_events` would store Stripe payloads with name and e-mail. | Art. 30, 13 | `apps/web/lib/billing/providers/stripe-test.ts:166-172,197-203`; A2 D10 | organisational | E | IN DRAFT (`processor-and-transfer-register-v3.md`) |
| G-36 | **ROPA v1 is stale.** About 20 activities are missing, and its ADM statement is false. | Art. 30 | A2 D7, D6 | organisational | O + L | IN DRAFT (`ropa-v2.md`) |

## LOW

| ID | Gap | Legal ref | Evidence | Type | Owner of fix | Status |
|---|---|---|---|---|---|---|
| G-37 | **Consent wording in PR #2412 and E2.** The PR calls the detached consent row one that "no longer names a person". It is pseudonymised (per-subject uuid plus context columns), and it must never be called anonymous. | Recital 26, Art. 4(5) | A1 finding 3 | product-function (wording) | E | IN PR #2412 (RED draft, not approved; superseded by erasure v2) |
| G-38 | **Signup records no Terms/Privacy version.** | Art. 5(2), 7(1) (where relevant) | A3 §2 | product-function | E | OPEN |
| G-39 | **Consent "current" check compares the version but not the hash**, after the PL re-pin under the same version. Withdrawals hardcode locale `lt`. | Art. 7(1) | A3 §2, §1 row 7(3); migration `20260711130000` :399,547 | product-function | E | OPEN |
| G-40 | **Speech-dictation consent is stored only in localStorage.** The legacy unversioned `workers.docs_aggregate_consent` is still used. | Art. 7(1) | A3 §2 | product-function | E | OPEN |
| G-41 | **Legal-notice hygiene:** the director name is shown although it is classed VERIFY-BEFORE-SIGNING; the address omits the seniūnija; "ask LabourMarket.ai" names the brand as if it were an entity. | Art. 13(1)(a) | A3 §6; `corporate-identity-source-of-truth-v1.md` §4 #2 | legal-text | O + E | OPEN |
| G-42 | **Stale items:** the CSP still allowlists `accounts.google.com`, and the Facebook sign-in paragraph remains although Facebook sign-in is disabled. Dormant adapters (IndexNow, LinkedIn, Facebook, local LLM, LibreTranslate) are not in the register. | Art. 13 (accuracy) | A2 D16, D19; A3 L16 | legal-text + product-function | E | IN DRAFT (register v3 lists the dormant adapters) |
| G-43 | **Evidence-import staging rows** (`evidence_import_rows`, 2,967, each with `person_label` + `activity_text`) are kept after finalisation with no end date. | Art. 5(1)(e) | A1 §3.3; A3 §3 | product-function | E + O | OPEN |
| G-44 | **The `trust_score` / `matches.score` columns are dormant.** If they are ever computed, a DPIA update and a public notice are required first, and the "no behavioural scoring" copy would become false. | Art. 35, 13(2)(f) | A2 §4; `supabase/migrations/0001_initial_schema.sql:59,111` | organisational (tripwire) | E | OPEN (guard recommended) |
| G-45 | **The AI audit trail overstates data egress.** `ai_runs.data_categories_sent` records the categories a task WOULD send, also when the egress gate refused before any vendor call; both 2026-10-15 audits read 2 refused `extract_cv` rows as "CV text sent". Accountability records must distinguish attempted from transmitted. | Art. 5(2), 30 | prod 2026-10-15: `extract_cv` 2 rows, 0 with tokens, route_reason "data egress gate … PERSONAL" | product-function | E | OPEN (record `[]` or a separate `transmitted` flag when no vendor call happened) |

## Top 10 by severity (for the owner's first sitting)

1. G-01: erasure executor plus the open request due about 2026-11-14.
2. G-02: Gemini historical breach / unlawful-processing assessment.
3. G-03: employer AI-assistant access to workers' data.
4. G-04: profiling live without a DPIA.
5. G-05: people without accounts in imported history.
6. G-07: no DPA or transfer evidence for any processor.
7. G-15: absence reasons as possible Art. 9 data.
8. G-06: vacancy texts with third-party contacts.
9. G-12 / G-13: no approved retention; privacy policy non-final and incomplete.
10. G-08 / G-09 / G-10: false public statements on e-mail provider, AI and analytics.
