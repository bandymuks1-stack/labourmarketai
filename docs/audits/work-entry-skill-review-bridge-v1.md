# Work Entry Review UI + Persistence Bridge v1 — audit (PR #478)

Date: 2026-06-19 · Branch: `feat/work-entry-skill-review-bridge-v1`. Builds on PR #477.

## Current work-entry flow (discovery)
- `components/app/journal-entry-composer.tsx` (1200+ lines) already has a rich review stage: suggested skills + reasons, time/quantity, direction/site/institution/topic, multi-fragment unknown→edit-label cards, accept (confirm)/ignore (discard), and on save links recognised DECLARED skills as evidence via `autoLinkRecognizedJournalSkills` (never verified). New undeclared skills add a SELF-DECLARED claim via `saveProfileSkillClaimsAction`. Persistence already exists: `journal_entry_skills` (migration 20260602120000) + `worker_skills.source` tiers, RLS owner-scoped.
- Gap: the composer used the OLD engine (`extractJournalSuggestions`/`recognizeSkills`) — the cross-domain gaps + cleaning→carpentry false positive + dropped-2nd-duration measured in PR #477.

## Persistence decision (no DB)
A safe persistence bridge already exists. Accepting a suggestion creates a SELF-DECLARED profile claim through the existing `saveProfileSkillClaimsAction` (worker-owned, RLS-enforced) — a supported/profile signal, never verified. **No DB migration, no schema/RLS change.** Free-text unmapped phrases stay review-only (no hidden DB).

## What this PR adds
- `lib/work-entry/entry-skill-review.ts` — pure `buildEntrySkillReview(text)` adapting `recognizeUniversal` (#477) into a review model (items + durations + quantities + unmapped + needsMoreDetail); every item `status:"suggested"`, `confirmed:false`. `acceptedLabels()` pure helper.
- `components/app/work-entry-skill-review.tsx` — "Suggested skills from this entry" panel (LT `Siūlomi įgūdžiai iš šio įrašo`, EN, RU): cross-domain suggestions with reason + domain, detected quantities/durations, unmapped phrases, accept / ignore. Accept → self-declared claim (existing path). Honest "needs review / not confirmed"; nothing auto-verified.
- Mounted additively in the composer review stage (one import + one render) — does NOT rewrite the existing buckets/save flow.
- i18n `workEntryReview` (en/lt/ru). Tests: `entry-skill-review.test.ts` (5).

## What it delivers vs the old flow
The review now benefits from #477: web/design, admin/warehouse, cleaning, electrical recognition; **no cleaning→carpentry false positive**; all durations; unmapped phrases surfaced for review instead of dropped.

## Validation
work-entry route smoke (auth redirect), tests for accept vs ignore vs unmapped, full suite.

## What remains blocked (future)
- Mapping non-canonical candidate labels (web/admin/cleaning) to canonical taxonomy slugs (taxonomy growth, owner-gated).
- Persisting unmapped phrases as structured review items would need a new table → a dedicated migration PR (NOT done here).
- Reports over accepted/evidence state → PR #479.

No DB/migration/Supabase/RLS/auth/billing/env. No fake data, no auto-verification, no external AI, no old LABMA, no living/gyvas/живой.