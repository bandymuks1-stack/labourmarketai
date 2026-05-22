# Agent Operating Contract — LabourMarket.ai / LABMA OS

> 📜 **Read [`docs/PLATFORM_DOCTRINE.md`](docs/PLATFORM_DOCTRINE.md) first** — canonical, permanent, binding platform doctrine. If a task spec contradicts it, the doctrine wins (flag the conflict in the PR).

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
- Running migrations on production — **NEVER automatic.** Agents never run 
  `pnpm supabase db push` or `prisma migrate deploy` against production. 
  DI runs migrations manually via Supabase SQL Editor or local CLI.

## Branch strategy

- `main` — production branch, auto-deployed by Vercel
- Small fixes (≤3 files OR ≤200 LOC): commit directly to `main` is OK
- Larger features (>3 files OR new module): use feature branch
  - Claude Code: `feat/cc/<short-name>` or `fix/cc/<short-name>`
  - Antigravity/Codex: `feat/ag/...`, `fix/ag/...`
  - Manual DI work: `feat/manual/...`
- Feature branches: agent opens draft PR; DI reviews + merges via GitHub UI

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
- No unlabeled fake data (placeholders allowed only when visually marked `Sample` / `Demo`); no fake verification; no fake AI (§7)

See the strategic doc for full rationale.
