# Agent Operating Contract — LabourMarket.ai / LABMA OS

> 📜 **Read [`docs/PLATFORM_DOCTRINE.md`](docs/PLATFORM_DOCTRINE.md) first** — canonical, permanent, binding platform doctrine. If a task spec contradicts it, the doctrine wins (flag the conflict in the PR).

---

## Universal Engineering Graph Protocol v1

This repository follows the **Universal Engineering Graph Protocol v1**.
Portfolio reference copy: `C:\Users\Mano\Documents\AI_ENGINEERING_PROTOCOL.md`
(kept local by owner decision). **The version-controlled source of truth for
this product is this file plus `CLAUDE.md` and `docs/PLATFORM_DOCTRINE.md`** —
they stay authoritative wherever they are more specific. The protocol sets a
floor; it never loosens a LABMA rule.

The purpose is not "an agent completed a task". The purpose is **"the system is
demonstrably better, safely, with evidence."**

### Execution graph

```
MISSION → VERIFY REPO → UNDERSTAND → RESEARCH → ARCHITECT → BUILD → INTEGRATE
→ REVIEW → TEST → EVIDENCE GATE → BUSINESS VALUE GATE
→ HUMAN CHECKPOINT ONLY WHEN REQUIRED
→ SHIP → PRODUCTION VERIFY → BUSINESS MEMORY
```

### Repository identity gate — before ANY write

Git is the source of truth. **Never trust** the terminal title, the previous
shell cwd, the directory name alone, previous agent output, conversation
assumptions, or a similarly named repository. This project has dozens of sibling
worktrees and near-identical directory names (`labourmarketai-*`, `lm-*`,
`lmai-*`), so a directory name is **not** identity.

```bash
pwd
git rev-parse --show-toplevel        # must equal pwd
git remote -v                        # must be bandymuks1-stack/labourmarketai
git branch --show-current
git status --short
git rev-parse HEAD
gh repo view                         # when GitHub CLI is available
gh pr status
```

Before branching, verify the base: `git fetch origin` then
`git rev-list --left-right --count HEAD...origin/main` — a local `main` may be
far behind `origin/main`.

For PR work also run:

```bash
gh pr view <PR_NUMBER> --json url,headRefName,headRefOid,baseRefName,state
```

and verify **PR repository == git remote repository**, and — when exact identity
is claimed — **local `HEAD` == the PR's `headRefOid`**. Never claim exact
PR/repository identity without this evidence.

If identity does not match → **STOP** for this repository.

### Repository mission

Build an AI-native European labour/work platform connecting workers, employers,
organizations, opportunities, services, workflows, labour-market intelligence
and AI assistance.

Direction: EU-wide · chat-first · Personal / Organization contexts (later
Project / Object contexts) · real worker and employer journeys · real labour/job
supply · calendar & work scheduling · **evidence-based reputation** ·
Workforce & Organization Simulation · multilingual · GDPR/privacy aware ·
SEO + AI-search visibility · market & competitor intelligence.

- **Reputation: NO star-rating reputation.**
- **Public functionality: visible functionality must actually work.**

### Value gate

**Real worker/employer journeys become measurably more useful.**

Volume is not value. "Job importer executed" is not the outcome — *real current
jobs are visible, correctly attributed, searchable and usable* is. Classify
every outcome as `VALUE_PRODUCED` · `TECHNICALLY_VERIFIED_VALUE_PENDING` ·
`DISCOVERY_ONLY` · `NO_VALUE` · `BLOCKED`.

### Evidence gate and truthful status

`NOT STARTED` · `DISCOVERED` · `DESIGNED` · `IMPLEMENTED` · `TESTED` ·
`DEPLOYED` · `PRODUCTION VERIFIED` · `BUSINESS VERIFIED`

**"Implemented" ≠ "working". "Tests pass" ≠ "business value produced".** Never
call IMPLEMENTED work DONE before the required verification happened. Always
distinguish `FACT` / `ASSUMPTION` / `DECISION` / `HYPOTHESIS` / `EVIDENCE` /
`ARTIFACT` / `OPEN QUESTION` / `RISK` — never silently convert an assumption
into a fact.

### Non-negotiables

1. Verify repository identity before any write.
2. Never expose secrets or private customer data — not in code, logs, error
   messages, commits or reports. Report env vars as
   `NAME | PRESENT/ABSENT | SCOPE`, never the value.
3. Never make purchases, paid API commitments, subscription or billing changes
   without explicit owner approval.
4. Never fabricate production results, jobs, payments, metrics, tests,
   screenshots or database records.
5. Never claim "done" without evidence (command + output, query result, real
   screenshot, CI/PR link, production response).
6. Production-impacting changes require **production verification** after
   landing — build ≠ deployment, deployment ≠ verified behavior.
7. Existing working functionality must not regress; reuse existing architecture
   before creating a parallel system.
8. Human checkpoints are scarce and meaningful — only genuine human-only actions
   (passwords, MFA, CAPTCHA, payment/purchase/subscription, legal acceptance,
   irreversible production actions, major owner product decisions, ambiguous
   repository identity, plus every owner gate defined below). Block that one
   action; finish everything else; request ONE precise action.
9. Never blindly rewrite existing agent instructions — merge.
10. When the working tree holds unrelated dirty or untracked files, staging must
    be **path-scoped** — the `git add .` in the Commit workflow below assumes a
    tree that contains only your slice.

---

## Auto-commit policy

After completing any work session, agents MUST automatically commit and push 
when ALL of the following are true:

### Conditions to auto-commit

1. **Green checks:**
   - `pnpm -F web typecheck` exits 0
   - `pnpm -F web lint` exits 0
   - `pnpm -F web build` exits 0
   - (Markdown/docs-only changes: skip build, run lint if available)

2. **Non-destructive scope:**
   - No `DROP TABLE`, `DROP COLUMN`, destructive data migrations
   - No `DELETE FROM` outside narrow fixture/test scope
   - No removal/loosening of RLS policies (additive RLS is OK)
   - No force-push, no history rewrites
   - No changes to authentication core logic outside the explicit task scope

3. **No explicit hold from DI:**
   - Prompt does NOT contain "do not commit", "no commit", "manual review", 
     "leave uncommitted", or equivalent

If all three hold → commit + push automatically.
If any fails → complete work, report, request explicit DI approval before commit.

### Commit workflow

```bash
git add .
git commit -m "<type>(<scope>): <description>"
git push origin <current-branch>
```

### Conventional Commits format

- `feat(scope): ...` — new feature
- `fix(scope): ...` — bug fix
- `chore(scope): ...` — maintenance, deps, configs
- `docs(scope): ...` — documentation only
- `refactor(scope): ...` — code restructure, no behavior change
- `test(scope): ...` — tests
- `perf(scope): ...` — performance

First line ≤72 chars, present tense, no period. Body (optional) explains WHY.

## Migrations

- Migration files (`supabase/migrations/*.sql`) — **commit and push automatically**
- **PROD APPLY AUTONOMY (conditional — DI decision 2026-06-12).** The old hard
  blocker ("running migrations on production is NEVER automatic") is replaced.
  This is the canonical policy for this repository; `CLAUDE.md` → Migrations
  points here and must not restate an absolute prohibition.
  The executing agent MAY apply a **merged** migration to prod via Supabase MCP
  `apply_migration` when **ALL** hold:
  - (a) classified **GREEN** by the upgraded `migration-safety` patterns
    (= reviewed, non-destructive, no irreversible data loss);
  - (b) strictly **additive/widening** — existing rows and behavior stay valid;
  - (c) a tested rollback script exists at
    `supabase/rollbacks/<same_name>.down.sql` in the same PR;
  - (d) the **correct production target is verified** before applying, and
    immediately after apply, **verify the change on prod via an MCP read
    query and record the verification output in the task log**;
  - (e) reported in the session summary as
    `APPLIED TO PROD: <name> (rollback: <file>)`;
  - (f) no owner-only credential or approval is required to perform it.

  If **ANY** condition fails or is uncertain → **stop and hand off to the owner
  review channel. Uncertainty itself is a RED signal; reclassification only
  goes in the cautious direction (RED → human review, never the reverse).**
  Always Supabase MCP `apply_migration` — **never** `supabase db push` /
  `prisma migrate deploy` (repo filenames don't match the ledger; a push
  re-runs applied migrations).

  **RED remains absolute:** needs-human-gate, owner-channel apply only — no
  self-apply, regardless of the above.
- **Naming (binding, see PLATFORM_DOCTRINE §16):** NEW migrations are named
  `YYYYMMDDHHMMSS_snake_case.sql` (14-digit UTC timestamp prefix). The legacy
  sequential `000N_*.sql` files (`0001`–`0036`) are already applied and
  **frozen** — never rename, renumber, or reformat them. The convention is
  forward-only; timestamp prefixes sort after the `000N` set so order is kept.
- **Reversibility (binding):** every DB-touching migration ships a paired
  `supabase/rollbacks/<name>.down.sql` in the same PR (CI fails otherwise via
  `migration-safety` `missing-rollback-file`). `DROP TABLE` / `DROP COLUMN`
  only after asserting the target has zero rows, and must still ship a
  reversible recreate.

## Merge model — Auto-merge Safety Envelope

**Claude Code controls merge timing.** DI is removed from routine merges; a hard
stop fires only for the irreversible RED class. Two CI checks gate `main`:
`quality` (Quality Gates) and `migration-safety` (static, secret-free, no-DB —
`.github/scripts/migration-safety.mjs`).

**GREEN class → zero-human auto-merge.** Scope = code / docs / tests / additive
or guarded migrations that **pass `migration-safety`** (no RED flags).
- Claude Code opens the PR **only once the slice is fully pushed** (no more
  commits coming). This kills the mid-slice merge race.
- Claude Code then enables **GitHub native auto-merge (squash)**
  (`gh pr merge --auto --squash`). It merges automatically the moment the
  required checks pass. No DI action, no manual merge, no waiting human.

**RED class → hard human gate (no auto-merge).** Any of:
- a migration that trips `migration-safety` — unguarded `drop`, missing
  rollback (in-file or the `supabase/rollbacks/*.down.sql` file),
  RLS-loosening (`using (true)` / `to anon` / grant to anon|public),
  **`SECURITY DEFINER` functions, any `GRANT`/`REVOKE`, `ALTER … OWNER`,
  `ALTER`/`DROP POLICY`, `SET ROLE`, `SET`/`DROP NOT NULL`, a bare
  `DROP CONSTRAINT`, any data `UPDATE`/`DELETE`, `TRUNCATE`,
  `DISABLE ROW LEVEL SECURITY`, `ALTER DEFAULT PRIVILEGES`, `CREATE EXTENSION`,
  `CREATE TRIGGER`, `ALTER TYPE`, or any unrecognized statement shape
  (fail-closed)**, an auth-core change — **including** one marked
  `-- @human-gate-approved`;
- any change to auth-core logic, destructive data ops, new secrets, billing, or
  live outreach.

For RED: do **not** enable auto-merge. Open the PR as **draft**, add the
**`needs-human-gate`** label, and post the **exact migration SQL + RLS policy
diff** in the description for explicit **DI / Chat-Claude approval**. Prod
migration APPLY for RED stays **manual via Supabase MCP `apply_migration` after
approval** — never `supabase db push` (the repo's filenames don't match the
ledger versions; a push would re-run applied migrations).

**The `-- @human-gate-approved` annotation** lets an intentional risky migration
*pass CI*, but it **moves the PR to the RED class** (draft + label + human
approval). It is an acknowledgement, not an auto-merge pass.

**Structural rules always hold** (NOT bypassable by the annotation): §16
filename convention; no reuse of an existing migration version (re-run hazard).

**One-time prerequisites (DI, GitHub UI — see the envelope PR for exact steps):**
repo setting *Allow auto-merge* must be ON, and branch protection on `main` must
require both `quality` and `migration-safety` status checks. Until those are set,
auto-merge is inert and Claude Code falls back to waiting for CI then merging.

## Branch strategy

- `main` — production branch, auto-deployed by Vercel
- Small fixes (≤3 files OR ≤200 LOC): commit directly to `main` is OK
- Larger features (>3 files OR new module): use feature branch
  - Claude Code: `feat/cc/<short-name>` or `fix/cc/<short-name>`
  - Antigravity/Codex: `feat/ag/...`, `fix/ag/...`
  - Manual DI work: `feat/manual/...`
- Feature branches: GREEN-class PRs auto-merge once CI is green (see **Merge
  model** above); RED-class PRs open as **draft** with `needs-human-gate` for DI.

## Policy overrides

DI's explicit prompt instruction always wins. If a prompt says "do not commit" 
or "leave uncommitted for review", that overrides the auto-commit default for 
that task.

## Replaces

This policy supersedes any prior "review-only / no merge / no deploy / no send" 
slice rules. Auto-commit is now the default; manual review is the exception.

## Universal Architecture Migration (May 2026)

Active sequence:
1. **PR #9** — Docs-only architecture & handoff suite (this commit)
2. **PR #10** — Non-destructive universal schema migration
3. **PR #11** — Universal Work Journal UI + API
4. **PR #12** — Living CV Hub + entry-level manager confirmation
5. **PR #13** — Dashboard redesign (Industrial Intelligence aesthetic)

Strategic compass: `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`  
Architecture summary: `docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md`

Non-negotiable principles for the sequence:
- No tiler hardcode
- New worker must start without company / project
- CV is the central living trust object
- No unlabeled fake data — placeholders allowed only when visually marked as `preview` / `concept` / `not live yet`; the word "demo" is banned from all product copy (doctrine §18, enforced by `lib/guards/product-copy-forbidden-terms.test.ts`); no fake verification; no fake AI (§7). Internal fixtures / test / sample data may exist where technically necessary, but stay clearly separated from production truth and are never presented to users as real functionality.

See the strategic doc for full rationale.
