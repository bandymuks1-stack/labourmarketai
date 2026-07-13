# Multi-Source Talent Provenance Contract v1

Status: PREPARED (repo-safe consumers) + OWNER-GATED (provenance migration)
Date: 2026-07-13
Programme: Labour Market OS — P5

## Principle

Every person-shaped record on the platform must be able to answer three
questions: **where did this data come from, under what consent, and when was
it last confirmed?** Provenance is a first-class record, not a comment. A
labour-market OS that aggregates talent from many channels without a
provenance ledger inevitably drifts into unverifiable data — this contract
prevents that drift structurally.

## The 8 source types (closed vocabulary)

| Source type | Meaning | Typical consent state |
|---|---|---|
| `direct_registration` | The person signed up themselves | `not_required` (own action) |
| `cv_import` | The person uploaded their own CV file | `not_required` (own action) |
| `external_profile` | The person linked a profile they hold elsewhere | `not_required` (own action) |
| `agency` | A staffing agency introduced the person | `pending` until the person confirms |
| `partner` | A partner organisation introduced the person | `pending` until the person confirms |
| `referral` | Another person referred them | `pending` until the person confirms |
| `company_added_contact` | A company recorded them as a work contact | `pending` until the person confirms |
| `official_integration` | An official, documented integration supplied the record | per integration agreement |

There is **deliberately no `scraped` source type, and none may ever be
added**. The platform does not scrape (see "No scraping", below); a
vocabulary without the word is a stronger guarantee than a policy sentence.

## Provenance record fields

`talent_source_records` (DRAFT migration
`supabase/migrations/20260713210000_multi_source_talent_v1.sql`, human-gated,
NOT applied):

- `subject_profile_id` — whose data this is about (FK profiles, cascade on
  erasure: if the person is deleted, their provenance goes with them).
- `source_type` — one of the 8 closed types above.
- `source_name` (≤160) / `source_reference` (≤300) — bounded human-readable
  origin details (e.g. an agency name, a file name).
- `consent_status` — `not_required` | `pending` | `granted` | `revoked`.
- `first_seen_at` / `last_confirmed_at` — freshness facts; a record that was
  never re-confirmed says so honestly.
- `import_method` (≤80) — how the data physically arrived (e.g.
  `file_upload`).
- `provenance` — bounded jsonb (≤16 KB) for structured origin details.
- `canonical_person_link` — nullable self-reference to `profiles`: the
  canonical person this record resolves to **after a human-confirmed merge**
  (see identity-resolution-contract-v1). Never auto-populated.

## Consent lifecycle

```
not_required ──→ pending ──→ granted ──→ revoked (terminal)
      │              └───────────────────→ revoked
      └──────────→ granted / revoked
```

- `granted → revoked` is always allowed (withdrawal).
- **`revoked` is terminal for the record.** It can never flip back to
  `granted` — automatically or manually. A new, explicit grant is a NEW
  record with its own timestamp. Encoded in
  `apps/web/lib/talent/provenance-model.ts` (`canTransitionConsent`) and
  unit-tested.

## Who can write provenance (v1)

Only the **subject themselves** (or an admin) via the SECURITY DEFINER RPC
`record_talent_source_v1`. A company or agency has **no path** to write
provenance rows about another person in v1. Recording agency/partner-sourced
introductions is a **v2 admin/service path** behind its own owner gate — the
column vocabulary already supports it, the write authorisation does not.

Reads are subject-or-admin only ("where does my data come from" is a
self-view). No employer, company, or public read exists.

## No scraping (hard rule)

- No fetcher of external sites exists in `lib/talent`, `lib/worker` or the
  external-profiles UI, and the consent guard
  (`apps/web/lib/guards/external-profiles-consent.test.ts`) scans for any
  `fetch`/HTTP client appearing there.
- The only import path anywhere in this programme is a **worker-uploaded
  exported file**, reviewed by the worker (see
  external-profile-consent-contract-v1).

## v1 vs v2 honesty

| Capability | v1 (this PR) | v2 (separate owner gates) |
|---|---|---|
| Provenance table + RPC | DRAFT migration, not applied | owner applies |
| Self-view read service | shipped (`lib/talent/provenance.ts`), degrades honestly until applied | — |
| Self-record action | shipped (`lib/talent/provenance-actions.ts`) | — |
| Agency/partner source recording | **does not exist** | admin/service path, own gate |
| Provenance UI surface | **does not exist** (no fake panel) | worker "data sources" view |
| Backfill of existing rows | **none** — old records simply have no provenance rows (honest unknown) | owner decision |

## Owner gate

`supabase/migrations/20260713210000_multi_source_talent_v1.sql` — DRAFT,
needs-human-gate, NOT applied by any agent. Paired rollback in
`supabase/rollbacks/`. `docs/APPLIED_LEDGER.md` Deferred entry. Apply only
after explicit owner OK via Supabase MCP.
