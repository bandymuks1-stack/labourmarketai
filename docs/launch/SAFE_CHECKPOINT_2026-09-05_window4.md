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

---

## 7. Window 4, later — the drilldown chain walked end to end (addendum)

Written after §1–§6, once #1556 was served. The queued walk did **not** simply
pass: it found a second defect, and it found three bugs in itself. Both are
recorded here because a walk that is trusted rather than read is worth nothing.

### 7.1 The priority finding — CLOSED and PROD_PROVEN

`walk-market-drilldown-prod.cjs` against real persisted demand
(`customer_requests b0a48f65`, LT, "welder", 2, created 2026-09-04 through the
proven employer flow). On the served build every check of the chain passes:

| Check | Result |
|---|---|
| the drilldown is not empty for real canonical demand | **1 row** (was 0 for all four geographies on `f43ce715`) |
| the row IS the canonical `customer_requests` row | same id `b0a48f65…` |
| the row declares its provenance | `unit-kind=need` |
| the employer's OWN role text and headcount | "welder", 2 |
| depth 2 opens on the canonical id | `?project=b0a48f65…` |
| the source statement is honest | "Šaltinis: canonical demand (customer_requests, submitted)" |
| **the people panel is reachable** | renders, carrying the row's real values |
| no raw id leaked back into it | #1553 holds — ordinary words only |
| another tenant's real demand via the worker RPC leg | mason / NL / 40 reachable |
| tenant isolation from a hand-typed URL | 0 rows, `evaluation-not-found` |
| failed requests | none |

### 7.2 The SECOND defect the walk found — a marker no pointer could hit (#1558)

The map flew to a CONSTANT Europe centre/zoom sized for a large map. The
dashboard result map is ~319x288: at that size NL falls inside the viewport and
LT does not, and Leaflet draws an out-of-bounds `circleMarker` as `d="M0 0"`.
Measured stable over 15 s (`probe-anchor-geometry-8be8502c.log`): `NL-approx`
drew `M124,145a18,18 …` in a 36x36 box, `LT-approx` drew `M0 0` in a **0x0** box.
Pointer click timed out with no navigation; keyboard focus + Enter opened the
drilldown.

So the anchor was in the DOM, announced `role="button"` with an aria-label,
focusable and keyboard-activatable — and **no mouse or touch user could open
it**. #1556 made the drilldown RETURN real demand; without #1558 most people
still could not reach it.

**The working keyboard path is why this survived.** Anything that activates the
anchor programmatically passes while every real pointer user is blocked. Only a
genuine pointer click against production exposes it — which is the whole reason
the definition of done is a walk and not a test.

### 7.3 THREE bugs in the walk itself, found by running it

None of these was a product defect. They are recorded because each one would
have produced a confident false claim:

1. **Preflight used `service_role` to read `customer_requests` → `42501`.** That
   grant is deliberately absent (narrow grants are the posture). The row is
   verified out of band through the Supabase MCP instead. Widening a production
   grant to make a read-only walk convenient would have been a real privilege
   change to prove nothing.
2. **Six `eval-*` test ids that have never existed** (`eval-demand`,
   `eval-geography`, `eval-timing`, `eval-organization`, `eval-data-quality`,
   `eval-explanation`), copied from the goal-3 spec. The walk reported every
   section absent while the panel was plainly on screen.
3. **Sections counted too early.** `project-evaluation` is the OUTER wrapper and
   mounts during loading, so the count measured an empty shell. It now waits for
   a control that only exists in the loaded state.

### 7.4 Pre-existing finding — the goal-3 spec asserts test ids that do not exist

The same six names are asserted in `tests/e2e/goal3-project-evaluation.spec.ts`.
None exists in `market-drilldown.tsx`. Because the local Supabase stack cannot
bind on this machine (ports 54290–54389 are in the Windows excluded range), the
spec has not been runnable and nothing ever caught it — it would fail for
reasons unrelated to any of this work. Re-anchored onto ids that exist
(`eval-demand-list`, `eval-anchor-relation`, `eval-visibility`,
`eval-no-judgement`), and the phantom `eval-organization` replaced with the
`eval-missing-field` chip, which is how the gap actually renders.

This is the `E2E selector rot` class: an assertion that can never fail is worse
than no assertion.

### 7.5 Two follow-ups, recorded not done

* **`company_name` is dropped on the floor.** `list_open_demand_for_workers`
  RETURNS `company_name` (verified companies only), and `canonical-demand.ts`
  does not carry it, so a worker-visible need renders its organisation as an
  explicit "nenurodyta" gap even though we are authorised to name it. Withholding
  disclosable information and printing a gap is worse than showing it. It is a
  change to the `CanonicalDemand` contract, so it belongs in its own slice.
* **G-14 dependency on the walk's negative control.** `E2E Walker UAB` has **0
  verified companies**, which is exactly why its LT need reaches the map only via
  the own-rows leg and `e2e-spine-org` cannot see it. If the owner ever verifies
  that company (owner gate G-14), the need enters the worker feed and becomes
  visible to every worker — and the isolation check in this walk would then fail
  CORRECTLY. A future window must not read that as a regression.

---

## 8. Window 4, later still — organisation disclosure, and the deploy block returns

### 8.1 #1560 — MERGED, CI-GREEN, **NOT PROD_PROVEN** (unserved)

`feat/cc/canonical-demand-organization-name-v1` → `32ca306a`. It closes the
honesty gap §7.5 recorded: `list_open_demand_for_workers` already returns
`company_name` for a VERIFIED company, the canonical read dropped it, so a
worker-visible need rendered "organizacija: nenurodyta" for a name the platform
was already authorised to show.

No new privilege and no new query: the value is the RPC's own column, the
employer's own-rows branch contributes `null` (it never borrows the viewer's
active workspace name), and the read still opens exactly one table. Absent stays
absent — null or blank keeps `organization` in `missing`.

The closed key-set guard on `CanonicalDemand` failed as designed and was
**re-stated, not loosened**: what it bans is an identity the read INVENTS;
salary/fit/score/confidence and every contact detail stay banned, and
`companyId` / `profileId` were ADDED to the forbidden list.

**It is NOT PROD_PROVEN.** The walk is prepared and now asserts the disclosure
against a real row — `customer_requests a2ffd425` (mason, NL, 40) whose owner's
company `Labour market ai Sp. z o.o` is `verification_status = 'verified'`, so
the worker leg is entitled to the name. Two checks are armed: the row text
carries that name, and the `organizacija` gap chip is gone for that row.

### 8.2 THE DEPLOY BLOCK RE-ENGAGED (M1, as predicted)

#1560 merged **20:35:02 UTC**. At **20:56 UTC** the newest Vercel Production
deployment was still ~33 min old — i.e. it PREDATES the merge, and no deployment
was created for it. The Hobby rate limit is back, exactly the intermittent
condition §0 warned was "a recurring condition, not a resolved one".

Per the standing directive: no paid plan, no repeated retries, no probing
pushes. #1560 waits for the next served build. Re-run
`walk-market-drilldown-prod.cjs` with `EXPECT_BUILD=<sha>` then — the script's
build guard already refuses to run against the wrong build (it caught exactly
this when production moved from `128db83d` to `da1ba2eb` mid-window).

### 8.3 The completion map has no autonomous P0 item left

Checked all 14 non-PROD_PROVEN items against what an agent can actually close:

| Item | Why it is not autonomous |
|---|---|
| J2 PAID=10, J3, J4, J5, K4 | first genuine paying customer (owner directive: no owner payment) |
| D5 | "decide by real client need; no new object without proof" — needs a real client |
| E4 | owner decision + 0 internship postings |
| E5 | needs ≥5 real accepted learners of one institution |
| I5 | `INVITE_EMAIL_*` env (owner) |
| M1 | Vercel plan (owner) — and the block above |
| M5 | a real recruiter/institution using production |
| L1 | the chip-vocabulary findings are DONE (#1439). What remains is ONE product-semantic OWNER decision: inner-page navigation (A persistent compact workspace strip vs B finder-only) |
| L4 | rolling — "keep checking on every new surface", not a closable item |
| H2 | 1M load validation (V1); a bbox RPC (RED migration, owner gate); page composition (P5, deliberately deferred) |

**H2 composition, measured rather than assumed** (`probe-world-map-da1ba2eb.log`):
`/lt/dashboard/market-map` really does mount **three** Leaflet instances, all
visible, at 1440 and 390. But the third is `location-map.tsx` — a location
PICKER, a different job — so the page is busy composition, not three stacked
market views. The map's own note defers this to P5. Not treated as a broken
chain; recorded so the next window need not re-measure it.

### 8.4 The drilldown's people dead end is COHERENCE, not a broken chain

Worth correcting an earlier reading. The drilldown's continuation still says
"Žmonių paieška dar nepristatyta", which looks like the biggest incomplete
chain. It is not: a real, deterministic, doctrine-compliant matching engine is
already live (`lib/market/match-v1` + `match-team-v1`), and an EMPLOYER-facing
path already composes it — `lib/scouting/scouting.ts` → the `candidates`
workspace result (`?result=candidates&demand=<requestId>`), plus
`/dashboard/company/scouting`. So employer → candidates is reachable and proven
ALREADY; only that one panel dead-ends.

`runScouting` is safe to link to by construction: it requires an employer
workspace and reads OWN demand only (`profile_id = auth.uid()`), so another
tenant's id yields `not-found` and discloses nothing.

**Design note for whoever takes it.** The panel would need to know the row is
the caller's OWN need. That signal belongs on the canonical row
(`ownedByViewer`, true only on the own-rows leg) — and adding it means
`dedupeCanonicalDemand` must MERGE the two authorized views of one demand
(fill a missing `organizationName`, OR the ownership) instead of PREFERRING one
of them, which is what #1560 currently does. Do that deliberately, with the
#1560 tests updated, not as a side effect.

---

## 9. Window 4, close — both slices PROD_PROVEN; the deploy block cleared again

### 9.1 #1560 organisation disclosure — **PROD_PROVEN** on `4ac7f22f`

`walk-market-drilldown-4ac7f22f.log`, **18/18 PASS**. The two new checks:

* the verified company is NAMED — the row reads
  `mason · atviras poreikis · apytikslė vieta · **Labour market ai Sp. z o.o** · NL`,
  where before it read `nenurodyta`;
* the `organizacija` gap chip is gone for that row.

And the honest half held: the employer's OWN LT need still renders
`nenurodyta`, because the own-rows branch has no company column and never
borrows the viewer's workspace name.

### 9.2 #1562 own-demand candidates — **PROD_PROVEN** on `6a5c6030`

`walk-market-drilldown-6a5c6030.log`, **22/22 PASS**. Both halves of the rule,
proven against real rows:

| | own need (`b0a48f65`, the viewer's) | another tenant's need (`a2ffd425`) |
|---|---|---|
| `open-candidates` | **1** | **0** |
| `people-not-yet` | **0** | **1** |
| click | → `?result=candidates&demand=b0a48f65…` | not offered |

So the drilldown now leads somewhere real for the person who owns the demand,
and still says the honest not-yet line to everyone else — because
`runScouting` is scoped to own demand and would dead-end otherwise.

**Readback after both walks:** `customer_requests` 20 (12 submitted) —
UNCHANGED; `billing_checkout_operations` 1 (the expired one from §1.2);
`billing_subscriptions` 0; `payment_webhook_events` 0. The walks are
read-only and left no residue.

### 9.3 Counts — deliberately NOT moved

PROD_PROVEN stays **61 / 75**. Neither slice closes a completion-map ITEM:
both are quality/coherence fixes inside surfaces already counted (L1 / the
proven market chain). Reporting 62 or 63 would be double-counting, which §0 of
this checkpoint already refused once.

### 9.4 The deploy block, twice in one window

It cleared, re-engaged after #1560 merged at 20:35 UTC (§8.2), then cleared
again on its own — production went `da1ba2eb` → `4ac7f22f` → `6a5c6030`
without any intervention. No paid plan, no retries, no probing pushes. M1
remains `EXTERNAL_BLOCKED (intermittent)`; the pattern to expect is minutes-to-
an-hour of stall, not a day. The walk's `EXPECT_BUILD` guard is what makes this
safe to work through: it refused to run twice against a stale build and never
produced a false pass.

### 9.5 What is left, honestly

Nothing autonomous remains on the completion map (the §8.3 table stands). The
whole remainder is the owner batch — superadmin reconcile, the
`billing_customers` stale `test_mode`, G-12/#1430, G-1, G-14, G-15/#1436,
`INVITE_EMAIL_*`, the Vercel plan, the L1 inner-page-navigation decision — plus
the five billing stages and M5, which need the first real paying customer and
the first real recruiter.

**G-14 still interacts with the proof**: `E2E Walker UAB` has 0 verified
companies, which is exactly why its LT need reaches the map only through the
own-rows leg and why both the isolation check AND the new ownership check are
meaningful. If G-14 is closed, that need enters the worker feed; update the
fixture/negative control rather than reading newly lawful visibility as a
regression.
