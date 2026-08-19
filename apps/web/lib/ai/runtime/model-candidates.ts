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
 * SCOPE, stated precisely because it is easy to overclaim: this projection is
 * now open — EVERY provider in the registry appears here, including ones that
 * were never in the original four. What is NOT yet open is the dispatch
 * surface: `AiModelProvider` (task-routing), `AiProviderKind` (config-core) and
 * `AiChainProviderId` (provider-chain) remain closed unions, so a newly
 * registered provider is visible and priced but cannot yet be PASSED to
 * `modelIdForAlias` or dispatched without migrating those three types. That
 * migration touches dispatch and is its own slice.
 *
 * SCOPE, stated precisely because it is easy to overclaim: this projection is
 * now open — EVERY provider in the registry appears here, including ones that
 * were never among the original four. What is NOT yet open is the dispatch
 * surface: `AiModelProvider` (task-routing), `AiProviderKind` (config-core) and
 * `AiChainProviderId` (provider-chain) are still closed unions, so a newly
 * registered provider is visible and priceable but cannot yet be PASSED to
 * `modelIdForAlias` or dispatched without migrating those three types. That
 * migration touches dispatch and is its own slice.
 *
 * DERIVED SINCE 2026-08-19: the ids now come from `./model-registry.ts`,
 * which is the single place a (provider, model) fact is written. The values are
 * unchanged — a guard pins them — but they are no longer maintained here beside
 * a separate price table that did not know about them. Adding a provider is a
 * registry entry; this object simply projects it.
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

import { modelsForProvider, registryProviders } from "./model-registry";

export const AI_MODEL_CANDIDATES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze(
  Object.fromEntries(
    registryProviders().map((p) => [p, modelsForProvider(p)]),
  ),
);
