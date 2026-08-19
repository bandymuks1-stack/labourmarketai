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
 * SCOPE, updated 2026-08-19 (second pass). The first pass opened this
 * projection but left the road out of it closed, and said so. That is now
 * fixed: `AiChainProviderId` is registry-driven, `adapterForChainId` is a total
 * lookup that fails closed, and `observeProviderStates` takes an open map, so a
 * registered provider can be observed and ordered rather than rejected by a
 * type.
 *
 * What still requires work outside the registry, stated so it is not
 * overclaimed again: a new provider needs a `AI_PROVIDER_PROFILES` entry (cost
 * class, locality, capabilities — provider-level data, not a type), an
 * observation wired from env, an ADAPTER BINDING in run-core, and — for a
 * metered one — owner-reviewed prices before it is selectable at all.
 *
 * On that adapter binding: a first attempt dispatched by wire protocol, so
 * every `openai-compatible` provider shared one adapter. That was wrong and was
 * caught in review — each adapter hardcodes its own endpoint, key env and model
 * map, so sharing one would have sent an xAI-selected payload to OpenAI. The
 * registry's `transport` records protocol compatibility, which is real; it is
 * not permission to reuse another vendor's credentials. Making the
 * openai-compatible adapter take its base URL, key and model map PER PROVIDER
 * is the change that would finally make a new entrant pure registry data.
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
