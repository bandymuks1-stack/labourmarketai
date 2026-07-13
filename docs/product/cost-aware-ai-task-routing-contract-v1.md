# Cost-Aware AI Task Routing Contract v1

Status: ACTIVE (Labour Market OS P8–P9)
Date: 2026-07-13

Every internal agent run is routed by **task**, not by a hard-coded model.
Product call sites still call `runAiAgent(agentKey, input, { locale })` and
never name a model or provider; the routing layer
(`apps/web/lib/ai/runtime/task-routing.ts`, pure — no env/IO) resolves a
model **tier**, a model **alias**, and an audit record for every run.
Enforced by `lib/guards/ai-task-routing.test.ts` and
`lib/ai/runtime/task-routing.test.ts`.

**UI rule:** technical model names (tier ids, aliases, model ids) never
surface in user-facing copy. The routing layer adds no UI; any future
surface may only say plain-language things like "assistant suggestion".

## Tier definitions

| Tier | Model alias | Meaning |
|---|---|---|
| `deterministic` | — (none) | Computed by pure workforce models. No LLM call, no provider, zero cost. |
| `low_cost` | `haiku` | Cheap, fast tasks: normalization, translation, short drafts. |
| `standard` | `sonnet` | Default LLM tier for structuring/extraction/explanation. |
| `advanced` | `opus` | Escalation-only tier. **Never a default.** |
| `high_risk_verified` | `opus` + second-model review | Declared seam for future high-risk tasks. Requires a pre-run human confirmation flow that does not exist yet → any route resolving here is **blocked** (`needs_human_confirmation`). |

Aliases map to concrete model ids in exactly one place
(`modelIdForAlias` → `AI_MODEL_CANDIDATES`, `lib/ai/types.ts`). No product
code outside `lib/ai/runtime` may reference `AI_MODEL_CANDIDATES` or a raw
model id literal (guard-enforced).

## Task policies

| Task | Risk | Preferred tier | Fallback | Min quality | Max cost (USD) | Max latency | Escalation conditions | 2nd-model review | Human review |
|---|---|---|---|---|---|---|---|---|---|
| `structure_future_work` | medium | standard | low_cost | 0.60 | 0.15 | 30 s | low_confidence, schema_invalid, human_requested_depth | no | **yes** |
| `derive_workforce_requirements` | medium | standard | low_cost | 0.60 | 0.15 | 30 s | low_confidence, schema_invalid, contradicts_sources | no | no |
| `normalize_work_scope` | low | low_cost | low_cost | 0.55 | 0.05 | 20 s | schema_invalid, quality_below_threshold | no | no |
| `detect_capacity_gap` | low | **deterministic** | deterministic | 1.00 | 0.00 | 5 s | — (never escalates to an LLM) | no | no |
| `detect_skill_gap` | low | **deterministic** | deterministic | 1.00 | 0.00 | 5 s | — (never escalates to an LLM) | no | no |
| `normalize_external_profile` | medium | standard | low_cost | 0.60 | 0.12 | 30 s | low_confidence, schema_invalid | no | **yes** |
| `extract_cv` | medium | standard | low_cost | 0.60 | 0.20 | 45 s | low_confidence, schema_invalid, human_requested_depth | no | **yes** |
| `explain_match` | medium | standard | low_cost | 0.60 | 0.15 | 30 s | low_confidence, contradicts_sources, human_requested_depth | no | no |
| `translate_message` | low | low_cost | low_cost | 0.55 | 0.03 | 15 s | quality_below_threshold | no | no |
| `draft_follow_up` | medium | low_cost | low_cost | 0.60 | 0.05 | 20 s | quality_below_threshold, human_requested_depth | no | **yes** |

Allowed/prohibited input fields per task live in
`docs/product/ai-data-minimization-contract-v1.md` (P11) and in
`TASK_POLICIES` itself.

`expectedSchema` per task names the strict zod envelope the output must
satisfy (e.g. `companyNeedOutputSchema`, `matchingExplanationOutputSchema`);
the runner already rejects anything off-shape (`ai-output-schema-required`).
For the two deterministic tasks it names the pure workforce-model output —
no LLM output exists to validate.

"Human review = yes" means the output enters review state `pending` in the
audit record. Independently of this flag, **every** LLM output in this
platform is a suggestion that only becomes a record through an existing
human-confirmed write path (platform doctrine §7).

## Agent → task mapping (all 11 registered agents)

| Agent | Task | Rationale |
|---|---|---|
| `worker_profile` | `extract_cv` | free-text bio/CV → structured profile draft |
| `work_journal` | `normalize_work_scope` | journal free-text → structured work scope |
| `skill_evidence` | `normalize_external_profile` | evidence text → normalized capability claims |
| `company_need` | `structure_future_work` | company's future work → structured need |
| `country_readiness` | `derive_workforce_requirements` | what working in a country requires |
| `document_assistant` | `derive_workforce_requirements` | documents needed = requirement derivation |
| `matching_explanation` | `explain_match` | canonical fit → explanation |
| `booking_risk` | `explain_match` | risk narrative = explanation over canonical signals |
| `admin_risk` | `explain_match` | same explanation-class task, admin audience |
| `support_onboarding` | `draft_follow_up` | guidance / next-step message drafts |
| `translation_copy` | `translate_message` | translation |

`detect_capacity_gap` and `detect_skill_gap` have **no agent** on purpose:
they are computed by the pure workforce models, never by an LLM
(deterministic-first, guard-asserted).

## Routing rules (binding)

1. **Start at the preferred tier.** Always. The max model is never a
   default: no policy may prefer `advanced`/`high_risk_verified` unless it
   is `riskLevel: "high"` — and a high-risk policy must also require human
   review (test-asserted; no current task is high-risk).
2. **Escalate one tier only**, and only when the previous attempt failed
   with a condition the policy lists (`low_confidence`, `schema_invalid`,
   `contradicts_sources`, `quality_below_threshold`,
   `human_requested_depth`). An unlisted failure never escalates.
3. **Cost ceiling blocks.** If the caller supplies an
   `estimatedCostUsd` above the policy ceiling the decision is
   `blocked: "cost_ceiling"` and the run never reaches a provider. Over
   budget never silently proceeds.
4. **Fallback is surfaced, never silent.** On a provider failure the route
   moves to the policy's fallback tier with `fallbackApplied: true` and an
   honest reason naming the downgrade. No silent quality drop.
5. **`high_risk_verified` is blocked** (`needs_human_confirmation`) until a
   real pre-run human confirmation flow exists. No fake approval.
6. **Daily run budget.** `assessRunBudget(countToday, cfg)` (pure) enforces
   the previously-declared-but-unenforced `dailyRunBudget` clamp. The
   runner applies it when the caller supplies a real `runsToday` count.

The runner (`lib/ai/run-agent.ts`) maps blocked decisions to honest
non-suggestion outcomes: `cost_ceiling` and the daily budget →
`needs_review` / `budget_exceeded`; `needs_human_confirmation` →
`needs_review` / `route_blocked`. Call sites are unchanged.

## Audit record fields

`buildRoutingAuditRecord(decision, outcome)` (pure builder) produces, and
the runner attaches to every outcome as `routing`:

`taskType`, `selectedTier`, `providerAdapter`, `modelAlias`, `reason`,
`fallback`, `escalation`, `blocked`, `secondModelReview`,
`estimatedCostUsd` (nullable), `actualCostUsd` (**honest null** — no
pricing table is wired), `latencyMs`, `usage` (tokens, nullable),
`schemaValidation` (`passed | failed | skipped`), `confidence` (envelope
coarse confidence or null), `humanReviewState`
(`not_required | pending | approved | rejected`), `dataCategoriesSent`
(**field names only — never input content/PII**).

## Provider adapter registry (P9 seam)

`lib/ai/runtime/providers/adapter-contract.ts` declares the
provider-neutral descriptors (compatible with a future shared
Rexora/Agentai OS AI Gateway — dependency-free):

| Adapter | Status | Note |
|---|---|---|
| `anthropic` | **active** | the one allowlisted SDK importer; env-gated, inert without a key |
| `openai` | declared_inactive | seam only — `run-core.ts` maps it to the disabled provider |
| `deepl` | declared_inactive | translation seam only |
| `meta_llama` | declared_inactive | self-hosted low-cost seam only |
| `xai` | declared_inactive | seam only |
| `sora` | **unavailable** | video generation — no task maps to it, explicitly not usable |

`selectAdapterForRoute` only ever returns the active adapter or an honest
`no_adapter` result; it can never activate a declared seam
(guard-asserted).

## Honest gaps (owner-gated follow-ups)

- **Audit persistence:** the `ai_runs` append-only audit table is an
  owner-gated future migration. Today the record exists in-memory on the
  runner outcome only — nothing pretends it is stored.
- **Daily-run counter store:** no persisted per-day run counter exists.
  The budget check is pure and enforced only when a caller supplies a real
  count; nothing fakes a counter.
- **Cost estimation:** no pricing table is wired; `estimatedCostUsd` is
  caller-supplied and `actualCostUsd` stays `null` rather than being
  fabricated.
- **Second-model review / pre-run human confirmation:** declared in the
  policy shape; the `high_risk_verified` tier stays blocked until these
  flows are really built.
