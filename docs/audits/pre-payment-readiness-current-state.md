# Pre-Payment Readiness — Current State Audit (Stage 0)

> **Purpose.** Ground-truth snapshot of what exists *today* before the
> pre-payment readiness sprint, so every later slice is gap-delta (extend),
> never greenfield (recreate). Compiled 2026-06-13 from the live codebase
> (migrations `0001`–`20260612220000`, app routes, lib services). No code was
> changed to produce this audit.
>
> **Companion source of truth:** [`docs/product/pre-payment-product-readiness.md`](../product/pre-payment-product-readiness.md)
> defines what is free / paid / not-yet-payable and the readiness definitions.

## Legend

- **Exists now?** — Yes / Partial / No (schema present but empty = "Schema-only")
- **Prod-usable?** — Live (wired end-to-end) / Stub / Inert (pure, not wired) / N/A
- **Status colour** — 🟢 ready · 🟡 partial/extend · 🔴 missing

## Reading the big picture

The platform already has: real auth + 5 roles, worker profile + journal + skills
+ player-card, company/agency profiles with a verification ladder, a deterministic
scouting/matching engine with a strict contact-hiding safe-view, conversations +
a gated request-to-communicate, a **worker documents** model with append-only
audit, an **empty** `country_document_requirements` table (correct: no invented
legal facts), an **inert** booking state machine, `plans`/`subscriptions` tables
with **no** Stripe/checkout, a feature-availability catalogue, and a family of
honesty guards. The sprint's job is to **seed, wire, extend, and gate** — not to
build from zero.

---

## 1. Worker side

| Function | Exists now? | Prod-usable? | Missing before payments | Route / component / schema | Proposed sprint action |
|----------|-------------|--------------|--------------------------|----------------------------|------------------------|
| Worker profile (profession, skills, bio, narrative) | Yes | 🟢 Live | — | `/dashboard/profile`; `workers`, `profiles.profile_text`, `profile_skill_claims`; `save_worker_card` RPC | None (reuse) |
| Availability: status + `available_from` + salary + preferred countries | Partial | 🟡 Live (RPC) / no UI for location & preferred countries | UI to edit `current_location_country`, `preferred_countries` | `workers.availability_status/available_from/preferred_countries`; `save_worker_card` | PR4: surface the orphaned RPC fields in UI |
| Availability prefs: relocate, accommodation needed, transport, team/solo, contract type, max trip | No | 🔴 columns absent | All listed columns | none | PR2: additive columns (or `worker_availability_prefs`); PR4 UI |
| Availability windows / unavailable periods | No | 🔴 | granular windows + blackout periods | none | PR2: `worker_unavailable_periods` (windows optional v2); PR6 UI |
| Work journal (entries, metrics, skill links, manager confirmation) | Yes | 🟢 Live | — | `/dashboard/journal`; `journal_entries`, `journal_entry_*` | None (reuse) |
| Skill recognition (profession skills, self-declared, journal-supported) | Yes | 🟢 Live | manager-verify UI is column-only | `worker_skills.source`, `profile_skill_claims` | None blocking; ESCO is future |
| ESCO taxonomy | Schema-only | 🔴 empty / import-only | not blocking pre-payment | `esco_*` tables | Out of sprint scope |
| Worker documents (type, country, status, expiry, note, audit) | Yes | 🟢 Live | file upload UI; country-req seed (see §4) | `/dashboard/documents`; `worker_documents`, `worker_document_events`; `upsert_worker_document` RPC | PR4: extend statuses (pending_verification / verified / rejected), wire country checklist to seed |
| Document file storage | Schema-only | 🔴 `file_path` column, no upload UI | upload + private bucket | `worker_documents.file_path` | PR2/PR4: optional Supabase Storage bucket + reference (no payment dependency) |
| Player card / avatar (real signals only) | Yes | 🟢 Live | add country-readiness + missing-items signals | `/dashboard/player-card`; `lib/player-card` | PR7: add country-readiness + doc-readiness signals |
| Worker docs consent (aggregate, agency-visible counts) | Yes | 🟢 Live | per-company explicit share consent | `workers.docs_aggregate_consent`; `set_docs_aggregate_consent` | PR2/PR7: scope a company-facing safe summary |

## 2. Company / agency side

| Function | Exists now? | Prod-usable? | Missing before payments | Route / component / schema | Proposed sprint action |
|----------|-------------|--------------|--------------------------|----------------------------|------------------------|
| Company profile + verification ladder | Yes | 🟢 Live | extra legal/billing fields | `/dashboard/company`, `/dashboard/admin/company-verification`; `companies` (`verification_status`, `company_type`); `save_company_setup_v2`, `admin_set_company_verification` | PR2: additive readiness columns; PR5 UI |
| Company legal/billing: registration_number column, legal rep, billing email, hiring model, insurance, countries of operation, compliance status | Partial/No | 🔴 mostly absent (reg code rides RPC; billing uses `contact_email`) | dedicated columns + UI | `companies` | PR2 `company_readiness` (additive table or columns); PR5 UI |
| Agency profile | Yes | 🟢 Live | no verification ladder parity | `/dashboard/agency`; `agencies`, `agency_workers` | PR5: optional readiness parity |
| Worker need / demand (draft + submit) | Yes | 🟡 Live (draft live; submit via API, dashboard submit UX thin) | structured skills/docs requirements; rate; headcount range; transport | `customer_requests` (+`payload` jsonb); `save_demand_draft`, `submit_demand_request` | PR5: complete need fields + clarity feedback |
| Demand shortlist | Yes | 🟢 Live | — | `demand_shortlist` (saved/interested/not_fit/reviewed) | None (reuse for booking link) |
| Matching / scouting (deterministic, ranked) | Yes | 🟢 Live | readiness signals on cards | `/dashboard/company/scouting`; `lib/scouting`, `lib/visibility/worker-profile-visibility` | PR7: add country/doc readiness signals |
| Safe-view contact hiding | Yes | 🟢 Live | — | `worker-profile-visibility.ts` (`canViewWorkerContact()` → always false) | None (reuse) |
| Agency pool + open-demand positioning | Yes | 🟡 Live (some RPCs draft) | apply S5/S6 migrations | `/dashboard/agency/pool`; `list_open_demand_for_agencies`, `mark_agency_can_offer` | Confirm applied; reuse |
| Candidate drafts (private, unregistered people) | Yes | 🟢 Live | — | `/dashboard/candidates`; `candidate_drafts` | None |
| `/dashboard/search` | Stub | 🔴 | not required pre-payment | `/dashboard/search` | Defer |

## 3. Communication / booking / calendar

| Function | Exists now? | Prod-usable? | Missing before payments | Route / component / schema | Proposed sprint action |
|----------|-------------|--------------|--------------------------|----------------------------|------------------------|
| Conversations + messages (append-only, RLS, revocation) | Yes | 🟢 Live | — | `conversations`, `conversation_participants`, `conversation_messages`; `/dashboard/communication` | None (reuse) |
| Request-to-communicate (Step 4A, gated, contacts hidden) | Yes | 🟢 Live | — | `requestWorkerConversationAction`; `getOrCreateDirectConversation` | None (reuse) |
| Booking state machine | Yes | 🔵 Inert (pure, tested, unwired) | persistence + RPC + UI + conflict | `lib/booking/booking-state.ts` (proposed→accepted/declined/withdrawn/expired) | PR6: build `booking_requests` table + accept/decline RPC against this machine |
| Booking persistence | No | 🔴 no table | additive `booking_requests` table | (proposed in `STEP_4B_BOOKING_DECISION.md`) | PR2 migration (additive, reversible) |
| Readiness snapshot at booking time | No | 🔴 | jsonb snapshot column | none | PR2/PR6: `readiness_snapshot` jsonb on `booking_requests` |
| Conflict detection (no double-accept) | No | 🔴 | overlap check in accept RPC | none | PR6: overlap check in `accept_booking_request` |
| Calendar / availability windows | No | 🔴 only `available_from` date | unavailable periods + windows | none | PR2/PR6: `worker_unavailable_periods`; internal calendar (no Google) |

## 4. Country work readiness / legal

| Function | Exists now? | Prod-usable? | Missing before payments | Route / component / schema | Proposed sprint action |
|----------|-------------|--------------|--------------------------|----------------------------|------------------------|
| Country document-requirements model | Schema-only | 🔴 EMPTY (correct: no invented facts) | seed + `last_reviewed_at` + `confidence` columns | `country_document_requirements` (country, document_type_slug, requirement_level, source_status, source_url, is_active) | PR2: add `last_reviewed_at`, `confidence`, `needs_legal_review`, scope; PR3: seed v1 from official sources |
| Document types | Yes (seeded) | 🟢 Live | extend type list (work permit, posting notification, tax/social-sec registration) | `document_types` (cv, id_document, a1_certificate, employment_contract, posted_worker_package, professional_certificate) | PR2: additive type rows |
| Countries master list | Partial | 🟡 9 seeded (FI missing) | add FI | `countries` (LT,LV,EE,PL,NL,DK,DE,SE,NO) | PR2: add FI row |
| Labour-market evidence (qualitative, sourced) | Yes | 🟢 Live (LT,LV,EE,PL,DE,NL) | DK/NO/SE/FI signals optional | `lib/labour-market/sources.ts`,`evidence.ts`,`country-evidence.ts`; `/labour-market` | Reuse provenance pattern for country reqs |
| Legal pages (terms/privacy/cookies) | Partial | 🟡 placeholder shells with honest draft banner | real reviewed content (M5/counsel) | `/legal/{terms,privacy,cookies}` | Keep honest; out of code scope — flag for counsel |
| Consent infra (data processing, marketing, docs aggregate) | Yes | 🟢 Live | per-context share consent UI | `consents`, `profiles.consent_*`, `workers.docs_aggregate_consent` | PR7: company-facing safe-summary consent |
| Provenance guards | Yes | 🟢 Live | a *legal-guarantee* guard | `lib/guards/*evidence*`, `country-evidence.test.ts` | PR3/PR10: new `no-legal-guarantee` guard + `country-requirements-sources` guard |

## 5. Admin / plans / feature gates / payments

| Function | Exists now? | Prod-usable? | Missing before payments | Route / component / schema | Proposed sprint action |
|----------|-------------|--------------|--------------------------|----------------------------|------------------------|
| Auth + 5 roles + dual admin signal | Yes | 🟢 Live | — | `lib/auth/*`; `profiles.active_role`, `profile_roles`, `is_admin()` | None (reuse) |
| Admin hub + sub-pages (verification, telemetry, agent-os, language-feedback, project-truth, users) | Yes | 🟢 Live (some read-only) | doc-verification queue, country-rule review, readiness-blockers, plan override | `/dashboard/admin/*`; `requireSuperadmin` | PR9: add admin control-center surfaces |
| Plan definitions | Yes | 🟢 Live (DB + i18n) | pre-payment plan model (Free Worker / Worker Plus / Company Pilot / Agency Pilot / Admin) | `plans`; `lib/marketing/plans.ts`; `/pricing` | PR8: plan source-of-truth aligned to sprint plan names + feature limits |
| Subscriptions table | Schema-only | 🔴 never written | manual/admin-controlled status (no Stripe) | `subscriptions` (`external_ref` unused) | PR8: admin/manual entitlement write (no payment) |
| Feature availability catalogue | Yes | 🟢 Live | entitlement/plan-limit enforcement | `lib/config/feature-availability.ts` | PR8: add plan-entitlement gate layer |
| Entitlement / plan-limit gating | No | 🔴 `plans.features` readable, unenforced | gate helpers + UI labels | none | PR8: `lib/billing/entitlements.ts` (pure) + gates |
| Payment-not-enabled / contact-for-pilot state | Partial | 🟡 honest pricing copy | explicit gated-feature UI state | `/pricing` honesty copy + guard | PR8: reusable "payment not enabled yet" + "request pilot access" components |
| Stripe / checkout / billing live | No | 🟢 correctly absent | **must stay absent this sprint** | none | Guard in PR10: forbid Stripe-live + checkout route |

---

## Cross-cutting honesty assets (already enforced)

- `check:pilot-honesty-copy` — bans fake AI-match / instant-hiring / automatic-verification / demo-is-live / "we guarantee".
- `check:pricing-honesty-copy` — bans checkout/pay-now / automatic billing / guaranteed hiring / verified-automatically / payment-active.
- `check:fit-signal-copy` — bans OVR / universal score / 0–99 rating / "profile strength".
- `product-copy-forbidden-terms` — bans the word "demo" (use preview/concept/not-live-yet) and fake trial framing.
- **Gap (this sprint adds):** no guard yet bans *legal-guarantee* claims ("guaranteed legal", "we ensure compliance", "legally approved") or requires `source_url` on official country requirements. → PR3/PR10.

## Sprint-blocking gaps (ranked)

1. **Country document-requirements are empty** + missing `last_reviewed_at` / `confidence` / scope. → PR2 (columns) + PR3 (seed).
2. **Worker availability preferences** (relocate/accommodation/transport/team/contract) have no columns or UI. → PR2 + PR4.
3. **Booking has no persistence / accept path / conflict detection.** → PR2 + PR6.
4. **Company legal/billing readiness fields** are mostly absent. → PR2 + PR5.
5. **No entitlement gating / pre-payment plan model** mapped to the sprint plan names. → PR8.
6. **No admin readiness-blockers / doc-verification queue / country-rule review.** → PR9.
7. **No legal-guarantee guard / country-source guard.** → PR3 + PR10.

## What stays untouched (guard-rails)

No Stripe live, no checkout route, no real payment collection, no DNS/secrets,
no destructive migrations, no RLS-loosening, no fake "verified"/"ready" states,
no invented country requirements, no exposure of private documents to companies
without explicit consent. Migrations are committed but **applied by the owner**
(RED class stays human-gated).
