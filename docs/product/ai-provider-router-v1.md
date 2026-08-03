# AI Provider Router v1 — one shared AI routing layer

Status: implemented (Sprint v2 §7). Owner gates listed in §8.
Builds on: `docs/product/cost-aware-ai-task-routing-contract-v1.md` (P8–P9).

Binding rule: **business logic never calls a vendor directly.** Every AI call
goes through the shared routing layer; every provider is an adapter; the
cheapest sufficient model always serves; the max model is never a default;
every action is logged.

## 1. Architecture

```
product callers (staffing / profile / assist / worker / workforce)
        │  runAiAgent(agentKey, input, opts)          ← the ONLY entry point
        ▼
run-agent-server.ts (SERVER boundary)
        │  quota: countAiRunsTodayBestEffort() → daily-run budget guard
        │  audit: persistAiRunAudit(record) → ai_runs (append-only, best-effort)
        ▼
run-agent.ts (pure core)
        │  1. validate INPUT (strict zod, data minimisation)
        │  2. resolveTaskRoute(task, ctx)  ── task-routing.ts (pure policy)
        │       task type · language · privacy(fields) · quality · latency ·
        │       cost · fallback · quota  → tier → model ALIAS
        │  3. latency guard: dispatch raced against policy.maxLatencyMs
        │       timeout → ONE fallback-tier retry, reason "latency_timeout"
        │  4. validate OUTPUT (strict envelope) — raw is never surfaced
        │  5. build audit record (+ real cost from model-pricing.ts)
        ▼
run-core.ts (dispatch)
        │  preferredProvider (e.g. deepl) tried first on live runs,
        │  honest fall-through to the primary provider
        ▼
providers/  (every provider is an adapter — the ONLY vendor boundary)
   anthropic.ts   ACTIVE        @anthropic-ai/sdk (sole SDK importer)
   openai.ts      WIRED+GATED   fetch → api.openai.com  (chat completions)
   gemini.ts      WIRED+GATED   fetch → generativelanguage.googleapis.com
   xai.ts         WIRED+GATED   fetch → api.x.ai (OpenAI-compatible)
   deepl.ts       WIRED+GATED   fetch → api[-free].deepl.com (translate only)
   mock.ts        deterministic (tests/dev)   disabled.ts  inert default
   meta_llama     declared seam only (no wiring)   sora  unavailable (video)
```

## 2. Task types → tiers → model aliases

Tier ladder: `deterministic → low_cost (haiku) → standard (sonnet) →
advanced (opus) → high_risk_verified (opus + human gate, currently blocked)`.

| Task type | Preferred tier | Fallback tier | Agents |
|---|---|---|---|
| detect_capacity_gap | deterministic (no LLM) | deterministic | — (pure workforce models) |
| detect_skill_gap | deterministic (no LLM) | deterministic | — (pure workforce models) |
| normalize_work_scope | low_cost | low_cost | work_journal |
| translate_message | low_cost (DeepL preferred) | low_cost | translation_copy |
| draft_follow_up | low_cost | low_cost | support_onboarding |
| structure_future_work | standard | low_cost | company_need |
| derive_workforce_requirements | standard | low_cost | country_readiness, document_assistant |
| normalize_external_profile | standard | low_cost | skill_evidence |
| extract_cv | standard | low_cost | worker_profile |
| explain_match | standard | low_cost | matching_explanation, booking_risk, admin_risk |

## 3. Routing dimensions (all considered per run)

| Dimension | Where it acts |
|---|---|
| task type | `AGENT_TASK_TYPES` → `TASK_POLICIES[task]` — the whole policy |
| language | `AiTaskRouteContext.language`; `policy.languageRouting` may prefer a dedicated provider (DeepL for translate_message); recorded as `languageConsidered` |
| privacy | `allowedFields` / `prohibitedFields` (data minimisation); audit stores field NAMES only |
| quality | `minQuality` + escalation conditions (one tier up, listed reasons only) |
| latency | `maxLatencyMs` — adapter timeout is clamped to it AND the dispatch is raced against it; timeout → fallback tier with reason `latency_timeout` |
| cost | `maxEstimatedCostUsd` ceiling → blocked `cost_ceiling` (never silently proceeds); real cost computed post-run from token usage |
| fallback | provider failure / latency timeout → fallback tier with `fallbackApplied=true` + honest reason — never a silent downgrade |
| quota | `AI_DAILY_RUN_BUDGET` vs the persisted `ai_runs` daily counter (server boundary); over budget → blocked `quota/budget_exceeded` |

**Cheapest-sufficient rule:** every route starts at the policy's preferred
tier (the cheapest tier that satisfies the task's quality needs). Escalation
moves exactly ONE tier and only on a condition the policy lists. No policy may
prefer `advanced`/`high_risk_verified` unless it is `riskLevel: "high"` — the
max model is never a default (guard-pinned in `task-routing.test.ts`).

## 4. Provider adapters + configuration

All OFF by default. Non-anthropic adapters are DOUBLE gated: the per-provider
enable flag must be `"true"` AND the key must be present, else the adapter
returns the typed disabled sentinel (never a faked result).

| Adapter | Role | Activation env |
|---|---|---|
| anthropic | primary (default) | `AI_PROVIDER_MODE=live` + `AI_API_KEY` |
| openai | primary (opt-in) | above + `AI_PROVIDER=openai` + `AI_OPENAI_ENABLED=true` + `OPENAI_API_KEY` |
| gemini | primary (opt-in) | above + `AI_PROVIDER=gemini` + `AI_GEMINI_ENABLED=true` + `GEMINI_API_KEY` |
| xai | primary (opt-in) | above + `AI_PROVIDER=xai` + `AI_XAI_ENABLED=true` + `XAI_API_KEY` |
| deepl | secondary — translate_message only (language routing) | `AI_DEEPL_ENABLED=true` + `DEEPL_API_KEY` (works with any primary) |
| mock | deterministic tests/dev | `AI_PROVIDER_MODE=mock` |
| disabled | inert default | (default) |

Other env: `AI_MODEL` (optional default-model override), `AI_REQUEST_TIMEOUT_MS`,
`AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`, `AI_DAILY_RUN_BUDGET` (all clamped in
`config-core.ts`). See `.env.example` for the full commented list.

Model candidates per provider live ONLY in `lib/ai/types.ts`
(`AI_MODEL_CANDIDATES`) keyed by the same tier aliases; pricing (Anthropic
only, owner-reviewed) lives in `lib/ai/runtime/model-pricing.ts`. Non-priced
providers report `actual_cost_usd = null` — honest, never fabricated.

Boundaries enforced by guards (`lib/guards/ai-task-routing.test.ts`,
`ai-readiness.test.ts`):

- only `providers/anthropic.ts` may import an LLM SDK;
- only `lib/ai/runtime/providers/*` may reference the provider API hosts
  (api.openai.com / api.deepl.com / generativelanguage.googleapis.com / api.x.ai);
- no model id literal outside the routing layer;
- `task-routing.ts` + `adapter-contract.ts` stay pure (no env / fetch).

## 5. ai_runs log schema (append-only)

Migration: `supabase/migrations/20260714150000_ai_runs_audit_v1.sql` (gated
draft — see §8). One row per LIVE run, written best-effort by
`lib/ai/runtime/audit-store.ts` via the service-role client. RLS: admin-only
SELECT, no anon access, no client write path, no UPDATE/DELETE for any role.

| Column group | Columns |
|---|---|
| identity | `id`, `created_at` |
| task | `task_type`, `tier`, `route_reason`, `prompt_version`, `request_context` |
| provider/model | `provider`, `model_alias`, `model_id` |
| inputs (names only) | `locale`, `input_source`, `data_categories_sent[]` |
| output | `output_excerpt` (≤ 4000 chars of the VALIDATED output), `schema_validation`, `confidence` |
| cost/usage | `estimated_cost_usd`, `actual_cost_usd`, `input_tokens`, `output_tokens`, `latency_ms` |
| honesty flags | `fallback_applied`, `fallback_reason`, `escalation_applied`, `blocked_reason` |
| review | `human_review_state` |
| linkage | `profile_id` (nullable, `on delete set null`) |

Approval states (`human_review_state`): `not_required` (policy needs no
review), `pending` (policy requires human review — the suggestion may not be
persisted/used until a human confirms through an existing confirmed write
path), `approved`, `rejected`. AI output NEVER becomes a record without the
human-confirmed write path (doctrine §7.1); the `high_risk_verified` tier
additionally stays blocked (`needs_human_confirmation`) until a pre-run
confirmation flow exists.

## 6. Quota (persisted daily run counter)

`run-agent-server.ts` counts today's (UTC) non-blocked `ai_runs` rows before
dispatch on live runs and feeds the count into `assessRunBudget`. Over budget
→ honest `budget_exceeded` block (no silent skip). Best-effort: if the count
query fails (table not applied / outage), the run proceeds and the failure is
logged — the budget guard then only applies to caller-supplied counts.

## 7. Latency enforcement

Per-policy `maxLatencyMs`: the adapter-facing timeout (`cfg.timeoutMs`,
honored via AbortController / SDK timeout inside every adapter) is clamped to
the policy ceiling AND the dispatch promise is raced against it
(`withLatencyTimeout`). A timeout triggers exactly ONE fallback-tier retry
with `fallback_applied=true` and `fallback_reason="latency_timeout"`; a second
timeout surfaces as an honest `needs_review` timeout outcome.

## 8. Owner gates (NOT done by this slice)

- ~~**Applying the `ai_runs` migration to prod**~~ — **DONE 2026-08-03.** Owner
  approved; applied via Supabase MCP `apply_migration` as prod ledger version
  `20260803061937`, 0 initial rows. Two conditions ride with that approval and
  are still open: `AI_PROVIDER_MODE` stays `disabled` until a separate decision,
  and a **90-day retention policy** for full `ai_runs` rows and `output_excerpt`
  is a REQUIRED BLOCK before that activation. Persistence and the quota counter
  still degrade honestly while the provider is off — with `disabled`, the
  `cfg.state === "live"` guard means neither ever executes.
- **Adding real API keys / flipping enable flags** (Anthropic, OpenAI, Gemini,
  xAI, DeepL) — new secrets are an owner-only gate. Everything ships OFF.
- **Reviewing `model-pricing.ts` prices and the non-anthropic model ids** in
  `AI_MODEL_CANDIDATES` before enabling any non-anthropic provider.
- **A pre-run human confirmation flow** for the `high_risk_verified` tier
  (routes there stay blocked until it exists).
