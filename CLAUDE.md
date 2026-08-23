# Agent Operating Contract — labourmarket.ai

> 📜 **Read [`docs/PLATFORM_DOCTRINE.md`](docs/PLATFORM_DOCTRINE.md) first** — canonical, permanent, binding platform doctrine. If a task spec contradicts it, the doctrine wins (flag the conflict in the PR).
>
> 🧭 Prieš planuojant ar įgyvendinant produkto funkcijas privaloma perskaityti
> [`docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md`](docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md).
>
> 🧲 Produkto riba ir vertės smagratis (boundary + flywheel) —
> [`docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md`](docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md)
> (axiom A-13). Joks feature/UX/copy sprendimas negali produkto suvesti į
> "tik job board / tik recruitment / tik CV / tik marketplace / tik ERP /
> tik žurnalas / tik chatbot" struktūrą.

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
- **Running migrations on production — conditional, not absolute.** The former
  "NEVER automatic" rule is superseded (owner decision; canonical policy detail
  lives in [`AGENTS.md` → Migrations → PROD APPLY AUTONOMY](AGENTS.md)). A
  production migration may be applied autonomously **only when ALL** hold:
  repository policy explicitly permits it (it does — see `AGENTS.md`); the
  migration has been reviewed; it is safe/reversible or has a verified recovery
  path; required tests/checks pass; the **correct production target is
  verified**; no destructive/irreversible data loss is involved; and no
  owner-only credential/approval is required.

  **Risky, destructive, ambiguous or irreversible migrations REQUIRE a human
  checkpoint.** Uncertainty is itself a stop signal — reclassification only
  moves in the cautious direction (RED → human review, never the reverse).

  Apply always via Supabase MCP `apply_migration` — **never**
  `pnpm supabase db push` or `prisma migrate deploy` against production (repo
  filenames don't match the ledger versions; a push would re-run applied
  migrations). RED-class migrations stay owner-channel only.
- **Naming (binding, see PLATFORM_DOCTRINE §16):** NEW migrations are named
  `YYYYMMDDHHMMSS_snake_case.sql` (14-digit UTC timestamp prefix). The legacy
  sequential `000N_*.sql` files (`0001`–`0036`) are already applied and
  **frozen** — never rename, renumber, or reformat them. The convention is
  forward-only; timestamp prefixes sort after the `000N` set so order is kept.
- **Reversibility (binding):** every DB-touching migration ships a rollback
  path. `DROP TABLE` / `DROP COLUMN` only after asserting the target has zero
  rows, and must still ship a reversible recreate.

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
- a migration that trips `migration-safety` (unguarded `drop`, missing rollback,
  RLS-loosening — `using (true)` / `to anon` / grant to anon|public, or an
  auth-core change), **including** one marked `-- @human-gate-approved`;
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
- No unlabeled fake data — placeholders allowed only when visually marked as `preview` / `concept` / `not live yet`; the word "demo" is banned from all product copy (doctrine §18, enforced by `lib/guards/product-copy-forbidden-terms.test.ts`); no fake verification; no fake AI (§7)

See the strategic doc for full rationale.
