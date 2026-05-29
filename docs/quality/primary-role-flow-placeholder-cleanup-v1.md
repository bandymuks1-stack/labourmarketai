# Labourmarket.ai — Primary Role Flow Placeholder Cleanup v1

## PASKIRTIS

Šis dokumentas skirtas Agentai / Claude Code kodavimo agentui.

Owner patvirtino: darom kitą realų kokybės žingsnį po Project Quality Agents v1 audito.

Project Quality Agents v1 rado, kad labourmarket.ai audit owner confidence yra apie 77/100, o top rekomendacija:

```text
fix: replace user-visible placeholders on the primary role flow
```

Tikslas: ne kurti naujas dideles funkcijas, o realiai pakelti produkto kokybę ten, kur žmogus pirmiausia mato nebaigtumą — placeholderius, fake/demo tekstus, neaiškius UI pažadus, „coming soon“ ar techninius likučius primary role flow.

---

# /goal

Project/repo: labourmarket.ai  
Working directory: `C:\Users\Mano\Documents\labourmarketai`

## GALUTINIS TIKSLAS

Padaryti vieną saugų implementation PR labourmarket.ai repo:

```text
fix: replace user-visible placeholders on the primary role flow
```

PR turi:
1. Rasti user-visible placeholderius primary role flow.
2. Pakeisti juos sąžiningu, production-safe tekstu arba aiškia realia būsena.
3. Nepadaryti fake funkcionalumo.
4. Nepadaryti naujo dizaino chaoso.
5. Nepaliesti production/env/billing/DB be būtinybės.
6. Paruošti owner-facing vizualinį/tekstinį įrodymą, ką vartotojas dabar matys.

---

## KONTEKSTAS

Agentai Project Quality Agents v1 jau atliko read-only labourmarket.ai auditą.

Runtime audit failai Agentai repo:

```text
runtime/projects/labourmarket.ai/project-quality/owner-open-first.html
runtime/projects/labourmarket.ai/project-quality/project-status.md
runtime/projects/labourmarket.ai/project-quality/bug-findings.md
runtime/projects/labourmarket.ai/project-quality/design-review.md
runtime/projects/labourmarket.ai/project-quality/recommended-next-cycle.md
runtime/projects/labourmarket.ai/project-quality/quality-scorecard.json
```

Top rekomendacija:

```text
triage and replace user-visible placeholders in the primary role flow
```

Pirmiausia skaityti šiuos failus, jei pasiekiami iš Agentai runtime. Jei nėra, daryti lokalią labourmarket.ai repo analizę.

---

## PRIMARY ROLE FLOW APIBRĖŽIMAS

Primary role flow šiame PR reiškia pagrindinius kelius, kuriuos mato realus vartotojas:

```text
welcome / onboarding
role choice
worker flow
company flow
foreman flow, jei egzistuoja
profile / capability entry
main dashboard / first-use state
work journal / job request entry, jei matoma primary route
admin/company first control surface, jei matoma primary route
```

Tikslus route sąrašas turi būti nustatytas pagal repo.

---

## KĄ LAIKYTI PLACEHOLDER / NEBAIGTUMO ŽENKLU

Ieškoti user-visible:

```text
placeholder
TODO
TBD
coming soon
lorem ipsum
demo
sample
mock
test text
insert text
not implemented
under construction
soon
fake verified
fake AI
fake matching
dummy CTA
dead CTA
raw technical fallback
untranslated key
copy that promises unavailable functionality
```

Taip pat ieškoti lietuviškų / angliškų atitikmenų:

```text
netrukus
ruošiama
pavyzdys
demo duomenys
laikinas tekstas
čia bus
testinis
neįgyvendinta
```

Svarbu: ne kiekvienas „ruošiama“ yra blogai. Blogai yra tada, kai primary flow atrodo nebaigtas, klaidina arba žada realiai neveikiančią funkciją.

---

## DARBO METODAS

### 1. Saugus repo paruošimas

Dirbk švariame labourmarket.ai worktree.

Jei `C:\Users\Mano\Documents\labourmarketai` dirty, neresetinti.

Sukurti naują worktree:

```powershell
cd C:\Users\Mano\Documents\labourmarketai
git fetch origin
git worktree add C:\Users\Mano\Documents\labourmarketai-placeholder-cleanup-wt origin/main
cd C:\Users\Mano\Documents\labourmarketai-placeholder-cleanup-wt
```

Jei worktree jau egzistuoja:
- patikrinti `git status --short`;
- jei dirty, kurti naują `-wt2`;
- nedaryti destructive cleanup.

### 2. Inventorizuoti route/failus

Surasti primary role flow routes/components.

Ieškoti:

```bash
rg -n "placeholder|TODO|TBD|coming soon|lorem|demo|sample|mock|not implemented|under construction|netrukus|ruošiama|pavyzdys|testinis|čia bus|neįgyvendinta" .
```

Taip pat peržiūrėti i18n/copy failus, jei yra.

### 3. Atskirti user-visible nuo internal

Nekeisti:
- testų fixture, nebent jie matomi UI;
- docs;
- internal comments;
- migration names;
- dev-only mocks, jei jie nepasiekia UI.

Keisti:
- route/component tekstus;
- button labels;
- empty states;
- onboarding copy;
- dashboard cards;
- first-use states;
- role-specific labels;
- error/fallback messages.

### 4. Taisyti ne tik tekstą, bet ir klaidinančią būseną

Jei UI turi mygtuką į neveikiančią funkciją:

- pašalinti CTA;
- arba padaryti disabled su aiškia sąžininga būsena;
- arba nukreipti į realiai veikiantį veiksmą;
- arba pridėti realų empty state / next step.

Draudžiama palikti fake CTA.

### 5. Visual / UX kokybės principas

Keitimai turi pagerinti aiškumą, ne tik „pervadinti placeholderį“.

Primary flow turi atrodyti:

```text
clear
owner/user understandable
no fake promise
no raw technical leftovers
mobile-readable
role-aware
```

Jei yra didelė vizualinė problema, bet jos pataisymas per didelis šiam PR, ją dokumentuoti kaip next PR, neplėsti scope.

---

## KOPIJOS / CONTENT PRINCIPAI

Naudoti sąžiningą copy:

- jeigu funkcija veikia — rodyti realų CTA;
- jeigu funkcija dar ruošiama — rodyti aiškiai, bet ne kaip klaidą;
- jeigu reikia vartotojo veiksmo — rodyti next step;
- jeigu duomenų nėra — rodyti empty state su realiu veiksmu.

Vengti:
- „AI matching ready“ jei neveikia;
- „verified“ jei nepatvirtinta;
- „instant hiring“ jei nėra;
- „coming soon“ kaip pagrindinio flow stubo;
- per daug techninių žodžių;
- raw database/status strings.

---

## PRIORITETINĖS VIETOS

Prioritetas 1:

```text
welcome / role selection
worker first-use path
company first-use path
main dashboard first-use cards
profile/capability entry
```

Prioritetas 2:

```text
foreman path
work journal visible entry
admin/company control visible entry
notifications / inbox visible first-use states
```

Prioritetas 3:

```text
secondary settings
internal admin low-traffic routes
docs-only copy
```

---

## OUTPUT / OWNER EVIDENCE

Sukurti runtime owner-facing paketą labourmarket.ai repo arba Agentai runtime, priklausomai nuo esamo workflow.

Pageidaujama:

```text
runtime/project-quality/placeholder-cleanup-report.md
runtime/project-quality/placeholder-cleanup-before-after.md
runtime/project-quality/placeholder-cleanup-route-inventory.json
```

Jei repo runtime struktūra kitokia, naudoti aiškų gitignored runtime katalogą.

Ataskaitoje turi būti:

```text
which routes/files were checked
which user-visible placeholders were found
which were changed
which were intentionally left
before → after copy examples
remaining risks
next recommended PR
```

Jei galima greitai sugeneruoti screenshots / visual evidence, padaryti. Jei screenshot infrastruktūros nėra, bent pateikti route/copy before-after lentelę.

---

## TESTAI / VALIDACIJA

Paleisti pagal repo:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Jei projektas naudoja kitą package manager, nustatyti iš lockfile ir package.json.

Minimaliai privaloma:

```text
lint arba typecheck
relevant tests
build, jei įmanoma
```

Jei yra e2e/Playwright ir saugu paleisti, paleisti primary routes smoke.

Paleidus validacijas, final report tiksliai parašyti:
- kas paleista;
- kas green;
- kas failina;
- ar failai pre-existing;
- ar PR sukėlė klaidas.

---

## SAUGOS RIBOS

Draudžiama:

```text
production deploy
Vercel/Supabase production changes
DB migrations
env/secrets changes
billing/payment changes
auth policy changes without explicit reason
fake features
fake verified states
auto outbound
touch Agentai runtime DB
touch LABMA
touch Vismantas/wavi
```

Leidžiama:

```text
copy/UI text changes
safe empty state changes
disabled CTA clarification
small route/component UX cleanup
tests/guards for no placeholder leaks
owner-facing report
open PR
```

---

## PR REIKALAVIMAI

Branch:

```text
fix/primary-role-flow-placeholder-cleanup
```

PR title:

```text
fix: replace user-visible placeholders on the primary role flow
```

PR body turi turėti:

```text
Summary
Routes/components checked
User-visible placeholders changed
Before/after examples
Validation
Safety proof
Remaining follow-up
```

Atidaryti PR į main.

Nedeployinti.

---

## FINAL REPORT

Final report lietuviškai:

1. Branch name.
2. Commit SHA.
3. PR URL.
4. Ar PR open/merged.
5. Kokias primary flow vietas tikrinai.
6. Kiek user-visible placeholderių rasta.
7. Kiek pakeista.
8. Top 10 before→after pavyzdžių.
9. Kas sąmoningai palikta ir kodėl.
10. Ar buvo pakeisti mygtukai / CTA / empty states.
11. Kur owner evidence reportas.
12. Ar buvo screenshots / visual evidence.
13. Validacija:
    - lint;
    - typecheck;
    - tests;
    - build;
    - e2e/smoke, jei buvo.
14. Safety proof:
    - no deploy;
    - no DB/env/billing;
    - no fake features;
    - LABMA/Agentai/Vismantas neliesti.
15. Kitas rekomenduojamas PR pagal rastas problemas.

---

## SĖKMĖS APIBRĖŽIMAS

Sėkmė nėra tik pašalinti žodį „placeholder“.

Sėkmė:

```text
Realus vartotojas primary role flow nebejaučia, kad produktas yra demo/stub/placeholder.
UI sąžiningai rodo, kas veikia, ką daryti toliau, ir nebežada to, kas neveikia.
Owner gauna aiškų prieš/po įrodymą.
PR yra mažas, saugus, reviewable.
```
