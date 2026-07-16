# Wagon 5 — Daily Work Journal Simplification: fact audit + slice (2026-07-16)

Branch `feat/daily-work-journal-simplification-v2` from main `a687d3ae`.

## What the doc asked vs. what main already has

| Doc requirement | Current main state | Verdict |
|---|---|---|
| description → possible skills → confirm/edit/reject → save → profile update | **Fully shipped**: deterministic recognizer (`extract-journal-suggestions.ts`, explicitly "NOT AI"), #765's Confirm/Correct/Reject editable flow (`journal-ai-suggestions.tsx`), accepted → `profile_skill_claims` (self_declared), recognized declared skills → `journal_entry_skills` evidence → `worker_skills.source` reconcile | **Already delivered** |
| LT/EN/RU/NL/DE + typos + slang + mixed languages | Base lexicon lt/en/ru + offline packs nl/de/da/et/fi/lv/no/pl/sv (12 languages); folded-text matching, edit-distance-1 fuzzy, LT+RU numerals; pinned by `journal-realworld-recognition` guard | **Already delivered** (beyond spec) |
| Skill states kept separate; extraction never creates employer verification; repetition never auto-verifies | `worker_skills.source` self_declared/work_journal/manager_confirmed + `verified`; `candidate_skills` Level-0 never auto-approved; reconcile skips verified rows; guards `skill-verification-provenance`, `new-skill-suggestion-safety` | **Already delivered.** Gaps vs the 7-state list: "repeatedly observed" exists only as admin-side `candidate_skills.mention_count`; "outdated" is a render-time chip (`stale_needs_review`), not a persisted state — both need a DATA decision (owner) before becoming worker-facing states; deliberately NOT invented in this wagon. |
| Persistence invariants (entry saved, links, rejected not added, duplicates not created, provenance internal) | `create_journal_entry_full` atomic RPC, hash-chained append-only, `visibility_scope:'closed'`, additive upsert links, rejected = client-only | **Already delivered**, guard-pinned |
| First view: ONE large input, ONE main action, suggestions, compact history; no technical status walls | ❌ Records list rendered BEFORE the composer (old P0-rescue order); ~6 status/legend/count lines above the list (whoCanConfirm, evidence legend, CV-bridge, proof-loop) | **THIS WAGON** |
| "Ką šiandien dirbai?" framing | Label was "Ką šiandien parodote apie savo darbą?" | **THIS WAGON** (doc's exact question) |

## Changes in this slice (reordering + disclosure, zero engine changes)

1. `app/[locale]/dashboard/journal/page.tsx`:
   - composer `order-2 → order-1`, entries `order-1 → order-2` — the day starts
     with the question + one Save action; compact history (newest day open,
     older collapsed — unchanged) follows;
   - the four honest status lines (whoCanConfirm, EvidenceStatusStrip legend,
     CV-bridge count, proof-loop strip) moved word-for-word into ONE
     `<details data-testid="journal-status-details">` disclosure — nothing
     deleted, just not a default wall.
2. i18n ×12 journal locales: `whatDidYouDo` → the doc's daily question
   ("Ką šiandien dirbai?" / equivalents), new `statusExplainer` summary label.
3. Guards: `journal-profile-single-path` order assertion updated to the
   superseding Wagon 5 order; NEW `wagon5-journal-first-view.test.ts` pins
   composer-first, single-disclosure (with all four lines still present
   inside), compact history, and the question copy in every journal locale.

## Action count (before/after)
- Before: worker landing on /journal scrolls past header + quick-nav +
  4 status lines + the full records list to reach the input (composer was the
  6th content block).
- After: header → composer (input + Save) is the FIRST content block —
  **1 input + 1 tap to save**, zero scrolling on desktop; history and status
  details reachable below/one tap.

## Explicitly NOT done (with reasons)
- No new persisted "outdated"/"repeatedly observed" skill states — requires an
  owner data-model decision (new statuses on canonical tables); current honest
  render-time handling stays.
- No AI activation (suggestions stay deterministic-first; AI path stays
  off-by-default behind `AI_PROVIDER_MODE=live`).
- No changes to extraction, persistence, RPCs or migrations.
- No Employer Preview or any owner-removed surface returns.
