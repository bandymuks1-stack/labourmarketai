/**
 * FREE API TIERS — Cloudflare Workers AI, Mistral, Groq (2026-10-25).
 *
 * Owner order 2026-10-25: restore real AI with maximum use of FREE provider
 * quotas, reliable fallback and minimal cost; no new paid plans, no second
 * router. These are three BINDINGS on the one OpenAI-compatible wire in
 * `./openai.ts` — not three new code paths. Each is:
 *
 *   - env-gated twice (its AI_<P>_ENABLED flag AND its key) and returns the
 *     typed disabled sentinel otherwise — inert without its key;
 *   - its OWN endpoint, key and model table — a payload chosen for one vendor
 *     can never reach another vendor's host;
 *   - a `free_tier` profile in `provider-chain.ts`, so the data-egress gate
 *     sends it PUBLIC payloads only (no grant names these providers), and the
 *     free-tier ceiling caps any future grant at LOW_RISK_PROJECT_DATA.
 *
 * Terms each binding rests on (read first-hand 2026-10-25, recorded again on
 * the registry rows next to the prices):
 *
 *   Cloudflare Workers AI — 10,000 Neurons/day free on Workers Free AND Paid;
 *     on Workers Free requests fail once the allocation is spent (no bill).
 *     "Cloudflare does not use Customer Content processed by Workers AI to
 *     train AI models"; inputs/outputs are not retained after the request.
 *     developers.cloudflare.com/workers-ai/platform/{pricing,data-usage}/.
 *   Mistral (free "Experiment" API plan) — rate-limited, $0. API data MAY be
 *     used for training unless the opt-out is switched off in the Admin
 *     console (help.mistral.ai article 455207). EU vendor.
 *   Groq (free plan) — rate-limited, $0; Services Agreement §4.2: no training
 *     on inputs or outputs, DPA incorporated; inputs not retained by default,
 *     logs ≤ 30 days, Zero Data Retention available; storage in GCP US
 *     (console.groq.com/docs/your-data). Free-plan commercial use is not
 *     stated, so it stays a `free_tier` provider like the other two.
 *
 * None of that changes what may be SENT: that is `data-egress.ts`, and every
 * one of these is a `free_tier` external provider there.
 */
import type { AiCompletionProvider } from "../types";
import {
  createOpenAiCompatibleProvider,
  type OpenAiCompatibleBinding,
} from "./openai";

/** Cloudflare's OpenAI-compatible chat endpoint lives under the ACCOUNT, so
 *  the binding is unconfigured (null) until an account id is present. The id
 *  is operator config (env), never user input — and it is URL-encoded anyway. */
function cloudflareChatUrl(): string | null {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!account) return null;
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`;
}

/**
 * Cloudflare Workers AI general LLMs. The SAME vendor, account, token and enable
 * flag as the m2m100 translation secondary (`./cloudflare.ts`) — one vendor is
 * one switch — and the same `cloudflare` id the egress gate already knows.
 * `response_format` is not documented on the compatibility page, so the JSON
 * contract rides on the system-prompt hint + `extractJson` instead.
 */
export const CLOUDFLARE_LLM_BINDING: OpenAiCompatibleBinding = {
  id: "cloudflare",
  chatCompletionsUrl: cloudflareChatUrl,
  enabled: () => process.env.AI_CLOUDFLARE_ENABLED === "true",
  apiKey: () => process.env.CLOUDFLARE_API_TOKEN?.trim() || undefined,
  tokenParam: "max_tokens",
  jsonObjectMode: false,
  strictModels: true,
};

export const MISTRAL_BINDING: OpenAiCompatibleBinding = {
  id: "mistral",
  chatCompletionsUrl: () => "https://api.mistral.ai/v1/chat/completions",
  enabled: () => process.env.AI_MISTRAL_ENABLED === "true",
  apiKey: () => process.env.MISTRAL_API_KEY?.trim() || undefined,
  tokenParam: "max_tokens",
  jsonObjectMode: true,
  strictModels: true,
};

export const GROQ_BINDING: OpenAiCompatibleBinding = {
  id: "groq",
  chatCompletionsUrl: () => "https://api.groq.com/openai/v1/chat/completions",
  enabled: () => process.env.AI_GROQ_ENABLED === "true",
  apiKey: () => process.env.GROQ_API_KEY?.trim() || undefined,
  tokenParam: "max_tokens",
  jsonObjectMode: true,
  strictModels: true,
};

export const cloudflareLlmCompletionProvider: AiCompletionProvider =
  createOpenAiCompatibleProvider(CLOUDFLARE_LLM_BINDING);
export const mistralCompletionProvider: AiCompletionProvider =
  createOpenAiCompatibleProvider(MISTRAL_BINDING);
export const groqCompletionProvider: AiCompletionProvider =
  createOpenAiCompatibleProvider(GROQ_BINDING);
