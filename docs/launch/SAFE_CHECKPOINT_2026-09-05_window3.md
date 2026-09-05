# SAFE_CHECKPOINT — 2026-09-05 window 3 (MASTER completion orchestrator, ~18:45 UTC)

> Durable hand-off for the NEXT MASTER. Recover from this file + `MASTER_COMPLETION_MAP_2026-09-05.md`
> + `SAFE_CHECKPOINT_2026-09-05_window2.md` (window 2, still valid where not superseded here) + git/PR/CI/production.
> Do NOT restart architecture, design, billing, Stripe or repository audits. Do NOT redo PROD_PROVEN work.
> No secrets in this file.

## 0. Coordinates (verified against git / gh / production at write time)

| Item | Value |
|---|---|
| `main` | `34272741` (#1546) ← `97f1817e` (#1548 `public_plans_v1` code) ← `b6a2e7bf` (#1547). Also merged this window: #1550 (ledger), #1551 (window-2 checkpoint). |
| Production | **`97f1817e`** (`/api/health` 18:28 UTC). Docs-only merges after it do not change the served build. |
| Open PRs, auto-merge armed (GREEN) | **#1549** early-access banner live copy — head `567f836c` (copy no longer names the provider: `pricing-public-surface` guard bans it in `conciergeOffer`) · **#1553** L1 drilldown project name (`fix/cc/drilldown-project-name`, `lane-p8-world`) |
| Open PR, RED draft, `needs-human-gate`, auto-merge OFF | **#1552** billing safety invariants v1 — head `a9eb8061`, **CI fully green** (quality, migration-safety, e2e-smoke, mobile, CodeQL). Migration renamed to `20260905200000_billing_safety_invariants_v1.sql` (+ paired `.down.sql`); ratchets 265; main merged in. **Waiting ONLY on the owner's migration approval (§2).** |
| Counts (map §1) | PROD_PROVEN **61 / 75** · COMMERCIAL 25 / 30 · SAFE PILOT **33 / 33** · remaining commercial = J2 PAID=10, J3, J4, J5, K4 = EXTERNAL_REAL_CUSTOMER_PROOF_PENDING |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (unchanged) |

## 0a. UPDATE ~19:05 UTC — apply done, deploy rate-limited

- **#1552 APPLIED + MERGED.** Owner sentence "apply billing safety 2026-09-05" → MCP `apply_migration` → ledger `20260905184921 billing_safety_invariants_v1` → readback verified (FINAL_COMPLETION_REGISTER §4) → #1552 squash-merged `ad50abe0`. #1549 merged `061580d3`, #1553 merged `f43ce715`, #1554 merged `8942e7e5`, #1555 (this record) armed.
- **Production serves `f43ce715` (#1553) and STOPS there.** Vercel commit status on `061580d3`, `ad50abe0`, `8942e7e5`: "Deployment rate limited — retry in 24 hours" (Hobby plan; diagnosis: `gh api repos/<o>/<r>/commits/<sha>/status`). So the live-banner copy (#1549) and the billing safety code (#1552) are MERGED but UNSERVED until ≈19:00 UTC 2026-09-06 or the owner's Vercel plan decision (recorded gate, not re-asked). The migration is applied; the served code (`f43ce715`) still writes `billing_customers` through the legacy path — compatible with the widened key (the column set is unchanged), and no live checkout is expected before the deploy.
- **Next MASTER, first action after the quota resets:** confirm `/api/health` build ≥ `ad50abe0`, then run `walk-billing-safety-prod.cjs` (replay proof + reconcile 403) and `walk-pricing-anon-prod.cjs` (no "neįjungt" text) with `EXPECT_BUILD=<served sha>`; record J1 fully PROD_PROVEN and the checkout-idempotency property PROD_PROVEN.
- **L1 drilldown (#1553):** served, but the market drilldown's project depth reads `job_demands` = **0 rows in production** (canonical demand lives in `customer_requests`), so the people panel is unreachable for any real user — `walk-drilldown-people.log`. Finding for the WORLD lane: the market → projects → evaluation depth is fed by a dead table (map H2 stays PARTIAL for this reason as well).

## 1. Drift found on resume (window 2 → 3) and how it was closed

1. **Every open PR's `quality` job failed** — the LIVE anon SECURITY DEFINER gate saw `public_plans_v1()` anon-executable in production (applied 18:20 UTC) while `main`'s allowlist did not carry it; #1548 (which carries the entry) had run BEFORE the apply (its run said "stale allowlist entry") and also lacked the paired rollback file. Fix: `supabase/rollbacks/20260905190000_public_plans_v1.down.sql` added → #1548 green → merged `97f1817e`; the other PRs were refreshed with `gh pr update-branch` (a plain re-run reuses the stale merge ref and fails again — trap, §5).
2. **#1546 was DIRTY** (conflict in `RESUME_CHECKPOINT_2026-09-04.md`: the activation record vs the acceptance correction) — both hunks kept in time order.
3. **#1549 failed a guard**, not the live gate: `pricing-public-surface.test.ts` bans `/stripe/i` in the `conciergeOffer` namespace; the live-state body said "per Stripe". Copy → "saugiu mokėjimu" (lt) / "by secure payment" (en) / de / nl / ru.
4. **Ledger version note:** MCP `apply_migration` recorded `public_plans_v1` as `20260905175428` (apply time), not the repo prefix `20260905190000`. The billing migration rename to `20260905200000` stands (repo-side uniqueness; nothing on the ledger uses either prefix).

## 2. OWNER GATE — the only owner action this window (RED, security-sensitive migration)

**#1552 `supabase/migrations/20260905200000_billing_safety_invariants_v1.sql`** — apply via Supabase MCP `apply_migration` after approval. Production preflight 18:40 UTC (read-only): `billing_customers` 1 row (constraint `billing_customers_owner_id_provider_key` present, as the migration expects), `billing_subscriptions` 0, `payment_webhook_events` 0, `billing_checkout_operations` absent, `public.is_admin()` present. Executable content:

- `billing_subscriptions` + 5 nullable columns (`last_event_id`, `last_event_created_at`, `provider_price_id`, `unit_amount_cents`, `currency`) — ordering + amount evidence.
- `payment_webhook_events` + `event_created_at` (+ index).
- `billing_customers`: drop unique `(owner_id, provider)` → add unique `(owner_id, provider, test_mode)` — the LIVE-path defect (a TEST `cus_` id reused in LIVE mode) fix.
- New table `billing_checkout_operations` (server-side identity of every Checkout Session request; ONE open row per scope+plan via partial unique index; RLS ON; SELECT policy `is_admin()`; grants: `authenticated` SELECT, `service_role` SELECT/INSERT/UPDATE). No anon grant, no policy loosening, no data touched.
- Rollback `.down.sql` refuses silently destructive reversal (row-count guards) and restores the original key.

After approval: MCP apply → readback (indexes/constraints present) → mark #1552 ready → squash-merge → deploy → prod verification WITHOUT money: `GET /api/billing/reconcile` (superadmin) reports zero anomalies; second "Order" click on an org with an open operation replays the same session. Real settlement stays EXTERNAL_REAL_CUSTOMER_PROOF_PENDING (owner: no €99 payment; €1 smoke only on fresh approval).

## 3. Product proofs this window (do not redo)

| Walk (all in `pilot-feedback/walks-2026-09-05/`) | Build | Result |
|---|---|---|
| `rewalk-spine-gaps-prod.cjs` (kept spine identities) | `b6a2e7bf` 18:24 UTC | G1 company named via the visible label → start hub names it → workspace chip named; G2 project panel + assign control render in the named context → person assigned (`project_worker_assignments 15191226…` active); G3 readiness line names the person (0/7) → "Nurodymas išsiųstas" (`conversation_messages 3a891f65…`, `is_instruction=true`); G4 person brief "Laukia nurodymų: 1", instructions page 1 card naming the project. **A4 → PROD_PROVEN.** |
| `walk-pricing-anon-prod.cjs` (anonymous, 1280 light + 390 dark) | `97f1817e` 18:30 UTC | `pricing-price-business` "99 €/mėn.", `pricing-price-free` "0 €", hero "Kainos patvirtintos savininko ir galioja". Stale line "Vieši mokėjimai dar neįjungti" in the early-access banner → #1549. **J1 figure → PROD_PROVEN.** |
| `walk-instruction-reply-prod.cjs` | `97f1817e` 18:31 UTC | person "Paprašyti patikslinti" → "Prašymas išsiųstas" + thread link; reply row `642cc52f…`; manager readiness line "… · atsakė 2026-09-05: „Nesupratau nurodymo, prašau patikslinti.“"; thread shows it. **I3 gap link 5–6 → PROD_PROVEN.** |

The walk defect of window 2 (`L1_org_company_setup` timeout) was a WALK artefact: Playwright clicked the `sr-only` radio input; a person clicks its label. Not a product defect.

## 4. Residue (kept as evidence; delete only if the owner asks)

Spine identities unchanged (`e2e-spine-org-202609051508@…` profile `03e1861f…`, `e2e-spine-person-202609051508@…` profile `70851a66…`). New rows this window: company `acbdf51a…` now NAMED "E2E Spine UAB (testinis)" (construction, `active_unverified`); assignment `15191226…` (project `e6af0df4…` draft, worker `c83fd3d3…`); conversation `3de3c080…` with instruction `3a891f65…` and reply `642cc52f…`; pilot_events incl. `project_assigned`, `organization_created` (fired on naming an existing company row — telemetry observation, not chased). Window-2 residue (Checkout Session `cs_live_a1f1…` expiring 2026-09-06 17:06 UTC, live customer `cus_VCmctzUiZ8NDw4`) unchanged.

## 5. Traps learned this window

- `gh run rerun --failed` re-executes against the ORIGINAL merge ref, so a PR whose failure came from `main` moving (live catalog gate) fails identically; use `gh pr update-branch` (new synchronize event).
- MCP `apply_migration` names the ledger version by apply time; repo filenames are a repo-side convention only.
- The `conciergeOffer` namespace guard bans the provider name even in honest live-state copy — say "secure payment".
- `pull_request` docs-only PRs still run the live secdef gate; a production apply without the allowlist entry on `main` reds EVERY open PR until the allowlist PR merges — merge the allowlist PR first next time.

## 6. NEXT ATOMIC ACTIONS (in order)

1. Owner approval for §2 → MCP apply → readback → #1552 ready + merge → deploy → reconcile route + replay proof.
2. When #1549 + #1553 are served: anon `/lt/pricing` re-walk (no "neįjungt" text) → J1 fully PROD_PROVEN; World drilldown people panel shows the project title (L1 finding closed).
3. Remaining PARTIAL: D5 (needs a real client), E4 (owner decision), E5 (≥5 learners), H2 (1M validation), L1 chips (I2), L4 (rolling).
4. Owner gates unchanged (not re-ask): G-12 apply #1430, G-1 real-inbox signup, G-14 verify `E2E Walker UAB`, G-15 apply #1436, `INVITE_EMAIL_*` env, Vercel plan. First genuine paying customer closes J2(PAID)/J3–J5/K4.
5. Worktrees: `lane-p5-employer` (#1552), `lane-p4-field` (#1549), `lane-p8-world` (#1553), `lane-docs` (this branch), `master-orch` (on `docs/cc/no-owner-payment-strategy`, untracked walk screenshots — evidence, not committed). Main checkout still on `feat/cc/stripe-live-activation-draft` with the two harness files dirty (never commit).
