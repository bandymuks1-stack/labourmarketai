# labourmarket.ai — Safe Merge PR #136 + Quality Sprint v1

## PASKIRTIS

Šis dokumentas skirtas labourmarket.ai agentui / Claude Code operatoriui.

Owner nurodė: „duok agentui merginti komandą ir darom kokybės sprintą“.

Tikslas:
1. Saugiai sujungti PR #136, jeigu preflight green.
2. Patikrinti production deploy po merge.
3. Pradėti kitą kokybės sprintą, kuris sustiprina primary-route QA mechanizmą.
4. Nekurti chaoso, nemerge’inti papildomų PR be owner sprendimo.

Svarbu: labourmarket.ai `main` auto-deployina į Vercel.  
Merge = production deploy.  
Agentui leidžiama merge’inti PR #136 tik jei visi preflight/checks green.  
Kitas kokybės PR turi būti OPEN, ne merged, nebent owner vėliau aiškiai patvirtins.

---

# /goal

Project/repo: labourmarket.ai  
Working directory: `C:\Users\Mano\Documents\labourmarketai`

## GALUTINIS TIKSLAS

Padaryti saugų kokybės ciklą:

```text
A. Safe merge PR #136
B. Post-merge deploy / smoke check
C. Quality Sprint PR: wire check:primary-route-smoke into CI
D. Optional: prepare Playwright live-render smoke plan or first safe skeleton
E. Owner-facing final report
```

---

## KONTEKSTAS

PR #136:

```text
Title: test: add primary route smoke and dead-ui QA guard
Branch: test/primary-route-smoke-dead-ui-guard
Commit: 2dbbfdcb5e2e55d1aece940c064d25cfa9c6c040
Status reported: OPEN / MERGEABLE
Validation reported: typecheck, lint, build, vitest 923, placeholders:check, check:primary-route-smoke green
Scope: tests/guards/CLI/docs/package scripts
Deploy: not yet
```

PR #136 guard:
- inventories 21 primary routes;
- blocks `href="#"` / empty href in app/components;
- blocks lorem ipsum in user-visible EN/LT messages;
- blocks `[XX]` locale tag leaks;
- blocks missing/renamed primary route source;
- allows honest Sample/Preview/Ruošiama/coming-soon states as inventory.

---

# PHASE A — SAFE MERGE PR #136

## A1. Clean worktree

Nenaudoti dirty pagrindinio medžio destructive būdu.

```powershell
cd C:\Users\Mano\Documents\labourmarketai
git fetch origin
git worktree add C:\Users\Mano\Documents\labourmarketai-merge-136-quality-wt origin/main
cd C:\Users\Mano\Documents\labourmarketai-merge-136-quality-wt
```

Jei worktree jau egzistuoja ir dirty, kurti `-wt2`.

## A2. Preflight PR #136

Patikrinti:

```bash
gh pr view 136 --json number,title,state,mergeable,baseRefName,headRefName,isDraft,url,statusCheckRollup
gh pr checkout 136
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
scope = guard/test/docs/package scripts only
no env/secrets/DB/billing/auth/deploy config
```

Jei bet kas ne taip:

```text
STOP_MERGE_PREFLIGHT_FAILED_PR136
```

## A3. Local validation

Paleisti realias repo komandas:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
pnpm placeholders:check
pnpm check:primary-route-smoke
```

Jei root script pavadinimas kitoks, naudoti realų scriptą ir reportuoti.

Jei validacija failina:

```text
STOP_MERGE_VALIDATION_FAILED_PR136
```

## A4. Merge PR #136

Tik jei preflight + validation green:

```bash
gh pr merge 136 --squash --delete-branch
```

Po merge:

```bash
git checkout main
git pull --ff-only
git log -1 --oneline
```

## A5. Post-merge Vercel/deploy check

Patikrinti Vercel / GitHub checks:

```bash
gh run list --limit 5
```

Jei repo deploy info pasiekiama per GitHub/Vercel check, poll’inti iki success/fail.

Jei deploy failina:

```text
STOP_AFTER_PR136_DEPLOY_FAILED
```

## A6. Production smoke

Tik read-only. Jokio login/captcha.

Patikrinti, jei URL aiškus:
- landing;
- primary public routes;
- market/sample section;
- no obvious broken landing.

Jei URL nežinomas arba reikia login — reportuoti, neguessinti.

---

# PHASE B — QUALITY SPRINT PR: WIRE SMOKE GUARD INTO CI

## Tikslas

Po #136 merge guard egzistuoja, bet turi veikti kiekvieno push/PR metu.

Kitas mažas PR:

```text
ci: run primary route smoke guard in CI
```

## Scope

Leidžiama:

```text
GitHub Actions / CI workflow update
package script usage
docs/quality note
small guard wiring test
owner-facing runtime report
```

Draudžiama:

```text
product UI changes
env/secrets
DB/migrations
billing/auth
deploy config changes unrelated to checks
LABMA
Agentai code
Vismantas
```

## Darbas

1. Rasti CI workflow failus:

```text
.github/workflows/*
```

2. Rasti kur vykdomas:

```text
placeholders:check
typecheck
lint
build
test
```

3. Įtraukti:

```bash
pnpm check:primary-route-smoke
```

šalia `placeholders:check` arba tinkamiausio quality gate.

4. Jeigu CI nėra arba workflow struktūra neaiški:
   - sukurti reportą;
   - neatlikti rizikingo pakeitimo.

5. Paleisti lokaliai:

```bash
pnpm check:primary-route-smoke
pnpm placeholders:check
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
```

6. Atidaryti PR:

Branch:

```text
ci/primary-route-smoke-guard
```

PR title:

```text
ci: run primary route smoke guard in CI
```

PR palikti OPEN. Nemerge’inti be owner sprendimo, nes main auto-deploy, net jei CI-only.

---

# PHASE C — OPTIONAL NEXT QA PLAN: PLAYWRIGHT LIVE-RENDER SMOKE

Jei lieka laiko, bet be rizikos:

Sukurti tik planą arba minimalų skeleton, jei test infra jau egzistuoja.

Tikslas ateičiai:

```text
HTTP 200 primary routes
CTA target resolution
no console fatal errors
mobile viewport smoke
```

Jei Playwright jau yra:
- galima pridėti mažą smoke spec kaip PR dalį, tik jei stabilus.
Jei Playwright nėra:
- nediegti naujų dependency be owner approval;
- sukurti `docs/quality/playwright-live-render-smoke-plan.md`.

---

# PHASE D — OWNER-FACING REPORT

Sukurti gitignored reportą:

```text
runtime/project-quality/merge-136-quality-sprint-report.md
runtime/project-quality/merge-136-quality-sprint-report.html
```

Reportas turi rodyti:

```text
# PR #136 Merge + Quality Sprint Report

## PR #136 status
## Preflight
## Merge SHA
## Deploy status
## Smoke result
## New CI PR status
## What owner should review
## Safety proof
```

---

# VALIDATION

PR #136 merge prieš merge:

```bash
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
pnpm placeholders:check
pnpm check:primary-route-smoke
```

CI PR validation:

```bash
pnpm check:primary-route-smoke
pnpm placeholders:check
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
```

Jei komanda neegzistuoja, reportuoti tiksliai.

---

# SAUGOS RIBOS

Draudžiama:

```text
merge any PR except #136 in Phase A
merge CI PR without owner
production env/secrets
DB migrations
billing/auth changes
LABMA touch
Agentai code touch
Vismantas touch
prospect outreach
paid API/login/captcha
force push
reset dirty owner worktree
```

Leidžiama:

```text
merge PR #136 if green
open CI PR if green
write gitignored runtime report
read-only production smoke
```

---

# FINAL REPORT

Final report lietuviškai:

1. PR #136 preflight:
   - state;
   - mergeable;
   - checks;
   - scope;
   - validation.
2. Ar #136 merged:
   - merge SHA;
   - branch deleted yes/no.
3. Post-merge deploy/check:
   - success/fail/pending.
4. Production smoke:
   - kas tikrinta;
   - rezultatas.
5. Quality Sprint CI PR:
   - branch;
   - commit;
   - PR URL;
   - status OPEN/MERGED.
6. Kokie workflow failai pakeisti.
7. Ar `check:primary-route-smoke` įtrauktas į CI.
8. Validacija.
9. Kur owner-facing reportas.
10. Safety proof:
    - no env;
    - no DB;
    - no billing/auth;
    - no LABMA/Agentai/Vismantas;
    - no outreach.
11. Kitas rekomenduojamas veiksmas owneriui.

Galutinė būsena turi būti viena:

```text
MERGE_136_COMPLETE_AND_CI_PR_OPEN
MERGE_136_COMPLETE_ONLY
NO_MERGE
PARTIAL_STOP
```

---

## SĖKMĖ

Sėkmė:

```text
PR #136 saugiai įmainintas ir saugo main.
check:primary-route-smoke paruoštas CI veikimui per kitą PR.
Owner gauna aiškią ataskaitą.
Nieko nesugadinta produkcijoje.
