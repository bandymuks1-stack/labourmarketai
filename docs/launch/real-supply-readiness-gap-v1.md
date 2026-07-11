# Real Supply Readiness — Gap Analysis v1 (2026-07-11)

Written as part of the non-landing launch repair (Scope E), together with
the operator launch-readiness view (`/dashboard/admin/launch-readiness`,
service `apps/web/lib/admin/launch-readiness.ts`). The view shows ONLY
counts the production data model can prove. This document records what it
**cannot** prove, what real data the owner must collect, and which fields
would need a future (human-gated) migration.

## What the system CAN prove today (existing columns, live counts)

| Signal | Source of truth |
|---|---|
| Worker profiles | `public.workers` rows |
| Profession per worker | `worker_professions` join rows |
| Location | `workers.current_location_country` |
| Availability | `workers.availability_status = 'available'` (+ preference columns from the 2026-06-13 migration) |
| Pay expectation | `workers.salary_min_eur` / `salary_max_eur` |
| Work evidence | ≥1 `journal_entries` row per worker (hash-chained journal) |
| Document readiness | `worker_documents.status = 'ready'` (+ operator-stamped `verification` axis) |
| Data-processing consent flag | `profiles.consent_data_processing = true` (+ `public.consents` audit trail) |
| Companies | `public.companies` rows |
| Public demand pipeline | `company_need_public_intakes.status` (new / contacted / qualified / rejected) |
| Authenticated demand | `customer_requests.status = 'submitted'` |
| Teams | `organizations.organization_type = 'team'` (migration applied in production) |

Measured production state on 2026-07-11 (read-only): 20 worker profiles
(2 with profession, 2 with location, 2 available, 3 with pay expectation,
4 with journal evidence, 0 with ready documents), **0 consented profiles**,
4 companies, 0 public intakes, 10 submitted customer requests, 0 teams.
The owner's pre-marketing target is **15–25 consented real profiles** —
the platform is measurably below it, and the readiness view says so.

## What the system CANNOT prove today

1. **Consent provenance for marketing/matching use.** `profiles.
   consent_data_processing` is a boolean set at onboarding; `public.consents`
   records grant/revoke events. Neither ties a consent to the SPECIFIC use
   "show my profile to employers during the launch pilot". A profile with the
   flag is not automatically a launch-usable profile.
2. **Availability freshness.** `availability_status` has no "confirmed at"
   timestamp — a worker marked available six weeks ago counts the same as one
   confirmed yesterday.
3. **Profile source.** No column records whether a worker was self-registered,
   operator-entered, or imported — so "real person, real intent" cannot be
   proven per row.
4. **Brigade composition.** A team is an `organizations` row plus
   `engagement_contexts` membership; there is no roster with role-per-member
   or headcount-by-trade. "We have N ready brigades" cannot be proven.
5. **Identity verification.** `worker_documents.verification` proves an
   operator checked a document — not that the person's identity was verified.

The readiness view therefore shows **no** "verified", "ready" or percentage
figures for these dimensions — they render only in this gap document as
open work.

## What the owner must collect (no code required)

1. 15–25 real workers with explicit, recorded consent to be presented to
   employers during the pilot (re-confirm the consent wording covers this).
2. Fresh availability confirmation for each of those workers (a dated
   re-confirmation, even via a phone call logged as a journal/CRM note).
3. At least 3–5 real company needs in the public intake queue (share the
   /company-need link with known contacts; the queue and operator alert are
   live pending the alert env — see the domain truth doc).

## Fields that may need a FUTURE human-gated migration (NOT this task)

| Need | Possible field | Migration? |
|---|---|---|
| Consent scope + timestamp per use | `consents.consent_type = 'launch_pilot_visibility'` (new enum value / row type) | Likely additive, needs owner + legal wording first |
| Availability freshness | `workers.availability_confirmed_at timestamptz` | Additive migration |
| Profile source | `workers.source enum('self','operator','import')` | Additive migration |
| Brigade roster | roster table (org_id, worker_id, trade, role) | New table, needs product decision |
| Journal language for NL/DE | widen `original_language` check constraint (currently lt/en/ru) | Small constraint migration |

Per the launch-repair rules, **no migration was made in this task**. Each of
the above is a separate, owner-gated follow-up once real data collection
starts and the exact wording (especially consent) is approved.
