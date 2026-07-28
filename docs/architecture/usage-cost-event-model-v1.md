# CANONICAL USAGE & COST EVENT MODEL V1 — PLATFORM TELEMETRY ARCHITECTURE

| Field | Value |
|---|---|
| Status | **BINDING.** The single canonical event model for the whole platform |
| Contract | `apps/web/lib/telemetry/usage-cost-event-model.ts` (types + registries + shape validation only) |
| Enforced by | `apps/web/lib/guards/usage-cost-event-model.test.ts` (CI) |
| Scope | Contract (PR #898) + **first storage layer (PR #899)**: table, RLS, append-only write path, idempotency, Business Health read model. Still **no emitters, no scheduler, no webhook, no UI** |
| Storage | `supabase/migrations/20260728120000_usage_cost_events_v1.sql` · rollback `supabase/rollbacks/20260728120000_usage_cost_events_v1.down.sql` |
| Write path | `apps/web/lib/telemetry/usage-cost-store.ts` (server-only, append-only) |
| Read model | `apps/web/lib/commercial/business-health-read.ts` (read-only, no rollups) |
| Created | 2026-07-28 · branch `feat/canonical-usage-cost-event-model-v1` |
| Feeds | `docs/product/business-health-engine-v1.md` — the 26 metrics that today have no source |

## Purpose

Not another telemetry system. **One canonical event model** that is the single
source of truth for usage, cost, revenue, LMC, AI and every Business Health
calculation for the next 5–10 years — designed so that adding a supplier, a
service, a measure or a product line **does not require a migration**.

---

## PART 1 — ARCHITECTURE AUDIT (done before any design)

Verified against the live codebase and production database on 2026-07-28.

| Layer | What it actually is | Consequence for the model |
|---|---|---|
| **Workspace** | **NOT a table.** No `workspaces` table exists. The canonical workspace (`ExecWorkspace`, rebuild W4) is `{ organizationId: string \| null }`, resolved server-side from the `engagement_contexts` spine + the active-organization pointer; `null` = personal workspace | `workspace_id` must be a **derived string** (`personal:<profile_id>` / `org:<organization_id>`), never a foreign key. Inventing a workspaces table would have created a second identity spine for the whole product |
| **Context Intelligence** (#892) | Pure deterministic composition over rows already read under the caller's RLS. No store, no IO, no LLM | The event model must stay equally pure at the contract layer, and must never become a second read path |
| **Commercial System** (#895) | One canonical catalogue; plans, top-ups and micro-features carry stable codes | `feature_code` reuses that code space — this is what makes per-feature margin possible |
| **Business Health Engine** (#897) | 39 metrics defined, **0 computable**; 26 blocked purely by missing collectors | The model's success criterion is precise: it must feed exactly those 26 |
| **LMC** | Immutable ledger, 18 SECURITY DEFINER RPCs, balances derived, append-only, RPC-only writes | Events may **point** at LMC transactions; they may **never** restate an amount or become a second balance source |
| **Stripe** | Provider seam, test-only, no account configured, 0 subscriptions | Revenue events are a pointer to `billing_subscriptions` / invoices, not a copy |
| **`pilot_events`** | **Live, 328 rows.** Server action with an allowlisted metadata key set, 200-char value caps, 2 KB serialized limit, server-derived `profile_id`, bounded scalars | The strongest asset in the audit: its **privacy contract is reused verbatim**. It stays the product-analytics pipe; it is not extended into a cost pipe |
| **`finance_records`** | Applied, 0 rows, manual EUR-cent invoices/payments | Stays the manual revenue store; events link to it, never duplicate it |
| **`payment_webhook_events`** | Applied, 0 rows, `unique(provider, event_id)` idempotency | The idempotency pattern this model copies for `event_id` |
| **`subscriptions`** (legacy) | 0 rows, 0 code references | Dead. Not a source, not a target |
| **`profiles`** | 31 rows, PK = `auth.users.id` | The only user identity; `user_id` is a `profiles.id` and is **always server-resolved** |

### Verdict on PR #754 — reject the schema, keep the doctrine

| #754 element | Verdict | Why |
|---|---|---|
| `usage_events` attributed to `profile_id` only | **REJECT** | No organization, no workspace, no feature, no session → per-feature and per-plan margin are impossible, which is the entire point |
| `cost_usd` | **REJECT** | The commercial system, every plan and the LMC peg are **EUR**. A USD column would need conversion at every read, with a rate nobody stores |
| `ai_runs` separate from `usage_events` | **REJECT** | Two sources of truth for one question. #754's own doc admitted the split ("no double-write drift") and then shipped the split anyway |
| 9 categories as a DB CHECK constraint | **REJECT** | A new provider or service = a **migration**. This is the single biggest reason the old model cannot last 10 years |
| `credit_types` (`ad_credits`, `ai_credits`) | **REJECT** | Superseded by the single LMC unit (train doc §3.1 row 9) |
| `credit_balances` (mutable) | **REJECT** | Balances are derived, never stored — the LMC ledger settled this |
| Append-only, UPDATE/DELETE revoked from every role | **REUSE (doctrine)** | Correct and adopted |
| Bounded metadata, rejected past a size limit | **REUSE (doctrine)** | Correct and adopted, aligned with the live `pilot_events` caps |
| "Never fabricate a cost — null when unknown" | **REUSE (doctrine)** | Adopted and **strengthened**: a usage event may not claim `0` without saying why |

**Nothing from #754 is restored. Its schema is not revived, its tables are not
created, its migrations stay unapplied.**

---

## PART 2 — THE CANONICAL EVENT

One shape for AI and non-AI, usage and cost, product and revenue.

| Field | Type | Notes |
|---|---|---|
| `event_id` | uuid | Client- or server-minted; **doubles as the idempotency key** (same pattern as `payment_webhook_events`) |
| `occurred_at` | timestamptz | When the action happened, not when it was stored |
| `event_type` | enum | `usage` · `cost` · `revenue` · `activity` — the **only** closed vocabulary, because it decides interpretation |
| `provider` | text (≤64) | `anthropic`, `openai`, `supabase`, `mapbox`, a 2031 vendor — **data, not a constraint** |
| `service` | text (≤64) | `llm_completion`, `ocr`, `email`, `storage`, … — data |
| `resource` | text (≤128, nullable) | model id, bucket, template, endpoint |
| `status` | enum | `success` · `error` · `partial` · `rejected` — `partial` exists because a half-finished AI call still costs money |
| `workspace_id` | text (derived) | `personal:<profile_id>` / `org:<organization_id>` — never a FK |
| `user_id` | uuid (nullable) | `profiles.id`, **server-resolved**, null for anonymous/system |
| `organization_id` | uuid (nullable) | null in a personal workspace |
| `session_id` | text (≤64, nullable) | bounded, rotating, never a device fingerprint |
| `feature_code` | text (≤64, nullable) | the canonical catalogue code |
| `plan_key` | text (nullable) | the plan in force at event time |
| `payer` | enum (nullable) | `worker` · `company` · `agency` · `platform` (`platform` = subsidised) |
| `measures` | sparse object | Part 3 |
| `cost` | object | Part 4 |
| `revenue_link` | object (nullable) | Part 5 |
| `metadata` | bounded map | allowlisted, ≤24 keys, ≤200 chars per string value, ≤2 KB serialized |
| `schema_version` | int | so a reader can adapt without a migration |

---

## PART 3 — USAGE MEASURES

`requestCount` · `durationMs` · `tokensInput` · `tokensOutput` · `characters` ·
`bytes` · `storageUsedBytes` · `files` · `images` · `pages` · `objects`

Every measure is **optional and additive**. An AI call fills tokens; an OCR job
fills pages and files; an upload fills bytes. A new measure (say `frames`) is a
new optional key — **not a schema change**. This is why the storage
recommendation in Part 10 is one JSONB column, not twelve numeric ones.

---

## PART 4 — COST

| Field | Meaning |
|---|---|
| `currency` | **always `EUR`** — enforced by the contract |
| `estimatedCents` | what we believed it cost at event time. **`null` = unknown, never `0`** |
| `actualCents` | what it actually cost once reconciled against a supplier invoice |
| `pricingVersion` | the rate card used for the estimate — makes a repricing auditable |
| `supplier` | who will invoice for it |
| `billingSource` | `estimated_from_price_list` · `supplier_reported` · `supplier_invoice` · `allocated` |

**The rule that protects every margin above this layer:** a `usage` event may
**not** claim a cost of exactly `0` with no `billingSource`. Free things exist —
but they must say *why* they are free (`allocated` + a pricing version).
Otherwise an unmeasured cost silently becomes a measured zero, and every margin
computed on top of it is wrong in the flattering direction. Guard-asserted.

---

## PART 5 — REVENUE LINK

`subscription` · `plan` · `invoice` · `payment` · `topup` · `lmc_debit` ·
`lmc_credit`

A revenue link is a **pointer** — `{ kind, ref }`, exactly two fields, no
amount. The amount stays in its own canonical store (`billing_subscriptions`,
`finance_records`, `lmc_transactions`). Restating it here would create a second
financial truth, which is precisely what the LMC ledger forbids.

---

## PART 6 — ATTRIBUTION

Every event is attributable to **workspace · feature · owner · payer**, and
therefore to a Business Health metric. Attribution is **always resolved
server-side**: a client-submitted event carrying a `user_id` or
`organization_id` is refused (`client_supplied_identity`), the same rule the
live `pilot_events` action already enforces.

The commercial-feature link (`feature_code`) is what turns telemetry into
economics: without it, cost can be totalled but never blamed.

---

## PART 7 — AI AND NON-AI IN ONE SHAPE

**AI** — OpenAI · Anthropic · Gemini · Mistral · DeepSeek · local models · any
future supplier. Provider and model are `provider` + `resource`, both data.
Adding a vendor is a string, not a migration. Guard-asserted with an
explicitly unknown vendor.

**Non-AI** — OCR · Search · Maps · CV Import · File Upload · Storage · Email ·
SMS · Push · Video · Voice · API · Automation · Background Jobs. Same shape,
different `service` and different measures.

---

## PART 8 — EVENT PRINCIPLES

1. **One action = one event.**
2. **Never duplicate** — `event_id` is the idempotency key; a retry writes the same id.
3. **Never aggregate at write time** — aggregates are computed later, from rows.
4. **Never hide** — a failed or rejected action is still an event, because it may still have cost money.
5. **Immutable** — append-only; no UPDATE, no DELETE (the LMC ledger pattern).
6. Reconciliation adds a **new** `cost` event, it never rewrites the original.

---

## PART 9 — HOW IT FEEDS THE BUSINESS HEALTH ENGINE

| BHE metric | Derived from |
|---|---|
| `cost_ai` · `cost_storage` · `cost_api` · `cost_email` · `cost_ocr` · `cost_maps` · `cost_search` · `cost_voice` · `cost_video` | `sum(cost)` filtered by `service`, grouped by `feature_code` |
| `cost_infrastructure` | `event_type='cost'` with `billingSource='supplier_invoice'` |
| `cost_total` · `acpu` | all events in the period; ÷ distinct `user_id` |
| `top_cost_features` · `top_ai_consumers` · `top_revenue_features` | grouped by `feature_code` / `workspace_id`, ranked |
| `revenue_subscription` · `revenue_topup` · `mrr` | `event_type='revenue'` via `revenue_link` |
| `gross_margin` · `contribution_margin` | revenue events − usage/cost events, by feature |
| **Forecast** | rows are time-series by construction: run rate per feature/plan over N periods |
| **Health Score** | unlocks once cost + revenue components become computable |
| `lmc_spent` | `revenue_link.kind='lmc_debit'` **joined** to the ledger (pointer only) |
| **LMC liability** | **unchanged — stays derived from the LMC ledger, never from events** |

`cost_referral` also stays ledger-derived: a referral reward is a ledger entry,
not a metered consumption. Deriving it from telemetry would let a missing event
understate a real liability.

**This model closes 26 of the 26 metrics the Business Health Engine currently
cannot compute** — every one except those that must remain ledger-derived.

---

## PART 10 — STORAGE (IMPLEMENTED — PR #899)

**Applied to production.** One table was enough, exactly as designed:

```
usage_cost_events
  event_id          uuid primary key          -- idempotency
  occurred_at       timestamptz not null
  event_type        text not null             -- 4-value CHECK (safe: closed by design)
  provider          text not null             -- NO constraint (data)
  service           text not null             -- NO constraint (data)
  resource          text
  status            text not null             -- 4-value CHECK
  workspace_id      text                      -- derived, not a FK
  user_id           uuid references profiles(id)
  organization_id   uuid references organizations(id)
  session_id        text
  feature_code      text
  plan_key          text
  payer             text
  measures          jsonb not null default '{}'   -- sparse; new measures need no DDL
  cost              jsonb not null default '{}'   -- estimated/actual/version/supplier/source
  revenue_link      jsonb                          -- {kind, ref} pointer only
  metadata          jsonb not null default '{}'   -- allowlisted, bounded
  schema_version    int  not null default 1
```

Plus, later and only if measurement proves it necessary: **one** rollup table
(`usage_cost_daily`) that is a pure derivation and can always be rebuilt from
the events.

Everything else stays where it is. `pilot_events` is **not** merged into this —
product analytics and cost accounting have different retention, different
privacy exposure and different consumers.

### Why this reduces future migrations

| Change | Old model (#754) | This model |
|---|---|---|
| New AI vendor | migration (CHECK) | **none** — a string |
| New service (SMS, video) | migration | **none** |
| New measure (frames, minutes) | migration (column) | **none** — a JSONB key |
| New product line | migration | **none** — a new `feature_code` |
| Reprice a supplier | migration or silent rewrite | **none** — a new `pricingVersion` |
| Add a revenue link kind | migration | one enum value in the contract |

Estimated migrations avoided over a 5-year horizon: **the large majority of
telemetry schema changes**, because the two axes that actually churn — who
supplies a service and what is measured — are both data.

---

## PART 11 — AGENTS / FUTURE USE (no extra tables)

The same rows serve, without new storage:

- **Agents OS** — an agent's actions are events with `service='automation'`; its cost is attributed like any other.
- **Demand Intelligence** — `activity` events by feature and workspace show what the market actually does.
- **Recommendations** — the same time series is the behavioural signal.
- **Anomaly detection** — a per-workspace rate/cost baseline over the same rows.
- **Fraud** — abnormal consumption per account, and LMC spend patterns via `revenue_link`.
- **Learning** — `status='error'` + `partial` events are a labelled failure set.

All of it reads the one event stream. None of it needs a second table.

---

## PART 12 — PRIVACY

**Collected:** what happened (`event_type`, `provider`, `service`, `resource`),
how much was consumed (`measures`), what it cost (`cost`), and *whose* workspace
it belonged to (`user_id`, `organization_id`, `workspace_id`, `session_id`) —
plus bounded, allowlisted `metadata`.

**Never collected:** message or document CONTENT; prompt or completion text; CV
text; free-text user input; credentials, tokens or cookies; full URLs with query
strings; IP addresses; device fingerprints; precise location; any special
category of personal data.

**Principles, inherited verbatim from the live `pilot_events` contract:**

| Principle | How |
|---|---|
| Data minimisation | measures and cost, never content. Tokens counted; text never stored |
| Purpose limitation | cost accounting + business health. Not profiling, not ad targeting |
| Server-resolved identity | the client never says who it is; a client-supplied id is refused |
| Allowlisted metadata | keys must be added deliberately; wildcards forbidden |
| Bounded values | ≤200 chars per string, ≤2 KB serialized, ≤24 keys |
| Pseudonymisation | identity is `profiles.id` / `organizations.id`, never an email or a name |
| Anonymisation | after the retention window, drop `user_id`, `session_id` and `metadata`, keep the aggregate row |
| Retention | raw events **13 months** (12 + reconciliation), then anonymised; derived rollups kept indefinitely (they carry no identity). **The exact window is an owner decision — see Part 13** |
| Erasure (Art. 17) | deleting a user anonymises their events rather than deleting them: cost facts are accounting records, and the aggregate must stay correct. Documented as a legitimate-interest retention basis |
| RLS | owner + admin read only, never anonymous; writes server-only, like every ledger in this platform |

---

## PART 13 — RISKS AND OPEN DECISIONS

| # | Risk | Mitigation / decision needed |
|---|---|---|
| R1 | **Volume.** One row per action grows fast at scale | Rollups + retention (Part 10/12). Decide the window: **OWNER DECISION** |
| R2 | **Cost estimation drift** — estimates never reconciled against invoices | `pricingVersion` + `billingSource` make drift measurable; reconciliation adds events, never rewrites |
| R3 | **Attribution gaps** — an event with no `feature_code` is invisible to margin | Treat missing `feature_code` on a costed event as a defect, surfaced as an unattributed bucket, never silently dropped |
| R4 | **Write-path latency** — telemetry must never slow a user action | Fire-and-forget with a bounded queue; a dropped event is better than a slow product, and the drop is counted |
| R5 | **Free-form `provider`/`service`** could fragment (`openai` vs `open_ai`) | Bounded length + a documented registry + a normalisation step at ingestion. A constraint would be worse: it trades typos for migrations |
| R6 | **Double counting** if both an estimate and an invoice are summed | `billingSource` distinguishes them; `actualCents` supersedes `estimatedCents` in every aggregate |
| R7 | **Privacy creep** — metadata gradually becoming a content log | Allowlist + guard, exactly as `pilot_events` does today |
| R8 | **PII in `resource`** (e.g. a filename) | `resource` is a type identifier, never a user string — enforce at ingestion |

---

## PART 14 — IMPLEMENTATION SEQUENCE (nothing in this PR)

| Stage | What | Gate |
|---|---|---|
| **0** | Contract + document — **DONE (PR #898)**, no migration | — |
| **1** | One additive migration: `usage_cost_events` (append-only, RLS, service-role write) + the write path + the Business Health read model — **DONE (PR #899)**, applied to production | owner-gated, RED class |
| **2** | Server-side emitter for **AI calls only** — the highest-value cost, one call site | **NEXT** — after stage 1 |
| **3** | Emitters for OCR / storage / email — the next three real costs | measurement proves stage 2 works |
| **4** | Supplier invoice import → `event_type='cost'` reconciliation | needs stage 2–3 data to reconcile against |
| **5** | Revenue events on the existing billing webhook (pointer only) | after Stripe activation |
| **6** | BHE reads the events; metrics go from `blocked_missing_data` to computable | automatic once stages 2–5 land |
| **7** | Rollups + retention job | only when volume justifies it |

Each stage is independently useful. **Stage 2 alone unlocks AI cost, the single
metric most likely to reveal a loss first.**

---

## PART 15 — FINAL REPORT

- **Is PR #754 worth using?** Its **doctrine** yes, its **schema** no. Nothing
  from it is restored.
- **What is rejected:** `profile_id`-only attribution · `cost_usd` ·
  the `ai_runs`/`usage_events` split · categories as a CHECK constraint ·
  `credit_types` · mutable `credit_balances` · the legacy alias map.
- **The new canonical model:** one event, one shape, for AI and non-AI, usage
  and cost, product and revenue — with provider/service/resource as **data**.
- **Tables needed in future:** **one** (`usage_cost_events`), plus optionally
  one derived rollup. Nothing else.
- **Sequence:** contract → table → AI emitter → other emitters → invoice
  reconciliation → revenue links → rollups.
- **Risks:** volume, estimation drift, attribution gaps, latency, vocabulary
  fragmentation, double counting, privacy creep — each with a stated mitigation.
- **Migrations reduced:** a new vendor, service, measure, product line or
  repricing needs **none**.

**PR #898 contained no migration, no table, no ingestion code and no API** —
the contract was agreed before any storage decision.

**PR #899 adds exactly one storage layer and nothing else:** the
`usage_cost_events` table, its RLS, the append-only server write path, the
idempotency contract and a read-only Business Health model. It ships **no
emitter, no OCR/storage/email instrumentation, no revenue rollup, no invoice
reconciliation, no pricing crawler, no billing import, no scheduler, no
background job, no webhook and no UI** — and the contract module itself still
carries no database dependency, which the guard continues to assert.

---

*Binding. Amend by editing this document and
`lib/telemetry/usage-cost-event-model.ts` in the same PR; the guard fails if
they disagree.*
