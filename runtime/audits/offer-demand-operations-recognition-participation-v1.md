# Offer–Demand Operations, Recognition & Participation — source-grounded audit v1

**Date:** 2026-06-29 · **Branch:** `feat/cc/offer-demand-recognition-v1` · **PR title:**
`feat(market): add offer demand operations recognition path v1` · **Rule:** no DB/
RLS/RPC/schema/production-config change; no merge; no deploy without owner approval.

Owner goal source: `runtime/owner-goals/offer-demand-operations-recognition-participation-v1.md`.

---

## A. What ALREADY EXISTS (reuse — do NOT rebuild)

### Recognition / text → structure (all PURE, no DB)
- `lib/structuring/structure-need.ts` — `structureNeed(input)` → closed-set
  `{workType, country, teamSize, startPeriod, accommodation, confidence, reasons,
  needsReview}` from employer free text. **This is the job-post recognizer.**
- `lib/structuring/extract-profile-suggestions.ts` — `extractProfileSuggestions()`
  (CV/bio text → skills/professions/years). Worker-capability recognizer.
- `lib/profile/skill-claim-extractor.ts` — `extractProfileSkillClaims()` (narrative →
  self-declared claims with reason needles).
- `lib/structuring/skill-recognition.ts`, `keywords.ts`, `synonyms.ts`, `sectors.ts`,
  `lib/taxonomy/work-categories.ts` — multilingual (LT/EN/RU) needle lexicons +
  closed-set slugs/countries.
- `lib/cv/extract.ts` — file (PDF/DOCX/TXT) → raw text.

### Matching (all PURE, no DB)
- `lib/market/fit.ts` — `computeContextFit()` (§19 coverage, null when unstructured).
- `lib/market/match-v1.ts` — `matchWorkerToNeed(need, subject)` →
  `MatchResultV1 {status, skillFit, evidence, reasons[], gaps[], missingData[]}`.
  **This is the canonical worker↔need match with reasons/gaps/missing.**
- `lib/staffing/fit.ts` + `lib/staffing/match-preview.ts` — `computeStaffingFit()`,
  `buildMatchPreview()` — NON-PERSISTED preview (5 blockers: profession, accommodation,
  transport, language, start_date). Already the "enter facts → see fit, nothing saved"
  pattern (`components/app/match-preview-form.tsx`).

### Readiness / missing (all PURE except where noted)
- `lib/player-card/readiness.ts` — `deriveWorkerReadiness()` (6 pillars, met/total,
  level). `lib/player-card/readiness-steps.ts` — `readinessNextSteps()` → real routes.
- `lib/buyer/request-readiness.ts` — `computeRequestReadiness()` (no_files →
  enough_for_manual_review).
- `lib/company/company-readiness.ts` — `computeCompanyReadiness()` (missing fields).

### Domain types (reuse as the normalized inputs)
- `lib/staffing/company-need.ts` — `CompanyNeed` (zod) — the richest need shape.
- `lib/staffing/worker-intake.ts` — `WorkerIntake` (zod) — worker capability shape.
- `lib/demand/demand-request.ts`, `lib/demand/demand-drafts.ts` — `DemandFields`,
  per-type payloads. `lib/services/service-offerings-shared.ts` — `ServiceOfferingRow`.

### Existing submission SURFACES (reuse for the "next action" hand-off; do NOT duplicate)
- Company/agency demand intake: `components/app/demand-request-button.tsx` →
  `submitDemandRequestAction` (writes `customer_requests`). Already runs `structureNeed`.
- Private drafts: `components/app/demand-draft-form.tsx` → `demand_drafts`.
- Buyer requests: `components/app/buyer-requests-section.tsx` → `customer_requests`.
- Service offers: `components/app/service-offerings-section.tsx` → `service_offerings`.
- Projects: `components/app/project-context-create-form.tsx`,
  `project-operations-board.tsx` (readiness items).
- Non-persisted preview: `components/app/match-preview-form.tsx`.
- Aggregates: `lib/admin/market-analysis.ts` — real supply/demand counts,
  `SMALL_SAMPLE_N = 5`, "unknown" bucket, read-only (admin).

### DUPLICATE / drift to AVOID rebuilding (audit flag)
- Two company demand paths already coexist: `DemandRequestButton` (immediate submit)
  vs `DemandDraftForm` (private draft) — and Buyer has `BuyerRequestsSection` +
  `DemandDraftForm`. **Do NOT add a third write path.** The v1 recognizer must be a
  read-only helper that hands off to ONE of these existing real forms.

---

## B. What does NOT exist yet (the real v1 gaps)

1. **Unified "what do you need / offer?" entry point.** No single surface lets any
   role paste raw text and see recognized + missing + risk + next action. (Closest:
   `DemandRequestButton` step 1, but it's company-only and immediately persists.)
2. **Detailed job-post missing-field detection.** `structureNeed` only derives
   workType/country/teamSize/startPeriod/accommodation. It does NOT detect the
   missing salary / gross-net / currency / hours / overtime / contract type / legal
   employer / language / driving-licence / tools-PPE / accommodation-deductions /
   travel-timing / required-documents the goal enumerates. **New, pure, testable.**
2b. **Risk flags** derived from missing critical fields. New, pure.
3. **A normalized recognition card** (recognized + confidence + missing + risks +
   next action) as one named contract. New thin wrapper over the engines above.
4. **Top 1–3 match EXPLANATION** presentation (status → ready/needs-info/reject +
   why/missing/risk/next). The match engine exists; the top-N explanation wrapper
   does not. New, pure.
5. **Participation classification + private progress message** (text). No
   system→user message path exists at all (communication is bilateral). New as PURE
   logic + types + tests; **delivery is approval-gated (see D).**
6. **Anonymized weekly public digest.** No digest infra exists. New as PURE builder
   over aggregate counts + tests; **scheduling + public surface + data source are
   approval-gated (see D).**

---

## C. Safe to implement in THIS PR (no DB, no schema, no secrets)

Pure library `lib/market/recognition/` + focused tests + ONE read-only UI entry:

- `types.ts` — normalized contract: `RecognitionIntent`, `MissingField`, `RiskFlag`,
  `NextAction`, `RecognizedJobDemand`, `MatchExplanation`, `ParticipationEvent`,
  `PrivateProgressMessage`, `WeeklyPublicDigest`, `ReadinessState`. Re-exports/aliases
  existing `MatchResultV1`, `NeedStructureSuggestion`, `WorkerReadiness` (no dup).
- `missing-fields.ts` — `detectJobDemandFields(rawText)` → recognized + missing list
  (the 15 job-post fields). Pure, multilingual regex.
- `risk-flags.ts` — `deriveJobDemandRiskFlags()`. Pure.
- `recognize-job-demand.ts` — composes `structureNeed` + missing + risks + next
  action → `RecognizedJobDemand`. Pure.
- `match-explanation.ts` — `explainTopMatches(need, subjects, max=3)` over
  `matchWorkerToNeed`. Pure (caller supplies subjects; UI wiring to a real pool is a
  later PR — see D).
- `participation.ts` — `classifyParticipation(action)` (empty login → null) +
  `buildPrivateProgressMessage(event)` (i18n code + params, never raw text). Pure.
- `weekly-digest.ts` — `buildWeeklyPublicDigest(counts)` → anonymized lines. The
  function signature accepts ONLY aggregate counts — it is structurally impossible to
  pass a name. Pure.
- UI: `app/[locale]/dashboard/market/recognize/page.tsx` +
  `components/app/market/offer-demand-recognizer.tsx` (client). Intent selector +
  paste box → runs `recognizeJobDemand` client-side (no persistence) → recognized /
  missing / risk / readiness / next-action card. The next action LINKS to the existing
  real form (e.g. `/dashboard` demand intake, `/dashboard/profile`,
  `/dashboard/services`). No dead end, no new write path. Mobile-first, premium
  card styling reused. Copy in LT/EN/RU under a new `marketRecognition` namespace.
- Tests/guards: recognition parsing (ship-carpenter example), missing-field
  detection, risk flags, match explanation top-1–3, participation trigger, empty
  login → no reward, weekly digest anonymized + no names, no forbidden public copy.

## D. Requires owner approval BEFORE coding (STOP — not in this PR)

- **Persisting recognized cards / participation events** (`JobDemand`,
  `ParticipationEvent`, `ReadinessState` history) — needs new tables + RLS + RPC.
- **Delivering private progress messages** to a user — needs a system→user
  notification/message channel (none exists) + RLS + a non-spam policy.
- **Public weekly digest surface + scheduled aggregation** — needs a data source
  (extend `getMarketAnalysis`-style reads), a public route, and a privacy review of
  the aggregate thresholds (k-anonymity; `SMALL_SAMPLE_N`).
- **Wiring `explainTopMatches` to the real worker pool** — needs RLS-scoped pool
  reads + a visibility review (who may see whom). v1 keeps it pure/tested only.

## E. Privacy boundaries (binding for later PRs, honored by v1 types)
- Weekly digest = aggregate counts only; no names/employer/company identities, no
  person-identifying location, no private salary/docs/photos, no low-performer
  callouts. The `buildWeeklyPublicDigest` input type carries no identity fields.
- Private messages target the acting user only; company-owner messages require an
  already-safe relationship/permission (NOT implemented in v1; gated to D).
- No public ranking of named workers; no empty-login reward (enforced by a test).

## F. Exact allowed slice after this audit
Implement C only. Defer D. One PR. No merge/deploy without owner approval.
