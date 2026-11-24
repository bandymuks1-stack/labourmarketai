# Human-copy register — developer terminology awaiting replacement

**Status: NEPATIKRINTA. Not approved.** Owner ruling 2026-09-27: guard blast
radius is NOT a justification for keeping developer-facing language in human UI.

## The rule for this register

Do NOT bulk-replace. When one of these SURFACES is reached during the production
walk, replace the developer term with the shortest natural human wording that
preserves the meaning in the third column. If guards pin the OLD WORDING, update
those guards to protect the owner-approved HUMAN MEANING instead — the wording is
not the thing being protected.

`grep -rl deterministi apps/web/lib/guards/*.test.ts` = 70 files. That is the cost
of the change, recorded as information — explicitly NOT a reason to skip it.

## What must NOT be weakened

These protections are materially different from banned internal explanatory copy
and stay wherever genuinely necessary: *not an official document*; *not a
rating/score/verdict*; *not automatic legal confirmation*; *required source
attribution*. Replacing a developer WORD must not drop the CLAIM it carries.

## The occurrences

### 1. `roleDashboards.company.scoutingBridge.points.matches`

**SURFACE** — COMPANY · scouting bridge — components/app/company-scouting-bridge.tsx

**CURRENT SENTENCE (lt)** — Atitikmenys apskaičiuojami deterministiškai tik šiam poreikiui — tai tinkamumo signalai, o ne garantija.

**HUMAN MEANING THAT MUST BE PRESERVED** — Matches are computed for THIS need only, and are a fit signal — not a guarantee.

### 2. `scouting.how.intro`

**SURFACE** — COMPANY · /dashboard/company/scouting

**CURRENT SENTENCE (lt)** — Atitikimas yra deterministinis ir skirtas būtent šiam poreikiui — jokio DI, jokio bendro balo, jokių išgalvotų kandidatų. Kiekvienas darbuotojas rodomas tik kaip anonimizuota, saugi profilio peržiūra.

**HUMAN MEANING THAT MUST BE PRESERVED** — Matching is for this need only; no AI, no general score, no invented candidates; each worker is shown only as an anonymised, safe profile preview.

### 3. `scouting.footnote`

**SURFACE** — COMPANY · /dashboard/company/scouting

**CURRENT SENTENCE (lt)** — Atitiktis skaičiuojama deterministiškai tik šiam poreikiui. Jokio bendro reitingo, jokių išgalvotų kandidatų.

**HUMAN MEANING THAT MUST BE PRESERVED** — Fit is computed for this need only. No general ranking, no invented candidates.

### 4. `auth.dashboard.wow.demand.estimate.intro`

**SURFACE** — COMPANY · /dashboard/company/needs (estimate)

**CURRENT SENTENCE (lt)** — Skaidri, deterministinė sąmata pagal jūsų pačių skaičius — tai nėra įpareigojantis pasiūlymas.

**HUMAN MEANING THAT MUST BE PRESERVED** — The estimate is transparent and built from YOUR OWN numbers — and it is NOT a binding offer.

### 5. `intelligence.methodology.deterministic`

**SURFACE** — WORKER/ORG · /dashboard/intelligence

**CURRENT SENTENCE (lt)** — Visos reikšmės deterministinės ir apskaičiuotos iš įrašų su šaltiniais — nieko nesprendžia DI ir joks skaičius niekada neišgalvojamas.

**HUMAN MEANING THAT MUST BE PRESERVED** — Every figure is computed from records with sources; no AI decides anything and no number is ever invented.

### 6. `intelligence.timeline.actor.system`

**SURFACE** — WORKER/ORG · components/intelligence/intelligence-timeline.tsx (actor label)

**CURRENT SENTENCE (lt)** — Sistema (deterministinės taisyklės)

**HUMAN MEANING THAT MUST BE PRESERVED** — The actor was the system following fixed rules — not a person, and not an AI judgement.

### 7. `intelligence.timeline.explain.deterministicComparison`

**SURFACE** — WORKER/ORG · intelligence timeline explanation (renderer NOT located by static grep — locate at walk time)

**CURRENT SENTENCE (lt)** — Sistema apskaičiavo šį rezultatą pagal fiksuotas, deterministines taisykles

**HUMAN MEANING THAT MUST BE PRESERVED** — The system produced this result by fixed rules.

### 8. `conversation.results.evalNoJudgement`

**SURFACE** — WORKER · components/app/workspace/market-drilldown.tsx

**CURRENT SENTENCE (lt)** — Tai deterministinis filtro paaiškinimas, ne vertinimas: apie projekto patrauklumą, sėkmės tikimybę ar tinkamumą čia nieko neteigiama.

**HUMAN MEANING THAT MUST BE PRESERVED** — This explains a FILTER, not an assessment: nothing is claimed about the project's attractiveness, chance of success or suitability.

### 9. `assist.provider.state.mock`

**SURFACE** — WORKER/ORG · /dashboard/assist (provider state label)

**CURRENT SENTENCE (lt)** — Testinė (deterministinė) veiksena

**HUMAN MEANING THAT MUST BE PRESERVED** — This is a TEST mode, not the live provider. (Doctrine §18: the word 'demo' is banned; 'test'/'preview' vocabulary must survive.)

### 10. `admin.requestReview.help`

**SURFACE** — ADMIN ONLY · /dashboard/admin — internal operator console

**CURRENT SENTENCE (lt)** — Pirmenybė nustatoma deterministiškai pagal realius laukus (aprašymą, failų skaičių, būseną). Be dirbtinio intelekto, be automatinio nuskaitymo.

**HUMAN MEANING THAT MUST BE PRESERVED** — Priority comes from real fields (description, file count, status); no AI and no automatic reading. ADMIN surface: owner to decide whether the rule applies here.

### 11. `needStructuring.footnote`

**SURFACE** — ADMIN ONLY · /dashboard/admin/need-structuring

**CURRENT SENTENCE (lt)** — Pasiūlymai deterministiniai (pagal raktažodžius), ne AI. Laisvas tekstas matomas tik čia ir niekada nepatenka į darbuotojų sąrašą.

**HUMAN MEANING THAT MUST BE PRESERVED** — Suggestions come from keywords, not AI; free text stays here and never reaches the worker list. ADMIN surface: owner to decide whether the rule applies here.

## Related: “algoritmas”, same class

### 12. `admin.matching.humanNote`

**SURFACE** — ADMIN ONLY · admin matching

**CURRENT SENTENCE (lt)** — Kiekvienas match čia parinktas žmogaus, ne algoritmo. Sistema nereitinguoja ir nesiūlo — ji tik rodo realius duomenis ir užfiksuoja tavo sprendimą su grįžtamojo ryšio pastaba.

**HUMAN MEANING THAT MUST BE PRESERVED** — Every match here was chosen by a HUMAN, not an algorithm; the system does not rank or recommend — it shows real data and records your decision.

### 13. `draft.subcopy`

**SURFACE** — PUBLIC/WORKER · match direction subcopy

**CURRENT SENTENCE (lt)** — Atitikimo kryptis su priežastimis. Kiekvienas atitikimas parodo "kodėl" — be neskaidraus algoritmo ar užmaskuoto įvertinimo.

**HUMAN MEANING THAT MUST BE PRESERVED** — Each match shows its WHY — no opaque scoring and no hidden assessment.

## Scope note

All sentences above exist in 11 locale catalogues; the Lithuanian text is quoted
because it is the authored locale. A replacement is a change in every locale that
carries the key, and must keep the claim intact in each.
