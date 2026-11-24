# CI Quality Gates v1

> Added by PR `ci: run primary route smoke guard in CI`. Companion to
> `docs/quality/primary-route-smoke-dead-ui-guard-v1.md` (PR #136) and
> `docs/quality/merge-136-quality-sprint-v1.md`.

## What this adds

`.github/workflows/quality.yml` — the repo's **first** GitHub Actions workflow.
Before this, CI was Vercel build/deploy + Supabase preview only; there was no
GitHub Actions quality pipeline, so the PR #136 guard ran only locally.

The workflow runs the existing static quality gates on every **push to `main`**
and every **pull request**:

| Step | Command |
|------|---------|
| Typecheck | `pnpm -F web typecheck` |
| Lint | `pnpm -F web lint` |
| Unit tests | `pnpm -F web test` (vitest) |
| Placeholder governance | `pnpm placeholders:check` |
| **Primary route smoke / dead-UI guard** | `pnpm check:primary-route-smoke` |
| Build | `pnpm -F web build` |

## Why it is safe

- **Secret-free.** No `env`/secrets, no DB, no deploy, no billing/auth. The
  build step is env-independent in this repo (it builds with no secrets).
- **Non-authoritative for deploy.** Vercel remains the authoritative build +
  deploy on `main`. This workflow is a *gate*, not a deployer.
- **Read-only `permissions: contents: read`.**

## Guard-on-guard

`apps/web/lib/guards/ci-primary-route-smoke-wiring.test.ts` pins this wiring:
the vitest suite fails if the workflow stops running
`check:primary-route-smoke` / `placeholders:check`, so the CI integration
cannot be silently dropped.

## Next recommended step

Once the owner merges this PR and the first run is green, consider making the
`quality` job a required status check on `main` (GitHub branch protection) so a
red gate blocks merge — owner decision, not changed here.
