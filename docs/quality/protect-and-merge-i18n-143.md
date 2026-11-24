# labourmarket.ai — Enable Quality Gate Protection + Safe Merge PR #143

## PASKIRTIS

Šis dokumentas skirtas labourmarket.ai agentui / Claude Code operatoriui.

Owner patvirtino: darom.

Tikslas:
1. Pirmiausia sutvarkyti Quality Gates branch protection, jei agentas turi saugias teises.
2. Jei branch protection negalima įjungti automatiškai — sukurti aiškią owner instrukciją.
3. Tada saugiai preflightinti ir merge’inti PR #143, jei jis green.
4. Patikrinti Quality Gates / Vercel / production smoke po merge.
5. Pateikti owner-facing final report.

Svarbu: labourmarket.ai `main` auto-deployina į production.  
PR #143 yra i18n debt inventory + ratchet guard, be vertimų.  
Merge leidžiamas tik jei preflight + validation green.

---

# /goal

Project/repo: labourmarket.ai  
Working directory: `C:\Users\Mano\Documents\labourmarketai`

## GALUTINIS TIKSLAS

Užbaigti kitą kokybės grandinės žingsnį:

```text
A. Patikrinti Quality Gates branch protection.
B. Jei saugu ir leidžia teisės — įjungti Quality Gates kaip required check.
C. Jei neleidžia — paruošti owner instrukciją.
D. Saugiai merge’inti PR #143, jei preflight green.
E. Patikrinti post-merge Quality Gates / Vercel / production smoke.
F. Pateikti final report.
```

Galutinė būsena turi būti viena:

```text
QUALITY_PROTECTION_ENABLED_AND_143_MERGED
BRANCH_PROTECTION_MANUAL_AND_143_MERGED
BRANCH_PROTECTION_DONE_143_NOT_MERGED
NO_MERGE
PARTIAL_STOP
```

---

## KONTEKSTAS

Jau padaryta:

```text
PR #121 merged
PR #125 merged
PR #136 merged
PR #138 merged
PR #140 merged
Quality Gates main’e green
```

Dabartinis PR:

```text
PR #143
Title: test/i18n-debt-inventory-guard
Branch: test/i18n-debt-inventory-guard
Commit: c421ac9
Status latest: OPEN
Scope: DA/DE i18n debt inventory + ratchet guard
No translations
```

i18n debt:

```text
DA: 633 [EN]
DE: 633 [EN]
EN/LT: 0
top namespaces: auth 184, agencies/companies/workers po 46, pricing 45
```

Svarbu: PR #143 neturi versti tekstų. Jis tik matuoja skolą ir neleidžia jai augti.

---

## SAUGOS RIBOS

### Leidžiama

```text
read branch protection status
add Quality Gates as required check if safe and permissions allow
merge PR #143 if preflight green
run validation
run post-merge checks
write runtime reports
```

### Draudžiama

```text
merge unknown PRs
force-push
reset dirty worktree
env/secrets
DB/migrations
billing/auth
machine translation as final
LABMA touch
Agentai code touch
Vismantas/wavi touch
outreach
paid API/login/captcha
new dependency without owner approval
```

---

# PHASE A — OPEN PR INVENTORY

Naudoti švarų worktree:

```powershell
cd C:\Users\Mano\Documents\labourmarketai
git fetch origin
git worktree add C:\Users\Mano\Documents\labourmarketai-protect-merge-143-wt origin/main
cd C:\Users\Mano\Documents\labourmarketai-protect-merge-143-wt
```

Jei worktree jau egzistuoja ir dirty, kurti `-wt2`.

Patikrinti open PR:

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,mergeable,url
```

Sukurti reportą:

```text
runtime/project-quality/open-pr-inventory-before-143.md
runtime/project-quality/open-pr-inventory-before-143.json
```

Nemerge’inti jokių kitų PR.

Jei yra kitas unknown risky PR:

```text
leave untouched
```

---

# PHASE B — BRANCH PROTECTION / REQUIRED QUALITY GATES

## B1. Read current protection

```bash
gh api repos/bandymuks1-stack/labourmarketai/branches/main/protection
```

Jei 404:

```text
BRANCH_PROTECTION_NOT_CONFIGURED
```

Jei forbidden:

```text
BRANCH_PROTECTION_FORBIDDEN
```

Jei egzistuoja, išsaugoti esamą statusą.

## B2. Determine exact check name

Patikrinti naujausią main Quality Gates run:

```bash
gh run list --branch main --limit 10
```

Tikslas: required check pavadinimas turi būti tikslus. Tikėtina:

```text
quality
```

arba:

```text
Quality Gates
```

Naudoti realų check context iš GitHub, ne spėti.

## B3. If safe, enable required check

Jei branch protection jau egzistuoja ir API leidžia saugiai pridėti required check:
- neprarasti esamų required checks;
- neprarasti kitų taisyklių;
- tik pridėti Quality Gates check.

Jei branch protection nėra, bet repo politika leidžia ir agentas turi aiškią saugią komandą, galima sukurti minimalų required status check rule tik main branch, bet:
- neįjungti nereikalingų agresyvių taisyklių;
- neblokuoti owner tiesioginių merginimų labiau nei intended;
- final report aiškiai parašyti kas įjungta.

Jei bet kas neaišku:

```text
BRANCH_PROTECTION_MANUAL_REQUIRED
```

Tada sukurti owner instrukciją:

```text
runtime/project-quality/branch-protection-required-check-owner-action.md
runtime/project-quality/branch-protection-required-check-owner-action.html
```

Instrukcija turi būti vieno veiksmo lygio:

```text
GitHub → Settings → Branches → Add rule → main → Require status checks → pasirinkti quality / Quality Gates → Save
```

## B4. Do not block #143 purely because branch protection is manual

Kadangi owner davė leidimą „darom“, jei branch protection negalima saugiai įjungti per API, agentas gali tęsti į PR #143 merge, bet final report turi pažymėti:

```text
BRANCH_PROTECTION_MANUAL_REQUIRED
```

---

# PHASE C — PR #143 PREFLIGHT

Patikrinti:

```bash
gh pr view 143 --json number,title,state,mergeable,baseRefName,headRefName,isDraft,url,statusCheckRollup
gh pr checkout 143
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
scope=i18n inventory/ratchet guard/docs/tests/package scripts only
no actual translations as final
no env/secrets
no DB/migrations
no billing/auth
no production config
no new dependency without owner approval
```

Jei ne:

```text
STOP_MERGE_143_PREFLIGHT_FAILED
```

---

# PHASE D — PR #143 VALIDATION

Paleisti realias repo komandas.

Tikėtina:

```bash
pnpm check:i18n-debt
pnpm check:primary-route-smoke
pnpm placeholders:check
pnpm -F web typecheck
pnpm -F web lint
pnpm -F web build
vitest run
```

Jei script pavadinimas kitoks, naudoti realų ir reportuoti.

Jei failina:

```text
STOP_MERGE_143_VALIDATION_FAILED
```

---

# PHASE E — MERGE PR #143

Tik jei preflight + validation green:

```bash
gh pr merge 143 --squash --delete-branch
```

Po merge:

```bash
git checkout main
git pull --ff-only
git log -1 --oneline
```

---

# PHASE F — POST-MERGE CHECKS

Patikrinti GitHub Actions / Quality Gates:

```bash
gh run list --branch main --limit 10
```

Poll’inti iki success/fail.

Patikrinti Vercel / deployment status, jei prieinamas per checks/status.

Read-only production smoke:

```text
/lt
/lt/for-workers
/lt/for-companies
/lt/pricing
/lt/vision
/lt/auth/login
/lt/onboarding
```

Jokio login.

---

# PHASE G — OWNER-FACING FINAL REPORT

Sukurti:

```text
runtime/project-quality/protect-and-merge-143-final-report.md
runtime/project-quality/protect-and-merge-143-final-report.html
```

Reportas:

```text
# Quality Gate Protection + PR #143 Merge Report

## Branch protection status
## PR #143 preflight
## PR #143 merge result
## Validation
## Production smoke
## i18n debt baseline
## Owner next action
## Safety proof
```

Jei branch protection manual:

- reportas turi turėti aiškią instrukciją;
- owner neturi ieškoti techninių logų.

---

# FINAL REPORT

Final report lietuviškai:

1. Open PR inventory:
   - kokie PR rasti;
   - kurie palikti.
2. Branch protection:
   - before;
   - after;
   - Quality Gates required yes/no;
   - jei manual, report path.
3. PR #143 preflight:
   - state;
   - mergeable;
   - scope;
   - checks.
4. PR #143 validation:
   - i18n debt;
   - primary-route-smoke;
   - placeholders;
   - typecheck/lint/build/vitest.
5. Ar #143 merged:
   - merge SHA;
   - branch deleted yes/no.
6. Post-merge:
   - Quality Gates;
   - Vercel/deploy;
   - production smoke.
7. i18n baseline:
   - DA count;
   - DE count;
   - EN/LT count;
   - top namespaces.
8. Owner-facing report path.
9. Safety proof:
   - no env/DB/billing/auth;
   - no fake translations;
   - no LABMA/Agentai/Vismantas;
   - no outreach;
   - no new dependency.
10. Final state:

```text
QUALITY_PROTECTION_ENABLED_AND_143_MERGED
BRANCH_PROTECTION_MANUAL_AND_143_MERGED
BRANCH_PROTECTION_DONE_143_NOT_MERGED
NO_MERGE
PARTIAL_STOP
```

11. Vienas next owner action be PowerShell.

---

## SĖKMĖ

Sėkmė:

```text
Quality Gates branch protection arba aiški manual instrukcija.
PR #143 saugiai sujungtas, jei green.
DA/DE i18n debt apsaugotas nuo augimo.
Owner žino vieną kitą veiksmą.
