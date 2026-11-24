# labourmarket.ai — Finish Quality Gate Chain v1
## Merge PR #138 + Required Quality Gate + Next Live-Render Smoke Plan

## PASKIRTIS

Šis dokumentas skirtas labourmarket.ai agentui / Claude Code operatoriui.

Owner nurodė: „padaryk komandą viskam“.

Tai reiškia užbaigti dabartinę kokybės grandinę:

1. Saugiai merge’inti PR #138, jei preflight green.
2. Patikrinti, kad GitHub Actions Quality Gates veikia main’e.
3. Jei agentas turi teises ir repo leidžia — įjungti branch protection required status check.
4. Jei branch protection negalima pakeisti automatiškai — paruošti aiškią owner instrukciją.
5. Paruošti kitą saugų QA žingsnį: Playwright/live-render smoke planą arba skeleton, bet nediegti naujų dependency be owner approval.
6. Pateikti owner-facing final report.

Svarbu: labourmarket.ai main auto-deployina į Vercel. PR #138 yra CI-only, bet vis tiek merge į main gali paleisti deploy/check pipeline. Agentas turi patikrinti po merge.

---

# /goal

Project/repo: labourmarket.ai  
Working directory: `C:\Users\Mano\Documents\labourmarketai`

## GALUTINIS TIKSLAS

Užbaigti Primary Route Smoke guard grandinę:

```text
A. Safe merge PR #138
B. Verify Quality Gates on main
C. Configure required Quality Gates branch protection if possible
D. Prepare Playwright/live-render smoke next-step plan or safe skeleton
E. Final owner-facing report
```

---

## KONTEKSTAS

Jau padaryta:

```text
PR #136 merged → 233886a
Primary route smoke guard main’e
Production deploy success
Production smoke pass
```

Dabartinis PR:

```text
PR #138
Title: ci: run primary route smoke guard in CI
Branch: ci/primary-route-smoke-guard
Commit: f3383da
Status reported: OPEN
CI self-run: green
Scope: .github/workflows/quality.yml + CI wiring test + docs
```

Tikslas: padaryti, kad `pnpm check:primary-route-smoke` bėgtų kiekvienam PR/push kartu su placeholders check.

---

## SAUGOS RIBOS

### Leidžiama

```text
merge PR #138 if preflight green
verify GitHub Actions Quality Gates
configure branch protection required status check only if safe and permissions allow
create docs/runtime reports
prepare Playwright smoke plan
open a docs-only or test-skeleton PR if safe
```

### Draudžiama

```text
merge any PR other than #138 without explicit owner approval
modify env/secrets
modify DB/migrations
modify billing/auth
force-push
reset dirty owner worktree
touch LABMA
touch Agentai code
touch Vismantas/wavi
send outreach
paid API/login/captcha
install new dependency without owner approval
```

---

# PHASE A — SAFE MERGE PR #138

## A1. Clean worktree

```powershell
cd C:\Users\Mano\Documents\labourmarketai
git fetch origin
git worktree add C:\Users\Mano\Documents\labourmarketai-merge-138-quality-wt origin/main
cd C:\Users\Mano\Documents\labourmarketai-merge-138-quality-wt
```

Jei worktree egzistuoja ir dirty, kurti `-wt2`.

## A2. Preflight PR #138

```bash
gh pr view 138 --json number,title,state,mergeable,baseRefName,headRefName,isDraft,url,statusCheckRollup
gh pr checkout 138
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
scope=CI workflow/test/docs only
no app product behavior changes
no env/secrets/DB/billing/auth/deploy secrets
```

Jei ne:

```text
STOP_MERGE_138_PREFLIGHT_FAILED
```

## A3. Local validation

Paleisti:

```bash
pnpm check:primary-route-smoke
pnpm placeholders:check
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
```

Jei failina:

```text
STOP_MERGE_138_VALIDATION_FAILED
```

## A4. Merge PR #138

Tik jei green:

```bash
gh pr merge 138 --squash --delete-branch
```

Po merge:

```bash
git checkout main
git pull --ff-only
git log -1 --oneline
```

Expected: main turi PR #138 squash commit.

---

# PHASE B — VERIFY QUALITY GATES ON MAIN

Po merge patikrinti GitHub Actions.

```bash
gh run list --limit 10
```

Rasti naują `Quality Gates` run ant main po #138 merge.

Poll’inti iki:

```text
success / failure / timed_out
```

Jei success:

```text
QUALITY_GATES_MAIN_GREEN
```

Jei fail:

```text
STOP_QUALITY_GATES_MAIN_FAILED
```

Jei nėra run:

```text
QUALITY_GATES_MAIN_RUN_NOT_FOUND
```

Tada final report turi aiškiai pasakyti, kad branch protection dar negalima jungti kol nėra aiškaus status check pavadinimo.

---

# PHASE C — REQUIRED STATUS CHECK / BRANCH PROTECTION

## Tikslas

Po pirmo green `Quality Gates` run, padaryti taip, kad PR su raudonu guard negalėtų būti merge’inami.

## Pirma patikrinti esamą protection

Naudoti GitHub CLI/API read-only:

```bash
gh api repos/bandymuks1-stack/labourmarketai/branches/main/protection
```

Jei grąžina 404 arba forbidden:
- reportuoti;
- nebandyti agresyvių pakeitimų.

## Jeigu branch protection jau egzistuoja

Jeigu leidžia teisės, įtraukti required status check:

```text
Quality Gates
```

arba tikslų check context pavadinimą iš `gh run view`.

Svarbu:
- neištrinti esamų required checks;
- neperrašyti kitų branch protection taisyklių;
- tik pridėti naują Quality Gates check prie esamų.

Jei saugiai neįmanoma per API, STOP ir sukurti owner instrukciją.

## Jeigu branch protection neegzistuoja

Nekurti agresyvios branch protection be aiškios repo politikos.  
Vietoje to sukurti owner instrukciją:

```text
Settings → Branches → Add rule / main → Require status checks → Quality Gates
```

## Output

Sukurti:

```text
runtime/project-quality/branch-protection-quality-gate.md
runtime/project-quality/branch-protection-quality-gate.html
```

Jame:
- current protection status;
- whether Quality Gates required;
- if not, exact owner steps.

---

# PHASE D — PLAYWRIGHT / LIVE-RENDER SMOKE NEXT STEP

## Tikslas

Paruošti kitą QA sluoksnį, bet neįdiegti naujų dependency be owner approval.

## Patikrinti ar Playwright jau yra

```bash
rg -n "playwright|@playwright/test" package.json pnpm-lock.yaml apps .github
```

Jei Playwright jau egzistuoja:
- galima paruošti mažą live-render smoke skeleton PR;
- bet nemerge’inti be owner.

Jei nėra:
- nediegti dependency;
- sukurti docs planą:

```text
docs/quality/playwright-live-render-smoke-plan.md
```

Plan turi aprašyti:
```text
HTTP 200 primary routes
CTA target resolution
mobile viewport
console fatal errors
auth-gated route handling
how to run locally
dependency decision needed
```

## Optional PR

Jei tik docs planas, galima įtraukti į tą patį reportą arba atidaryti docs-only PR.

Jei test skeleton be naujos dependency, branch:

```text
test/live-render-smoke-plan
```

PR title:

```text
docs: plan live-render smoke for primary routes
```

Palikti OPEN, jei atidarytas.

---

# PHASE E — OWNER-FACING FINAL REPORT

Sukurti:

```text
runtime/project-quality/finish-quality-gate-chain-report.md
runtime/project-quality/finish-quality-gate-chain-report.html
```

Reportas turi būti ne techninis raw logas, o aiškus:

```text
# Quality Gate Chain Completion

## PR #138 merge status
## Quality Gates main status
## Branch protection status
## Next Playwright/live-render step
## What owner must do
## Safety proof
```

---

# FINAL REPORT

Final report lietuviškai:

1. PR #138 preflight:
   - state;
   - mergeable;
   - checks;
   - scope;
   - validation.
2. Ar #138 merged:
   - merge SHA;
   - branch deleted yes/no.
3. Quality Gates main run:
   - found yes/no;
   - status;
   - run URL, jei yra.
4. Branch protection:
   - existing yes/no/forbidden;
   - Quality Gates required yes/no;
   - if not configured, exact owner instruction.
5. Playwright/live-render:
   - Playwright exists yes/no;
   - what plan/skeleton created;
   - PR URL if opened.
6. Owner-facing report path.
7. Safety proof:
   - no env/secrets;
   - no DB/migrations;
   - no billing/auth;
   - no LABMA/Agentai/Vismantas;
   - no outreach;
   - no new dependency without approval.
8. Final state:

```text
QUALITY_GATE_CHAIN_COMPLETE
QUALITY_GATE_MERGED_BRANCH_PROTECTION_MANUAL
QUALITY_GATE_MERGED_PLAYWRIGHT_PLAN_OPEN
NO_MERGE
PARTIAL_STOP
```

9. Next owner action with no coding jargon.

---

## SĖKMĖ

Sėkmė:

```text
PR #138 merge’intas.
Quality Gates veikia main’e.
Owner žino ar branch protection įjungta.
Jei ne — turi tikslų vieną veiksmą.
Playwright/live-render smoke pasiruoštas kaip kitas žingsnis be nepatvirtintų dependency.
