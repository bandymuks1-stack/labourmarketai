# Labourmarket.ai — 30 / 60 / 90 Day Plan v1

**Date:** 2026-07-22 · **Baseline HEAD:** `664b9ab9`
**Sources:** `docs/audits/labourmarketai-*-v1.md`, `docs/plans/labourmarketai-delivery-loops-v1.md`

---

## The strategic fact this plan is built on

Production carries **27 people, 27 workers, 6 companies, 17 demands, 2 conversations, 5
projects**. Against that, the repo ships **115 page routes** (≈80 under `/dashboard`),
**161 migrations**, **205 `SECURITY DEFINER` functions**, and **129 RLS-enabled tables**.

The build is one to two orders of magnitude ahead of validated demand. LOOP 4 measured the
same pattern inside the product: **7 of 11 registered AI agents and 5 of 6 recognition
helpers have zero production callers**; ESCO is loaded at **1,045,186 labels** and wired to
nothing (`esco_uri` is NULL on 100% of the 202 local rows); `market_rate_averages` has 0
rows, so a salary card on two dashboards is permanently "insufficient data".

**Therefore this plan does not add scope for 60 days.** The 30- and 60-day phases make what
exists true, safe and understandable. New capability resumes at day 60 only where a real
user is blocked.

---

## Days 0–30 — Make it safe, honest and comprehensible

**Goal: eliminate P0s, fix the highest-value P1s, and make the first visit make sense.**
Nothing in this phase requires new product surface.

### Week 1 — safety and legality (blocking)

| Item | Loop | Gate |
|---|---|---|
| Enable leaked-password protection; OTP ≤ 1 hour | L11 | **Owner, ~15 min, dashboard only** |
| Close the anonymous authorization bypass (7 RPCs) + revoke 54 stray `PUBLIC` grants | L0 | **Owner — RED migration** |
| Privacy notice + terms + consent at signup | L1 | Owner (legal wording) |
| Cookie consent, and retention copy corrected to match reality | L2 | Owner (legal wording) |

L0 must land before any commercial pilot writes a contract, proposal or marketplace
listing. Blast radius is zero today only because those tables are empty.

### Weeks 2–3 — trust and comprehension (four small PRs, no gates, no migrations)

| Item | Loop | Effort |
|---|---|---|
| Delete the fabricated hero counters (312 shown vs 27 real) | L3 | S |
| Align the landing copy with what matching actually does | L5a | XS |
| Sector breadth — surface the 31 hidden professions; de-construction the landing list | L4 | S |
| Field examples, starting with the free-text field that drives the draft | L10 | S |

These four together answer **all five** pieces of owner-supplied tester feedback. They are
config, copy and one component deletion. They are the cheapest real improvement available.

### Week 4 — truth in the product's own claims

| Item | Loop |
|---|---|
| Skill provenance honesty: stop auto-writing unconfirmed skills as `self_declared`; fix the decorative confidence dot; fix the raw i18n keys rendering on the CV | L6 |
| Repo/doc hygiene: reconcile `CLAUDE.md` vs `AGENTS.md`, fix the stale `DEPLOYMENT.md`, commit `.env.example`, close 8 stale PRs | L13 (partial) |

### Also in the first 30 days — measurement, because none exists

Instrument the funnel: landing → signup → completed profile → CV upload success → first
recognised skill → demand posted → first suitable candidate → application → company
contact. Segment by device, language and role. **Collect no personal data for analytics
beyond what the funnel requires** — and note this depends on L2 (consent) shipping first.

Add real user monitoring for LCP/CLS/INP. There is currently **no field performance data
at all**, which is why the mobile findings in LOOP 2 are stated as circumstantial.

### 30-day exit criteria

- Zero P0 open.
- No public page renders an invented number.
- The landing, pricing and match-preview pages make the same claim about matching.
- A non-manual employer can express their need without choosing "other".
- Signup shows privacy and terms and records consent.
- The funnel is measurable end to end.
- **Explicitly NOT a goal:** enabling payments.

---

## Days 31–60 — Prove the loop works for real people

**Goal: make one complete journey demonstrably work, for a handful of real users, in more
than one sector.** Depth over breadth.

1. **Authenticated journey verification.** This audit could not test a single logged-in
   path (no credentials). Establish disposable worker and company accounts and drive the
   full journeys — registration → profile → CV import → work history → skill recognition →
   evidence → search → application; and demand → draft → candidates → contact. Anything
   that fails becomes the priority queue. **This is the largest remaining unknown in the
   entire audit.**

2. **Erasure and retention actually execute** (L7). Ships dry-run first, then live, against
   disposable accounts only. Owner-gated per run.

3. **Commercial contract coherence** (L8): one plan taxonomy, prices that map to
   entitlements, and Terms that contain payment, renewal, cancellation, refund and
   withdrawal clauses. Decide whether the €600–€1,900 AI-automation packages belong on this
   domain at all — today they are the only real prices on the site and they map to nothing.

4. **Entitlement enforcement** (L9), including the paused-subscription grace defect and
   the re-subscription upsert collision. **Payments stay off.** Turning Stripe on before
   this would take money and grant nothing.

5. **Cross-sector recognition, but only where a real user is blocked.** LOOP 4 executed the
   recogniser against 30 inputs: teaching (LT+EN) → 0, CNC/manufacturing → 0, hospitality
   "mise en place / 80 covers" → 0, video editing → 0, "refactored the payment service" → 0,
   nursing in EN and RU → 0; plus two active false positives ("photographed a **wedding**"
   → `welding-blueprint`, "**picked** 240 orders" → `packaging`). Fix the false positives
   first — they are worse than silence — then extend the lexicon for the sectors that
   actual pilot users bring.

6. **Mobile.** Act on the RUM data from phase 1 rather than on assumption.

7. **Automated regression** over the core journeys, so phase-1 gains cannot silently
   regress.

### 60-day exit criteria

- Both primary journeys demonstrated end to end in production, with evidence, in at least
  two different sectors.
- Erasure verifiably works.
- One coherent commercial contract exists on paper and in code — still not activated.
- No known false-positive skill attribution.

---

## Days 61–90 — Earn the European claim, then consider revenue

**Goal: evidence-based readiness, not new surface.**

1. **Decide the geography claim honestly.** The product says "Europe"; the need form serves
   10 Northern-European countries and the demand recogniser's location regex knows 10.
   Either extend the coverage or state "Baltic & Northern Europe" and own it. Do not leave
   the promise and the form disagreeing for another quarter.

2. **Evidence-weighted matching** (L5b) — the real version. Only now, and only if phase 2
   produced enough real skill records for the result to be measurable. In the same loop:
   revive or delete the dead Haversine distance code (geography is currently country string
   equality); score documents, permits and visas (never scored today, despite cross-border
   EU labour being the core use case); and add a proportionality gate to the hard language
   block, which is a nationality-proxy discrimination risk as it stands.

3. **ESCO: use it or park it.** 1,045,186 labels are loaded and connected to nothing. Wire
   `esco_uri` on the 202 local rows, or explicitly park ESCO and stop paying its cognitive
   cost. Do not leave it half-built for another quarter.

4. **Agencies, education and institutional partners.** Today agencies exist in navigation
   with 3 rows and there is no education path at all. Before building: confirm with one
   real agency and one real institution what they actually need. **Do not build an EURES or
   institutional integration on speculation** — that is exactly the pattern that produced
   80 dashboard routes for 27 users.

5. **Commercial gate — the decision point.** Only after L8 and L9 are complete may payment
   activation be considered, and it is an explicit owner decision. Worker Plus at
   49.98 EUR/month is **not configured anywhere**: the number occurs exactly once in the
   repo (`docs/product/lmc-commercial-system-train-v1.md:249`), as an intermediate
   `24.99 × 2` in a table labelled "NOT FINAL", attached to plan key `vip_media`, not
   `worker_plus`. It must not be treated as decided.

6. **LMC and the referral network — specification only.** The ledger is live in production
   (10 tables, 18 RPCs), all balances 0, all 6 flags false, and **zero application code
   touches it**. Critically, an exhaustive search of all 11 message files found **no
   user-facing LMC string at all** — no wallet, balance, invite, earning, payout or
   withdrawal text exists. **That is the correct state and it must be preserved.** Nothing
   about payouts or withdrawal may be communicated as an available capability.
   Before any activation, three gaps must close: there is no referral-relationship table,
   no `referred_by` column and no depth constraint, so the "single direct relationship, no
   MLM" rule is documentary only; the lot-expiry CHECK exempts `referral_reward`, permitting
   perpetual liability; and `lmc_expire_lots_v1` has no caller, with no liability report.
   At 1 LMC = 1 EUR these are financial exposures, not cosmetic ones.

### 90-day exit criteria

- Product readiness claims are backed by measured funnel data, not assertion.
- Matching explains itself using real evidence, or the product stops claiming it.
- The commercial model is coherent, legally complete, and consciously either activated or
  deliberately deferred.
- LMC has a written technical specification and still no misleading payout communication.

---

## Standing constraints for all three phases

1. One loop, one outcome, one PR. Never mix UX redesign, migration, Stripe, AI-model and
   refactor changes.
2. Migrations to production remain owner-gated. Note `CLAUDE.md` and `AGENTS.md` currently
   give **opposite** instructions here — reconcile them in phase 1 (L13) before relying on
   either.
3. No feature is called "working" until it has been exercised on a real user journey in
   production.
4. No copy may promise a capability the system does not have. This is the single most
   frequently violated rule in the current product and the root of most P1 findings.
5. Do not build for the agency, education or institutional segments until a real
   counterparty has stated the requirement.

---

## The one-line version

**Thirty days to stop the product from saying things that are not true, sixty to prove one
journey works for real people, ninety to decide — on evidence — whether to charge for it.**
