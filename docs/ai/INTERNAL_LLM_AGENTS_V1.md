# Internal LLM Agents v1 — architecture audit + safety doctrine

> **Status of THIS document: architecture + safety doctrine for the Internal LLM
> Agents v1 sprint.** It is the source-of-truth that grounds every PR in the
> sprint (PR2–PR12). It does **not** activate anything: the runtime stays inert
> (disabled/mock) until the owner provides a provider key in env. Read
> [`AI_READINESS.md`](./AI_READINESS.md) and
> [`../PLATFORM_DOCTRINE.md`](../PLATFORM_DOCTRINE.md) **§7 / §7.1** first — on
> conflict, the doctrine wins.

## 0. One-paragraph summary

We turn the existing **inert AI boundary** (`apps/web/lib/ai/` — a no-op
provider, strict suggestion schemas, all flags `false`) into a real **internal
LLM agent layer**: a provider adapter with `disabled | mock | live` modes
(off by default, `live` only via env + key), a **prompt registry** as the single
source of truth, **strict per-agent output schemas**, an **append-only AI run
audit log**, and **twelve domain agents** that *suggest / structure / explain*
but never verify, price, persist, send, or invent. The truth always stays in the
database; the LLM is a translator and drafter, never an authority. The system is
**production-safe inert** with no keys, runs in **mock mode** for tests/dev, and
becomes **live** only when the owner sets `AI_PROVIDER_MODE=live` + a key in env.

## 1. What already exists (audit — do not rebuild)

| Asset | Location | Keep / extend |
|---|---|---|
| Inert provider seam | `lib/ai/provider.ts` (`getAiProvider()` → noop) | **Extend** into a mode-resolving adapter (PR2). |
| No-op provider | `lib/ai/noop-provider.ts` | **Keep** as the `disabled` provider. |
| Strict suggestion schemas | `lib/ai/schemas.ts` (zod `.strict()`, `FORBIDDEN_AI_OUTPUT_FIELDS`) | **Extend** with per-agent schemas (PR3). |
| Types + model candidates | `lib/ai/types.ts` (`AI_MODEL_CANDIDATES`) | **Extend** with agent I/O types. |
| Master + per-use-case flags | `lib/config/ai.ts` (`AI_ASSIST_ENABLED`, `AI_ASSIST_FLAGS`) | **Keep**; add per-agent flags (PR2/PR3). |
| Architecture doc | `docs/ai/AI_READINESS.md` (six agent types, data contracts, run-log shape) | **Foundational** — this doc extends it. |
| Prompt templates | `docs/ai/prompts/*.md` (matching-explainer, document-checklist-helper, profile-fill-explainer) | **Fold** into the prompt registry (PR3). |
| Guards | `lib/guards/ai-readiness.test.ts`, `ai-provider-boundary.test.ts` | **Evolve** (allow SDK in the one allowlisted adapter; add new safety guards). |
| Deterministic helpers (NOT AI) | `lib/process-brain/`, documents/readiness checklist engine | **Untouched** — never relabel deterministic logic as "AI" (§7 reverse-lie). |

**Gap-delta:** the boundary is shaped for 3 use-cases (`demand_draft`,
`estimate_clarify`, `worker_profile_draft`) and is hard-wired to `noop`. The
sprint adds the **mode-resolving adapter**, the **prompt registry**, **per-agent
schemas + audit log**, and the **12 agents**. Nothing here removes or weakens an
existing guard — guards are only strengthened.

## 2. Non-negotiable safety doctrine (binding)

The LLM **MAY**: suggest, structure, explain, extract draft data, surface
missing items, cite evidence, and request human/system confirmation.

The LLM **MUST NEVER**:

1. mark a skill, document, profile, or person as **verified / confirmed**;
2. produce or alter a **document verification** status;
3. produce a **legal guarantee** ("legal to work", "fully compliant", "guaranteed");
4. answer a **country-requirement** question without `source_refs`;
5. leak a **private document**'s contents (no doc-content reading without a
   separate, explicit extraction pipeline + consent);
6. claim a **live payment** / suggest paying when payments are disabled or test-only;
7. produce a **score / percentage / ranking** presented as fact;
8. **persist** to any canonical table (no autonomous INSERT/UPDATE/DELETE);
9. **send** any message / outreach;
10. **auto-publish** a worker profile or company need without human review;
11. **invent** prices, clients, matches, experience, confirmations, or readiness;
12. promise **work or earnings**;
13. run **unlogged** (no audit row → no output shown);
14. be reached **directly from a React component** or via an **uncontrolled
    free-form DB write**.

**The truth stays in the DB.** Authoritative facts come only from:
`worker_documents` verification, work-journal evidence + manager/admin
confirmation, country-readiness **source records**, `billing_subscriptions` /
entitlement status, booking status, and explicit human confirmation. Every LLM
output is a **suggestion** (structured data, never prose of record) that becomes
a record only through an existing human-confirmed write path.

## 3. Runtime architecture (PR2)

```
caller (server action / route — never a React component)
   │  builds typed agent input from canonical rows (RLS-scoped, read-only)
   ▼
runAiAgent(agentKey, input)            ── lib/ai/runtime
   │  1. resolve AI runtime config  (disabled | mock | live)   ── config-core (pure)
   │  2. resolve prompt from the registry (key + version)      ── prompt registry (PR3)
   │  3. dispatch to the active provider
   │        • disabled → AiDisabledResult sentinel (default)
   │        • mock     → deterministic canned structured output (tests/dev)
   │        • live     → Anthropic adapter (ONLY SDK importer; lazy; env-keyed)
   │  4. validate output against the agent's strict zod schema   ── PR3
   │  5. write append-only ai_runs audit row (provider/model/hashes/status)  ── PR4
   ▼
suggestion (suggestion:true, evidence_refs, missing_information,
            needs_human_review, blocked_claims) — shown labelled, never auto-saved
```

**Provider abstraction.** `AiRuntimeConfig` resolves from env (mirroring the
Stripe `config-core` pattern):

- `AI_PROVIDER_MODE` ∈ `disabled | mock | live` (default **`disabled`**);
- `AI_PROVIDER` ∈ `anthropic | openai` (live only; default `anthropic`);
- `AI_API_KEY` (live only; **never committed**, never in client, owner-set in env);
- `AI_MODEL` (live only; default `claude-opus-4-8`);
- `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`,
  `AI_DAILY_RUN_BUDGET` (cost guard).

`live` requires `AI_PROVIDER_MODE=live` **and** a non-empty key; otherwise the
adapter resolves to `disabled`. No `process.env` read happens in client bundles.

**SDK boundary.** Exactly one file (`lib/ai/providers/anthropic.ts`) may import
`@anthropic-ai/sdk`, lazily, constructed only when `live` + key. This mirrors the
allowlisted Stripe adapter. The `ai-readiness` guard is **evolved** to permit the
SDK in that one file and to keep forbidding it everywhere else.

## 4. The twelve agents (PR5–PR9)

Each agent = a prompt-registry entry + a strict zod output schema + a pure
input-builder + a thin server-side caller. Every output carries
`confidence`, `evidence_refs[]`, `missing_information[]`, `needs_human_review`,
and `blocked_claims[]` (what the model tried to over-claim and was stripped).

| # | Agent | Suggests | Hard "never" (beyond §2) |
|---|---|---|---|
| 1 | Worker Profile | headline, skill *claims*, roles, experience categories, missing fields | never "verified"; never invented experience |
| 2 | Skill Evidence | `self_declared_candidate` / `journal_supported_candidate` / `needs_confirmation` | never `manager_or_client_confirmed`; never fake skills |
| 3 | Work Journal Structuring | tasks, tools/materials, possible skills, safety notes, follow-up Q | never "done well"; no facts from photos w/o OCR pipeline; no invoice facts |
| 4 | Company Need | normalized role, required skills/docs, readiness blockers, missing fields, draft public copy | never invented pay; never "legally ready"; never auto-publish |
| 5 | Country Readiness | missing/likely-required items, needs_legal_review, source_refs, risk_level | never without `source_refs`; never "fully legal"; never change source status |
| 6 | Document Assistant | missing docs, expiring soon, needs-verification, plain explanation | never read file contents; never "document is real"; never verify |
| 7 | Matching Explanation | fit summary, strong matches, gaps, blockers, next action | never hide legal/doc blockers; never "ready to start" if readiness incomplete; no private-doc leak |
| 8 | Booking Risk | risk flags, conflict warnings, missing docs, start readiness | never bypass conflict logic; never double-book; never "safe to start" if not ready |
| 9 | Admin Risk / Control | prioritized queue, risk reason, suggested action, severity | never auto-reject/ban; no discriminatory or legal conclusions |
| 10 | Multilingual Copy / Translation | localized copy, plain-language version, over-strong-wording warnings | never change meaning; never drop disclaimers; never translate a guarantee *as* a guarantee |
| 11 | Support / Onboarding | top next action, short explanation, CTA suggestion, missing info | never suggest paying if payments disabled/test-only; never promise work/earnings |
| 12 | AI Audit + Prompt Registry + Evaluation | (infrastructure, PR3/PR4) | — |

## 5. Data / migrations (PR4 — RED, owner-applied)

Additive only, human-gated, reversible. Candidate tables:

- `ai_prompt_registry` — optional DB mirror of the code registry (code is SoT);
- `ai_runs` — append-only audit (user/org context, agent key, prompt version,
  input/output **hashes**, provider, model, created_at, status, error code,
  tokens/cost; **no raw secrets**; optional redacted snapshot). Mirrors the
  existing `journal_entry_extractions` shape (migration 0013), RLS default-closed,
  no UPDATE/DELETE;
- `ai_suggestions` — `draft | accepted | rejected | edited | expired`, linked to
  a source entity; **no automatic write into factual tables**;
- `ai_suggestion_feedback`, `ai_eval_results` — optional.

Until applied, every AI surface degrades to a `needs-migration` honest state.
Dual migration baseline bumped per the ops-bridge convention.

## 6. Safety guards (build-failing — PR2/PR3 + per-agent)

1. `no-ai-verifies-skills` — AI copy/output never sets verified/confirmed on skills.
2. `no-ai-verifies-documents` — never sets document verification.
3. `no-ai-legal-guarantee` — no "legal to work guaranteed" / "fully legal" copy.
4. `no-unsourced-country-answer` — country agent schema requires `source_refs`.
5. `no-private-document-leak` — no document-content field on any AI input/output.
6. `no-ai-live-payment-claim` — no "pay now / live checkout" from AI copy.
7. `no-provider-secret-leak` — no key/secret literal in source; key only via env.
8. `no-direct-llm-client-call` — no SDK / provider import from React components.
9. `ai-output-schema-required` — every agent output validated by its strict schema.
10. `prompt-registry-required` — prompts live in the registry, not scattered.

Plus the **evolved** `ai-readiness` (SDK allowed only in the one adapter) and the
existing `ai-provider-boundary` (inert-by-default, no record-like output fields).

## 7. Tests / evals (every PR)

- **Provider:** disabled / mock / missing-env / timeout / malformed-output /
  schema-fail / provider-error.
- **Agents:** one extraction/suggestion test per agent (driven by the **mock**
  provider — no keys, no network).
- **Safety negatives:** hallucinated document rejected; legal guarantee rejected;
  skill-verified claim rejected; private-doc leak rejected; unsourced country
  answer rejected; live-payment suggestion rejected.
- **UI:** AI suggestions are labelled; user must review before saving; no
  auto-confirm; no fake verification.
- **Eval fixtures:** LT worker text, RU worker text, EN company need, incomplete
  company need, NL/DE/DK country readiness, booking conflict, document expiry.

## 8. PR sequence

PR1 (this) → PR2 adapter+config+guards → PR3 registry+schemas+evals →
PR4 audit/suggestions migration (RED) → PR5 Worker Profile + Work Journal →
PR6 Skill Evidence + Document Assistant → PR7 Company Need + Matching →
PR8 Country Readiness + Booking Risk → PR9 Admin Risk + Support/Onboarding →
PR10 UI integration → PR11 multilingual/copy hardening → PR12 final proof + smoke.

Each PR: `typecheck` + `lint` + `test` (incl. guards) + `build` +
`migration-safety` (if DB) + route smoke + no-secret-leakage, all green.

## 9. Doctrine reconciliation (§8.2)

`AI_READINESS.md` §5 states *"no external AI endpoint is called from this repo
until the owner explicitly decides provider, budget and key handling."* This
sprint **is** the owner's deliberate decision on that activation architecture:
provider abstraction (Anthropic default + OpenAI seam + mock), **env-gated** keys
(never committed, never in client), cost guard, timeout, and retry. It does **not**
relax the gate — it *implements* it:

- the runtime is **`disabled` by default**; `live` requires `AI_PROVIDER_MODE=live`
  + a key the owner sets in env;
- **no key, no SDK call** — without env the adapter is inert and tests run on the
  mock provider;
- every other §7 / §7.1 invariant is preserved verbatim (suggestion-only, logged,
  human-confirm, never verifies/persists/prices/sends/invents).

If any later task spec contradicts this doctrine, the PR flags it under a
`## Doctrine conflict` heading and asks DI before proceeding.

## 9.1 Cost-aware task routing (Labour Market OS P8–P9 addendum)

Runs are now routed by TASK, not by a hard-coded model. Call sites are
unchanged (`runAiAgent(agentKey, input, { locale })` — still never a model
or provider); the runner resolves `agentKey → taskType → tier → model
alias` through the pure policy core `lib/ai/runtime/task-routing.ts`:

- **Tiers:** `deterministic` (pure workforce models, no LLM — capacity/skill
  gap detection), `low_cost` (haiku), `standard` (sonnet), `advanced` (opus,
  escalation-only, never a default), `high_risk_verified` (opus +
  second-model review — blocked until a real pre-run human-confirmation
  flow exists).
- **Rules:** start at the policy's preferred tier; escalate ONE tier only on
  a listed condition; cost ceiling → `blocked: cost_ceiling` (never
  silently proceeds); provider-failure fallback may go down a tier only
  with `fallbackApplied: true` and an honest reason; the previously
  unenforced `dailyRunBudget` now has a pure check (`assessRunBudget`),
  applied when a caller supplies a real run count.
- **Audit:** every outcome carries a routing audit record (tier, adapter,
  alias, reason, escalation/fallback, cost estimate, honest-null actual
  cost, latency, usage, schema validation, confidence, human-review state,
  and `dataCategoriesSent` — field NAMES only, never input content).
  The `ai_runs` table for persisting it was applied to production 2026-08-03
  (prod ledger `20260803061937`, 0 rows). Nothing is written yet: with
  `AI_PROVIDER_MODE=disabled` the `cfg.state === "live"` guard means the insert
  never executes. A **90-day retention policy** for full rows and
  `output_excerpt` is a REQUIRED BLOCK before the provider is enabled.
- **Adapters:** `lib/ai/runtime/providers/adapter-contract.ts` declares the
  provider-neutral registry — `anthropic` active (still the one allowlisted
  SDK importer); `openai`/`deepl`/`meta_llama`/`xai` declared-inactive
  seams (run-core still maps them to the disabled provider); `sora`
  unavailable.

Contracts: `docs/product/cost-aware-ai-task-routing-contract-v1.md` +
`docs/product/ai-data-minimization-contract-v1.md`. Guard:
`lib/guards/ai-task-routing.test.ts` (no model literals outside
`lib/ai/runtime`, policy completeness, single SDK importer, single active
adapter, routing-module purity).

## 10. What this sprint will NOT do

No committed keys; no live payment keys; no DNS; no Vercel env/secrets without
owner permission; LLM never used as a verification / legal / payment authority;
no AI auto-publish of profiles/needs; no AI mutation of document verification or
country official status; no private-document leak; no fake scores; no work/earnings
guarantees; no legacy project terms; no destructive migrations.
