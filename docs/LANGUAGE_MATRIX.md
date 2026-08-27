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
   compounds.
4. Promote catalog-only locales (`lv et da no sv pl`) to routed only after
   their *understanding* layers, not just their strings, reach core-journey.
