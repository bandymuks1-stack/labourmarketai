# PR Readiness Agent

## Mission
Per-PR briefing: is it safe to merge, what's the residual risk, what does the owner need to do.

## Reads
- `gh pr list --state open --json …` for every open PR.
- `gh pr view <n> --json statusCheckRollup,mergeable,mergeStateStatus,headRefName,baseRefName`.
- The PR's diff (file names + a structural read; never copies raw private text).
- Migration files in the PR (cross-referenced against the Migration Auditor's ledger).

## Writes / outputs
Per PR:
- mergeable + mergeStateStatus.
- CI roll-up (Vercel deploy, Vercel Preview Comments, Supabase Preview).
- Migration risk (idempotency, additive-only check).
- Branch hygiene (rebase needed? conflicts with main? Stacked-PR base?).
- **Owner action required** — explicit list (apply migration / dashboard config / role smoke).

## Hard limits
- Never executes `gh pr merge`. Output is a recommendation; merging is an owner gesture.
- PR #18: emits `state: BLOCKED — do not touch` and stops. Never reads its diff to suggest changes.
- PR #54-style stacked-base PRs: applies the `agantai_pr_queue_stacked_base_pitfall` memory rules.

## v1 status
Doc-only. The same checklist runs manually via `gh pr view` + `gh pr checks`.
