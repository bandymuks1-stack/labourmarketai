# Marketplace Precision & Booking — Canonical Contracts v1

Companion to `marketplace-precision-booking-gap-map-v1.md`. These contracts bind PRs 2–7 of the programme. Nothing here creates a parallel store; every contract names its single canonical owner.

---

## 1. Canonical field-ownership contract

Rule: a fact lives in exactly one place; every other surface reads it.

| Fact | Owner | Write path | Read gate |
|---|---|---|---|
| Demand identity/status/kind | `customer_requests` columns | `save_demand_draft` / `submit_demand_request` / `save_customer_request` | owner+admin RLS; workers via `list_open_demand_for_workers` whitelist |
| Demand structured detail v2 (opportunity type, target supply, worksite, engagement form, time, compensation, accommodation detail, transport split, requirements, process) | `customer_requests.payload.structured_v2.*` (typed by `lib/demand/structured-demand-v2.ts` zod contract — new in PR 2) | existing owner-scoped RPCs (payload passthrough) | owner preview; worker exposure ONLY via future RPC v3 whitelist (MP-3) |
| Demand geo | `company_demand_locations` | `lib/demand/demand-location.ts` (signal-only) | map/legend rules |
| Worker base availability | `workers.availability_status`, `available_from` | `save_worker_card` | `can_view_worker` |
| Worker structured preferences | `workers` 8 pref columns (+ MP-2 additions) | `save_worker_availability_prefs` (v2 via MP-2) | owner-only until disclosure whitelist says otherwise |
| Worker languages | MP-1 `worker_languages` (future) | MP-1 RPC | owner + `can_view_worker` |
| Worker professions/skills/evidence | `worker_professions` / `worker_skills` / journal | existing flows | `can_view_worker` (consent-swapped RLS) |
| Worker docs/certificates | `worker_documents` (+`valid_until`, verification axis) | existing doc flows | owner + consent |
| Team capability | `organizations(type='team')` + member-derived aggregation | `create_team_v1`, `add_org_member` | `get_team_capability_summary_v1` (honest counts) |
| Company capability | `companies` (verification ladder) + `service_offerings` | `save_company_setup`, offerings CRUD | discovery policy (active offerings) |
| Booking truth | `booking_requests` (+events) | 3 RPCs (propose/respond/withdraw; MP-4 adds change/reason) | 2-party RLS |
| Conversation truth | `conversations*` + source relation | `getOrCreateDirectConversation` (4 gated grants) | participant RLS |
| Match result | computed at read time by `lib/market/match-v1.ts` — NEVER persisted | n/a | same visibility as inputs |
| Attention counts | derived spine (`spine-signals.ts`) | n/a | own-data |
| Saved/repeat state | URL/localStorage (filters, recently-viewed) now; MP-5 table for saved opportunities later | client | client |

Anti-duplication pledges (guard-enforced where possible): no second dashboard, profile/CV, opportunity model, booking system, conversation system, skills/availability/document store, map engine, search system, top-level nav entry.

## 2. Structured demand contract (`structured_v2`) — shape summary

`customer_requests.payload.structured_v2` (all optional, additive; absence = "not provided", rendered honestly):

- `opportunity_type`: `employment | temporary_assignment | project_work | subcontract | service_request`
- `target_supply`: `individual | multiple_workers | team | company`
- `worksite_type` slug; `site_mode`: `single | multiple | mobile`; `work_mode`: `onsite | remote | hybrid`
- `engagement_form`: `direct_employment | agency_employment | temporary_employment | posted_worker | self_employed_contractor | company_subcontract`; `contract_country` ISO-2; `probation_days?`; `right_to_work_notes` (neutral facts); `required_permits[]` (doc-type slugs)
- `time`: `{ start_earliest, start_latest, end_date?, extension_possible?, hours_per_week?, min_guaranteed_hours?, shifts[]: day|night|weekend, overtime_expected?, rotation_pattern?, schedule_notice_days?, application_deadline?, expected_response_days? }`
- `compensation`: `{ min_cents?, max_cents?, currency, basis: gross|net|unspecified, unit: hour|day|week|month|project, guaranteed_base_cents?, overtime_rate?, night_rate?, weekend_rate?, bonuses[], per_diem_cents?, holiday_pay_note?, payment_frequency?, first_payment_days?, deductions[]: {kind: accommodation|transport|insurance|other, amount_cents?, period?, note} }` — publish-honesty flags derive from missing `min_cents`/`min_guaranteed_hours`/`basis`/`deductions`
- `accommodation`: `{ state: offered|not_offered|not_needed, payer: employer|shared|worker?, price_cents?, price_period?, room: single|shared?, occupancy?, distance_km?, travel_minutes?, amenities[]: kitchen|laundry|internet, registration_possible?, deposit_cents?, family_possible?, agreement_note?, available_from? }`
- `transport`: `{ international_travel: provided|compensated|not_provided|unknown, pickup?, daily: provided|compensated|not_provided|unknown, between_sites?, company_vehicle?, fuel_card?, own_vehicle_required?, licence_categories[], driver_supplement?, parking_tolls?, return_travel_contribution? }`
- `requirements`: `{ professions[], skills[] (catalogue/ESCO slugs), min_experience_years?, similar_project?, independent_work?, drawings_reading?, leadership?, languages[]: {lang, level: A1..C2, one_per_team_sufficient?}, certificates[]: {slug, expiry_required?}, education?, equipment_permissions[], own_tools?, own_vehicle?, own_workwear?, references_required?, physical_conditions?, medical_prerequisites? }`
- `process`: `{ application_method: interest_signal|conversation|external_none, required_documents[], interview_stages?, practical_test?, document_verification?, decision_owner?, response_deadline_days?, start_confirmation?, listing_kind: active_vacancy|talent_pool }` — `talent_pool` must render a disclosure chip
- `meta`: `{ contract_version: 2, updated_at }`

Numbers are integer cents; enums are closed; free text is bounded and never worker-exposed without the RPC whitelist.

## 3. Deterministic matching contract v2

One engine: `lib/market/match-v1.ts` extended in place. `MATCH_CALC_VERSION = "2"`.

Criterion classes:
- **hard** — failure ⇒ `eligible: false`; cannot be compensated by any weighted sum (structural: eligibility computed before ordering). Set: right-to-work conflict, required profession absent, mandatory certificate absent/expired, required language below level, impossible location (country not accepted / outside radius with no relocation), start date impossible, engagement form rejected, essential licence/vehicle absent, compensation below worker hard minimum, insufficient team/company capacity.
- **weighted** — ordering only. Set: extra skills, similar-site experience, extra languages, shorter travel, own vehicle/tools, accommodation fit, evidence strength (manager_confirmed 1.0 / journal 0.7 / self 0.4 — existing), earlier start.
- **negotiable** — displayed as discussion points, never block, never silently boost. Set: close salary gap (≤15%), start-date flexibility window, rotation, room type, hours delta, transport arrangement, duration.

Every result exposes: `eligible`, `matchedHard[]`, `blocking[]`, `strengths[]`, `negotiables[]`, `missingData[]` (criterion + which side must provide), per-criterion `source` (table/field) + `freshness` (updated_at where available), `calcVersion`. Missing data NEVER fabricates an outcome — criterion lands in `missingData`, and if a hard criterion is unknowable the result is `insufficient_data`, not eligible.

Directions (same engine, mirrored inputs): worker→opportunity, opportunity→worker (scouting), demand→team/company (team summary + offerings as subject), worker/team/company→compatible demand.

Presentation: explanation first; a numeric basis (`matched/total`) may follow; `%` never appears alone; worker-facing board stays band-based. No ML/AI language for deterministic rules (guarded).

## 4. Booking / request lifecycle contract

Canonical machine (existing, unchanged this programme): `proposed → accepted | declined | withdrawn` (+ `expired` reserved, no writer yet). Worker-only accept; overlap guard on accept; events append-only; conversation opens on accept under `allowed_accepted_booking`.

Programme additions:
- **Derived display states (repo-safe, PR 5):** `awaiting_response` (proposed, fresh), `no_response_stale` (proposed older than N days — display-only, no status write, labelled honestly), terminal labels. No fake `expired` writes.
- **Mode clarity:** every request surface declares one of: `direct_application` (interest signal), `request_to_discuss` (conversation grant), `request_booking` (propose), `propose_dates` (booking with date range). Instant confirmation is out of scope (owner-gated).
- **MP-4 (draft, human-gated):** `cancellation_reason` (bounded enum+note) on withdraw/decline events, `response_deadline_at` on propose, `propose_booking_change` (reschedule: new row linked via event, old row superseded — no in-place mutation of accepted truth), expiry writer decision (DB function vs scheduled job — scheduler itself owner-gated).
- **Invariants (tests):** company never self-accepts; no double-accept overlap; one conversation per source (regression test over app-side dedup); timezone truth = date precision, never fake times; readiness snapshot immutable.

## 5. Review / experience-record eligibility contract (owner decision pack)

Doctrine reconciliation proposal (requires owner approval before ANY UI ships):
- No numeric person rating ever (§19 stands). A **structured experience record** is: eligible-relationship-bound, dimension chips (punctuality, communication, work quality, condition accuracy vs the published structured_v2 facts, accommodation/transport accuracy where experienced), bounded written text, reviewed-party response, moderation state machine (`submitted → in_moderation → published | rejected`), report path. Compensation-accuracy is a factual field with mandatory moderation + legal review. No aggregate score is ever computed or shown; transparent record count only; "insufficient data" renders as absence, not 0.
- **Eligibility:** exactly one record per (author, subject, interaction); interaction ∈ accepted `booking_requests` reaching its start date, completed engagement (`engagement_contexts` ended), or accepted+concluded `service_offering_requests`; self-review impossible; private work details excluded by bounded structured fields.
- **Store (MP-6, only after approval):** append-only `experience_records` + moderation events; RLS: author+subject+admin; publication via moderation RPC only; no anon read until owner decides public visibility.
- This programme ships: this contract + pure eligibility lib (`lib/trust/experience-eligibility.ts`) + tests, and stops.

## 6. Mobile flow map (390px targets for PR 7 proof)

Worker: sign-in → dashboard → profile/CV (identity, professions, skills) → **structured preferences form (new)** → journal/evidence → opportunities board (filters + explanation + detail) → express interest / propose dates → conversation → planning/status.
Company: sign-in → company identity/verification → **structured demand quick-entry → advanced clusters → preview-as-worker → publish** → scouting results with explanations → contact/request via consent gates → booking propose → planning → project/task/document connection (tasks lane honest while #708 gated).
Proof: authenticated 390px screenshots per step, desktop parity samples; if production smoke accounts are unavailable, exact seeded-account requirements are reported as a gate.

## 7. Validation matrix binding (per goal spec)

Every PR runs: `pnpm -F web typecheck | lint | test | build`, `placeholders:check`, `check:i18n-debt`, `check:primary-route-smoke`, `check:public-seo-indexing`, honesty-copy checks, `migration-safety.mjs --self-test` (CI), plus targeted new tests: old-record readback, publish-honesty flags, hard-block non-override, negotiable presentation, missing-data explanation, gross/net/deduction honesty, accommodation/transport separation, role equivalence, consent-scoped discovery, exact-location privacy, availability overlap, lifecycle invariants, review eligibility + duplicate prevention, route reality (no dead cards), LT/EN/RU/NL/DE keys, 390px/desktop, keyboard focus, no horizontal overflow.
