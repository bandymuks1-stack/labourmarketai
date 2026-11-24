# Consent and Disclosure Design — v1 (2026-07-11)

Technical design of the LabourMarket.ai consent + disclosure system.
NOT legal advice; technical risk control awaiting final privacy-text review
(see `privacy-risk-and-dpia-screening-v1.md` and the controller-identity
owner action in the final report).

## Processing purposes (separated by design — GDPR Art. 5(1)(b), 7(2))

| Purpose | What it permits | Default | Scope | Withdrawable |
|---|---|---|---|---|
| `profile_discoverability` | Registered companies/agencies may FIND a limited professional summary for job offers / selection | OFF | global (never per-company) | yes, one click, same screen |
| `employer_data_disclosure` | Transfer of explicitly listed fields (closed whitelist of 7) to ONE company for ONE context (company_need / booking / service_request) | none | per recipient + context + field list | yes, per permission |
| marketing communications | NOT CREATED — the product sends no marketing messages; no public consent surface exists (deliberate) | — | — | — |

Registration, Terms acceptance, profile completion and prior product usage
grant NEITHER purpose. There is no bundled "accept everything" control; the
signup form carries no consent checkbox at all (guard-tested).

## Data model (append-only, migration 20260711130000)

- `privacy_consent_purposes` — pinned CURRENT (version, SHA-256 text hash)
  per purpose. Registry source: `apps/web/lib/privacy/consent-definitions.ts`
  (texts in lt/en/ru/nl/de; hash over the canonical JSON of version + all
  locale texts). Grant RPCs reject any stale/unknown pair → a version bump
  invalidates old grants automatically (fail closed, guard-tested).
- `privacy_consent_events` — append-only ledger. One immutable row per
  grant/withdraw: user, purpose, action, text version + hash, locale shown,
  source surface, (for disclosure) recipient org + context + selected
  fields, created_at. UPDATE/DELETE blocked by trigger for EVERY role
  including service role and superadmin. No IP, no user agent — the
  versioned text + hash carries the proof burden without redundant PII
  (data-minimisation, Art. 5(1)(c)).
- `personal_data_disclosures` — append-only disclosure ledger: who received
  which data categories, when, why (context), under which consent event id,
  initiated by whom, delivery method. Never stores CV/document copies. Only
  one-way `revoked_access_at` stamping is permitted.

Current state = newest event per (user, purpose[, recipient, context]).
No update-in-place anywhere; the legacy `consents` table and
`profiles.consent_data_processing/consent_marketing` booleans are deprecated
(no write path existed; never used as consent evidence).

## Enforcement layers

1. **RLS (primary)**: `workers` / `worker_skills` / `worker_professions`
   SELECT policies route through `can_view_worker()` — employer/agency
   discovery requires `worker_profile_discoverable()` = a CURRENT granted
   ledger row. Server code cannot opt out; client JS is irrelevant.
2. **Active-relationship carve-outs** (different legal basis, see
   legal-basis-matrix): accepted company/agency link, active engagement
   context, active managed-project assignment.
3. **Disclosure guard**: `record_personal_data_disclosure()` is the ONLY
   sanctioned path for an outward transfer: admin-gated, requires
   `has_employer_data_disclosure()` (recipient+context+version match) and
   refuses any payload category the worker did not approve
   (`PAYLOAD_WIDER_THAN_CONSENT`). Missing grant → 
   `DISCLOSURE_AUTHORIZATION_REQUIRED`, nothing returned, no signed URL.
4. **Operator surfaces**: candidate pool / workbench stay internal
   (superadmin), now showing "Awaiting worker permission"; admin can VIEW
   states (current only, never history) via two read-only RPCs and cannot
   grant/edit/delete consent (no such function exists — guard-tested).
5. **UX**: canonical screen `/dashboard/privacy` (visibility / disclosures /
   history / rights), dashboard status card, equal enable/decline buttons,
   no checkboxes, no scare copy, full versioned text + exact "how companies
   see you" preview before the choice.

## Withdrawal semantics (Art. 7(3))

- Discoverability: newest ledger row decides → withdrawal removes the worker
  from every new employer query at the next statement; no cache layer exists
  above RLS for these reads; no profile/CV/journal data is deleted.
- Disclosure: withdrawal inserts a withdrawn event (guard returns false
  immediately) and stamps `revoked_access_at` on prior disclosures; the UI
  says honestly that a company may have seen data while permission was valid.
  Platform-generated access links: none exist today (no cross-user signed
  URLs); if added, they must check the guard at mint time.

## Existing users (Phase 10)

No backfill of any kind (guard-tested: the only statement-level INSERT is
the two-row purposes seed). All 20 production workers start `not_set` =
private; readiness "consented" is 0 until real users choose.
