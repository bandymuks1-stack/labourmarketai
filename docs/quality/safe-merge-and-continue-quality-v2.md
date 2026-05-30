# labourmarket.ai — Safe Merge Everything Allowed + Continue Quality Sprint v2

## PASKIRTIS

Šis dokumentas skirtas labourmarket.ai agentui / Claude Code operatoriui.

Owner nurodė: „duok agentui viską merginti ir vystyti saugiai“.

Tai nereiškia aklai merge’inti bet kokį PR. Tai reiškia:

1. Inventorizuoti visus open PR.
2. Merge’inti tik aiškiai saugius ir owner jau patvirtintus kokybės PR.
3. Jei atsirado nežinomas/rizikingas PR — STOP ir pateikti owneriui.
4. Po saugaus merge tęsti kokybės sprintą be production rizikos.
5. Nenaudoti ownerio kaip programuotojo: final output turi būti owner-facing HTML/MD, ne raw logs.

---

# /goal

Project/repo: labourmarket.ai  
Working directory: `C:\Users\Mano\Documents\labourmarketai`

## GALUTINIS TIKSLAS

Saugiai užbaigti dabartinę labourmarket.ai kokybės grandinę:

```text
A. Inventorizuoti open PR.
B. Merge’inti tik saugiai leidžiamus PR.
C. Pirmas leidžiamas target: PR #140, jei preflight green.
D. Patikrinti deploy / Quality Gates / smoke.
E. Jeigu nėra kitų saugių merge kandidatų, pradėti kitą kokybės PR:
   DA/DE i18n inventory + guard, be automatinio vertimo.
F. Pateikti owner-facing final report.
```

---

## OWNER LEIDIMAS

Owner leidžia agentui merge’inti:

```text
PR #140 — Playwright live-render smoke plan + skeleton
```

Tik jei:

```text
preflight green
checks green
scope saugus
nėra env/secrets/DB/billing/auth
nėra production config rizikos
nėra naujų dependency be aiškaus owner approval
```

Owner NEDUODA leidimo aklai merge’inti nežinomų PR.

Jei yra kitų open PR:

```text
classify them
do not merge unless they match safe/docs/test/CI scope and owner intent
if unsure: STOP_UNKNOWN_OPEN_PR
```

---

## KONTEKSTAS

Jau padaryta:

```text
PR #121 merged → placeholder cleanup
PR #125 merged → always-on Sample affordance
PR #136 merged → primary route smoke / dead UI guard
PR #138 merged → Quality Gates CI workflow
Quality Gates main’e green
```

Dabartinis known open PR:

```text
PR #140 — Playwright live-render smoke plan + skeleton
Status latest: OPEN, CI green
```

Kitas saugus backlog prioritetas po #140:

```text
DA/DE i18n inventory + guard
```

Svarbu: DA/DE vertimų negeneruoti kaip „native-perfect“. Pirmas žingsnis turi būti inventory + guard, ne automatinis vertimas.

---

# PHASE A — OPEN PR INVENTORY

## Tikslas

Prieš merge patikrinti realią GitHub būseną.

Naudoti švarų worktree:

```powershell
cd C:\Users\Mano\Documents\labourmarketai
git fetch origin
git worktree add C:\Users\Mano\Documents\labourmarketai-safe-merge-develop-wt origin/main
cd C:\Users\Mano\Documents\labourmarketai-safe-merge-develop-wt
```

Jei worktree jau egzistuoja ir dirty — kurti `-wt2`.

Patikrinti open PR:

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,mergeable,url
```

Sukurti inventoriaus runtime reportą:

```text
runtime/project-quality/open-pr-inventory.md
runtime/project-quality/open-pr-inventory.json
```

Kiekvienam PR nurodyti:

```text
number
title
scope guess
safe-to-merge? yes/no/unknown
reason
```

Jei yra open PR be owner leidimo:

```text
do not merge
```

---

# PHASE B — SAFE MERGE PR #140

## B1. Preflight

```bash
gh pr view 140 --json number,title,state,mergeable,baseRefName,headRefName,isDraft,url,statusCheckRollup
gh pr checkout 140
git status --short
git diff --stat origin/main...HEAD
```

Merge leidžiamas tik jei:

```text
state=OPEN
isDraft=false
baseRefName=main
mergeable=MERGEABLE/CLEAN
no failing required checks
scope=Playwright/live-render smoke plan/skeleton/test/docs only
no env/secrets
no DB/migrations
no billing/auth
no risky production config
no new dependency unless already present or owner-approved
```

Jei preflight blogas:

```text
STOP_MERGE_140_PREFLIGHT_FAILED
```

## B2. Validation

Paleisti realias repo komandas:

```bash
pnpm check:primary-route-smoke
pnpm placeholders:check
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
```

Jei PR #140 turi savo smoke/test komandą, paleisti ir ją.

Jei failina:

```text
STOP_MERGE_140_VALIDATION_FAILED
```

## B3. Merge

Tik jei green:

```bash
gh pr merge 140 --squash --delete-branch
```

Po merge:

```bash
git checkout main
git pull --ff-only
git log -1 --oneline
```

## B4. Post-merge checks

Patikrinti GitHub Actions / Quality Gates:

```bash
gh run list --limit 10
```

Poll’inti naują main run iki success/fail.

Jeigu Vercel deploy/check yra, patikrinti statusą.

Production smoke, tik read-only:

```text
/, /lt, /lt/for-workers, /lt/for-companies, /lt/pricing, /lt/vision, /lt/auth/login, /lt/onboarding
```

Jokio login.

---

# PHASE C — BRANCH PROTECTION STATUS

## Tikslas

Po #138 merge Quality Gates jau yra. Reikia patikrinti, ar jie required.

Patikrinti branch protection:

```bash
gh api repos/bandymuks1-stack/labourmarketai/branches/main/protection
```

Jei leidžia teisės ir aišku kaip saugiai pridėti:

```text
Add required status check: Quality Gates
```

Svarbu:
- neištrinti esamų taisyklių;
- neperrašyti apsaugų;
- jei neaišku, neliesti.

Jei negalima pakeisti:

```text
BRANCH_PROTECTION_MANUAL_REQUIRED
```

Sukurti owner-facing instrukciją:

```text
runtime/project-quality/branch-protection-required-check-owner-action.md
runtime/project-quality/branch-protection-required-check-owner-action.html
```

Ji turi būti paprasta:

```text
GitHub → Settings → Branches → main protection → Require status checks → Quality Gates
```

---

# PHASE D — NEXT QUALITY PR: DA/DE i18n INVENTORY + GUARD

## Tikslas

Po #140 merge pradėti kitą saugų kokybės PR, jei nėra blokų.

PR tikslas:

```text
test: add DA/DE i18n untranslated-key inventory guard
```

Svarbu: NE versti tekstų automatiškai.  
Tik inventory + guard + owner report.

## Kodėl

Quality Audit v2 rado:

```text
DA/DE turi daug [EN] untranslated keys
tai didelė kokybės spraga
bet automatinis vertimas kaip native-perfect draudžiamas
```

## Scope

Leidžiama:

```text
i18n inventory script
guard test
runtime report
docs/quality note
package script
CI optional wiring if safe
```

Draudžiama:

```text
machine translation as final
large copy changes
product behavior changes
env/DB/billing/auth
```

## Guard principas

Sukurti script/test, kuris:

1. suskaičiuoja `[EN]` markers DA/DE;
2. grupuoja pagal route/namespace;
3. failina tik jei count padidėja virš baseline;
4. leidžia esamą baseline kaip debt;
5. sukuria owner reportą, ką versti pirmiausia.

Pageidaujami outputai:

```text
runtime/project-quality/i18n-da-de-inventory.md
runtime/project-quality/i18n-da-de-inventory.html
runtime/project-quality/i18n-da-de-inventory.json
```

Pageidaujamas script:

```bash
pnpm check:i18n-debt
```

arba pagal repo script convention.

## PR

Branch:

```text
test/i18n-debt-inventory-guard
```

Title:

```text
test: add DA/DE i18n debt inventory guard
```

PR palikti OPEN. Nemerge’inti be owner.

---

# PHASE E — OWNER-FACING FINAL REPORT

Sukurti:

```text
runtime/project-quality/safe-merge-and-quality-sprint-report.md
runtime/project-quality/safe-merge-and-quality-sprint-report.html
```

Reportas turi atsakyti:

```text
What was merged
What was not merged
What is open
Quality Gates status
Branch protection status
Next PR opened
What owner should do next
```

---

# VALIDATION

Po #140 merge:

```bash
pnpm check:primary-route-smoke
pnpm placeholders:check
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
```

Naujam i18n guard PR:

```bash
pnpm check:i18n-debt
pnpm -F web typecheck
pnpm -F web lint
vitest run
```

Jei script pavadinimas kitoks, final report tiksliai rašyti.

---

# SAUGOS RIBOS

Draudžiama:

```text
merge unknown PRs
merge i18n PR without owner
force push
reset dirty worktree
env/secrets
DB/migrations
billing/auth
LABMA
Agentai code
Vismantas/wavi
outreach
paid API/login/captcha
new dependency without owner approval
machine translation as final
```

Leidžiama:

```text
merge #140 if green
open i18n guard PR
write runtime owner reports
read-only production smoke
```

---

# FINAL REPORT

Final report lietuviškai:

1. Open PR inventory:
   - kiek PR;
   - kurie safe;
   - kurie nemerge’inti.
2. PR #140:
   - preflight;
   - validation;
   - merged yes/no;
   - merge SHA;
   - branch deleted yes/no.
3. Post-merge:
   - Quality Gates status;
   - Vercel/deploy status;
   - production smoke result.
4. Branch protection:
   - Quality Gates required yes/no;
   - if manual, exact owner action.
5. New i18n PR:
   - branch;
   - commit;
   - PR URL;
   - status OPEN/MERGED.
6. i18n inventory:
   - DA count;
   - DE count;
   - top namespaces/routes;
   - report path.
7. Owner-facing final report path.
8. Safety proof:
   - no env/DB/billing/auth;
   - no LABMA/Agentai/Vismantas;
   - no outreach;
   - no fake translations;
   - no new dependency without approval.
9. Final state:

```text
ALL_SAFE_MERGED_AND_I18N_PR_OPEN
MERGED_140_ONLY
NO_MERGE
PARTIAL_STOP
```

10. One next owner action without PowerShell.

---

## SĖKMĖ

Sėkmė:

```text
PR #140 saugiai merge’intas.
Quality chain dar stipresnė.
Branch protection būsena aiški.
Kitas DA/DE i18n debt guard PR paruoštas, bet ne merge’intas be owner.
Owner gauna aiškią ataskaitą ir neturi spėlioti.
