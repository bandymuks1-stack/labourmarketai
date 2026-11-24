# Skill Recognition — Language & Labour-Market Coverage Audit

**Date:** 2026-07-04 · **Auditor:** Claude Code · **Branch:** `feat/cc/skill-recognition-coverage-audit`
**Prod project:** `labourmarket.ai` / `gorgitwvdzxbnaxhrsrw` (read-only queries only — no DB mutation in this audit)

## 0. Verdict up front (owner question)

> *"Are skills recognized in all languages? Does the platform recognize the full real labour-market skill set?"*

**No, and no — and this audit proves exactly where the line is.**

- **Recognition from real text exists in exactly 3 languages: LT, RU, EN.** All other UI
  languages (NL, DE, DA, NO, SV, PL, LV, ET) have **display names only — zero recognition**.
  **FI has neither** — there is no Finnish locale directory at all.
- **The catalogue covers ~20 of 27 major labour-market families at basic depth**, with
  construction 10× deeper than everything else (94 of 131 skills). Whole families are
  missing entirely (repair/auto-mechanic, beauty, HR, security-guard work, data entry).
- What IS proven (by `apps/web/lib/guards/multilingual-phrase-recognition.test.ts`, added
  in this PR): 15/16 owner-mandated realistic phrases recognise correctly **in each of
  LT, EN, RU** (the 16th requires a data-entry skill that does not exist in the catalogue
  — pinned as a known gap, not papered over).

### Vocabulary (binding for every coverage claim)

| Term | Meaning | Where it lives | Current truth |
|---|---|---|---|
| **Locale-translated** | slug has a display name in a UI language | `messages/{locale}/skill-names.json`, `professions.json` | 131 skills + 36 professions × **11 locales** (no FI) |
| **Recognized from real text** | a worker sentence produces the slug as a suggestion | needles in `lib/structuring/keywords.ts` + `synonyms.ts` via `recognizeSkills` | **LT/RU/EN only**; 76/131 skills have needles |
| **Installed in DB** | canonical row exists in prod | `public.skills` / `professions` / `profession_skills` | 131 / 36 / 186 (verified 2026-07-04) |
| **Usable as evidence** | recognition can become journal/profile/CV/matching data | `journal_entry_skills`, `worker_skills`, `profile_skill_claims`, ESCO fit | works for journal/profile; **ESCO matching path is inert — 0/131 skills mapped to ESCO URIs** |

A slug can be locale-translated in 11 languages and still be invisible to a worker who
writes about it (55 skills have no needles), or recognized and installed but still carry
zero weight in ESCO-based matching (all 131 today). **Never collapse these four layers
into the word "supported".**

---

## 1. TASK 1 — Current coverage audit

### 1.1 Canonical production catalogue (read-only queries, 2026-07-04)

- **Skills:** 131 · **Professions:** 36 · **profession_skills links:** 186
- Migration ledger includes `universal_profession_skill_catalogue` (20260704120000) and
  `seed_missing_legacy_professions` (20260704130000).

Skill family distribution (`split_part(category,'.',1)`):

| Family | Skills | | Family | Skills |
|---|---|---|---|---|
| construction | **94** | | agriculture | 3 |
| logistics | 6 | | office | 3 |
| manufacturing | 4 | | hospitality | 3 |
| cleaning | 4 | | education | 2 |
| it | 4 | | events | 1 |
| care | 3 | | creative | 1 |
| sales | 3 | | | |

Profession sector distribution: construction **18**; retail_sales, manufacturing,
agriculture, education, transport_logistics, hospitality_food, other **2 each**;
care_health, office_admin, it_software, cleaning_facility **1 each**.

Live evidence volume (early stage): `worker_skills` 22 rows, `journal_entry_skills` 7,
`profile_skill_claims` 16.

### 1.2 Recognition language coverage classification

Recognition = needles in `SKILL_HINTS_LT` / `SKILL_SYNONYMS` / `PROFESSION_HINTS_LT` /
`ACTIVITY_HINTS_LT` (+ `skill-claim-extractor` dictionary), matched by folded-substring
containment. Classification measured by running the owner's 16-phrase pack (× language)
through `recognizeSkills` — see §6 evidence.

| Language | Locale names | Recognition needles | Tested with real phrases | Class |
|---|---|---|---|---|
| **LT** | ✅ 131+36 | ✅ primary language, diacritic-folded | ✅ ~15 test files, now + owner pack (15/16) | **GREEN** |
| **RU** | ✅ | ✅ Cyrillic needles ride the same rows | ✅ heavy fixtures, now + owner pack (15/16) | **GREEN** |
| **EN** | ✅ | ✅ but thinner than LT/RU (was 9/16 before this PR; now 15/16) | ✅ now + owner pack | **GREEN (was YELLOW before this PR)** |
| NL | ✅ | ❌ none | ❌ canary pinned = zero | **RED** |
| DE | ✅ | ❌ none | ❌ canary pinned = zero | **RED** |
| DA | ✅ | ❌ none | ❌ | **RED** |
| NO | ✅ | ❌ none | ❌ | **RED** |
| SV | ✅ | ❌ none (one accidental fuzzy brush: "packade"→"packag" — pinned as accident) | ❌ | **RED** |
| FI | ❌ **no locale exists** | ❌ none | ❌ | **RED (below RED — not even display names)** |
| PL | ✅ | ❌ none (no ł/ż/ń needles anywhere) | ❌ canary pinned = zero | **RED** |
| LV | ✅ | ❌ none | ❌ canary pinned = zero | **RED** |
| ET | ✅ | ❌ none | ❌ canary pinned = zero | **RED** |

The GREEN ratings are scoped claims: they mean the owner phrase pack + the existing
fixture suites pass, **not** "every profession recognisable in that language". EN
construction sub-skill coverage is still thinner than LT/RU.

### 1.3 The six layers, precisely (with file evidence)

1. **Locale display names** — `messages/{locale}/skill-names.json` + `professions.json`.
   Render-only; used by UI after a slug already exists. Never triggers recognition.
2. **Recognition needles** — `lib/structuring/keywords.ts` (`SKILL_HINTS_LT`,
   `PROFESSION_HINTS_LT`, `ACTIVITY_HINTS_LT`), `synonyms.ts`, matched by
   `skill-recognition.ts` (exact > synonym > fuzzy on folded text, context guards for
   flooring-vs-cleaning and now power-tools-vs-electrical). LT/RU/EN in the same rows.
3. **Canonical DB rows** — `public.skills` / `professions` / `profession_skills`.
   Needles map only to existing slugs (verified: 0 hint slugs missing from DB).
4. **Journal extraction** — `extract-journal-suggestions.ts` → worker confirms →
   `autoLinkRecognizedJournalSkills` (`lib/journal/journal-entry-skills-actions.ts`)
   upserts `journal_entry_skills` **only for skills already in `worker_skills`**; never
   invents, never sets verified. Manager confirmation (`lib/journal/confirm-actions.ts`)
   is the only path to the verified tier.
5. **Profile/CV extraction** — two distinct paths: `extractProfileSuggestions` → canonical
   slugs → `worker_skills` (gated by `profession_skills`); `extractProfileSkillClaims`
   (`lib/profile/skill-claim-extractor.ts`) → **free-text** `profile_skill_claims`
   (honest self-declared labels, deliberately no fake taxonomy).
6. **Matching use** — `lib/market/match-v1.ts` + `match-subject.ts` match on **ESCO URIs**
   from `worker_skills → skills.esco_uri`. ⚠️ **Finding: `skills.esco_uri` and
   `professions.esco_uri` are NULL for all 131/36 rows** (ESCO reference tables are loaded
   — 13,939 esco_skills, 3,039 esco_occupations — but nothing is mapped). The skill side
   of ESCO matching is therefore inert for the entire catalogue, construction included.
   Player card (`lib/player-card/player-card.ts`) works off `worker_skills` tiers and
   claims counts, so journal→profile evidence IS live; the ESCO fit component is not.

---

## 2. TASK 2 — Real labour-market coverage matrix

Legend: **Skills/Profs** = installed prod rows · **REC** = recognition needles (langs) ·
**DB** = installed · **TEST** = phrase-tested. "Missing (obvious)" = non-regulated,
clearly universal items a Lithuanian labour-market platform will meet in year one.
LT/EN/RU example = a phrase measured to work today (from the new guard test unless noted).

| # | Family | Existing skills | Existing professions | Missing obvious skills | Missing obvious professions | REC | DB | TEST |
|---|---|---|---|---|---|---|---|---|
| 1 | Construction & renovation | 94 (full trade tree) | 16 | — (deepest family) | — | LT/RU strong, EN partial; **55 sub-skills have no needles** (§4B) | ✅ | ✅ heavy |
| 2 | Manufacturing & assembly | assembly-work, production-line, packaging, equipment-operation | production_worker, furniture_assembler | machine-operator (CNC), sewing/textile, food-production, quality-inspection needles | seamstress, machine_operator | LT/EN/RU ✅ | ✅ | ✅ pack |
| 3 | Logistics & driving | driving, delivery-driving, cargo-transport | driver | bus/passenger transport, taxi as distinct signal, licence-category capture (B/C/CE) | courier (delivery-driving skill exists; profession missing) | LT/EN/RU ✅ | ✅ | ✅ pack |
| 4 | Warehouse & packaging | warehouse-operations, order-picking, forklift-operation, packaging | warehouse_worker | inventory/stock-taking | — | LT/EN/RU ✅ | ✅ | ✅ pack |
| 5 | Cleaning & facility | cleaning-services, window-cleaning, housekeeping, winter-service | cleaner | industrial/post-construction deep clean, laundry | janitor/caretaker (kiemsargis) | LT/EN/RU ✅ | ✅ | ✅ pack |
| 6 | Office & administration | administration, document-handling, bookkeeping | office_administrator | **data-entry / office software (measured gap — Excel phrase = NONE in all 3 languages)**, reception | receptionist, secretary | LT/EN/RU ✅ | ✅ | ✅ pack + pinned gap |
| 7 | IT & programming | programming, qa-testing, it-support, web-design | software_developer | data-analysis, sysadmin/devops signal | qa_tester (QA is label-only activity today), sysadmin | LT/EN/RU ✅ | ✅ | ✅ pack |
| 8 | Customer service | customer-service | customer_service_specialist | call-centre work | call_centre_agent | LT/EN/RU ✅ | ✅ | ✅ pack |
| 9 | Sales | cashier, sales-assistant | sales_assistant | merchandising, telesales | merchandiser | LT/EN/RU ✅ | ✅ | ✅ pack |
| 10 | Hospitality & food | cooking, waiting-tables, bartending | cook, waiter | **dishwashing/kitchen-help** (only reaches cooking via "virtuvė"), barista, baking | kitchen_helper, barista, baker | LT/EN/RU ✅ | ✅ | ✅ pack |
| 11 | Agriculture & gardening | gardening, farm-work, animal-care | gardener, farm_worker | forestry, greenhouse | — | LT/EN/RU ✅ | ✅ | ✅ pack |
| 12 | Care & assistance | elderly-care, childcare, first-aid | caregiver | household help (buities pagalba) as distinct signal | — | LT/EN/RU ✅ | ✅ | ✅ pack |
| 13 | Childcare | childcare | (caregiver covers) | after-school care nuance | nanny as own profession — owner call | LT/EN/RU ✅ | ✅ | ✅ pack |
| 14 | Elder care | elderly-care | (caregiver covers) | — | — | LT/EN/RU ✅ | ✅ | ✅ pack |
| 15 | Health support | first-aid only | — | — (regulated → §4F) | nurse assistant etc. → **§4F owner gate** | first-aid only | partial | partial |
| 16 | Education & teaching | teaching | teacher | tutoring | tutor, sports coach | LT/EN/RU ✅ | ✅ | fixtures |
| 17 | Languages & translation | translation | translator | interpreting distinct from written | — · *worker's own language proficiency is NOT a skill row → §4F* | LT/EN/RU ✅ | ✅ | fixtures |
| 18 | Creative / media / events | graphic-design, web-design, event-setup | event_organizer | photography, video, content-writing | photographer | LT/EN/RU ✅ | ✅ | ✅ pack (events) |
| 19 | Security & safety | safety-officer, first-aid | safety_specialist | — (guard work regulated in LT → §4F) | security_guard → **§4F** | safety-officer has **no needle** | ✅ | ❌ |
| 20 | Equipment & machine operation | equipment-operation + 9 construction operator skills | heavy_equipment_operator, crane_operator | — | — | generic ✅; operator sub-skills **no needles** (§4B) | ✅ | partial |
| 21 | Management & coordination | team-coordination, work-scheduling, site-management, materials-management, quality-control | site_manager, foreman | shift-supervision (non-construction) | shift_supervisor | LT/RU ✅, EN partial | ✅ | fixtures |
| 22 | Recruitment / HR | **none** | **none** | recruitment, personnel admin | recruiter, hr_specialist | ❌ | ❌ | ❌ |
| 23 | Finance / accounting | bookkeeping | **none** | payroll | accountant (certification nuance → §4F) | LT/EN/RU ✅ (bookkeeping) | skill ✅ / prof ❌ | ✅ pack |
| 24 | Legal / admin compliance | **none** | **none** | — (regulated → §4F) | — | ❌ | ❌ | ❌ |
| 25 | Beauty / personal services | **none** | **none** | hairdressing, barbering, manicure/nails | hairdresser, beautician (medical-adjacent forms → §4F) | ❌ | ❌ | ❌ |
| 26 | Repair / maintenance | hand-tools (no needle) | **none** | **auto mechanics (major LT market segment)**, appliance repair, handyman work | auto_mechanic, handyman | ❌ | ❌ | ❌ |
| 27 | Retail / cashier | cashier, sales-assistant | sales_assistant | shelf-stocking | shelf_stocker (order-picking partially covers) | LT/EN/RU ✅ | ✅ | ✅ pack |

**Summary:** 20/27 families have at least basic installed+recognized coverage;
families **22, 24, 25, 26** are absent from the catalogue entirely; **15, 19** are
deliberately thin pending owner decisions on regulated work; **6, 10** have measured
holes (data entry; kitchen-help).

---

## 3. TASK 3 — Real phrase test fixtures (done in this PR)

`apps/web/lib/guards/multilingual-phrase-recognition.test.ts` — **56 tests**:

- the owner's 16 mandatory LT phrases (verbatim), 15 asserting measured recognition;
- 16 EN + 16 RU equivalents for the same families;
- 3 pinned data-entry GAP cases (Excel phrase = `[]` in LT/EN/RU — fails the day someone
  adds coverage without updating the audit);
- 7 RED-language canaries (PL×2, DE×2, NL, LV, ET) pinned to zero recognition + 1 SV
  accidental-fuzzy pin — locale names can never masquerade as recognition;
- false-positive regressions: power tools ≠ electrical-install (LT/EN/RU), "filled" ≠
  skim-coating, "helped" ≠ general-labour.

Recognition fixes shipped with it (measured gaps, existing slugs only — **no DB change,
no locale change, no new skill system**): inflected/real-word needles for
customer-service, cashier, bookkeeping, document-handling, programming, cargo-transport,
childcare, elderly-care, event-setup, packaging, cleaning-services; power-tool context
guard + fuzzy blocklist in `skill-recognition.ts`. Before → after on the owner pack:
LT 13→15, EN 9→15, RU 12→15 (of 16; #12 blocked on missing catalogue row, class E).

---

## 4. TASK 4 — Gap list

**A. Fully installed + recognized (LT/EN/RU) + phrase-tested** — the 37 universal skills
(all have needles) + core construction trades with needles; 18+18 professions reachable
via profession/activity hints; everything the 56-test pack + existing ~15 fixture suites
assert.

**B. Installed in DB but recognition weak or absent** —
- **55 of 131 skills have no needles at all** (locale-translated ×11, invisible to text):
  arc-welding, blockwork, bulldozer-operator, cable-pulling, compactor-operator,
  concrete-finishing, concrete-vibration, concrete-works, crane-operator,
  decorative-plaster, door-window-install, electrical-testing, excavator-operator,
  facade-plaster, flat-roofing, forklift-operator, formwork-carpentry, gas-cutting,
  glazing, grader-operator, grouting, gutter-install, hand-tools, industrial-electric,
  joinery, large-format-tiling, lighting-install, load-signaling, loader-operator,
  low-voltage, manual-handling, material-transport, materials-management,
  mig-mag-welding, mobile-crane, mortar-prep, mosaic-tiling, panel-install,
  precast-install, quantity-takeoff, rebar-detailing, rigging, roof-insulation,
  roof-tiling, safety-officer, setting-out, site-supervision, spray-painting,
  steel-fixing, stone-masonry, structural-steel, surveying, tig-welding, tower-crane,
  waterproofing-tiles. (Mostly specialist construction sub-skills reachable only via
  manual profile selection.)
- 3 of 36 professions have no needles: **builder, safety_specialist, site_engineer**.
- Profession-tier "elektr" false positive remains in `extract-profile-suggestions`
  (the new power-tool guard covers the skill tier only) — PR4 item.

**C. Locale exists but no recognition** — every slug × the 8 RED languages
(NL/DE/DA/NO/SV/PL/LV/ET): 131 skills + 36 professions each have display names but zero
needles. Plus the class-B 55 skills even in LT/EN/RU. **FI: no locale, no recognition.**

**D. Recognition candidate exists but no DB skill/profession row** — no orphan needles
(verified: every hint slug has a DB row). The honest label-only layer qualifies:
`skill-claim-extractor` free-text claims and null-slug activities ("Projekto rengimas",
QA testing activity) recognise text but persist only to `profile_skill_claims` — by
design, but QA is a strong candidate for promotion (qa-testing skill exists; a
`qa_tester` profession row does not).

**E. Missing from the catalogue entirely (obvious, universal, non-regulated)** —
data-entry/office-software (measured); auto mechanics + handyman/appliance repair;
hairdressing/barbering/nails (non-medical); dishwashing/kitchen-help; barista; baking;
laundry; reception/secretary; call-centre; HR/recruitment; payroll; merchandising/
shelf-stocking; photography/video/content-writing; tutoring; bus/passenger driving;
sewing/textile & CNC machine operation; forestry/greenhouse.

**F. Requires owner decision (regulated / sensitive / modeling question)** —
security guard (LT licencing); health support (nurse assistant, medication-adjacent
care); legal/compliance work; certified accountant vs bookkeeping; driving instructor;
massage/medical-adjacent beauty; **language proficiency** (belongs on the profile/CV as
a language field, not as skill rows — "Bendravau su klientais anglų kalba" currently
credits customer-service only, correctly); nanny/au-pair as formal profession;
FI locale (add or officially drop from the supported list).

---

## 5. TASK 5 — Staged expansion plan

**PR 1 — audit + measured LT/EN/RU recognition repairs (THIS PR).** No DB mutation, no
locale changes, no new slugs. Audit doc + 56-test guard + needle fixes + 2 false-positive
guards. GREEN class.

**PR 2 — obvious universal catalogue additions (class E).** One additive migration
(`INSERT … ON CONFLICT DO NOTHING`, timestamp-named, rollback shipped) for ~15–20 skills
+ ~10–12 professions from §4E + links; 11-locale display names; LT/EN/RU needles;
installation-chain + phrase-pack guard extensions (new fixtures per new slug). RED-gate
review of the migration per merge model; **prod apply stays owner-gated via MCP**.
Excludes everything in §4F.

**PR 3 — language expansion: PL + DE + NL first, then DA/NO/SV/LV/ET.** Add needles for
the ~40 highest-traffic slugs per language in the SAME hint rows (mechanism proven by
RU); per-language realistic phrase packs mirroring the owner pack (the RED canaries in
the guard flip to full packs one language at a time); fold-map audit for PL `ł` (foldText
does not fold it today — needles must be written pre-folded or normalize.ts extended).
Decide FI (locale + needles, or drop). No DB change.

**PR 4 — evidence & matching alignment.** (a) ESCO mapping migration: populate
`skills.esco_uri` / `professions.esco_uri` (reference tables already loaded; 0/131
mapped today) so canonical skills actually feed `match-v1` fit — owner-gated apply;
(b) apply the power-tool guard + phrase-pack coverage to `extract-profile-suggestions`
/ profession tier; (c) class-B needle pass over the 55 needle-less construction
sub-skills + builder/safety_specialist/site_engineer professions; (d) player-card/CV
surfaces re-audited so every tier label matches the four-layer vocabulary.

---

## 6. Evidence appendix

- Prod queries (2026-07-04, read-only): counts §1.1; `skills.esco_uri` NULL for 131/131;
  `professions.esco_uri` NULL for 36/36; esco_skills=13,939, esco_occupations=3,039,
  candidate_skills with mapped URI = 0.
- Probe method: owner 16-phrase pack ×3 languages + 8 other-language sentences run
  through `recognizeSkills` before/after the fixes (temporary vitest probe, deleted;
  results pinned as the permanent guard test).
- Before-fix failures (measured): LT #12/#13/#14 = NONE; EN #3/#7/#9/#12/#13/#14 = NONE,
  #4 skim-coating(fuzzy) FP, #6 general-labour(fuzzy) FP, #10 electrical-install FP;
  RU #2/#7/#12 = NONE, #3 cashier missed, #10 electrical-install FP.
- Full suite after fixes: **460 files / 6467 tests green** (2026-07-04).
