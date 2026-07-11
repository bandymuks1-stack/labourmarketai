# Consent Copy Register — v1 (2026-07-11)

Registry of every consent text version. The machine-readable source of
truth is `apps/web/lib/privacy/consent-definitions.ts`; the DB pins the
current (version, hash) in `public.privacy_consent_purposes`. A consent
event proves version + locale + time + purpose; the exact wording for any
version is reproducible from this file's git history + the hash.

## Versioning rules

- Any change to purpose scope, recipient circle, disclosed data categories
  or the nature of use ⇒ NEW version (new `version` string, new hash) and a
  DB `current_version` bump via migration. Old grants stop counting as
  current automatically (`worker_profile_discoverable` /
  `has_employer_data_disclosure` compare the event's version to the pinned
  current one — enforced in SQL, guard-tested).
- Pure typo fixes that do not change meaning still change the hash ⇒ still
  a new version. There is no in-place editing of a served consent text.
- Withdrawal is version-independent: always accepted.

## Active versions

### profile_discoverability — `2026-07-11.v1`

- Hash: `8ef7c1b10511f01904045621ef56f167838f27409ceb209311e7ee0dc1d8acd9`
- Locales: lt, en, ru, nl, de (complete; NL/DE/RU are AI-seeded and follow
  the project's preview/human-review convention — flagged for native review
  together with the rest of those catalogs).
- Blocks per locale: title / summary / visibleData / invisibleData /
  freedom / withdrawal. LT base text = the owner-approved wording from the
  consent goal (verbatim, guard-pinned in `consent-definitions.test.ts`).
- Recipient category: registered, signed-in companies and agencies.
- Data categories: chosen display name, profession(s), experience years,
  skills + safely published work-evidence descriptions, approximate
  preferred region, availability, languages, pay expectation (only if
  self-entered).
- Never included: surname, email, phone, exact address, personal code,
  birth date, bank data, document numbers, CV file, private evidence
  originals, health/ethnicity/religion/political/union or any other
  special-category data.

### employer_data_disclosure — `2026-07-11.v1`

- Hash: `ba18a01f1d90f774a4119aefe01e7bc3c0e807047d30054d85d7f2c7150e85f7`
- Locales: lt, en, ru, nl, de (same convention as above).
- Placeholders `{companyName}` and `{contextTitle}` are filled at render
  time with the registered company name and the concrete need/offer title;
  the hashed registry text contains the placeholders themselves.
- Field whitelist (closed, 7): full_name, phone, email, cv_document,
  preferred_locations, availability_details, salary_expectation.
- Context types (closed, v1): company_need, booking, service_request —
  each validated against its canonical table at grant time.

## Marketing communications

No version exists. The product sends no optional marketing messages, so no
public marketing consent is created (Phase 1 rule). If marketing ever
starts, add a third definition + purposes row FIRST.
