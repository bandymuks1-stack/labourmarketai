# LabourMarket.ai — GDPR package 2026-10-15

> **Status: DRAFT. Requires review by a qualified lawyer before anything here is published, signed or relied on.**
> Nothing in this package certifies or guarantees compliance. It reconciles the platform's real behaviour (code, production schema, vendors, data flows as measured on 2026-10-15) with the legal rules, and names every open decision.
>
> **Būsena: PROJEKTAS. Prieš skelbiant, pasirašant ar remiantis šiais dokumentais būtina kvalifikuoto teisininko peržiūra.** Šis paketas nepatvirtina ir negarantuoja atitikties; jis suderina realų platformos veikimą su teisės reikalavimais ir įvardija visus atvirus sprendimus.

## 1. Evidence: what the platform actually does (`audit/`)

| File | Content |
|---|---|
| `audit/01-personal-data-inventory-and-erasure-classes.md` | Every table, bucket and FK holding personal data. The 66 non-cascading FKs, each classified DELETE / RETAIN / REASSIGN / PSEUDONYMISE (0 truly anonymisable). Append-only tables; registry gaps. |
| `audit/02-processors-transfers-cookies-ai.md` | Every live vendor and flow; about 30 cookie and storage keys; AI egress; automated decisions; 19 discrepancies with file:line references |
| `audit/03-rights-consent-legal-pages.md` | Arts 15–22 as implemented; consent ledger; people without accounts; published pages vs reality, all six locales |

All three audits were read-only: catalog queries and counts only, no personal values read.

## 2. Public documents (`public/`): drafts in all six active locales (lt, en, ru, pl, de, nl)

| Document | Files |
|---|---|
| Privacy policy (per-purpose table: purpose, data, Art. 6 basis, source, retention, recipients; AI and profiling; rights and how to use them in the product) | `privacy-policy-v2.<lang>.md` |
| Cookie and local-storage policy (every key, class, lifetime; consent-required items marked) | `cookie-and-storage-policy-v2.<lang>.md` |
| Terms of service (B2B vs consumer fork, withdrawal right, organisations' data duties) | `terms-of-service-v2.<lang>.md` |
| Art. 14 notice for people without an account (organisation-supplied history, vacancy contacts, enquiries, invitees) | `notice-for-people-without-an-account-v2.<lang>.md` |
| Organisation data terms (roles per activity, Art. 14 duty, accuracy and disputes, Art. 28(3) processing terms) | `organisation-data-terms-v2.<lang>.md` |

The **EN** and **LT** versions are the drafting originals. **RU, PL, DE, NL** were translated from EN using the official GDPR terminology of each language (each file has a glossary note), and **each translation needs separate legal-linguistic review**. Every privacy policy has an `[INTERNAL — remove before publication]` block. **The live pages (`apps/web/messages/*.json` legal sections) are NOT changed by this package.** Publishing waits for the owner and the lawyer.

## 3. Internal records (`internal/`)

| Record | File |
|---|---|
| Art. 30 record of processing activities (32 activities) | `ropa-v2.md` |
| **Data-flow, legal-basis and retention matrix** (47 rows, 8 retention decisions) | `data-flow-legal-basis-retention-matrix-v2.md` |
| Processor and transfer register v3 (DPA / transfer evidence per vendor) | `processor-and-transfer-register-v3.md` |
| DPIA: matching and profiling (plus screening of other activities) | `dpia-v1-matching-and-profiling.md` |
| Security, access control, backups, Art. 33/34 breach procedure, incident INC-2026-001 | `security-and-incident-procedures-v1.md` |
| Data-subject request procedure (each right, real code paths, the open request) | `data-subject-request-procedure-v1.md` |
| Controller and processor roles (platform operator, IP licensor, organisations) | `roles-and-responsibilities-v1.md` |
| Minors and age policy | `minors-and-age-policy-v1.md` |
| **Erasure v2: technical plan, tests, remaining dependencies** | `erasure-v2-technical-plan.md` |
| **Gap register by severity: 2 CRITICAL, 13 HIGH, 21 MEDIUM, 9 LOW** | `gap-register-2026-10-15.md` |

Keep the breach register and request log in the owner's private store, never in this public repository.

## 4. Implemented vs needs approval

| Item | State |
|---|---|
| Erasure executor v2 (decision registry, dry run, receipts, admin flow) | **Built and tested locally**: draft PR #2426 (RED). **Owner approval needed** before the production apply. #2412 was closed as superseded |
| Real open deletion request (filed 2026-10-14, due ~2026-11-14) | Executable under v2 once it is applied |
| Gemini egress after #2399 | Verified on production: 0 personal-data calls since 2026-10-15 05:02 UTC |
| Historical Gemini processing (145 + 79 calls) | **Owner + lawyer:** breach / Art. 33 assessment (INC-2026-001) |
| Retention periods, consent banner, minimum age, roles for organisation imports, DPAs with vendors | **Owner + lawyer** decisions (listed in each document's header) |
| Publishing the public documents | **Lawyer review**, then the owner. Engineering then updates the live legal pages |
