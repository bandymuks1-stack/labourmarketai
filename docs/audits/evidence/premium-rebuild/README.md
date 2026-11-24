# PREMIUM REBUILD — EVIDENCE INDEX

Every entry states its **proof level** and the **SHA** it was produced at.
Evidence from an older SHA cannot close a current gate unless the relevant code
path and deployment are proven unchanged.

| Level | Meaning |
|---|---|
| `local` | local acceptance stack (`127.0.0.1:54321` Supabase, `127.0.0.1:3400` app) |
| `preview` | Vercel preview deployment |
| `production` | `app.labourmarket.ai` |

---

## Current index

| Evidence | Level | Kind | SHA | Status |
|---|---|---|---|---|
| [`goal3-project-evaluation/`](../goal3-project-evaluation/README.md) | `local` | automated + screenshots | `f3e16015` | **current** — code path unchanged at `9c7da373` |
| [`premium-rebuild-w1/`](../premium-rebuild-w1/README.md) | `local` | automated + screenshots | `9c7da373` | **current** |
| `production-smoke.md` | `production` | — | — | **NOT YET PRODUCED** |
| `launch-readiness.md` | `production` | — | — | **NOT YET PRODUCED** |
| `tooling-inventory.md` | — | — | — | **NOT YET PRODUCED** |
| `security-scan-triage.md` | — | — | — | **NOT YET PRODUCED** |
| `accessibility.md` | — | — | — | **NOT YET PRODUCED** |
| `performance-seo.md` | — | — | — | **NOT YET PRODUCED** |
| `open-defects.md` | — | — | — | **NOT YET PRODUCED** |
| `rollback-proof.md` | — | — | — | **NOT YET PRODUCED** |

The "NOT YET PRODUCED" rows are listed deliberately rather than omitted: the
master command requires them, and an absent file is a visible gap rather than a
silent one.

## What has been proven, precisely

### Local, automated, at `9c7da373`

```text
pnpm -F web test        790 files / 0 failing
pnpm -F web typecheck   clean
pnpm -F web lint        0 errors, 22 warnings
```

### Local, authenticated browser, at `9c7da373`

| Suite | Scenarios | Runs | Failed requests | Console errors |
|---|---:|---:|---:|---:|
| Goal 3 project evaluation | 8 | 5 consecutive clean | 0 | 0 |
| Landing repair | 4 | 1 | 0 | 0 |

Identity: `dev.worker@local.test` — a LOCAL fixture user, session minted through
the Admin API against the local stack only. No production account was used and
no real personal data appears in any screenshot.

### CI, at `9c7da373`

`migration-safety` SUCCESS. `quality` running at the time of writing; it failed
at `edcec2fc` with exactly the 7 landing-guard tests that `9c7da373` fixes
(run `30609842472`).

## What has NOT been proven

- **Nothing in production.** Production still runs `752f8b19`.
- No accessibility scan, no Lighthouse baseline, no security scan, no bundle
  analysis, no visual-regression baseline.
- Neither launch gate has been assessed.

## Data classification

All current evidence is:

```text
local deterministic acceptance data in real domain tables;
real authenticated domain queries under RLS;
not production data.
```
