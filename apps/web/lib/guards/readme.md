# Product readiness guards

Tests under this folder are run by `pnpm -F web test` (vitest picks up
`lib/**/*.test.ts`). They are intentionally coarse and stable:

- They check **critical strings and structure** in source / message files,
  not pixel-perfect rendering.
- They run in `node` (no DOM) so they cannot be coupled to Tailwind / React
  trees — fewer false positives when the design evolves.

## What is guarded

| Guard | Why |
| --- | --- |
| No legacy project name (`LABMA`, `LABMA OS`, `tiler.ai`, …) in `apps/web` UI / copy. | TASK rule §1, §2 — only `labourmarket.ai` naming in the new product. |
| No misleading AI / verification / automation claims in `apps/web/messages/*.json`. | TASK rule §5–§8 — no fake AI, no fake verified, no auto-approval. |
| `ProfileTextFirstFlow` renders **before** the manual chip picker on the profile page. | TASK acceptance — manual selection is the secondary path, never the first one. |
| Journal composer's first labelled field uses the `whatDidYouDo` key. | TASK acceptance — first action is text, not taxonomy. |
| Account roles list references the `preview_workspace` (`RUOŠIAMA`) tag. | TASK acceptance — inactive roles are honestly labelled. |
| Dashboard `<main>` keeps the bottom safe-spacing class. | Mobile UX §3-§4 — bottom nav doesn't cover CTAs. |
| The PR #30 smoke checklist stays `Status: PENDING` until manually flipped. | TASK §11 — production smoke is owner-only. |

If you intentionally change one of these surfaces, update the guard's
expected string at the same time. The guard is meant to make accidental
regressions obvious in CI, not to lock the design forever.
