# Commercial Pilot Readiness Train V1 — Delivery-Truth Audit

Date: 2026-07-16 · Baseline: main @ `39196ec8` (post PR #773 compact dashboard).
Method: five parallel read-only repo audits, one per wagon, against acceptance
requirements. Documentation, placeholder UI, hidden flags, mocks and unwired
components were NOT counted as delivered.

Status vocabulary: `ALREADY_COMPLETE` / `PARTIALLY_COMPLETE` / `MISSING` /
`BLOCKED_OWNER_DECISION` / `BLOCKED_EXTERNAL_DEPENDENCY`.

---

## Wagon 1 — Worker discovery and consent (Limited Worker Ads)

| Requirement | Status | Key evidence |
|---|---|---|
| Opt-in visibility + consent history | ALREADY_COMPLETE | `20260711130000_privacy_consent_and_disclosure_v1.sql` (APPLIED), append-only `privacy_consent_events`, RPCs grant/withdraw/current/history, `lib/privacy/discoverability-actions.ts`, privacy page UI |
| Employer worker search | PARTIALLY_COMPLETE | Scouting (`dashboard/company/scouting` → `runScouting`) + network name search; `talent` page is superadmin-gated SAMPLE data only |
| Bounded filtering | PARTIALLY_COMPLETE | Supply cap `.limit(200)`, search bounds; no interactive employer facet filters |
| Stale-profile handling | MISSING | No freshness column/filter; `WorkerCard.lastActiveBucket` prop exists but unwired (sample-fed) |
| Anonymised cards | ALREADY_COMPLETE | `lib/visibility/worker-profile-visibility.ts` allow-list + `assertContactSafe`, `scout-safe-view.ts` (name/contact never passed) |
| Contact request lifecycle | ALREADY_COMPLETE | `booking_requests` + events (APPLIED), proposed→accepted/declined/withdrawn/expired, worker-only accept; no scheduler for expiry sweep (owner-gated) |
| Contact disclosure after consent only | PARTIALLY_COMPLETE | Server enforcement complete (`can_view_worker` fail-closed RLS, admin-only `record_personal_data_disclosure`); ~~`grant_employer_data_disclosure` has zero app callers~~ CORRECTED 2026-08-01: `grantContactDisclosureAction` (`lib/privacy/contact-disclosure-actions.ts`) now calls it — but the ask-table migration `20260716120000` is `DRAFT — DO NOT APPLY`, so in prod the ask→accept→grant chain degrades to `needs-migration`; and `record_personal_data_disclosure` still has zero callers, so nothing is delivered (see `docs/audits/evidence/premium-rebuild/w4-permission-matrix.md` M3/M4) |
| Rate limits on contact requests | MISSING | No throttle on booking/conversation RPCs or actions |
| Limited-ads readiness state | BLOCKED_OWNER_DECISION (doc-only) | `READY_FOR_LIMITED_WORKER_ACQUISITION` is a doc label (PR #764/#765), no code flag |

## Wagon 2 — Trust Connect (teams, brigades, accommodation, transport)

| Requirement | Status | Key evidence |
|---|---|---|
| Team/brigade entity + roles | ALREADY_COMPLETE | `organizations.organization_type='team'` (`20260705220000`), membership via `engagement_contexts`, `create_team_v1` |
| Team creation flow | ALREADY_COMPLETE | `lib/company/team-brigades.ts` + `team-brigades-panel.tsx` on company room, honest needs_migration probe |
| Member invitations + rate limits | ALREADY_COMPLETE | Canonical `invitations` (`20260712200000`, APPLIED per ledger:61, PR #744), type `join_team`, 100 open + 30/24h |
| Member consent to be represented | PARTIALLY_COMPLETE | Invite-accept path carries consent; **owner "Add member" bypasses consent via direct `addOrgMember`**; no represent-consent artifact |
| Team availability | MISSING (team-level) | Explicitly deferred in `20260705220000` header; worker-level fields applied (`20260613100000`, `20260711270000`) |
| Team skills composition | ALREADY_COMPLETE | `get_team_capability_summary_v1` (declared/confirmed counts, no fake team rating) |
| Accommodation fields | PARTIALLY_COMPLETE | Worker (`needs_accommodation`) + demand (`payload.accommodation`) applied; no team-scoped field |
| Transport fields | PARTIALLY_COMPLETE | Worker (`has_transport`, `own_vehicle`, licence cats) + demand enum applied; no team-scoped field |
| Employer team enquiries, auditable states | MISSING | No enquiry entity anywhere; `booking_requests` is the worker-scoped analog to clone |

## Wagon 3 — CV import and profile review

| Requirement | Status | Key evidence |
|---|---|---|
| PDF/DOCX upload, bounded | PARTIALLY_COMPLETE (by design) | `POST /api/cv/extract` auth-gated, 5 MB cap, pdf/docx/txt; deliberately stores nothing (no CV bucket) |
| Extraction pipeline | ALREADY_COMPLETE | Deterministic `lib/cv/extract.ts` (unpdf/mammoth) + `structured-parse.ts` (LT/EN/RU/DE/NL lexicons); AI enhancement wired via AI router but `AI_PROVIDER_MODE=disabled` |
| Extraction staging | PARTIALLY_COMPLETE | Client-ephemeral proposals only (by design); no staging table |
| Field-level review | ALREADY_COMPLETE | `cv-import-section-review.tsx` per-item Confirm/Discard, language level user-picked, AI-origin labelled |
| Conflict handling | ALREADY_COMPLETE | conflict → shows both values, explicit Replace (`cv-section-import-actions.ts`) |
| Explicit confirmation, no silent AI writes | ALREADY_COMPLETE | No write path without per-item confirm; guard `cv-upload-truth.test.ts` |
| No auto-publication | ALREADY_COMPLETE | Confirmed items → owner-only RLS tables; no visibility flip |
| Canonical profile targets | ALREADY_COMPLETE / gated | Work history RPC (`20260714161000` APPLIED 2026-07-16), languages/salary/availability applied; education/certificates/achievements migration `20260714160000` **NOT applied — owner gate** (UI degrades honestly) |

**Verdict: `IMPLEMENTATION_COMPLETE_PRODUCTION_ACTIVATION_OWNER_GATED` — no Wagon 3 PR (duplicate-PR ban).**
Full production completion may NOT be claimed until: (1) migration `20260714160000`
applicability is verified, (2) it is applied through the approved owner process if
required, (3) affected profile/import fields are production-smoked, (4) the optional
AI provider remains clearly optional and never blocks deterministic import.

## Wagon 4 — Explainable matching

| Requirement | Status | Key evidence |
|---|---|---|
| Deterministic engine | ALREADY_COMPLETE | `lib/market/match-v1.ts` (pure, contract v2/v2.1), live on scouting + opportunities |
| Mandatory/important/preferred tiers | PARTIALLY_COMPLETE | hard/weighted/negotiable vocabulary exists but hardcoded per criterion; no author-selectable tiers |
| Unknown vs mismatch | ALREADY_COMPLETE | `missingData` + `missingFacts` (which side owes the fact); NULL never treated as "no" |
| Blockers surfaced | ALREADY_COMPLETE | Hard blocker ⇒ `eligible=false`, status capped at weak before ordering (guard-tested) |
| Explanation surface | ALREADY_COMPLETE | reasons/gaps codes localized; match-signals / tier-explanation components; nextAction |
| Team matching | MISSING | Engine is single-worker only; `one_per_team_sufficient` is a leniency rule, not team assembly |
| No discriminatory fields | ALREADY_COMPLETE | No age/gender/nationality inputs; `docs/CONTEXTUAL_FIT_SIGNALS.md` binding |
| Single canonical engine | PARTIALLY_COMPLETE | Duplicates: `lib/admin/match-suggestions.ts` (workbench), `lib/staffing/fit.ts`+`match-preview.ts` (legacy fork) |

Prod caveat: canonical demands mostly unstructured (0/10 structured_v2 at MP-3) ⇒ engine returns `insufficient_data` until needs are structured.

## Wagon 5 — Pilot onboarding, administration, measurement

| Requirement | Status | Key evidence |
|---|---|---|
| Pilot/cohort entity | MISSING | No pilots/cohort/participants table; `pilot_drafts`/`pilot_events` are posture, not grouping |
| Participant invitations | ALREADY_COMPLETE | Canonical invitations (APPLIED); not cohort-scoped |
| Onboarding progress | PARTIALLY_COMPLETE | `profiles.onboarded_at` flag + started/completed events only; no per-step drop-off data |
| Organisation types | ALREADY_COMPLETE | `companies.company_type` allowlist, org types, team spine |
| Bounded admin UI | ALREADY_COMPLETE | requireSuperadmin + `is_admin()` RLS, ~19 admin routes; no pilot-cohort surface |
| Non-PII analytics | ALREADY_COMPLETE | `pilot_events` (0020) append-only, CHECK-bounded, PII guards green |
| Funnel metrics | PARTIALLY_COMPLETE | `getAcquisitionFunnel()` (PR #764) reg→activation; value end thin (submitted intent, not outcome) |
| Time-to-value | MISSING | Only per-event duration_ms; no journey latency |
| Auditable outcomes | PARTIALLY_COMPLETE | Operational status ladders exist (`20260609180000`, booking lifecycle); no pilot outcome ledger |

---

## Implementation plan derived from this audit

| PR | Branch | Scope |
|---|---|---|
| Worker Discovery and Consent v1 | `feat/cc/worker-discovery-consent-v1` | Disclosure grant/request flow, rate limits, freshness/stale demotion, employer facet filters, code-level readiness module |
| Trust Connect Teams v1 | `feat/cc/trust-connect-teams-v1` | Invitation-only membership consent, team-scoped availability/accommodation/transport (draft migration), team enquiries state machine (draft migration, clones booking_requests) |
| Explainable Matching v1 | `feat/cc/explainable-matching-v1` | Author-selectable mandatory/preferred tiers, team matching composition layer, workbench consolidation onto match-v1, legacy staffing-fit retirement; zero migrations |
| Pilot Onboarding and Measurement v1 | `feat/cc/pilot-onboarding-measurement-v1` | pilots/participants/outcomes draft migration, admin pilots UI, per-step onboarding events, time-to-value metrics |
| (no PR) CV Import | — | ALREADY_COMPLETE; owner gates: apply `20260714160000`, optional AI enablement |

All new migrations ship DRAFT / needs-human-gate with honest in-app degradation,
per repo doctrine. No automatic merges; Draft PRs for owner review.

## Integration Control Addendum (owner directive, 2026-07-16)

Cross-wagon contracts enforced before any Draft PR opens:

1. **Contact/consent contract (W1+W2).** One shared lifecycle for worker and
   team enquiries: statuses `created → accepted | declined | withdrawn |
   expired`; `delivered`/`viewed` captured as append-only event rows so the
   full 7-step lifecycle is auditable. Uniform policies: rate limit 10 open +
   30/24h per requesting owner; idempotent create (unique partial index on
   open requests, duplicate returns existing); 14-day expiry via admin-only
   sweep (no scheduler — owner gate); events + `audit_logs` per state change;
   no contact fields in request rows; **contact disclosure is a separate
   auditable grant, never implied by accepting an enquiry**; SECURITY DEFINER
   RPCs, RLS default-closed, target-only accept/decline.
2. **Team data contract (W2→W4).** One canonical `TeamMatchInputV1` (team id,
   active member count, deployable min/max, profession/skill/language
   composition, certification coverage, availability, destination countries,
   accommodation, transport, member-consent completeness, data freshness,
   visibility state). Wagon 2 owns the read model + contract doc
   (`docs/launch/team-match-input-contract-v1.md`); Wagon 4 consumes the
   contract and never infers team state from unrelated tables. Null/unknown =
   NOT STATED → missing fact, never match/mismatch.
3. **Matching consolidation safety (W4).** No legacy engine deleted/bypassed
   without: caller inventory, old-vs-new fixtures, documented differences,
   proof mandatory criteria cannot weaken, proof missing data ≠ match,
   rollback path, compatibility adapter, separate worker/team tests. Otherwise
   freeze the fork and record removal as a later bounded cleanup.
4. **Migration independence.** Every wagon migration applies against current
   main alone; no references to other unmerged wagons' tables; stable existing
   FKs; DRAFT/owner-gate headers; rollback/forward-fix guidance; honest
   unapplied degradation.
5. **Wagon 3 status truth.** Recorded as
   `IMPLEMENTATION_COMPLETE_PRODUCTION_ACTIVATION_OWNER_GATED` (see above).
6. **PR opening gate.** Independent lead-agent inspection per PR: diff scope,
   cross-wagon edits, migration independence, contract compatibility,
   RLS/IDOR, public copy, i18n, action-first UX, no long-scroll regression,
   no PII analytics, no placeholder behaviour.
7. **Validation/PR order.** A Worker Discovery → B Trust Connect → C
   Explainable Matching (validated against B's final team contract) → D Pilot
   (independently reviewable, no dependence on A–C).
8. **Integration report.** Conflict matrix (shared files, tables/types,
   migration dependencies, status vocabulary, duplicated helpers, route
   overlap, test overlap, rebase order) resolved before merge-ready is
   declared. Completion Telegram only after cross-wagon integration validation
   and an honest merge sequence — not merely because four Draft PRs exist.
