# Universal Work Text → Skill Recognition Core v1 — audit (PR #477)

Date: 2026-06-19 · Branch: `feat/universal-skill-recognition-core-v1`. Build-on-existing audit per the product train.

## 1. Current work-entry route/component map
- Work journal route: `app/[locale]/dashboard/journal/page.tsx` (auth-gated) + journal entry create/edit components; entries stored in `journal_entries`, skills linked via `journal_entry_skills`.
- Recognition feeds the journal compose/review flow through `lib/structuring/extract-journal-suggestions.ts` → `recognize-entry.ts` (`recognizeEntryDepth`).

## 2. Current skill model / taxonomy map
- Lexicon: `lib/structuring/keywords.ts` (`SKILL_HINTS_LT`, activity/direction hints) + `synonyms.ts` + `misspellings.ts`, folded via `normalize.ts` (`foldText`).
- Matcher: `lib/structuring/skill-recognition.ts` (`recognizeSkills`: tiered exact/synonym/fuzzy → slug + confidence + reason, cap 4).
- Canonical skills: `skills` table (slug/category) + `skillNames` i18n; work categories in `lib/work-market/categories.ts` (`relatedSkills`); candidate skills in `lib/skills/*`.

## 3. Does extraction exist today?
Yes — a real deterministic extractor exists (skills + single time + quantity + fragments). But it is construction-biased and incomplete across domains, and it does not emit a unified verbs/objects/quantities/durations/domain/unmapped structure.

## 4. What is missing (measured: 6 required examples run against the current engine)
| Example | Current engine result | Gap |
|---|---|---|
| 1 construction | plastering/roofing/timber-framing; 50 m²; only 3h (4h dropped); "čerpes" → unknown fragment | misses 2nd duration; no tile-laying skill |
| 2 web/design | **empty** (no suggestion, no unmapped phrase) | web/design unsupported; nothing surfaced for review |
| 3 admin/warehouse | **empty** (warehouse fragment unknown; Excel/invoices absent) | admin domain unsupported |
| 4 cleaning | **FALSE POSITIVE: "plovėme langus" → carpentry**; office cleaning + disinfection missed | invents an unrelated skill; cleaning domain weak |
| 5 electrical | one slug (electrical-install) only | cable install + voltage testing missed |
| 6 vague | empty | OK (no invention) |

Key problems: cross-domain coverage (web/admin/cleaning/electrical) is thin; a real false-positive invents carpentry from cleaning text; no unmapped-phrase output; durations limited to one.

## 5. Examples tested (this PR — all pass)
All six required examples + an explicit unmapped case + honesty checks pass in `lib/structuring/universal-recognition.test.ts` (13 tests):
- Ex1 → Sienų tinkavimas · Stogo sijų / konstrukcijų darbai · Čerpių klojimas; 50 m²; durations [3h, 4h].
- Ex2 → Puslapio / svetainės dizainas; domain web_design only (no construction).
- Ex3 → Sandėlio administravimas · Excel ataskaitų pildymas · Sąskaitų rengimas.
- Ex4 → Patalpų valymas · Langų valymas · Paviršių dezinfekavimas; 6h; **no carpentry/construction**.
- Ex5 → Kabelių montavimas · Elektros skydo darbai · Įtampos tikrinimas.
- Ex6 → no suggestions, needsMoreDetail.
- "Kalibravau spektrometrą…" → unmapped review phrase (no invented skill).

## 6. What this PR implements
- `lib/structuring/universal-recognition.ts` — a pure, deterministic `recognizeUniversal(text)` that returns:
  - `suggestions[]` — candidate skills (label + canonical slug when known + domain + confidence + reason + sourcePhrase), every one `status:"suggested"`, `confirmed:false`, `needsReview:true` (never auto-verified);
  - `unmapped[]` — work clauses with real work wording but no skill match (returned for review, never an invented unrelated skill);
  - `signals` — verbs, objects, quantities (e.g. 50 m²), durations (ALL of them), domain hints (construction / web_design / admin / cleaning / electrical);
  - `needsMoreDetail` — true for vague entries.
  - Cross-domain lexicon authored so cleaning ≠ carpentry; LT-first with EN/RU-safe folding (`foldText`); no external AI/API, no network.
- Tests: `universal-recognition.test.ts` (13).

## 7. What remains blocked by backend/DB/future AI (NOT in this PR)
- Persistence of accepted suggestions / unmapped phrases (needs the review UI + a safe persistence/migration — PR #478; a DB change there is a hard-stop for a dedicated migration PR with RLS/tests).
- Mapping non-canonical candidate labels (web/admin/cleaning/electrical) to real taxonomy slugs (taxonomy growth — future, owner-gated).
- Confidence beyond lexicon tiers / broader synonym coverage / optional future AI assist (explicitly out of scope; core stays deterministic).

No DB/migration/Supabase/RLS/auth/billing/env changes. No persistence. No UI. No external AI. No fake data. No automatic verification. No old LABMA, no living/gyvas/живой.