# Work Journal — Perfect Flow P0 (audit + fix)

**Branch:** `fix/work-journal-perfect-flow-p0` · **PR:** draft, **held — not merged, not deployed**
**Scope:** make the worker work-journal usable as the core product engine:
write a normal work text → immediately see what the system understood → fix it
easily → move on. No fake skills, no public confirmation/verification wording,
no DB mutation, no merge/deploy without owner approval.

This document is both the **audit** the owner asked for and the **record of what
this PR changed**. Findings are grounded in the actual code and in a deterministic
recogniser probe over the owner's six reality sentences (before/after tables below).

---

## 0. TL;DR

- The recogniser was **not** producing live construction skills for web-design
  text — that specific false-mapping was fixed in an earlier pass (the
  `svetainė` = website/living-room disambiguation). What the owner still saw is
  three real problems:
  1. **Under-recognition** — the journal had **three disconnected recognisers**
     with different vocabularies, so most non-construction work (IT, driving,
     communication, gardening, equipment) was understood by one of them but not
     shown in the place the worker looks.
  2. **False "Nesuprasta / patikslinkite"** — a work item the system *did*
     understand (web design, excavator) was still shown as an unknown fragment
     asking the worker to clarify. That contradiction reads as "the system is
     dumb / complicated".
  3. **Stale persisted links** — old entries kept construction chips from an
     earlier biased recogniser; the UI collapsed them but with review-y wording.
- This PR makes the **per-fragment recogniser read the full text through the
  same cross-sector dictionary the whole entry uses**, adds the missing sectors
  the owner named (gardening, heavy equipment, React/web-fix), kills the false
  "unknown", relabels stale links neutrally ("Ankstesni ryšiai"), and clarifies
  the edit flow. Deterministic only — no fake AI, no fake confidence.
- **Remaining RED** (documented, not faked): true natural-language extraction
  (real model + structured parser + background reprocessing + confirmation
  workflow + language expansion). See §6.

---

## 1. Current journal entry layout (before this PR)

| Surface | File | State |
| --- | --- | --- |
| Page / list | `app/[locale]/dashboard/journal/page.tsx` | Text-first order is already correct: identity card → records list → composer. Entry list reverse-chronological. |
| Single entry card | `components/app/journal-entry-row.tsx` + page render block | Order: entry text → decision timeline → metrics row (direction/site/quantity/date) → skill-link block → edit/delete. |
| Status / timeline | `components/app/evidence-decision-timeline.tsx` (`deriveReviewTimeline`) | Honest: `created → waiting` or real human decisions only; never a fabricated step. One status display per entry (top-right chip already removed). |
| Skill-signal display | `components/app/journal-entry-skill-links.tsx` | Clean linked chips + a collapsed review bucket. Chips were a small "badge wall"; the section had no clear heading. |
| Old / stale links | same component, `lib/journal/entry-skill-source.ts` | Stale links computed (not stored — no provenance column, migrations out of scope) and collapsed. Heading read "Reikia peržiūrėti / Needs review" — review-y, slightly alarming. |
| Mobile | all of the above | Functional but dense; skill chips + review bucket + metrics stack with little sectioning. |

**Layout problems:** no clear "what the system understood" / "skill signals"
section labels; stale bucket wording implied a problem rather than neutrally
saying "these are earlier links".

**This PR (A / E / F):**
- Skill-signal block now has a neutral heading **"Įgūdžių signalai / Skill
  signals / Сигналы навыков"**.
- Stale bucket relabelled to the owner's neutral wording **"Ankstesni ryšiai /
  Earlier links / Прежние связи"** with neutral summary copy ("…not shown as
  this entry's current signals"). Still collapsed by default; **no link is ever
  removed without an explicit worker click** (#509 principle kept).
- A full visual restructure (new card chrome) is intentionally **not** done — it
  borders the "no visual-WOW redesign" hard limit and needs owner design
  direction. Documented as YELLOW (§7).

---

## 2. Current edit flow

| Step | Behaviour (before) |
| --- | --- |
| Edit text | `?editing=<id>` remounts the composer (page `key`) with the saved text; only unconfirmed entries are editable (RPC re-enforces). |
| Suggestions update | Editing preloads the entry's OLD structured details (date/time/qty/direction/skills) as **confirmed** so a text-only edit re-sends them (supersede rebuilds metrics from the form). |
| Old suggestions remaining | **Bug:** if the worker changed the text but did NOT re-run "Sutvarkyti tekstą", the OLD preserved chips stayed shown as current — no signal that they may no longer match the new text. |
| Save / review / link / unlink | Understandable individually but the preserved block silently presenting stale details was the main confusion. |

**This PR (B):** added a `textDirty` signal in the composer. When the edit text
diverges from the saved text, the preserved-details block is **muted (opacity)**
and a neutral prompt appears: *"You changed the text. Press 'Organize text' so
the system re-evaluates the current text — the details below are still from the
earlier text."* (LT/EN/RU). No data deletion; manual links untouched.

---

## 3. Current recogniser pipeline

There are **three** recognisers, each with its own vocabulary and its own output
bucket. All read the **full** entry text (no truncation; the capability extractor
caps at 4000 chars, far above a journal entry). The problem was **divergence**,
not truncation.

| Recogniser | File | Vocabulary | Feeds | Used by |
| --- | --- | --- | --- | --- |
| `recognizeSkills` | `lib/structuring/skill-recognition.ts` (+ `keywords.ts` `SKILL_HINTS_LT`, `synonyms.ts`) | **construction-heavy** skill slugs (+ a few cross-sector) | skill chips, **auto-link on save**, stale-link "recognizedFromText" | composer skill bucket, `journal-entry-skills-actions`, entry-skill-source |
| `extractProfileSkillClaims` | `lib/profile/skill-claim-extractor.ts` (`DICTIONARY`) | **rich cross-sector** capability labels (IT, driving, cooking, comms, sales, …) | capability suggestions (label-only, no fake slug) | composer "possible new skills", profile composer |
| `ACTIVITY_HINTS_LT` | `lib/structuring/keywords.ts` | cross-sector per-fragment activity labels | per-fragment cards | composer fragment review |

**Where wrong / missing recognition came from:**
- **Capabilities vs skill slugs:** a real skill slug is produced only when the
  text matches `SKILL_HINTS_LT` (mostly construction). Everything else becomes a
  label-only capability (honest, no fake slug) — but it landed in a *different*
  bucket than the per-fragment cards, so a fragment could be "unknown" while the
  whole-entry capability list understood it.
- **Fragment split drops:** `splitFragments` keeps a fragment only if it has a
  time OR a matched activity. A part like "Dirbau su React svetaine" (no time,
  no `ACTIVITY_HINTS_LT` match) was **dropped entirely**.
- **False unknown:** a fragment with a time but no activity match was flagged
  `isUnknown` → "Nesuprasta / patikslinkite", even when the capability dictionary
  understood the same text.
- **Stale construction links:** old entries carry `journal_entry_skills` rows
  from an earlier biased recogniser. These are reconciled at render time by
  `entry-skill-source.ts`: a linked skill the recogniser KNOWS but the current
  text does not support → `stale_needs_review` → collapsed (now "Ankstesni
  ryšiai"). No DB write — links remain until the worker unlinks.

**This PR (C / D):**
- **Per-fragment cross-sector fallback** (`extract-journal-suggestions.ts`): when
  `ACTIVITY_HINTS_LT` has no match for a fragment, it now consults the **same**
  capability dictionary the whole entry uses. So IT/web, driving, communication,
  gardening, equipment, cooking, etc. are understood per-fragment and the false
  "unknown" disappears. Label-only (slug stays `null`) → **no fake taxonomy**.
- **Dictionary gaps filled** (`skill-claim-extractor.ts`): added the owner-named
  sectors that were missing — **gardening** ("Sodininkystė / aplinkos
  tvarkymas"), **heavy equipment** ("Sunkiosios technikos operavimas"), and
  **React / web-fix** phrasings on the existing IT row. All label-only, specific
  stems (no bare ambiguous roots), LT/EN/RU.
- **Construction stays out of web/IT:** `recognizeSkills` already returns no
  construction slug for the web sentences; the new fragment labels are IT, never
  construction/interior. Locked by a guard (§5).

---

## 4. Owner reality test cases — before / after (deterministic probe)

Exact recogniser output. `skill` = `recognizeSkills` chips; `fragment` =
per-fragment card label (`unknown` = the "Nesuprasta / patikslinkite" flag).

| # | Sentence | Before | After |
| --- | --- | --- | --- |
| 1 | "Dirbau su svetainės dizainu 9 h" | skill: — · fragment: **unknown** (9h, no label) | skill: — · fragment: **Interneto svetainės dizainas** (9h), unknown=false |
| 2 | "Dirbau su web dizainu 9 valandas" | skill: — · fragment: **unknown** (9h) | skill: — · fragment: **Interneto svetainės dizainas** (9h), unknown=false |
| 3 | "Kūriau svetainės dizainą" | skill: — · fragment: — (dropped) | skill: — · fragment: **Interneto svetainės dizainas**, unknown=false |
| 4 | "Kasiau žemes su ekskavatoriumi 10h" | skill: **earthworks** · fragment: **unknown** (10h) | skill: **earthworks** · fragment: **Sunkiosios technikos operavimas** (10h), unknown=false |
| 5 | "Dirbau su React svetaine, mūrijau sieną ir pristačiau darbą klientui" | skill: bricklaying · fragments: [Mūrijimas] (React + client **dropped**) | skill: bricklaying · fragments: [**Programavimas**, Mūrijimas] |
| 6 | long mixed (warehouse/driving/brick/React/negotiation/hedge) | skill: bricklaying · fragments: [warehouse, driving, masonry] (**3 of 6**); React/negotiation/hedge dropped | skill: bricklaying · fragments: [warehouse, driving, masonry, **Programavimas**, **Komunikacija**, **Sodininkystė / aplinkos tvarkymas**] (**6 of 6**) |

**Rules verified:**
- website/web-design → IT, **never** construction/interior. ✔
- excavator/earthworks → earthworks + machine label only, no unrelated trade. ✔
- mixed text → relevant **multiple** signals, no hallucinated sector. ✔
- uncertain (e.g. "pristačiau darbą klientui" with no clear comms stem) → **not**
  forced into a fake chip; it is simply not shown, and the worker can link a
  skill by hand ("Susieti įgūdį"). ✔ (honest "uncertain" handling)

---

## 5. Tests added / updated

- **New:** `lib/guards/journal-recognizer-fulltext.test.ts` (8 tests) — pins the
  six owner sentences: no construction slug/label for web; earthworks-only for
  excavator; React+brick → IT+masonry, nothing unrelated; long entry understands
  all six tasks (≥5 distinct sectors); **no false `isUnknown`** on understood
  web/excavator entries.
- Existing journal/structuring/profile guards stay green (305 files / 4819 tests
  at audit time), including `silent-trust-wording`, `journal-evidence-clarity`,
  `journal-stale-skill-review`, `cv-friendly-copy`, `production-reality-trust-p0`.

**Copy rules honored (F):** neutral wording only — "Įgūdžių signalai",
"Susieti įgūdžiai", "Ankstesni ryšiai", "Sistema suprato"/"Papildyti ranka"
family. No `patvirtinta / verified / confirmed` and no badge/trust/certification
wording introduced in normal/self-view journal UI.

---

## 6. Remaining RED requirement (NOT faked)

Perfect free natural-language understanding is **not** achievable deterministically.
What is still needed, kept honestly out of scope and owner-gated:

1. **AI extraction model** — real NLP entity/skill extraction (sector, activity,
   tools, time, quantity) instead of a lexicon.
2. **Structured parser** — grammar-aware multi-clause splitting (the current
   comma/`ir`/`и` splitter still drops clauses with no time and no dictionary hit).
3. **Background reprocessing / backfill** — re-run recognition over OLD entries so
   stale construction links are corrected at the source (needs a DB write path →
   owner-gated; today they are only collapsed at render time).
4. **User confirmation workflow** — a first-class "this is what we understood —
   fix it" review surface, beyond the current per-fragment cards.
5. **Language expansion** — beyond LT/EN/RU and beyond hand-curated stems.

Until then this PR is the **best safe deterministic improvement** and still fixes
the visible problems (§4).

---

## 7. Classification

| Item | Class | Note |
| --- | --- | --- |
| False "Nesuprasta" on understood text | **GREEN** | fixed (fragment fallback). |
| Web/IT text → construction | **GREEN** | already clean live; now locked by guard. |
| Full-text multi-task recognition | **GREEN** | 6/6 on owner long entry; cross-sector dictionary. |
| Stale-link wording + collapse | **GREEN** | "Ankstesni ryšiai", collapsed, no auto-delete. |
| Edit-flow stale-detail confusion | **GREEN** | `textDirty` mute + re-evaluate prompt. |
| Full visual card restructure | **YELLOW** | deferred — near "no visual-WOW" limit; needs owner design call. |
| Stale links corrected at source (backfill) | **RED** | needs DB write → owner-gated migration. |
| True NLP recognition | **RED** | §6. |

---

## 8. Hard limits honored

- No DB / schema / migrations / RLS / RPC / Supabase / env / DNS / billing /
  payment / auth-core changes. **Code + copy + tests + docs only.**
- No production DB mutation; no data deletion; stale links preserved.
- No fake skills (label-only suggestions, no invented taxonomy slug); no fake
  confidence; no fake AI claim.
- No public confirmation/verification wording added.
- Draft PR **held** — no merge, no deploy without owner approval.
