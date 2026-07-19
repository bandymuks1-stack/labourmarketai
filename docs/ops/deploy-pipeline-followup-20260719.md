# OPS Follow-up — Production Deploy Pipeline (2026-07-19)

**Scope:** deployment pipeline only. Deliberately NOT mixed with any product
workstream (Partner Referral Network, LMC, journal — journal is CLOSED as
`UNIVERSAL_JOURNAL_RECALL_TRUE`; no journal changes without a new reproduced
production defect).

## 1. Incident: PR #838 merge did not trigger the canonical production deploy

- Merges #833, #834, #835, #836, #837 (same day) each auto-deployed
  production within ~3–7 min of the squash-merge.
- **#838** (merged ~17:59 UTC, `main` = `9727974e`): NO production deployment
  was created by the GitHub → Vercel integration. Only the PR-branch preview
  builds existed.
- Mitigation applied: `vercel promote` of the branch preview
  (`labourmarketai-jszuci3rs…`, content byte-identical to the squashed main)
  → apex alias flipped to `dpl_9qe8rvZ4Kz53cLp15cDDcZdk4KWf`. Production now
  RUNS the #838 content; the deployment's git metadata references the branch
  commit, not `9727974e` — the next successful main deploy supersedes this.

## 2. Audit results (read-only, 2026-07-19 ~18:45 UTC)

| Check | Result |
|---|---|
| Repo `vercel.json` / `ignoreCommand` (ignored-build rules) | **absent** — no repo-side skip rules exist; a repo-config defect is RULED OUT |
| Root `.vercel/project.json` linkage | correct: `labourmarketai` / `prj_ZbFhWTGNX3kNP1ztujit9INvlnIC` (root of the canonical clone; gitignored) |
| Project settings (CLI inspect) | Root Directory `apps/web`, Next.js preset, Node 24 — correct |
| Prior same-day merges auto-deploying | yes (5/5 before #838) → integration was healthy until ~17:12 UTC |
| Repository commits | `main` linear, squash-merge like the others — nothing unusual about #838's commit |

**Assessment:** all repo-side causes excluded. The failure is on the
Vercel/GitHub event side (missed webhook delivery or a transient integration
error). **This very docs commit is the live probe**: it lands on `main` and
must trigger a production deployment. Outcome recorded below.

- [x] **Probe outcome (2026-07-19 ~19:05 UTC): NO production deployment within
  12 minutes of the probe commit (`8f977cd1`) — the integration defect is
  CONFIRMED, not a one-off missed event.**

  Additional diagnosis (CLI, same evening):
  - `vercel git connect <repo>` → "already connected" — the Vercel-side link
    is intact; the break is inside the GitHub App event flow.
  - Repo-level webhooks list is empty — expected (Vercel uses a GitHub App
    installation, whose deliveries are not readable with user credentials).
  - A CLI `vercel git disconnect` + reconnect was attempted as remediation
    but is blocked by the local agent permission policy → **OWNER ACTION
    (the one remaining step):** Vercel Dashboard → labourmarketai →
    Settings → Git → **Disconnect** then **Connect** the GitHub repository
    (re-registers the App events). Alternatively check GitHub →
    Settings → Integrations → Vercel App → whether the installation is
    suspended or repository access was narrowed.
  - Until reconnected: after every merge verify a Production deployment
    appears; if not, `vercel promote` the matching CI-built preview (this is
    how #838 and this docs commit are currently served — production content
    is correct and current).

## 3. Binding CLI rule (lesson, also in agent memory)

**Never run `vercel` CLI deploy commands from `apps/web`.** The CLI links a
NEW project named after the cwd. CLI deploys may run ONLY from the canonical
repository root `C:\Users\Mano\Documents\labourmarketai` and only after
`cat .vercel/project.json` shows `labourmarketai`. (2026-07-19: a deploy from
`apps/web` started creating a stray `web` project and burned the free-tier
CLI upload quota for ~24 h; git-based deploys were unaffected.)

## 4. Stray “web” Vercel project — status

Verified 2026-07-19 ~18:45 UTC: `vercel project ls` shows only
`labourmarketai` and `ai-process-automation`; `vercel project inspect web` →
"There is no project" — the aborted upload never finalized project creation.
**No owner cleanup needed.** If a `web` project ever appears in the dashboard
later, delete it — it would be an unlinked accident, never canonical.

## 5. Standing checklist before the NEXT production merge

1. `gh pr checks <n>` green (quality + migration-safety).
2. After merge: verify a **Production** deployment appears
   (`npx vercel ls labourmarketai --prod`, newest row age < ~10 min).
3. If none appears → do NOT re-deploy via CLI upload; use
   `vercel promote <latest matching preview>` or fix the webhook per §2.
