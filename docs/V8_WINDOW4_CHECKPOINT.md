# V8 WINDOW 4 — FINAL CHECKPOINT + OWNER RETURN BRIEF

TIME: 2026-08-13 (evening UTC)
ORIGIN_MAIN: window start 8ef80460 → window end 4db1e32e
CURRENT_PHASE: W4-D complete — window terminal

## OWNER RETURN BRIEF

WHAT SHIPPED (3 PRs, all squash-merged + deployed, CI green):
- #1147 W4-A — Employer Daily OS complete: Organization Today panel (company planning),
  windowed journal reports (/dashboard/reports?journalWindow=today|week|month — folded into
  the existing page, no new surface), org-report journal section. Fact-only, null≠0,
  privacy floor guard-pinned (no entry text, no absence reasons on employer aggregates).
- #1148 W4-B — language + external apply: locale switcher on auth/onboarding
  (production-verified); profiles.locale finally read on login (cookie > profile >
  Accept-Language, test-pinned) and persisted from the switcher; external-apply
  confirmation step ("application continues on another portal" → confirm → original ad);
  truthful Arbetsförmedlingen terms copy in all 11 catalogs; vacancy admin HEAD-count;
  recipient-language invitation emails (5 locales).
- #1149 W4-C — trust: factual subprocessors list on /legal/data-protection (Supabase,
  Vercel, GitHub; "nothing else active" stated); privacy requests excluded from the
  matching workbench and shown as a read-only queue on the admin control room;
  deletion-process design doc (SEC-06 answer, all destructive steps OWNER_GATED).
- Docs: EXTERNAL_JOB_SUPPLY_AUDIT_V1, retention decision package A, pricing decision
  package B, deletion process design v1, this checkpoint.

WHAT WAS VERIFIED IN PRODUCTION (browser, unauthenticated surfaces):
- Landing/auth/create-cv/pricing/legal clean at 320+375px, no overflow.
- Auth-page language switcher live, 5 locales, EN switch works.
- /dashboard/reports?journalWindow=week fail-closed redirects to login preserving next.
- Vercel deploy success on every merged SHA. Authed-surface proofs need a human session.

CURRENT PRODUCTION TRUTH (measured 2026-08-13 evening):
users 36 (active 7d: 5) · orgs 13 · journal entries 36 · real inquiries 17 ·
privacy requests 0 · active Swedish vacancies 7088 (last refreshed 06:13Z — will decay
without cadence config) · discoverability consent events 8 · bookings/engagements/
absences/notification_events/ai_runs/CV-documents all 0 (honest zeros, infra live).
DB 500 MB: esco_labels 408 MB (275 MB indexes) — NOT the vacancy table (37 MB).

DECISIONS I NEED FROM OWNER:
1. Retention package A (docs/legal/retention-decision-package-v1.md): 3 decisions from
   #1145 + inactive-external-ads horizon. Decisions 1-2 want lawyer sign-off.
2. Pricing package B (docs/commercial/pricing-decision-package-v1.md): candidate tables
   ready; ECONOMIC SAFETY = NOT_ENOUGH_EVIDENCE — 4 inputs listed there (Supabase/Vercel
   plans, Stripe fees, AI provider decision, expected beta scale).
3. esco_labels index review (biggest storage lever, ~120+ MB; RED migration → your gate).
4. public_vacancies column pruning: recommendation SKIP (saves ~5 MB, not worth a
   destructive migration) — confirm or override.
5. External/native jobs single-list unification (ONE JOB MARKET) — confirm-step shipped;
   the sectional split is a product-visual decision.
6. ESCO v1.2.1 catalogue import (typeahead currently degrades to empty suggestions).

CONFIG ACTIONS I NEED FROM OWNER (GitHub console — recorded once, not revisited):
1. Sweden cadence: secrets SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL,
   variables VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED=true + VACANCY_SCHEDULE_ENABLED=true.
   Workflow proven inert-by-design today (run 31697825348).
2. Stripe TEST credentials + three price ids (billing test mode is code-complete).

LEGAL DECISIONS: retention periods (blocks stating periods publicly); Terms
payment/refund/cancellation clauses (needed before payment activation, owner wording).

READY TO ACTIVATE (single owner action each): Sweden cadence; Stripe TEST checkout.
NOT READY (prerequisite builds, listed in package B): live payments — metering does not
exist, PAYMENTS_ENABLED=true would hard-enforce 21 feature gates with no meters behind
them, LMC engine has zero app callers, Terms lack payment clauses, AI provider disabled.

NEXT RECOMMENDED ACTION: approve retention package A (one sitting) — it unblocks public
retention wording, the deletion executor phases, and the notification/absence/external-ad
rolling deletes.

## FINAL VERDICTS (evidence labels)

CONTROLLED_BETA = READY — VERIFIED_LOCAL + VERIFIED_PRODUCTION (public surfaces);
  authed journey proofs BLOCKED_EXTERNAL (human tester script = W4-D acceptance matrices)
BROADER_PUBLIC = READY_FOR_OWNER_ACTIVATION, technical side; see PUBLIC_LAUNCH
EMPLOYER_DAILY_OS = COMPLETE — all 5 gaps shipped (#1146+#1147); HIRINGS_ZERO_VALUE_TEST
  = PASS (VERIFIED_LOCAL; production usage evidence NOT_ENOUGH_EVIDENCE — 0 engagements)
WORKER_JOURNEY = READY (5 routed locales; ESCO empty + AI off degrade honestly;
  CV chain proven free; "CVs=0" is a metric artifact — no CV store exists by design)
TRUST = READY minus two declared pendings (retention periods, DPAs) — public copy honest
PRICING = OWNER_GATED (decision-ready)
ECONOMIC_SAFETY = NOT_ENOUGH_EVIDENCE (input table in package B; no invented costs)
BILLING_TEST_MODE = CONFIGURATION_GATED (code-complete, env-blocked)
PAYMENTS = OWNER_GATED (live) — NOT technically ready even with approval until package B
  prerequisites 1-5 are built; TEST mode one config action away
PUBLIC_LAUNCH = LEGAL_DECISION_REQUIRED (retention periods) → then READY_FOR_OWNER_ACTIVATION.
  No new irreversible activation performed. Free-product deploys continued under doctrine.
SWEDEN_CADENCE = CONFIGURATION_GATED

## GATES REGISTER (nothing else blocks)
OWNER: pricing publication; live payments; esco index migration; column pruning (skip?);
  jobs-list unification; ESCO import; deletion executor destructive phases.
LEGAL: retention 3+1 decisions; Terms payment clauses.
CONFIG: Sweden cadence (2+2); Stripe TEST; INVITE_EMAIL_*; AI provider.
BLOCKED_EXTERNAL: authed production browser proofs (owner/tester session).

## KNOWN DEFECTS / FOLLOW-UPS (none launch-blocking)
- Privacy rows still appear (correctly labelled elsewhere) in the buyer request review
  list (lib/buyer/admin-request-review.ts reads customer_requests unfiltered) — one-line
  follow-up with the shared classifier.
- Dashboard-header locale switcher hidden below md (account-page switcher is the mobile
  path; deliberate, not guard-pinned).
- 6 catalog locales (lv/et/da/no/sv/pl) remain non-routed with 106 missing namespaces —
  promotion is a translation project, not a config flip.
- AI suggestion layer capped to en/lt/ru (silent EN fallback for nl/de) — moot while
  AI_PROVIDER_MODE=disabled; revisit at AI activation.

NEXT_EXACT_STEP for a fresh window: owner decisions above; else resume at
docs/V8_WINDOW4_CHECKPOINT.md — no in-flight work is open, all branches merged.
