# PACKAGE B — PRICING DECISION (owner approval required; nothing here is final)

Status: PRICING = OWNER_GATED. Candidate = docs/commercial/pricing-candidate-v8-2026-08-13.md (DRAFT_PRICING).
Public /pricing today: honest "prices being prepared" — VERIFIED_LOCAL. Nothing purchasable.

## WORKER PLANS (candidate)

| | FREE €0 | AI PLUS €19.99/mo | CAREER+ €29.99/mo |
|---|---|---|---|
| Job search / listings / apply | unlimited | unlimited | unlimited |
| Manual Work Journal | yes | yes | yes |
| Profile + preferred language | yes | yes | yes |
| CV create/import/edit/2 templates/PDF export | yes (proven free in code — no paywall exists) | yes | yes |
| AI CV enrichment / optimization | — | yes | yes |
| AI journal→profile/CV suggestions | — | yes | yes |
| Advanced matching insight | — | yes | yes |
| Career analysis / tailoring / automation | — | — | yes |
| LMC overage | top-ups | top-ups | top-ups |

NOTE (honesty): every AI-differentiated feature currently runs on AI_PROVIDER_MODE=disabled.
Selling AI PLUS before enabling an AI provider would be selling nothing. AI activation
(provider choice + budget) is a prerequisite decision for ANY paid worker plan.

## EMPLOYER PLANS (candidate; daily-operations-first per §0.6/§C8)

| | FREE €0 | START €49 | GROWTH €149 | SCALE/AGENCY €399 |
|---|---|---|---|---|
| Positioning | explore | run daily work | understand + plan | multi/large workforce |
| Morning brief / Today / absences | yes | yes | yes | yes |
| Journal review + windowed reports | limited | yes | yes | yes |
| Org report + capacity/planning zone | — | basic | yes | yes |
| Forecast / workforce intelligence | — | — | yes | yes |
| Team/project scale | 1 org | small | multi-project | multi-org/agency |
| Active inquiries | 1 | 3 | 7 | 15 |
| Searches | 5 | 12 | 25 | 50 |
| Full profiles | 3 | 8 | 15 | 30 |
| Contact reveals | 0 | 2 | 5 | 10 |
| Advanced matches | 2 | 6 | 15 | 30 |
| AI shortlist | 0 | 2 | 5 | 10 |
| Suitability analyses | 0 | 3 | 8 | 15 |

VALIDATION NOTE: allowance jumps are moderate (≈2-3x per tier) — no artificial inflation.
BUT: metering does not exist in code (audit: gateFeature's usage param has no producer).
Publishing numeric allowances before metering ships = unenforceable promises. Metering is a
prerequisite build for allowance-based pricing.

## LMC (candidate)

1 LMC = €1 platform credit. NOT cash/salary/redeemable asset/ownership (LEGAL CONTROL rule).
Top-ups: 10 / 25 / 50 / 100 / 250 LMC. Ledger engine LIVE in prod (23 RPCs, idempotency,
immutability) with ZERO app callers — spending integration is a prerequisite build.

## ECONOMIC SAFETY = NOT_ENOUGH_EVIDENCE

| COST INPUT | KNOWN VALUE | SOURCE | CONFIDENCE | MISSING? | WHY NEEDED |
|---|---|---|---|---|---|
| AI token prices (Anthropic haiku/sonnet/opus) | $1/5, $3/15, $5/25 per MTok | model-pricing.ts (mirrors public 2026-06) | HIGH (list price) | usage volume | per-action AI cost |
| AI per-task budget caps | $0.00–0.20/task | cost-aware routing contract | HIGH (own policy) | real run distribution | worst-case COGS |
| Actual AI spend | €0 (0 runs ever) | usage_cost_events=0, VERIFIED_DB | CERTAIN | real usage | unit economics calibration |
| Local keyless AI chain | €0 marginal | PR #1103 code | HIGH | operator host uptime | free-first cost floor |
| CV extraction | ~€0 (pure JS, compute only) | extract.ts audit | HIGH | Vercel function pricing at scale | free CV sustainability |
| Translation | €0 (no provider) | translation-service.ts | CERTAIN | DeepL char pricing IF enabled | vacancy/message translation cost |
| Email | €0 (not configured) | transactional.ts | CERTAIN | Resend/Postmark tier | invite/notification cost |
| DB/storage | 500 MB used (408 MB = esco_labels) | VERIFIED_DB | CERTAIN | Supabase plan + limits (console) | headroom before paid tier bump |
| Stripe fees | unknown | — | — | fee schedule for LT entity | net revenue per plan |
| Vercel hosting | unknown | — | — | current plan + usage | fixed cost baseline |
| Expected action sizes | unknown | — | — | owner assumptions or beta telemetry | allowance sizing |

EXACT OWNER INPUTS NEEDED: (1) Supabase + Vercel current plan/usage numbers from consoles;
(2) Stripe fee schedule assumption; (3) AI provider decision (local vs paid, budget/month);
(4) expected beta scale (users, AI actions/user/month). Allowances most sensitive to (3)+(4):
AI shortlist / suitability / CV enrichment counts.

## PREREQUISITE BUILDS BEFORE ANY PAID ACTIVATION (from W4-C audit)
1. Metering (usage counters feeding entitlement limits) — MISSING entirely.
2. Enforcement rollout plan — flipping PAYMENTS_ENABLED=true instantly enforces 21 feature
   gates that today return true; without staged rollout this hard-locks the pilot.
3. LMC spend integration (zero callers today).
4. Terms: payment/refund/cancellation/withdrawal clauses (currently absent).
5. AI provider activation for any AI-differentiated tier.
