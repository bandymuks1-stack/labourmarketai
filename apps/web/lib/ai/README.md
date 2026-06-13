# `lib/ai` — AI assist boundary (inert)

**There is no runtime AI here.** This directory is a typed boundary so a future,
owner-approved AI assist can be added without a rewrite. The default provider is
a deterministic no-op: **no SDK, no network, no API key, no env read.**

| File | Role |
|---|---|
| `types.ts` | Provider id, model-id config candidates (not used), use-case input/result types, `AiProvider` interface, `AiDisabledResult`. |
| `schemas.ts` | zod **strict** output schemas — suggestion-only, no `total`/`price`/`score`/`verified`. |
| `noop-provider.ts` | The inert default — every method returns `disabled`. |
| `provider.ts` | `getAiProvider()` (always no-op today), `isAiAssistEnabled()`. |

Rules (binding — see `docs/audits/ai-readiness.md` + `docs/ai/AI_READINESS.md`):
AI may only **draft / clarify**. It must never verify skills, produce a final
estimate / number / binding quote, persist to any table, send outreach, invent
data, or replace a deterministic formula. Every output is a `suggestion` and is
validated by `schemas.ts` before anything is shown.

Activation is owner-gated behind `AI_ASSIST_ENABLED` (`lib/config/ai.ts`, `false`)
plus the per-use-case `AI_ASSIST_FLAGS` (all `false`). Do not add an SDK, a key,
or a network call here without a dedicated owner-approved slice.

Guards: `lib/guards/ai-provider-boundary.test.ts`, `lib/guards/ai-readiness.test.ts`.
