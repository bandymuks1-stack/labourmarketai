# SAFE_CHECKPOINT — 2026-09-05 window 4 (MASTER completion orchestrator, ~19:30 UTC)

> Durable hand-off for the NEXT MASTER. Recover from this file +
> `MASTER_COMPLETION_MAP_2026-09-05.md` + `SAFE_CHECKPOINT_2026-09-05_window3.md`
> (still valid where not superseded here) + git / PR / CI / production.
> Do NOT restart architecture, design, billing, Stripe or repository audits.
> Do NOT redo PROD_PROVEN work. No secrets in this file.

## 0. Coordinates (verified against git / gh / Vercel / production at write time)

| Item | Value |
|---|---|
| `main` | `8928eab1` (#1555). Merged since window 3: #1552 (billing safety migration + code), #1554 (window-3 checkpoint), #1555 (billing-safety applied ledger + post-apply walks). |
| Production | **`8928eab1`** (`/api/health` 19:24 UTC, region `dub1`, auth + db ok). |
| **DEPLOY BLOCK — LIFTED** | The window-3 hand-off recorded the Vercel Hobby deployment rate limit with an expected reset around 2026-09-06 19:00 UTC. It cleared EARLY: `vercel ls` shows Production deployments Ready at 15 / 39 / 60 minutes before this write, and production advanced `f43ce715` → `8928eab1` on its own. **No paid plan was taken and nothing was force-deployed.** M1 stays `EXTERNAL_BLOCKED (intermittent)` — the limit is a recurring condition, not a resolved one. |
| Open PR (GREEN, this window) | **#1556** `fix/cc/drilldown-canonical-demand-v1` (auto-merge armed, squash) — the market drilldown reads the ONE canonical demand (below). |
| Counts | PROD_PROVEN **61 / 75** — UNCHANGED. This window changed no stage count: J1 went figure → full and the money-free legs of #1552 were proven, and both were already inside the 61. Saying 63 would be double-counting. · COMMERCIAL 25 / 30 · SAFE PILOT 33 / 33 |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (unchanged) |

## 1. Queued production proofs — EXECUTED on the served build `8928eab1`

Both scripts are the ones window 3 prepared; neither was rewritten.

### 1.1 `walk-pricing-anon-prod.cjs` → `walk-pricing-anon-8928eab1.log` — **J1 fully PROD_PROVEN**

Anonymous, 1280 desktop + 390 mobile, `/lt/pricing`:
`pricing-price-business` = "99 €/mėn.", `pricing-price-free` = "0 €",
hero "Kainos patvirtintos savininko ir galioja", and the live-state body
"Aktyvavimas vyksta organizacijos paskyroje per saugų Stripe mokėjimą; šiame
puslapyje niekas nenuskaičiuojama." **`staleHits: []`** — the stale line
"Vieši mokėjimai dar neįjungti" that window 3 found is gone on both viewports.
That was the only thing holding J1 at "figure only": **#1549 banner behaviour
→ PROD_PROVEN, J1 → PROD_PROVEN.**

### 1.2 `walk-billing-safety-prod.cjs` → `walk-billing-safety-8928eab1.log` — **#1552 proven without money**

Account state `billingState: stripe_live`, `subStatus: none`, order button present.

| Leg | Observed | Status |
|---|---|---|
| Double-click checkout idempotency | two POSTs to `/api/billing/test-checkout` in a row → both 200; **the same `operationId dd6eec70…`, the same Checkout URL, second `reused: true`**, `testMode: false` | **PROD_PROVEN** |
| Second-tab checkout idempotency | a third request from a separate tab → 200, same operation, same session, `reused: true` | **PROD_PROVEN** |
| Non-admin reconcile is refused | `GET /api/billing/reconcile` as the E2E identity → **403 `not_admin`** | **PROD_PROVEN** |
| Superadmin reconcile 200 report | not exercised — the only production admin is the owner's personal account and an agent never impersonates it | **OWNER_PROOF_PENDING** (batch it, §4) |
| Real settlement | untouched; no card, no €99, no €1 | **EXTERNAL_REAL_CUSTOMER_PROOF_PENDING** |

**Readback (MCP, read-only, 19:27 UTC).** Exactly ONE
`billing_checkout_operations` row exists — `dd6eec70-bed7-4675-bf66-559a890c9e7d`,
scope `organization:a996113c…`, plan `company_pilot`, `status open`,
`test_mode false`, `provider_price_id price_1UCKgg637uptAg5zD8dMA6kU`, session
present, `expires_at 20:10:31 UTC`. So the partial unique index held across
three requests: three clicks, one payable session. `billing_subscriptions` 0,
`payment_webhook_events` 0, `billing_customers` 1. No financial activity.

## 2. FINDING (new, real, NOT fixed by an agent) — a LIVE customer row labelled `test_mode = true`

`billing_customers` holds one row: owner `98212ae5…`, provider `stripe`,
customer `cus_VCmc…`, **`test_mode = true`**, created 2026-09-05 **17:06:44 UTC**
— the same minute as the LIVE Checkout Session `cs_live_a1f1…` of window 2.
That customer was minted in Stripe **LIVE** and is recorded in the **TEST** slot.

* It is **stale data, not a live code defect**: the row predates #1552 (applied
  18:49 UTC). The served `customer-store.ts` now writes
  `test_mode: created.testMode` from the adapter's own report, and
  `findBillingCustomer` filters on the ACTIVE mode — which is precisely why the
  mislabelled row is now invisible to the live path rather than being handed to
  Stripe as a live customer id.
* It is exactly the mislabel the new `(owner_id, provider, test_mode)` key was
  introduced to make impossible going forward.
* **No agent corrected it.** Editing a billing row in production is RED and
  owner-gated, and the honest place for it to surface is the reconcile report.
  Recommended correction, for the owner batch: either `update billing_customers
  set test_mode = false where provider_customer_id = 'cus_VCmc…'`, or delete the
  row and let the live path recreate it. Do NOT do both, and do neither while a
  Checkout Session is open.

## 3. Product work started this window — the market drilldown reads REAL demand

**The priority finding, confirmed and closed in code.** `walk-drilldown-people.log`
(#1555, build `f43ce715`) recorded `rows: 0, empty: true` for all four
geographies. Cause, verified against production: the drilldown loader
`lib/market-map/project-results.ts` still queried **`job_demands`** — 0 rows in
production for its whole life, nothing a customer touches writes it — while the
MARKER above it had been moved onto the canonical demand read
(`customer_requests`) by W10 slice 4, and consolidation slice 1 then deleted the
dead `job_demands` leg from that read. The drilldown was simply never migrated
with them. So every marker built from real employer demand opened onto "there
are no needs here" and depth 2 — the evaluation and the continuation to people —
was unreachable for every real user. The file's own header claimed both surfaces
read the identical rows; that had silently stopped being true.

PR **#1556**, branch `fix/cc/drilldown-canonical-demand-v1` (worktree
`labourmarketai-wt/drilldown-canonical`), commits `7ac95988` + `34fb6cc5`:

* both depths compose `loadCanonicalDemand()`, dedupe first, and apply the same
  geography rule the marker aggregates by — the same rows by construction;
* **no new table, no migration, no second demand model, no widened privilege**:
  the canonical read is the worker-gated RPC plus the caller's own rows under
  existing RLS, so tenant isolation is the tables' own;
* one canonical need is ONE unit — needs are never folded into an invented
  "project"; every field the contract does not carry (organisation, dates,
  skills, status) is declared in `missing`, and each row states its provenance
  (`unitKind`), rendered as a badge;
* copy in all five locales carrying the namespace now says "open need" instead
  of "project" (L1 architecture-vocabulary, the same class as #1553);
* `groupIntoProjects` / `DemandJoinRow` stay as the FROZEN vocabulary for
  project-scoped demand — the extension point is the canonical read, not a
  second reader here;
* two goal-3 guards were **re-anchored, not deleted** ("reads as the signed-in
  user", "reads only OPEN demand" now assert those invariants where they live);
* 12 new pure unit tests + 6 new structural guards; `typecheck` + `lint` green.

**Production walk prepared and NOT yet run:**
`docs/launch/pilot-feedback/walks-2026-09-05/walk-market-drilldown-prod.cjs`.
It proves the whole chain against REAL persisted demand — `customer_requests`
`b0a48f65-6152-40eb-8080-986f87dca211` (LT, "welder", team_size 2, created
2026-09-04 through the proven employer flow, owner
`e2e-walker-202609021438@labourmarket.ai`): marker → depth 1 not empty → the row
IS that canonical id with unit-kind `need` → depth 2 opens → **the people panel
is reachable** → and a second employer identity given the same hand-typed URL
gets `not found` (tenant isolation). Read-only; no residue. Run it with
`EXPECT_BUILD=<sha>` once the PR is merged and served.

## 4. Owner batch (do NOT interrupt the owner for these one at a time)

1. `GET /api/billing/reconcile` as superadmin → confirm zero anomalies (the
   403 for everyone else is already PROD_PROVEN).
2. Correct the `billing_customers` mode mislabel of §2 (one row).
3. Unchanged from window 3: G-12 apply #1430 · G-1 real-inbox signup · G-14
   verify `E2E Walker UAB` · G-15 apply #1436 · `INVITE_EMAIL_*` env · Vercel
   plan decision (M1). First genuine paying customer closes J2(PAID)/J3–J5/K4.

## 5. Residue

Unchanged from window 3, plus: `billing_checkout_operations dd6eec70…` (open,
expires 2026-09-05 20:10 UTC — it lapses on its own, no cleanup needed) and the
LIVE Checkout Session behind it. No card was entered. No row was written by any
walk in this window except that one checkout operation.

## 6. Traps learned this window

- **A recorded external block can clear early.** Window 3 recorded the Vercel
  quota with an expected reset 24 h out; it was gone within the hour. ONE
  `vercel ls` + one `/api/health` read is cheap and is the difference between a
  window of queued proofs and a window of waiting. Check once on resume — do not
  poll.
- **A ratchet can be tripped by a true cognate.** The Dutch badge for a project
  unit is byte-identical to English ("project"), which the untranslated-string
  ratchet reads as an untranslated value. The fix is to make the label carry its
  real meaning in every language ("project need" / "projectbehoefte" /
  "Projektbedarf" / "projekto poreikis" / "проектная потребность"), never to
  raise the baseline.
- **A copy guard matches substrings, not words.** `pricing`-style honesty guards
  ban `/best/i`; the German "Dieser Bedarf **best**eht in …" trips it. Reword
  ("liegt in"), do not widen the guard.
- **A guard that names the shape of a read stops checking anything when the read
  moves.** Both goal-3 authorization guards asserted `.from("job_demands")`-era
  syntax. Re-anchor such a guard onto the module the invariant moved to, and add
  the negative ("this loader keeps no query of its own"), or the rule silently
  retires itself.
