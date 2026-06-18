# Evidence Report Generator v1 — audit (PR #479)

Date: 2026-06-19 · Branch: `feat/evidence-report-generator-v1`.

## Discovery
- Evidence data already exists: `lib/cv-export/verified-cv.ts` (`buildVerifiedCv` → tiers confirmed/evidence/declared + declaredClaims + signals {verifiedSkills, managerConfirmations, journalEntries} + proof rows), `lib/profile/skill-evidence-state.ts` (5-state honest ladder), `getOwnCapabilities`.
- Print infra: `components/app/print-button.tsx` + the existing `window.print` pattern (no PDF dependency). `/cv` already prints the Verified CV.

## What this PR adds
- `lib/reports/evidence-report.ts` — pure `buildEvidenceReport(input)` → 5 honest report sections (profile evidence, skills supported by entries, work-entry summary, missing evidence / confirmation needed, work-need fit readiness). Real counts or honest empty/not_available; never a score or fake fit.
- Route `app/[locale]/dashboard/reports/evidence/page.tsx` — auth-gated, print-ready (PrintButton, no new dep), built ONLY from the worker's own RLS-scoped Verified CV data. Honest empty/not-worker states.
- i18n `evidenceReport` (en/lt/ru). Tests `evidence-report.test.ts` (4).

## Report honesty
Separates the evidence ladder: self-declared → supported by a work entry → confirmed by a responsible person. No fake scores, no fake verification, no matching. Fit readiness is `not_available` unless a real work-need context + supported evidence exist (no guaranteed fit). PDF = browser print-to-PDF (no new dependency added).

## Report types delivered
1. Worker/profile evidence report ✓ · 2. Skills supported by work entries ✓ · 3. Work-entry summary ✓ · 4. Missing evidence / confirmation needed ✓ · 5. Work-need fit readiness (honest not_available for the worker view until #480 wires need context).

## Remaining / future
- Richer company/work-need fit report (after #480 signal connection).
- Persisting/exporting report snapshots would need a table → a dedicated migration PR (NOT done here).

No DB/migration/Supabase/RLS/auth/billing/env. No external dependency. No fake data, no auto verification, no external AI, no old LABMA, no living/gyvas/живой.