# LabourMarket.ai — GDPR readiness v1

> Draft for owner review — 2026-07-06. Source-grounded @ 7dcef6d.
> **Not legal advice.** This is an engineering-side inventory to make the
> lawyer conversation cheap and concrete. Items marked ⚖️ need counsel.

## 1. Personal data inventory (what the product actually stores)

| Data | Table(s) | Lawful-basis candidate ⚖️ | Notes |
|---|---|---|---|
| Account email, name | `profiles` | contract | Supabase Auth managed |
| Roles/workspaces | `profile_roles` | contract | |
| Worker profile, skills, availability, pay expectations | `workers`, `worker_skills`, `worker_professions`, work-card tables | contract | user-entered |
| Work journal entries (free text, photos) | `journal_entries`, photo tables | contract | may contain third-party names the user wrote — ⚖️ guidance for users |
| Skill confirmations | confirmation tables | contract / legitimate interest | manager identity attached |
| Documents (CV import, worker docs) | storage + `worker_documents*` | contract + explicit consent flags (`s6_worker_docs_consent`) | consent capture exists in code |
| Messages | conversation tables | contract | participant-scoped |
| Location | `preferred_locations`, localStorage pin (client-only) | contract | map pin never leaves the device today |
| Company data | `companies`, `company_workers`, demand tables | contract | rekvizitai are business data |
| Telemetry | `pilot_events` (session-scoped, no IP logged by app) | legitimate interest ⚖️ | per-tab session id, not a fingerprint |
| Avatars | storage, consented upload | consent | |

## 2. Rights support — current state

| Right | Today | Gap |
|---|---|---|
| Access | user sees their own data in-product; no export bundle | "download my data" export PR (worker data is the priority) |
| Rectification | profile/journal editable (journal keeps correction lifecycle — by design, an integrity feature) | explain the append-only correction model in privacy copy ⚖️ |
| Erasure | `on delete cascade` from `profiles` exists on key tables; no self-service delete button | account-deletion PR: self-service delete + storage cleanup + confirmation flow ⚖️ (journal entries confirmed by others — retention tension) |
| Portability | none | folds into the export PR |
| Objection/consent withdrawal | document consent flags exist; no consent dashboard | small settings section listing given consents |

## 3. Processors ⚖️

Supabase (EU region: project runs in `eu-west-1`), Vercel, Google (OAuth
only). DPAs: standard vendor terms — lawyer to confirm they suffice and
whether a processor list must be published in the privacy policy.

## 4. Privacy copy

Public legal pages exist (`docs/policies/legal`, `legal-pages-public-clean`
guard). The privacy policy needs a pass against §1–§3 once the lawyer
confirms bases — owner wording, not a Claude draft, per repo rules.

## 5. Breach notification ⚖️

72h supervisory notification assessment + user-notification thresholds are
counsel decisions. Engineering side is ready to support them: incident
record format and containment steps in `incident-response-v1.md`.

## 6. Cheapest next actions (engineering, no lawyer blocked)

1. Data-export bundle PR (worker JSON export) — also the access right.
2. Self-service account deletion PR (with the confirmed-entry retention
   question presented to the lawyer FIRST).
3. Consent list in settings (documents/avatar flags already stored).
