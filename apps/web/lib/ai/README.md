# `lib/ai` — the AI runtime + a frozen legacy island

Two AI stacks live under this directory, and only one of them runs. This file
names both so the old claim "there is no runtime AI here" can never mislead a
reader again — there is, it is ~5,900 lines, and it serves real production
surfaces (guard: `lib/guards/ai-runtime-boundary.test.ts` pins the split).

## The canonical runtime (LIVE)

Product code enters through **one** function — `runAiAgent()` in
`run-agent-server.ts` (server-only). Nothing else may construct a provider
adapter (boundary guard, property d).

| Piece | Role |
|---|---|
| `run-agent-server.ts` | The canonical entrypoint: resolves env config, runs the agent, persists the `ai_runs` audit row + `usage_cost_events` for vendor runs. |
| `run-agent.ts` | `runAiAgentCore()` — the pure core the server wrapper feeds. |
| `registry/` | The 12 registered agent prompts (`AiAgentKey`) + strict input schemas. |
| `schemas/envelope.ts` | The strict suggestion envelope every output must satisfy. |
| `runtime/config.ts` / `config-core.ts` | Env gate. **OFF by default** — `disabled` unless `AI_PROVIDER_MODE` is `mock` or `live`; a cloud provider without a real key never goes live. |
| `runtime/task-routing.ts` | Cost-aware routing: task policies (allowed/prohibited fields, cost ceilings, tiers), agent→task map, route audit record. |
| `runtime/data-sensitivity.ts` + `runtime/data-egress.ts` | The data veto: PUBLIC → SENSITIVE_FREE_TEXT classes, default-deny egress grants (grant table empty), free-tier ceiling. |
| `runtime/provider-chain.ts` + `runtime/providers/` | Cheapest-sufficient provider selection; adapters for anthropic / openai / gemini / xai / deepl / local / mock / disabled. |
| `runtime/model-pricing.ts` / `model-candidates.ts` | Owner-reviewed prices + alias→model tables; an unpriced model blocks rather than spends. |
| `runtime/audit-store.ts` | Best-effort persistence into the applied `ai_runs` table. |
| `evals/` | Offline eval harness over the registered agents (mock provider). |

**Wired production surfaces** (the `runAiAgent` call sites — six, five agent
keys; pinned with their sensitivity classes by
`lib/guards/ai-wired-surface-sensitivity.test.ts`):

- `worker_profile` — `lib/profile/cv-ai-structuring-actions.ts` and
  `lib/staffing/worker-intake-actions.ts` (PERSONAL)
- `work_journal` — `lib/journal/journal-ai-suggestions-actions.ts` (PERSONAL)
- `matching_explanation` — `lib/staffing/match-preview-actions.ts` (PERSONAL)
- `company_need` — `lib/staffing/company-need-actions.ts` (LOW_RISK_PROJECT_DATA)
- `market_explanation` — `lib/market/market-explanation-actions.ts` (PUBLIC —
  the one task that may reach an ungranted external provider; proven live on
  Gemini in production)

The PERSONAL and LOW_RISK surfaces resolve vendorlessly until the owner adds an
egress grant — the runtime routes them, audits them, and honestly declines to
send a person's data to a provider that has no grant.

Rules that still bind every run: AI only **drafts / clarifies / explains**.
Every output is a schema-validated `suggestion`; it never verifies a skill,
never produces a binding number, and outbound-shaped drafts require human
review (`TASK_POLICIES`). Cost ceilings are enforced pre-run; over budget or
unpriced → blocked, never silently run.

## The legacy assist island (INERT, frozen)

The original typed no-op boundary — kept, frozen, and permanently inert
pending owner-gated removal (AI Runtime Consolidation Plan v1, Phases 4–6).
Exactly six files: `lib/config/ai.ts`, `provider.ts`, `noop-provider.ts`,
`types.ts`, `legacy-assist-schemas.ts`, `estimate-clarify-actions.ts`. Its
`getAiProvider()` always returns the no-op; `AI_ASSIST_ENABLED` stays `false`.

**Do not add importers of these modules and do not share symbols across the
boundary in either direction** — `ai-runtime-boundary.test.ts` fails the build
on a new importer, a new island member, or any runtime↔island import. New AI
work belongs on the canonical runtime, through `runAiAgent()`.

Guards: `lib/guards/ai-runtime-boundary.test.ts` (the split itself),
`lib/guards/ai-wired-surface-sensitivity.test.ts` (wired-surface classes),
`lib/guards/ai-readiness.test.ts`, `lib/guards/no-direct-llm-client-call.test.ts`,
`lib/ai/runtime/task-routing.test.ts`.
