/**
 * OpenAI live completion provider — env-gated fetch wire (AI Router v1).
 *
 * REAL minimal HTTP wire to the OpenAI Chat Completions API. No SDK import
 * (guard: only providers/anthropic.ts may import an LLM SDK; this adapter is
 * fetch-based, and only files under lib/ai/runtime/providers/ may reference
 * api.openai.com — pinned by lib/guards/ai-task-routing.test.ts).
 *
 * HONEST GATING: the adapter runs ONLY when BOTH
 *   - AI_OPENAI_ENABLED=true, and
 *   - OPENAI_API_KEY is present.
 * Otherwise it returns the typed disabled sentinel — it never fakes a result.
 * Reached only through run-core dispatch (AI_PROVIDER=openai + live mode);
 * business logic never imports this file.
 *
 * ONE WIRE, MANY BINDINGS (2026-10-25, free-provider chain). The chat-completions
 * shape is shared by most free API tiers (Groq, Mistral, Cloudflare Workers AI's
 * `/ai/v1` endpoint). The earlier review finding still holds — sharing the
 * OpenAI ADAPTER would send another vendor's payload to api.openai.com under
 * OPENAI_API_KEY — so what is shared is the WIRE, and every vendor supplies its
 * OWN binding: endpoint, key, enable flag and model table. A binding is the
 * whole difference between two vendors; there is no protocol-level fallback to
 * another vendor's endpoint anywhere in this file.
 *
 * Server-only by usage (env read at call time; never in a client bundle).
 */
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "../types";
import type { AiProviderKind, AiRuntimeConfig } from "../config-core";
import { AI_MODEL_CANDIDATES } from "../model-candidates";
import { registryEntryForModel } from "../model-registry";
import {
  extractJson,
  fetchErrorResult,
  jsonSchemaHint,
  malformedOrTruncated,
  httpErrorResult,
} from "./extract-json";

/**
 * Everything that makes one OpenAI-compatible vendor different from another.
 * Read at CALL time (never at import), so a test or an env change is honoured
 * without a module reload, and nothing here is evaluated in a client bundle.
 */
export interface OpenAiCompatibleBinding {
  /** Chain / registry provider id. Also the attribution on every result. */
  readonly id: AiProviderKind;
  /** The chat-completions URL, or null when the binding is not configured
   *  (e.g. Cloudflare without an account id). Never a user-supplied value. */
  readonly chatCompletionsUrl: () => string | null;
  /** The per-provider enable flag (AI_<P>_ENABLED === "true"). */
  readonly enabled: () => boolean;
  /** The vendor key, trimmed; undefined when absent. */
  readonly apiKey: () => string | undefined;
  /** OpenAI's reasoning models take `max_completion_tokens`; most compatible
   *  vendors document `max_tokens`. */
  readonly tokenParam: "max_completion_tokens" | "max_tokens";
  /** Send `response_format: {type:"json_object"}`. Only for vendors that
   *  document it — an unknown field is a 400 on some, and the JSON hint in
   *  the system prompt plus `extractJson` is the portable fallback. */
  readonly jsonObjectMode: boolean;
  /**
   * Refuse a model id that is not this provider's own registry entry. OFF for
   * OpenAI (legacy: an explicit request.model has always been honoured), ON
   * for every free-tier binding: an unrecognised id there is either another
   * vendor's id or a typo, and both fail closed HERE with a sentence rather
   * than at the vendor with an opaque 404.
   */
  readonly strictModels: boolean;
}

/** Resolve the model: the routed tier alias → this provider's candidate;
 *  otherwise the request/config model. Null = no honest model for this route. */
function resolveModel(
  binding: OpenAiCompatibleBinding,
  request: AiCompletionRequest,
  cfg: AiRuntimeConfig,
): string | null {
  const table = AI_MODEL_CANDIDATES[binding.id] ?? {};
  if (request.modelAlias) return table[request.modelAlias] ?? null;
  const model = request.model ?? cfg.model;
  if (!binding.strictModels) return model;
  return registryEntryForModel(model)?.provider === binding.id ? model : null;
}

/** A 429's `retry-after` (seconds), appended in a fixed shape the chain's
 *  cooldown reads (`provider-cooldown.ts`). Structural — never payload. */
function retryAfterSuffix(res: Response): string {
  if (res.status !== 429) return "";
  const raw = res.headers.get("retry-after");
  const seconds = raw !== null ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? ` (retry-after ${seconds}s)` : "";
}

/** Build a completion provider for one OpenAI-compatible vendor binding. */
export function createOpenAiCompatibleProvider(
  binding: OpenAiCompatibleBinding,
): AiCompletionProvider {
  return {
    kind: binding.id,
    async complete(
      request: AiCompletionRequest,
      cfg: AiRuntimeConfig,
    ): Promise<AiCompletionResult> {
      if (!binding.enabled()) return { status: "disabled", reason: "mode_disabled" };
      const apiKey = binding.apiKey();
      const url = binding.chatCompletionsUrl();
      if (!apiKey || !url) return { status: "disabled", reason: "missing_api_key" };

      const model = resolveModel(binding, request, cfg);
      if (model === null) {
        return {
          status: "error",
          code: "unsupported",
          message: `${binding.id} has no registry model for this route`,
          provider: binding.id,
        };
      }
      const maxTokens = Math.min(
        request.maxOutputTokens ?? cfg.maxOutputTokens,
        cfg.maxOutputTokens,
      );

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            [binding.tokenParam]: maxTokens,
            ...(binding.jsonObjectMode
              ? { response_format: { type: "json_object" } }
              : {}),
            messages: [
              { role: "system", content: request.system + jsonSchemaHint(request.jsonSchema) },
              {
                role: "user",
                content: `Locale: ${request.locale}\nInput:\n${JSON.stringify(request.input)}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        if (!res.ok) {
          const err = await httpErrorResult(binding.id, res);
          return {
            status: "error",
            code: err.code,
            message: `${err.message}${retryAfterSuffix(res)}`,
          };
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content;
        const raw = typeof text === "string" ? extractJson(text) : undefined;
        if (raw === undefined) {
          return malformedOrTruncated(
            json.choices?.[0]?.finish_reason === "length",
            binding.id,
          );
        }
        return {
          status: "ok",
          provider: binding.id,
          model,
          raw,
          usage: {
            inputTokens: json.usage?.prompt_tokens,
            outputTokens: json.usage?.completion_tokens,
          },
        };
      } catch (err) {
        const { code, message } = fetchErrorResult(err);
        return { status: "error", code, message };
      }
    },
  };
}

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** OpenAI's own binding — behaviour unchanged from the single-vendor adapter. */
export const OPENAI_BINDING: OpenAiCompatibleBinding = {
  id: "openai",
  chatCompletionsUrl: () => OPENAI_CHAT_COMPLETIONS_URL,
  enabled: () => process.env.AI_OPENAI_ENABLED === "true",
  apiKey: () => process.env.OPENAI_API_KEY?.trim() || undefined,
  tokenParam: "max_completion_tokens",
  jsonObjectMode: true,
  strictModels: false,
};

export const openaiCompletionProvider: AiCompletionProvider =
  createOpenAiCompatibleProvider(OPENAI_BINDING);
