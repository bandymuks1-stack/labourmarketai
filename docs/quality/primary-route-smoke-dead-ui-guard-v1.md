# labourmarket.ai — Primary Route Smoke / Dead UI QA Guard v1

## PASKIRTIS

Šis dokumentas skirtas labourmarket.ai kodavimo agentui.

Po PR #121 ir #125 merge produkto kokybė pagerinta: pašalintas dead CTA ir sample/fabricated duomenys pažymimi sąžiningiau. Kitas saugiausias didelės vertės žingsnis — įdiegti QA guardą, kuris automatiškai neleistų grįžti dead links, fake CTA, placeholder leaks ir primary route klaidoms.

Tikslas: ne nauja funkcija, o produkto patikimumo apsauga.

---

# /goal

Project/repo: labourmarket.ai  
Working directory: `C:\Users\Mano\Documents\labourmarketai`

## GALUTINIS TIKSLAS

Padaryti saugų PR:

```text
test: add primary route smoke and dead-ui QA guard
```

PR turi:
1. Inventorizuoti pagrindinius public / primary role routes.
2. Pridėti automatinį guardą prieš:
   - `href="#"`;
   - dead CTA;
   - fake / unlabeled sample states;
   - user-visible placeholder/demo/test text primary route;
   - missing role-flow messages;
   - broken primary route render/build regressions.
3. Sugeneruoti owner-facing QA reportą.
4. Neliesti production/env/DB/billing/auth.
5. Nedeployinti. PR palikti OPEN owner merge sprendimui, jei repo politika tokia pati kaip iki šiol.

---

## KONTEKSTAS

Neseniai sumerge’inti:

```text
PR #121 — placeholder cleanup / dead CTA removal
PR #125 — always-on Sample affordance
```

Dabar reikia apsaugoti, kad tokios klaidos negrįžtų.

Project Quality Audit v2 rodė:
- labourmarket.ai owner confidence apie 78/100;
- didelės spragos: DA/DE lokalizacija, workflow stepper, primary flow QA;
- Bug Hunter rado dead CTA ir unlabeled sample data, kurie jau pataisyti #121/#125.

---

## PRIMARY ROUTES

Agentas turi nustatyti realų route sąrašą iš repo, bet pradinis scope:

```text
/
landing / marketing page
welcome / role choice
auth login/register/confirm
worker dashboard / start
company dashboard / start
agency dashboard / start
buyer dashboard / start
profile / capabilities entry
request / job / work-journal visible entry, jei egzistuoja
```

Jei route reikalauja auth ir nėra test harness, įtraukti kaip static/source-level smoke, ne fake login.

---

## GUARD TURI TIKRINTI

### 1. Dead links / dead CTA

Ieškoti:

```text
href="#"
href=""
button without action in visible primary CTA area
View full insights -> no target
Learn more -> no route
self-link on same dashboard
```

### 2. Placeholder leaks

Ieškoti user-visible primary code/copy:

```text
placeholder
TODO
TBD
lorem
demo
sample
mock
test
coming soon
under construction
netrukus
ruošiama
pavyzdys
testinis
čia bus
neįgyvendinta
```

Svarbu: sąžiningas `Sample` / `Preview` / `Ruošiama` gali būti leidžiamas, jei:
- aiškiai pažymėta;
- neapsimeta realia funkcija;
- nėra primary fake CTA.

### 3. Fake / misleading claims

Ieškoti:

```text
verified
AI matching
instant hiring
real-time market intelligence
trusted score
confirmed
guaranteed
```

Jei claim neturi realios funkcijos/evidence, turi būti pažymėtas kaip sample/pre-alpha arba pašalintas.

### 4. Missing i18n / raw technical copy

Ieškoti primary route:

```text
[EN]
translation key shown to user
raw enum/status/database string
undefined/null
```

DA/DE vertimų netaisyti šiame PR, tik inventorizuoti ir failinti/soft-failinti pagal scope. Neįdėti mašininio vertimo kaip native-perfect.

---

## IMPLEMENTACIJOS KRYPTIS

Pageidaujama sukurti guard testą:

```text
apps/web/src/__tests__/primary-route-smoke.test.ts
```

arba pagal esamą testų struktūrą.

Jei repo jau turi guard testų folderį, naudoti jį.

Testas gali būti mišrus:
- source-level static scan;
- component/page file scan;
- route inventory validation;
- minimal render smoke, jei framework leidžia saugiai.

Svarbiausia, kad būtų stabilus ir ne trapus.

---

## OWNER-FACING REPORT

Sukurti gitignored runtime reportą:

```text
runtime/project-quality/primary-route-smoke-report.md
runtime/project-quality/primary-route-smoke-report.html
runtime/project-quality/primary-route-smoke-inventory.json
```

Reportas turi būti suprantamas owneriui:

```text
# Primary Route Smoke / Dead UI QA Guard

## What was checked
## Routes covered
## Issues prevented
## Allowed honest states
## Remaining risks
## Next recommended PR
```

Nesiųsti ownerio į JSONL/CSV kaip pagrindinį rezultatą.

---

## SAUGOS RIBOS

Draudžiama:

```text
production deploy
merge to main
env/secrets changes
DB migrations
billing/payment changes
auth policy changes
fake functionality
machine translate DA/DE as final
touch Agentai code
touch LABMA
touch Vismantas/wavi
outreach/email/Telegram to prospects
paid API/login/captcha
```

Leidžiama:

```text
tests/guards
route inventory
copy/source scan
small supporting utility
runtime report
docs note
open PR
```

---

## VALIDACIJA

Paleisti realias repo komandas:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
pnpm placeholders:check
```

Jei komanda neegzistuoja, reportuoti ir naudoti artimiausią realią.

Papildomai paleisti naują guard testą tiesiogiai, jei įmanoma.

---

## PR REIKALAVIMAI

Branch:

```text
test/primary-route-smoke-dead-ui-guard
```

PR title:

```text
test: add primary route smoke and dead-ui QA guard
```

PR turi būti OPEN, ne merged, nebent owner aiškiai leidžia merge.

PR body:

```text
Summary
Routes / files covered
New guard rules
Allowed honest sample/preview states
Validation
Safety proof
Follow-up
```

---

## FINAL REPORT

Final report lietuviškai:

1. Branch name.
2. Commit SHA.
3. PR URL.
4. PR status open/merged.
5. Kokie routes/files tikrinti.
6. Kokie guardai pridėti.
7. Ar rasta naujų problemų.
8. Ką guardas nuo šiol sustabdys.
9. Kur owner-facing reportas.
10. Validacija:
    - typecheck;
    - lint;
    - build;
    - vitest;
    - placeholders check.
11. Safety proof:
    - no deploy;
    - no DB/env/billing/auth;
    - no LABMA/Agentai/Vismantas;
    - no outreach.
12. Kitas rekomenduojamas PR.

---

## SĖKMĖ

Sėkmė:

```text
Po šio PR dead CTA / href="#" / fake placeholder leak primary route nebegrįžta nepastebėtas.
Owner gauna aiškų QA reportą.
PR yra mažas, saugus, reviewable ir nedeployintas be owner sprendimo.
```
