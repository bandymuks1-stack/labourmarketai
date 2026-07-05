# Offline Multilingual Skill Recognition — Architecture Audit & Status

**Date:** 2026-07-04 · **Owner mandate:** full language recognition must work
with the computer OFFLINE — no online APIs, no cloud LLMs, no remote
translation, no live ESCO calls, no runtime internet dependency.
**Living document:** updated at every PR of the offline-recognition train
(PR3A → PR3D). Status tables at the bottom are the single honest source for
GREEN/YELLOW/RED claims.

---

## 1. Where recognition lives

One deterministic engine, no parallel systems (doctrine §2):

| Layer | File | Role |
|---|---|---|
| Engine | `apps/web/lib/structuring/skill-recognition.ts` | folded-substring matching over one `TERMS` dictionary; tiers exact > synonym > gated fuzzy; context guards (floor-cleaning, power-tool) |
| Base lexicon (LT/EN/RU) | `apps/web/lib/structuring/keywords.ts` (`SKILL_HINTS_LT`) | exact-tier needles + sector tags; also profession/activity lexicons |
| Base synonyms | `apps/web/lib/structuring/synonyms.ts` | synonym-tier phrases (medium confidence) |
| **Offline language packs (NEW)** | `apps/web/lib/structuring/language-packs/{nl,de,pl,…}.ts` | per-language exact/synonym needles for the SAME canonical slugs |
| Pack registry | `apps/web/lib/structuring/language-packs/index.ts` | merged into `TERMS` at module init |
| Text folding | `apps/web/lib/structuring/normalize.ts` | lowercase + diacritics folding (now incl. ß→ss, ø→o, æ→ae, ł→l — NFD cannot decompose those) |
| Fixtures | `apps/web/lib/structuring/language-packs/fixtures/<lang>.ts` | ≥15 real phrases + ≥5 false-positive cases per covered language |
| Downstream | `extract-journal-suggestions.ts`, journal/profile flows | consume `recognizeSkills()` — unchanged by this train |

Every recognised skill is a **suggestion the worker confirms** — never an
auto-fact (doctrine §7).

## 2. How LT/EN/RU needles are stored (and why packs mirror it)

LT/EN/RU needles live inline in `SKILL_HINTS_LT` rows — the matcher folds
text and needle, so one row carries all three languages. The offline packs
keep the exact same matching semantics but move per-language data into
separate files so:

- coverage per language is countable and guardable (no silent display-only
  languages);
- a pack can be reviewed by a native speaker in isolation;
- pack needles are **excluded from the fuzzy tier** — 9 extra languages of
  fuzzy stems would multiply 1-edit cross-language accidents (the measured
  SV "packade"→"packag" case). Fuzzy stays base-lexicon only.

## 3. Why NL/DE/DA/NO/SV/PL/LV/ET were display-only (and FI missing)

`messages/{locale}/skill-names.json` gives every catalogue slug a name in 11
locales — but the recognizer never reads display names (guard-enforced,
§6). Until this train, no needle in any of those 8 languages existed, so
ordinary worker sentences recognised **nothing** (pinned by RED-language
canaries in `multilingual-phrase-recognition.test.ts`). FI additionally had
no locale directory at all — no display names either (doctrine §2.4 pinned
the locale set at 11; the FI amendment lands in PR3B with an explicit
doctrine-conflict flag).

## 4. What makes every language offline-recognized

Per language: a static needle pack (exact + synonym tiers) covering the
**62-slug core set** (`language-packs/core-slugs.ts` — all Wave-1+2 families:
office, warehouse/logistics, hospitality, retail, cleaning, repair, beauty,
HR, IT, agriculture, care, construction basics, manufacturing, events,
education) + phrase fixtures proving recognition from bundled data alone.

No ML models. Deterministic dictionaries only (owner Task 7 default).
Diacritics folding handles workers typing with or without accents; inflected
worker forms ("sprzątałem", "gemauert", "verzamelde orders") are the needles
themselves; false-positive blocklists live as context guards + measured FP
fixtures; collision notes live at the top of each pack file.

## 5. No runtime internet dependency — how it's enforced

- All dictionaries are TypeScript modules compiled into the app bundle
  (client + server). No JSON fetches, no dynamic imports, no DB reads.
- Guard `lib/guards/offline-language-pack.test.ts`:
  - static scan of every recognition module (comments stripped) for
    `fetch(`, `XMLHttpRequest`, `axios`, `WebSocket`, `http(s)://`,
    dynamic `import(`, `require(`, node network modules, `supabase`, and
    any reference to locale JSON (display names ≠ needles);
  - runtime proof: `fetch`/`XMLHttpRequest` stubbed to THROW, then one
    fixture phrase per covered language must still recognise.
- ESCO: recognition has **zero** ESCO dependency (ESCO URI mapping remains a
  separate YELLOW track — PR4 scope, explicitly NOT a runtime dependency).

## 6. Files bundled into the app

`lib/structuring/normalize.ts`, `keywords.ts`, `synonyms.ts`,
`skill-recognition.ts`, `language-packs/**/*.ts` (packs, types, core-slugs,
recognition-status, fixtures are test-only imports but ship in the repo).
Nothing else is needed at runtime — that is the whole point.

## 7. What tests prove offline recognition

| Test file | Proves |
|---|---|
| `lib/guards/offline-phrase-recognition.test.ts` | per covered language: ≥15 real phrases recognise the expected slugs via **exact/synonym only** (fuzzy or display-name luck fails the test) + ≥5 false-positive sentences stay silent |
| `lib/guards/offline-language-pack.test.ts` | fixture minimums; packs only map seeded slugs; core-slug coverage per pack; per-slug status classification (new skill ⇒ CI fails until classified); network-primitive scan; fetch-stubbed offline run |
| `lib/guards/multilingual-phrase-recognition.test.ts` | owner's mandatory LT pack + EN/RU equivalents (fixture data shared with the registry); RED-language canaries for still-uncovered languages |
| `lib/guards/skill-installation-chain.test.ts` | recognition slugs ↔ seed migrations ↔ locale registry stay one catalogue |
| `lib/guards/universal-profession-families.test.ts` | sector-neutrality and construction-is-not-default invariants |

## 8. Coverage status — LANGUAGES

Statuses: **GREEN** = real offline phrase recognition tested (≥15 phrases +
≥5 FP, non-fuzzy); **YELLOW** = partial, gaps documented; **RED** =
display-only or missing.

| Language | Status | Evidence |
|---|---|---|
| LT | **GREEN** | owner pack (35 phrases + 6 FP), base lexicon |
| EN | **GREEN** | 35 phrases + 6 FP, base lexicon |
| RU | **GREEN** | 35 phrases + 5 FP, base lexicon |
| NL | **GREEN** (PR3A) | pack (62 core slugs) + 20 phrases + 6 FP |
| DE | **GREEN** (PR3A) | pack (62 core slugs) + 20 phrases + 6 FP |
| PL | **GREEN** (PR3A) | pack (62 core slugs) + 20 phrases + 6 FP |
| LV | **GREEN** (PR3B) | pack (62 core slugs) + 20 phrases + 6 FP |
| ET | **GREEN** (PR3B) | pack (62 core slugs) + 20 phrases + 6 FP |
| FI | **GREEN — recognition** (PR3B) | pack (62 core slugs) + 21 phrases + 5 FP; taxonomy locale `messages/fi/` (all six files) added. **FI product UI locale stays YELLOW**: `fi` is NOT in `lib/i18n/config.ts` locales/activeLocales, no flat `messages/fi.json`, no /fi routes — FI is a taxonomy+recognition locale only until DI promotes it (doctrine §2.5 one-row add + full UI parity work). Do not call FI full-product-locale GREEN. |
| DA | **GREEN** (PR3C) | pack (62 core slugs) + 20 phrases + 6 FP |
| NO | **GREEN** (PR3C) | pack (62 core slugs) + 20 phrases + 6 FP |
| SV | **GREEN** (PR3C) | pack (62 core slugs) + 20 phrases + 6 FP |

**Project-level status after PR3C: GREEN scoped** — all 12 languages pass
offline real-phrase recognition (exact/synonym tier, ≥15 phrases + ≥5 FP
each, network-stubbed proof). The multilingual guard now pins
`COVERED_RECOGNITION_LANGUAGES === RECOGNITION_LANGUAGES` permanently.
Caveats that keep separate rows honest: FI product UI locale is still a
documented gap (recognition GREEN, product locale YELLOW), and construction
specialist depth per language remains deferred-with-notes (PR3D reviews
class-B holes).

## 9. Coverage status — SKILL FAMILIES

Statuses: **GREEN** = recognized in all target languages; **YELLOW** =
LT/EN/RU + covered-pack languages only; **RED** = no recognition anywhere.

| Family | Slugs | Status |
|---|---|---|
| Office/admin | data-entry, office-software, document-handling, bookkeeping, reception, administration | YELLOW (GREEN in lt/en/ru/nl/de/pl) |
| Warehouse/logistics | warehouse-operations, order-picking, barcode-scanning, pallet-handling, stock-taking, driving, delivery-driving, cargo-transport, forklift-operation | YELLOW (same six languages) |
| Hospitality/food | cooking, kitchen-help, dishwashing, baking, barista-work, waiting-tables | YELLOW |
| Retail/customer service | cashier, customer-service, call-centre, merchandising, sales-assistant | YELLOW |
| Cleaning/facility | cleaning-services, laundry, window-cleaning, housekeeping | YELLOW |
| Repair/maintenance | auto-repair, appliance-repair, handyman-work | YELLOW |
| Beauty | hairdressing, barbering, nail-care | YELLOW |
| HR/recruitment | recruitment, personnel-admin | YELLOW |
| IT | programming, it-support (+ qa-testing, web-design, graphic-design deferred with notes) | YELLOW |
| Agriculture | gardening, farm-work | YELLOW |
| Care | childcare, elderly-care (no regulated medical claims) | YELLOW |
| Construction basics | bricklaying, painting, tiling, plastering, flooring, welding-blueprint, roofing, electrical-install, plumbing, carpentry, demolition, furniture-fitting | YELLOW |
| Construction specialist depth | drywall, skim-coating, scaffolding, formwork, … (24 slugs) | YELLOW — full LT/EN/RU depth kept; per-language deferred with notes (`recognition-status.ts`) |
| Class-B needle wave (PR3D) | 48 formerly needle-less catalogue skills (welding processes, construction plant, masonry/tiling/plaster/roof depth, electrical depth, site engineering, manual handling, safety) | YELLOW — LT/EN/RU needles added; per-pack-language deferred with notes |
| Class-B explicit remainder | concrete-works, formwork-carpentry, joinery, forklift-operator, load-signaling, rebar-detailing, waterproofing-tiles (7 slugs) | Deliberately WITHOUT needles — each has an audited note in `recognition-status.ts` (umbrella/twin/covered-by-parent slugs where a needle would double-suggest) |
| Manufacturing | assembly-work, production-line, packaging | YELLOW |
| Events | event-setup | YELLOW |
| Education | teaching, translation | YELLOW |

No family is RED: every family above has at least LT/EN/RU + NL/DE/PL
recognition after PR3A.

## 10. Cross-language collision engineering (why this is safe)

The matcher is substring-over-folded-text across ONE dictionary, so every
needle must be distinctive across **all** languages at once. Measured traps
now guarded by FP fixtures and/or context guards:

- base "elektr" ⊂ "elektrisch gereedschap"/"Elektrowerkzeug"/
  "elektronarzędzia" → power-tool context guard extended with per-language
  power-tool forms (`POWER_TOOL_RE`) and per-language genuine electrical-work
  anchors (`ELECTRICAL_WORK_RE`);
- NL "gekocht" (bought) vs DE "gekocht" (cooked) — banned needle in both;
- NL/DE "geplant" (planned vs planted) — banned; gardening verb-anchored;
- DE "Gefahren" (dangers) ⊃ "gefahren" (driven) — driving needles anchored;
- DE "lernte" ⊃ "ernte" — harvest needles anchored;
- DE "Kindergarten" ⊃ "garten" — gardening anchors don't substring-match it;
- PL "ogrodzenie" ⊃ "ogrod", "nauczyłem się" ⊃ "uczyłem", "demontaż" ⊃
  "montaż", "Magda" ⊃ "agd" — all anchored;
- PL "stolarz" chosen over "stolar" (SV "stolar" = chairs);
- fuzzy tier closed to pack terms entirely;
- **adversarial review pass (PR3D)** — an independent reviewer probed the
  merged dictionary and found a family of short PRE-EXISTING LT base stems
  that became high-confidence false positives once new languages were
  covered. All fixed with anchored forms + regression fixtures: "lub"
  (⊂ PL "lubię", ET "juhiluba") → anchored ceiling forms; "kasė"→"kase"
  (⊂ LV "kasē") and "iškas" (⊂ FI "tiskasin") → fuller digging inflections;
  "sij" (⊂ ET "nõudepesija") and "apkal" (⊂ LV "apkalpoju") → anchored
  timber forms; "ravej" (⊂ LV "iekrāvēju") → fuller weeding forms; EN
  "garden" (⊂ SV "ladugården" after å→a) → space/suffix-anchored; RU
  "кладк" (⊂ "проКЛАДКа") → "кладка/кладку/кладкой стен"; "mūro" (⊂ FI
  "muroja") → "mūro darb/sien"; NL "lasser" (⊂ NO "vareplassering") →
  "als lasser"; DE "lackiert" (⊂ "Nägel lackiert") → anchored; power-tool
  guard: ET nominative "elektriline tööriist" now matches, DE
  "Elektroniker" (official electrician title) counts as electrical WORK.

## 11. Remaining YELLOW/RED and the plan

1. ~~**PR3B**~~ DONE — LV/ET/FI packs + fixtures landed; `messages/fi/`
   (all six files, EN-parity keys) added; locale-parity guards extended to 12
   (installation-chain, universal-profession-families, journal-namespace);
   doctrine §2.4 conflict flagged in the PR for DI confirmation. FI
   **product UI locale** (flat `messages/fi.json`, routing/config) remains an
   honest gap — FI is not full product-locale GREEN until that exists.
2. ~~**PR3C**~~ DONE — DA/NO/SV packs + fixtures; fuzzy-accident canaries
   replaced by exact coverage (ex-canary sentences pinned as non-fuzzy);
   base "mūr" needle narrowed to real LT stems (mūrij/mūryt/mūrinink/mūro) —
   it used to substring-match NL "muren"/DA "muren"; consumer-electronics
   mention ("elektronik(k)"/"электроник") added to the power-tool guard.
3. ~~**PR3D**~~ DONE — class-B audit: 55 catalogue skills had no needles in
   ANY language. 48 got low-risk LT/EN/RU needles (welding processes, plant
   operation, masonry/tiling/plaster/roof/electrical depth, site
   engineering, manual handling, safety); 7 are explicitly classified
   needle-less with audit notes (umbrella/twin/covered-by-parent). The
   classification guard now covers the WHOLE catalogue (152 slugs) — a new
   catalogue skill fails CI until classified. (The all-12-languages guard
   was already flipped in PR3C.)
4. **ESCO URI mapping** — separate track (matching stays YELLOW there); not
   a runtime dependency of recognition.
