# RESUME_CHECKPOINT — 2026-09-02, 19:30 UTC (session closed cleanly)

Canonical root `C:\Users\Mano\Documents\labourmarketai`, branch `main`, working tree clean except the
pre-existing untracked folder `docs/audits/evidence/ru-landing-localization/` (not this session's).

| Item | Value |
|---|---|
| `main` SHA | `3dbf5ec4` — docs(final-completion): G-1 corrected (#1443) |
| Production build | `3dbf5ec4` (`/api/health` → `build`), region dub1 — main = prod |
| Production health at close | 200 ×3 after one transient 503 at 19:23 UTC (db probe `http_500`, recovered within 10 s — the documented cold-start class). PostgREST "error" counts were elevated in the 18:40–19:05 windows while CI ran the live anon-SECDEF gate; no user-facing failure observed |
| Open PRs with auto-merge | **#1439** feat(launch): health-probe cron + SMTP procedure + I2 fixes — auto-merge ON, **DIRTY** (register conflict with #1443; guard fix already pushed and CI green on the branch) |
| Open RED drafts (needs-human-gate, no auto-merge) | #1441 Stripe live path (D3) · #1440 worker-board attribution (port of #1046) · #1436 accept-invitation org binding (G-15) · #1433 JSON-LD on /jobs (G-16 waiver) · #1430 companies contact minimisation (G-12) · #1426 work-plan primitive (G-13) · #1421 DB lifecycle pack (G-3..G-6) · #1266 ai_runs de-linking (rebased today, unannotated by design) |
| Inherited drafts, classified | #1355, #1225, #1211, #1166, #1046 (superseded by #1440), #1045, #897, #896, #895 (reject), #883, #740 — table in `OWNER_ACTION_QUEUE_2026-09-02.md` |
| Remote CI / deployments running | none at close: the last runs on `main` (Quality Gates, E2E Smoke, Mobile, CodeQL) and on `feat/cc/launch-consolidation-v1` all completed green; Vercel production is on `3dbf5ec4`; the `health-probe` cron becomes active once #1439 merges |
| Local processes | none: background wait loops stopped, browser preview stopped, no dev server |

## Exact remaining owner gates (see `OWNER_ACTION_QUEUE_2026-09-02.md` for screens and follow-ups)

DO NOW → CORE_PRODUCT_READY: **G-1** = the ONE real-inbox acceptance test (SMTP already live via Resend
team `bandymuks1`; nothing to configure) · **batch** approval "Apply batch 2026-09-02: 1430, 1436, 1426, 1440"
· **G-14** admin-verify `E2E Walker UAB` (the one admin account) · **G-16** one-line waiver approval on #1433.

DO BEFORE COMMERCIAL LAUNCH: **G-7** "Set A" on #1441 · **G-8** Stripe live keys + env token + approve #1441 ·
**G-2** LinkedIn/Meta apps · **I2** inner-navigation decision (A recommended) · **L3** Vercel rollback drill ·
#1266 apply.

SAFE TO DEFER: G-3..G-6 (#1421), G-9 residue cleanup, the remaining inherited drafts.

## First autonomous action for the next session

1. `git checkout feat/cc/launch-consolidation-v1 && git merge origin/main` — resolve the
   `docs/launch/FINAL_COMPLETION_REGISTER.md` conflict by keeping BOTH the §3a target-state block (branch) and
   the corrected G-1 row + change-log entry (main); push; #1439 then auto-merges and the health-probe cron
   starts.
2. Then act on whichever owner report arrived first: G-1 real-inbox result → read Resend event + auth audit
   chain, close G-1; batch approval → apply via Supabase MCP in the listed order with rolled-back proofs;
   G-14 → run `h2-demand-board-proof.mjs`; G-16 → add 1433 to the waiver.
3. Do not re-run any proof recorded in the register; do not generate `e2e-*` mail.
