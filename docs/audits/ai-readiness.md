# AI Readiness Skeleton — typed boundary, inert by default

> **Status: INERT. There is no runtime LLM/AI integration in this repo.**
> The default provider is a deterministic no-op; there is no SDK, no network
> call, no API key, and no active AI UI. Activation is owner-gated behind
> `AI_ASSIST_ENABLED` (`apps/web/lib/config/ai.ts`), a source literal `false`.
>
> This document covers the **code boundary** added in this slice. The system
> architecture + doctrine grounding live in `docs/ai/AI_READINESS.md` (read it
> first; on conflict the doctrine wins).

## 1. What exists now (this slice)

A typed boundary under `apps/web/lib/ai/` so a future AI assist can be wired
without a rewrite — while changing **nothing** about today's behaviour:

| File | Role |
|---|---|
| `lib/ai/types.ts` | Provider id + **model-id config candidates** (no SDK), use-case input/result types, the `AiProvider` interface, the `AiDisabledResult` sentinel. |
| `lib/ai/schemas.ts` | zod **strict** schemas — the only shape a future provider may return (suggestion-only, no `total`/`price`/`score`/`verified`). |
| `lib/ai/noop-provider.ts` | The deterministic **default** provider — every method returns `disabled`; no key, no network, no env read. |
| `lib/ai/provider.ts` | `getAiProvider()` — today always returns the no-op; `isAiAssistEnabled()` reads the master flag. |
| `lib/ai/README.md` | Boundary overview. |
| `lib/config/ai.ts` | `AI_ASSIST_ENABLED = false` (existing) + `AI_ASSIST_FLAGS` (all `false`). |

Existing scaffolding this builds on: `docs/ai/AI_READINESS.md`, the
`docs/ai/prompts/*.md` templates (TEMPLATE ONLY), and
`lib/guards/ai-readiness.test.ts`.

## 2. What is intentionally NOT active

- **No SDK installed** (`@anthropic-ai/sdk`, `openai`, `@ai-sdk/*` — none).
- **No network call** reachable from the default provider (no `fetch`, no http).
- **No API key / secret** anywhere; **no `.env` change**; no `process.env`-driven
  provider selection (AI cannot be switched on by a production env var).
- **No active AI UI** — no AI buttons, no AI badges, no AI copy claiming the
  product does anything with AI today.
- **No change** to estimate formulas, demand submission, worker verification, or
  matching. The estimate engine and demand paths do not import `lib/ai`.

## 3. Typed use cases (shaped, all inactive)

| Use case | Input | Result (suggestion-only) |
|---|---|---|
| `demand_draft` | `roleHint`, `rawDescription`, `locale` | `draftDescription`, `clarifyingQuestions[]`, `notes[]` |
| `estimate_clarify` | `missingInfoKeys[]` (from the **deterministic** engine), `workContext`, `locale` | `questions[]`, `assumptionNotes[]` — **no numeric fields** |
| `worker_profile_draft` | `rawText`, `locale` | `draftText`, `notes[]` |

Every result carries `suggestion: true` and is validated by a `strict` schema —
a model can never smuggle a fabricated number, price, score, or verification
status into a suggestion. **AI produces drafts and questions, never figures**;
the deterministic estimate engine owns all numbers.

## 4. Safety rules (binding — code + doctrine §7 / §7.1)

AI may only assist with **drafts and clarification**. AI MUST NEVER:

- mark skills as **verified** or raise any trust/verification level;
- create **final estimates** or any number/price/total (deterministic only);
- create **binding quotes**;
- create requests, drafts-of-record, or any data **without user confirmation**;
- **persist** to any canonical table (no INSERT/UPDATE/DELETE);
- send **outreach** (email/Telegram/social) or any message;
- **invent** prices, clients, matches, workers, confirmations, or verification;
- **replace** any deterministic formula or rule;
- run **unlogged** (a future activation requires an append-only run log, §7.1).

## 5. Future insertion points (documented; NOT wired)

When the owner activates a use case, the assist surfaces as an **optional,
clearly-labelled, dismissible suggestion** next to the relevant input — never an
auto-fill, never replacing the user's own words, always behind both flags:

1. **Demand description** — a "clarify / draft" helper beside the description
   field (Step 1): turns a rough note into a clearer draft + clarifying
   questions. The user edits and confirms; the existing write path persists.
2. **Estimate missing-info helper** — beside the Estimate Builder: turns the
   deterministic engine's `missingInfoKeys` into plain-language questions. It
   **never** touches the numbers.
3. **Worker profile / CV wording** — polishes the worker's own text; never adds
   skills or claims; never sets verification.

No visible AI control ships until its flag is true AND a real provider is wired.
A placeholder/disabled AI button is only acceptable if explicitly labelled
"not enabled yet" — none is added in this slice.

## 6. Activation requirements (owner-gated)

Before ANY real provider integration, the owner must decide and approve:

1. **Provider + model** (e.g. one of `AI_MODEL_CANDIDATES`), **budget**, and
   **key handling** — keys are an owner-gated hard blocker; no key is added now.
2. **Privacy / security / audit** before any user data is sent to a model:
   - a documented data-minimization policy (what fields may be sent; PII review);
   - user consent / transparency for AI-assisted drafting;
   - the append-only `ai_assist_runs` log (§7.1) — no output shown unless logged;
   - data-processing / sub-processor review for the chosen provider.
3. **Schema enforcement** — every model output validated by `lib/ai/schemas.ts`
   (`strict`) before display; anything off-shape is discarded.
4. **Human-confirm write path** — suggestions become records only through the
   existing confirmed RPCs/server actions, never autonomously.

Until all of the above are approved and merged in a dedicated slice, this layer
stays inert. Guarded by `lib/guards/ai-provider-boundary.test.ts` +
`lib/guards/ai-readiness.test.ts`.
