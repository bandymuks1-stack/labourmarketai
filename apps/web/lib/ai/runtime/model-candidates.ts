/**
 * Model id CANDIDATES — the single typed place a model id may be written.
 *
 * Moved here from `lib/ai/types.ts` by AI Runtime Consolidation Plan v1
 * Phase 1. The values are byte-identical to the ones that lived there; nothing
 * about model selection, routing, cost or gating changed. The move exists so
 * that **no symbol is shared between the runtime and the legacy assist island**
 * (plan §1.2): before it, `runtime/task-routing.ts` and the openai / gemini /
 * xai adapters had to reach up out of `lib/ai/runtime/` into a module that also
 * carries the legacy `AiProvider` boundary.
 *
 * Consequence for the guard: `lib/guards/ai-task-routing.test.ts` no longer has
 * to allowlist `lib/ai/types.ts` for model literals. Its allowlist is now
 * `lib/ai/runtime/` alone, which is strictly stronger — model choice cannot
 * leak into any module outside the routing layer, including the legacy island.
 *
 * These are CONFIG CANDIDATES ONLY. They are not imported by any SDK and make
 * no call by themselves. Which alias a task runs on is decided exclusively by
 * `./task-routing.ts` (`TIER_MODEL_ALIAS` → `modelIdForAlias`), and whether any
 * call happens at all is decided exclusively by `./config-core.ts`
 * (`AI_PROVIDER_MODE` + provider + non-empty key). Nothing here activates AI.
 *
 * OWNER REVIEWS these ids before enabling any provider.
 *
 * Pure constants. No IO, no server-only, no env.
 */

export const AI_MODEL_CANDIDATES = {
  anthropic: {
    fable: "claude-fable-5",
    opus: "claude-opus-4-8",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  },
  // Non-anthropic candidates for the env-gated fetch adapters
  // (lib/ai/runtime/providers/{openai,gemini,xai}.ts). Keyed by the same tier
  // ALIASES the routing layer uses (haiku = cheapest sufficient, sonnet =
  // standard, opus = advanced). OWNER REVIEWS these ids before enabling any
  // provider — they are config candidates only; nothing here activates AI.
  openai: {
    opus: "gpt-5",
    sonnet: "gpt-5-mini",
    haiku: "gpt-5-nano",
  },
  gemini: {
    opus: "gemini-2.5-pro",
    sonnet: "gemini-2.5-flash",
    haiku: "gemini-2.5-flash-lite",
  },
  xai: {
    opus: "grok-4",
    sonnet: "grok-3",
    haiku: "grok-3-mini",
  },
} as const;
