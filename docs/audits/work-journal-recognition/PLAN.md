# Work Journal Text-to-Skill Recognition v1 — Audit & Plan (DRAFT, not implemented)

> **Status: PLAN ONLY. Do not implement until the owner approves this plan.**
> No code in this PR except this document.

## Goal
Make free-text Work Journal entries much better at producing **relevant** skill
suggestions — for Lithuanian / Russian / English construction & day-work language,
missing diacritics, slang, short phrases, and incomplete entries. Turn "unclear"
from a dead end into an **active improvement loop**.

## Hard principles (binding for v1)
- No fake verification. No fake skills. Skills stay **suggestions** until the
  worker confirms them; manager/client confirmation stays separate and real.
- **No external AI/API in v1** unless separately approved — all recognition is
  deterministic (normalization + dictionary + light fuzzy + confidence rules).
- Low confidence → "choose manually" with the closest context, never a dead
  "unclear" state.
- Unknown phrases collected for improvement only within the existing
  privacy/data model; otherwise a local/audit report.

---

## 1. Current recognition path (audit)

| Concern | File / symbol | Current behaviour |
|---|---|---|
| Entry → suggestions | `lib/structuring/extract-journal-suggestions.ts` → `extractJournalSuggestions()` | Lowercases text, runs regex (time/quantity) + `pickSlug` substring containment over dictionaries; multi-fragment split via `splitFragments` / `detectActivity` |
| Match primitive | same file → `pickSlug(haystack, table)` | Pure `haystack.includes(needle)` — **no normalization, no fuzzy** |
| Ranking + cap | same file → `rankSkillSlugs()`, `SKILL_SUGGESTION_LIMIT=4` (shipped PR #332) | Ranks by matched-needle length, caps to 4 |
| Dictionaries | `lib/structuring/keywords.ts` → `SKILL_HINTS_LT`, `PROFESSION_HINTS_LT`, `WORK_DIRECTION_HINTS_LT`, `ACTIVITY_HINTS_LT` | LT + RU + some EN needles in the same rows; deaccented LT stems added ad hoc (e.g. `dazym`); `sector` tags via `lib/structuring/sectors.ts` |
| Skill taxonomy | `messages/{locale}/skill-names.json` (~95 slugs); `professions.json` | Slug → localized name; no synonym layer |
| Render + worker filter | `components/app/journal-entry-composer.tsx` (`analyse`, ~L189) | Maps extracted slugs → worker's **own declared** skills (`worker_skills`); honest empty state `journal.skillNoMatch` (shipped PR #332) |
| Unknown phrases | `lib/journal/actions.ts` writes `journal_entry_metrics` rows `metric_slug: "unknown_phrase"` / `parsed_fragment` / `fragment_activity` | Already persisted per entry, **owner-RLS-scoped** — a review report can read these; admin read via `is_admin()` RLS |

### Gaps that cause weak / illogical recognition
1. **No diacritic normalization** — `dažiau` matches (real needle has accents) but `daziau`/`dazem` only match because a deaccented stem was added by hand; coverage is inconsistent.
2. **No typo tolerance** — `gipsa`, `betona`, `dazimas` may miss.
3. **No real synonym layer** — synonyms are crammed into `needles`; hard to maintain, no grouping, no per-skill synonym set.
4. **No confidence model** — every hit is treated equally; UI can't say "weak match → pick manually".
5. **No reason** — the worker sees a skill with no "why".
6. **Known false positive** — `klijav` (glue) is a tiling needle, so `klijavau tapetus` (wallpapering) mis-suggests tiling.
7. **Profession context unused** for ranking — worker's profession/profile skills don't boost/narrow beyond the raw worker-skill intersection.
8. **Unknown loop is passive** — `unknown_phrase` rows exist but nothing surfaces them for dictionary improvement.

---

## 2. Realistic worker entries → expected suggestions (28 examples)

Confidence: **H** = direct phrase match · **M** = match after normalization/synonym · **L** = weak/none → manual pick.

### Lithuanian (incl. missing diacritics, slang, short)
| # | Entry | Expected suggestion(s) | Conf | Why |
|---|---|---|---|---|
| 1 | `montavau langus 6 val` | window/door installation | H | phrase "langus" |
| 2 | `dazem sienas` (no diacritics, slang) | painting | M | normalized `dazem`→`dažau` stem |
| 3 | `liejau betona, klojiniai, armatura` | concrete-pouring + formwork + rebar-cutting | H | 3 phrases |
| 4 | `gipsas lubos` | drywall + ceiling-systems | H | "gipsas", "lubos" |
| 5 | `plyteles vonioj` (short) | tiling | H | "plyteles" |
| 6 | `tinkavau` (one word) | plastering | H | "tinkav" |
| 7 | `mūrijau siena` (missing diacritic on siena) | bricklaying | H | "mūr" |
| 8 | `stoga dengiau` | roofing | H | "stog…deng" |
| 9 | `suvirinau remus` (slang remus=rėmus) | welding | M | normalized |
| 10 | `kasiau transeja` (no diacritics) | earthworks | M | normalized "transeja"→"tranšėja" |
| 11 | `klijavau tapetus` | **wallpapering** (NOT tiling) | M | fix false positive: tapet beats klijav |
| 12 | `elektros instaliacija` | electrical-install | H | "elektr" |
| 13 | `dažymas` | painting | H | "daž" |
| 14 | `gipsa` (truncated) | drywall | M | typo/truncation tolerance |

### Russian
| # | Entry | Expected | Conf | Why |
|---|---|---|---|---|
| 15 | `клал плитку в ванной` | tiling | H | "плитк" |
| 16 | `штукатурил стены` | plastering | H | "штукатур" |
| 17 | `заливал бетон` | concrete-pouring | H | "заливал бетон" |
| 18 | `вязал арматуру` | rebar-cutting | H | "арматур" |
| 19 | `ставил окна` | window/door installation | H | "окна" |
| 20 | `монтаж гипсокартона` | drywall | H | "гипсокартон" |
| 21 | `копал траншею` | earthworks | H | "копал"/"транше" |
| 22 | `красил стены, 3 часа` | painting | H | "красил" |

### English
| # | Entry | Expected | Conf | Why |
|---|---|---|---|---|
| 23 | `window install, 4h` | window/door installation | H | "window install" |
| 24 | `painted walls` | painting | H | "paint" |
| 25 | `laid tiles in bathroom` | tiling | H | "tiles" |
| 26 | `rebar and formwork` | rebar-cutting + formwork | H | 2 phrases |

### Weak / unknown / incomplete (manual-pick path)
| # | Entry | Expected | Conf | Why |
|---|---|---|---|---|
| 27 | `montavau` (verb only, no object) | closest: installation context → **manual pick** | L | ambiguous; show "choose manually" + nearest |
| 28 | `darbas buvo geras` / `сегодня устал` | **no suggestion** → manual pick + log unknown | L | no work term; never invent |

---

## 3. Proposed implementation plan (deterministic, no external AI)

**Layer A — Normalization (`lib/structuring/normalize.ts`, new, pure):**
- `foldText()`: lowercase + NFD strip combining marks + explicit LT/RU map
  (`ą→a č→c ę→e ė→e į→i š→s ų→u ū→u ž→z`; keep Cyrillic as-is). Apply to BOTH
  the entry text and the needles at load time so each needle is written once and
  matches accented **and** unaccented input. Removes the ad-hoc `dazym`-style
  duplicate stems.

**Layer B — Synonym sets (`lib/structuring/synonyms.ts`, new):**
- Per-skill/activity synonym groups keyed by slug (LT/RU/EN), e.g.
  `window-door → [langai, langus, montavau langus, окна, ставил окна, window install]`.
  Generated into the existing needle tables (single source) so `pickSlug` stays
  the matcher. Fixes #11 by giving `wallpapering` a stronger, longer phrase set
  than the generic `klijav` stem and ordering specific-before-generic.

**Layer C — Light fuzzy (conservative, gated):**
- Token-level: for tokens ≥5 chars with no exact match, allow edit-distance ≤1
  against needle stems ≥5 chars only (avoids short-stem false positives). Pure
  Levenshtein, capped, deterministic. Handles `gipsa`, `transeja`, `remus`.

**Layer D — Confidence + reason (extend `extractJournalSuggestions`):**
- Return per suggestion `{ slug, confidence: "high"|"medium"|"low", reason }`
  where reason carries the matched fragment ("found 'langus'"). High = exact
  (after folding) phrase; Medium = synonym or fuzzy; Low = weak/none.

**Layer E — Profession/profile narrowing + reason (composer):**
- Order/boost suggestions that match the worker's profession (`PROFESSION_HINTS`)
  or already-declared `worker_skills`; add reason "matches your profile skill Y"
  / "related to profession Z". Cap stays 3–5.
- Low/empty → keep the shipped `journal.skillNoMatch` manual-pick state, but show
  the **closest** context label instead of a bare empty.

**Layer F — Unknown-phrase improvement loop (report-only, no migration):**
- A local/admin **audit report** script (e.g. `scripts/recognition-unknown-report.ts`)
  reading existing `journal_entry_metrics` `unknown_phrase` rows (admin RLS) into
  `runtime/project-quality/recognition-unknown-inventory.{md,json}` — a review
  list for dictionary/taxonomy improvement. No new table, no silent burial.

**Layer G — Tests (vitest):**
- All 28 examples above as cases; plus: narrow entry → no broad cloud (already
  guarded); typo entry → relevant; RU entry → relevant; EN entry → relevant;
  weak/unknown → manual-pick path; suggestions never auto-verified; confirmed-skill
  logic (`lib/journal/skill-source.ts`) unchanged; existing
  `extract-journal-suggestions.test.ts` (RU/LT/EN) stays green.

---

## 4. DB migration needed?
**No.** Recognition is pure logic; the worker→skill suggestion path is in-memory.
Unknown phrases are already persisted in `journal_entry_metrics` (no new column).
The improvement loop is a read-only report over existing rows. (If, later, we want
to store per-suggestion confidence/reason on saved entries, that would be a
separate additive migration — **out of scope for v1**.)

## 5. Scope guards (same as PR #332)
No production DB apply · no migration · no RLS/grant/policy/SECURITY DEFINER · no
billing · no external AI/API · no fake data/skills/verification.

## 6. Open questions for the owner (decide before implementation)
1. Approve the deterministic-only approach for v1 (external AI explicitly deferred)?
2. OK to fold diacritics globally (it changes how every needle matches — broadly
   positive, but worth a conscious yes)?
3. Fuzzy edit-distance ≤1 on ≥5-char tokens — acceptable risk tolerance, or
   start dictionary/synonym-only and add fuzzy in v1.1?
4. Unknown-phrase report as a local/admin script is enough for v1, or do you want
   it surfaced in an admin UI (larger scope)?

**Recommended next step:** owner reviews this plan, answers Q1–Q4, then a separate
implementation PR delivers Layers A–G behind the same green gate.
