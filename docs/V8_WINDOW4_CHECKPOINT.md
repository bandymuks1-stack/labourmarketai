# V8 WINDOW 4 CHECKPOINT

TIME: 2026-08-13 (afternoon UTC) — updated after W4-A implementation
ORIGIN_MAIN: 8ef80460 at window start (PR #1147 pending merge on top)
HEAD: feat/cc/v8-w4-employer-daily-os @ 1b9a3209 (3 commits over 8ef80460)
CURRENT_PHASE: W4-A terminal (PR #1147 in CI) → next W4-B

## COMPLETED
- Phase 0: real state re-derived; canonical checkout confirmed stale (worked from worktree
  labourmarketai-wt/v8-train only); doctrine + architecture maps produced.
- W4-A implementation: GAP 4 (windowed journal report, /dashboard/reports/journal),
  GAP 5 (org reports hub journal section), GAP 2 (Organization Today panel on company/planning).
  Full suite green locally: 929 files / 15076 tests, typecheck 0, lint 0 errors.
- External Job Supply Audit fact base COMPLETE (DB + code + terms) — see
  docs/operations/external-job-supply-audit-v1.md (this commit).
- W4-B read-only audits COMPLETE (CV journey + language intelligence).
- W4-C read-only audits COMPLETE (trust/deletion/billing/economics).

## MERGED
- Nothing new merged yet this window; #1147 pending CI.

## DEPLOYED / PRODUCTION_VERIFIED
- Pending #1147 merge → Vercel deploy → smoke.

## IN_FLIGHT
- OPEN_PR: #1147 (W4-A GAPs 2/4/5) — CI running at checkpoint time.

## W4_A_STATUS (evidence labels)
- EMPLOYER_GAP_2 = IMPLEMENTED, VERIFIED_LOCAL (fact-only Organization Today; null ≠ 0;
  renders nothing on total read failure; no shift-claim). Production verify pending deploy.
- EMPLOYER_GAP_4 = IMPLEMENTED, VERIFIED_LOCAL (UTC windows today/7/30; aggregate-only select;
  privacy guard pins no original_text / no absence tables; REAL_LAUNCH_SURFACE).
- EMPLOYER_GAP_5 = IMPLEMENTED, VERIFIED_LOCAL (reports-hub journal section, BasisNote,
  degrades to unavailable, never fabricated zeros).
- EMPLOYER_DAILY_OS = PARTIAL → becomes VERIFIED_PRODUCTION only after deploy + authed browser
  check (auth gate: BLOCKED_EXTERNAL for authed production proof without owner/tester session).
- HIRINGS_ZERO_VALUE_TEST = PASS on architecture evidence: with 0 hirings the employer still gets
  morning brief (reviews/absences/unread), Organization Today (roster/absences/journal/review),
  windowed journal reports, org report (demand/projects/tasks/documents/finance/journal),
  planning/capacity zone. Label: VERIFIED_LOCAL (surface-level), production usage evidence
  NOT_ENOUGH_EVIDENCE (7 active users, 0 engagement rows).

## EXTERNAL_SUPPLY_STATUS
- Audit COMPLETE (doc committed). Sweden 7092 rows / 37 MB — NOT the storage problem;
  esco_labels = 408 MB (275 MB indexes). ~20 zero-reader columns; description_raw required for
  search, never rendered. Source terms CC0 + attribution honoured; retention row missing →
  LEGAL_DECISION_REQUIRED. Apply-confirm step (owner §4 decision) queued into W4-B slice.
  NO destructive action taken. SWEDEN_CADENCE = CONFIGURATION_GATED (verified: run 31697825348
  inert, HAS_KEY/HAS_URL false; owner console actions listed in docs/operations/sweden-freshness-cadence-v1.md).

## W4_B_STATUS
- Audits done. Planned implementation slice (next write stream, branch from post-#1147 main):
  1) locale switcher on auth + onboarding layouts; 2) read profiles.locale on session/login →
  honor account preference (write NEXT_LOCALE); 3) external-apply confirmation step
  (opportunities external card + workspace row); 4) admin vacancy count head:true fix;
  5) stale arbetsformedlingen source-terms copy fix (all 11 catalogs); 6) invitation email
  language: recipient-oriented choice (sender picks recipient language explicitly — smallest
  honest fix). CV chain: verified complete+free (no CV store by design — "CVs=0" is a metric
  artifact); file security hardened+tested; no paywall. ESCO catalogue empty (owner-gated import).
- Mobile matrix + booking/engagement regression + acceptance matrix: pending.

## W4_C_STATUS
- Audits done. Key facts: deletion = INTAKE ONLY (no executor, no admin queue — requests land in
  matching workbench); Stripe TEST chain code-complete but env-blocked (CONFIGURATION_GATED);
  enforcement trap: PAYMENTS_ENABLED=true would flip entitlementAllows to enforced with no
  metering behind 20/21 features; LMC engine live in prod with zero callers; AI disabled
  (0 runs, 0 cost rows). ECONOMIC SAFETY = NOT_ENOUGH_EVIDENCE (no real provider spend exists;
  cost table to be assembled in W4-C phase).
- Deliverables pending: retention 3-decision owner package, deletion-process design (executor is
  a product build, likely OWNER_GATED for destructive parts), Trust Center page(s), pricing
  decision tables, billing test-mode completion within config limits.

## W4_D_STATUS
- Production truth re-measured this morning (users 36, active7d 7, orgs 13, journal 36,
  inquiries 17 real, vacancies 7092/7088 fresh same-day, bookings/engagements/absences/
  notifications/CVs/ai_runs all 0). Full phase pending.

## OWNER_GATES
1. Sweden cadence config (2 secrets + 2 variables in GitHub console) — recorded once, not revisited.
2. Pricing publication + any real-money activation (PAYMENTS = will be READY_FOR_OWNER_ACTIVATION at best).
3. esco_labels index review migration (RED category; biggest storage lever).
4. public_vacancies column-pruning migration (recommendation: SKIP — negligible).
5. External/native jobs section unification (product-visual decision; confirm step ships regardless).
6. ESCO v1.2.1 catalogue import (typeahead currently degrades to empty).

## LEGAL_GATES
1. Contract/claim retention horizon; 2. invoice statutory retention; 3. rolling-delete approval
semantics (all from #1145); 4. NEW: retention period for inactive external vacancies (matrix row missing).

## CONFIG_GATES
- Stripe TEST credentials + price ids (billing test mode); INVITE_EMAIL_* (email sending);
  AI_PROVIDER_MODE + keys or AI_LOCAL_* (AI layer); Sweden cadence (above).

## BLOCKED_EXTERNAL
- Authed production browser proof for employer surfaces needs an owner/tester session (no fake
  users will be created). Minimal human acceptance script to be included in W4-D package.

## NEXT_EXACT_STEP
1. When #1147 CI green → squash-merge → verify Vercel production deploy → smoke /dashboard/reports
   (unauth redirect proof) → update this checkpoint.
2. Branch feat/cc/v8-w4b-language-and-external-apply from new main; implement W4-B slice list above.
3. Then W4-C deliverables; then W4-D.

## NEXT_COMMAND/FILES
- gh pr checks 1147; gh pr merge 1147 --squash
- Slice files: apps/web/app/[locale]/auth/layout.tsx, onboarding/layout.tsx,
  components/marketing/locale-switcher.tsx, apps/web/app/[locale]/auth/callback/route.ts (locale read),
  components/app/external-vacancies-section.tsx, components/app/workspace/opportunities-result.tsx,
  lib/vacancy-runner/vacancy-ingestion.ts (count fix), messages/*.json (intelligence.sources.terms).
