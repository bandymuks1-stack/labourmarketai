# LabourMarket.ai — LANGUAGE MATRIX (measured, not claimed)

> **Status:** canonical audit, 2026-08-27. Derived from CODE, not from the
> presence of locale files.
> **Owner requirement:** all 24 official EU languages **+ Georgian/Kartvelian
> + Russian**.
> **Rule this file exists to enforce:** a language is **not** FULL merely
> because a locale JSON exists.

---

## 1. THE HEADLINE

| | count |
|---|---|
| Languages the owner requires | **26** (24 EU + `ka` + `ru`) |
| Locale catalogs in the repo | 11 |
| Locales the app actually **routes** (`activeLocales`) | **5** — `lt en ru nl de` |
| Locales with offline recognition packs | 12 (`lt en ru` base + 9 packs) |
| Locales with transversal-capability recognition | **3** — `lt en ru` |
| **Georgian (`ka`)** | **absent everywhere** |

**15 of the 26 required languages have no presence in the product at all**:
Bulgarian, Croatian, Czech, French, Greek, Hungarian, Irish, Italian, Maltese,
Portuguese, Romanian, Slovak, Slovenian, Spanish, **Georgian**.

This is the honest position. Nothing in the product should describe it as
multilingual-ready.

---

## 2. THE SOURCE OF TRUTH IN CODE

| concept | where | value |
|---|---|---|
| catalog (files present) | `lib/i18n/config.ts` → `locales` | `en lt lv et nl de da no sv pl ru` (11) |
| **routed / selectable** | `lib/i18n/config.ts` → `activeLocales` | **`lt en ru nl de` (5)** |
| taxonomy-only, no UI | `lib/i18n/launch-language-scope.ts` → `NON_UI_TAXONOMY_LOCALES` | `fi` |
| offline recognition packs | `lib/structuring/language-packs/` | `da de et fi lv nl no pl sv` (9) |
| per-slug recognition status | `lib/structuring/language-packs/recognition-status.ts` | `core` / `deferred` / `not-text-recognizable` |

`lv et da no sv pl` have catalogs but **do not route** — no `/lv/…` page
prerenders and the URL↔locale resolver rejects the code. A file is not a
language.

---

## 3. PER-JOURNEY MATRIX

Legend: **F** full · **C** core-journey only · **P** partial · **—** not implemented

| journey | lt | en | ru | nl | de | lv et da no sv pl | fi | ka | other 14 EU |
|---|---|---|---|---|---|---|---|---|---|
| UI shell | F | F | F | F | F | — (catalog only, unrouted) | — | — | — |
| Auth / onboarding | F | F | F | F | F | — | — | — | — |
| Chat / intent | F | F | P | P | P | — | — | — | — |
| **Work Journal understanding** | F | C | C | P | P | P (pack needles) | P | — | — |
| Skill/capability extraction | F | C | C | P | P | P | P | — | — |
| **Transversal capabilities** | F | F | F | — | — | — | — | — | — |
| Profession normalization | F | C | C | P | P | P | P | — | — |
| NL vacancy / search | F | C | P | P | P | — | — | — | — |
| Matching explanation | F | C | P | P | P | — | — | — | — |
| Living CV | F | F | C | C | C | — | — | — | — |
| CV exports (incl. EU format) | F | F | C | C | C | — | — | — | — |
| Employer need structuring | F | C | C | P | P | — | — | — | — |
| Institution / student | F | F | C | C | C | — | — | — | — |
| Notifications / email | P | P | P | P | P | — | — | — | — |
| AI provider support | n/a — no provider configured (see `ai_runs = 0`) |

**Reading it honestly:** only **Lithuanian** is genuinely full across the
product. English is full for UI and CV but core-journey for understanding.
Russian, Dutch and German route and render, but their *understanding* layers
(journal, extraction, matching explanation) are thinner than their UI suggests.

---

## 4. THE ARCHITECTURAL PROBLEM (not just missing translations)

Recognition currently rests on **per-language literal needle lists**
(`SKILL_HINTS_LT` + one pack per language). That reached 12 languages, and it
does not reach 26 — the cost of each new language is another hand-written
needle set, and every needle is a chance to over- or under-claim.

**Canonical concept identity must be language-independent.** LT / EN / RU / KA
/ PL / DE / NL expressions should all resolve to the SAME canonical skill,
capability, profession, need or opportunity concept. Adding a language must
not mean rebuilding matching.

Direction (recorded, not yet implemented):

```
language-specific expression
  → deterministic normalization where reliable
  → structured dictionary / metadata
  → embeddings where appropriate
  → AI router where privacy, cost and quality permit
  → CANONICAL CONCEPT (language-independent)
```

The needle lists stay valid as the deterministic fast path. They must stop
being the *only* path.

### 4.1 THE CONCRETE MIGRATION PLAN (measured 2026-08-27, local stack)

What the direction above actually rests on today — checked, not assumed:

| prerequisite | state |
|---|---|
| `skills.esco_uri` (language-independent concept id) | column EXISTS, **0 of 161 rows populated (0%)** |
| embeddings anywhere in `lib/` | **none** |
| `pgvector` extension | **not installed** |
| hand-written needle packs | 9 files, ~235 lines each (~2,100 lines) for 9 languages |
| concept-resolution seam (step 2) | **DONE 2026-08-28** — a language may now arrive as data |
| AI router | implemented, `ENV-GATED`, `ai_runs = 0` |

So the recorded pipeline has **one asset with no data** (`esco_uri`) and **two
absent layers** (embeddings, vector store). That is why "add a language" still
costs a needle pack: there is currently no other way for an expression to reach
a concept.

**The order this has to happen in — each step is useful on its own, and none
of them blocks the pilot:**

1. **Populate `esco_uri` for the 161 skills.** This is the whole unlock: it is
   the only language-independent identity the schema already has, and it is
   empty. Curation, not engineering. Until it holds data, every later step has
   nothing to resolve *to*. Leave the slug as the join key — matching was
   re-keyed onto slugs precisely because ESCO was inert, and that must not be
   reversed until ESCO is real.
2. **Make concept resolution a named seam** — DONE 2026-08-28,
   `apps/web/lib/structuring/concept-resolution/`.

   Two seams, because the plan's one sentence hid two different questions:

   - `ConceptTermSource` — WHERE THE NEEDLES COME FROM. The recognizer's
     dictionary was assembled from three hardcoded imports, which is the line
     that made "add a language" and "write a file of curated matching code"
     the same act. It is now assembled from an ordered list of sources, and a
     source may be **data** (`ConceptLabelSet`: `slug → { exact, synonyms }`
     for any language code, plus its provenance). This is the step-3 landing
     shape: an ESCO label import writes these files and needs no TypeScript.
   - `ConceptResolver` — WHO ANSWERS. `resolveExpressionToConcepts()` is the
     one callable entry point. The deterministic lexicon resolver is first and
     default; a later resolver may only ADD concepts the earlier ones missed,
     never downgrade or overwrite a deterministic hit (doctrine I-7 — matching
     must work with no generative AI at all).

   **Coverage stopped being declarable.** `RECOGNITION_LANGUAGES` was a closed
   twelve-member tuple, so a language became "supported" the moment its code
   was typed into an array — the same file-counting mistake this document was
   written to stop, one layer down. `conceptLanguageCoverage()` now measures
   term counts per language from the sources themselves, and `covered` is true
   only when at least one real term exists.

   **Georgian is registered and reports zero.** `labels/index.ts` holds a `ka`
   entry with no labels and a provenance string that says so. That is the
   honest position: the ARCHITECTURAL exclusion is gone (a Georgian label could
   not previously be represented at all), the COVERAGE is untouched, and
   filling that object is the entire remaining work — no code changes with it.

   Proven by `apps/web/lib/guards/concept-resolution-seam.test.ts`, which
   deliberately proves two claims that pull against each other: **no loss**
   (the seam emits the identical term list, in identical order, and every
   shipped language fixture resolves identically to the direct recognizer,
   forbidden slugs included) and **the ceiling is gone** (a language with no
   pack, no fixtures and no code reaches the REAL recognizer through data
   alone — with the negative control that the same sentence resolves to
   nothing while that data is absent, without which the positive proves
   nothing).
3. **Add ESCO's own multilingual labels as a second resolver** behind that
   seam. ESCO publishes preferred/alternative labels in all 24 EU languages —
   which means languages 6–24 stop needing a hand-written pack and start
   needing a data import. This is the step that breaks the linear cost.
4. **Only then consider embeddings** (needs `pgvector` + a provider, i.e. the
   AI runtime gate) for the residue steps 1–3 cannot resolve. Not before: an
   embedding layer over a taxonomy with no canonical ids resolves to nothing.
5. **Georgian (`ka`) is not covered by step 3** — it is outside ESCO's EU
   language set and outside the current catalogs. It needs its own decision:
   a curated pack (the current cost model) or a translation layer into a
   resolved concept. Recording it here so it is not silently assumed to fall
   out of the EU work.

**What must NOT be done meanwhile:** adding more hand-written needle packs for
languages 13–26. That is the cost curve this plan exists to leave, and each
pack is also ~235 more chances to over- or under-claim a capability.

**Scope note:** any new recognition or extraction logic must be written behind
the step-2 seam even before that seam exists — i.e. never call a language pack
directly from a workflow. That keeps the eventual migration mechanical.

---

## 5. DELIVERY PRIORITY (§29 — do not block the pilot on obscure screens)

Critical journeys first, in this order: registration/login · onboarding ·
profile · Work Journal · Living CV · opportunities/search · employer need ·
matching · institution/student · interest/contact · important notifications.

Admin and back-office screens do **not** gate a language.

---

## 6. WHAT MUST NOT BE SAID

- Do not describe the product as supporting 11 languages — it **routes 5**.
- Do not describe transversal capability recognition as multilingual — it is
  **LT/EN/RU**, classified `deferred`, and a Finnish or Georgian student's
  journal reads as empty.
- Do not call a locale FULL because its JSON has no `[EN]` markers; parity of
  strings is not parity of understanding.

---

## 7. NEXT STEPS (ranked)

1. **Georgian (`ka`) does not exist anywhere** — catalog, routing, packs,
   recognition. It is an explicit owner requirement and is the largest single
   gap.
2. Prove one non-LT/EN/RU EU language end to end: natural-language input →
   journal or employer need → canonical concept → downstream workflow. Until
   that runs, multilingual readiness is unproven regardless of file counts.
3. Move concept identity off literal needle lists (§4) before adding languages
   6–26, or the cost per language stays linear and the over-claim risk
   compounds. **The seam for this is built (§4.1 step 2, done 2026-08-28); what
   is still missing is the DATA** — `esco_uri` remains 0 of 161, so step 1
   (curation, not engineering) is now the single thing standing between the
   architecture and languages 6–24.
4. Promote catalog-only locales (`lv et da no sv pl`) to routed only after
   their *understanding* layers, not just their strings, reach core-journey.
