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
 * Server-only by usage (env read at call time; never in a client bundle).
 */
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { AI_MODEL_CANDIDATES } from "../model-candidates";
import { extractJson, fetchErrorResult, jsonSchemaHint } from "./extract-json";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

function enabled(): boolean {
  return process.env.AI_OPENAI_ENABLED === "true";
}

function liveApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

/** Resolve the OpenAI model: explicit anthropic-shaped ids are re-mapped via
 *  the routed tier alias; otherwise the request/config model is honored. */
function resolveModel(request: AiCompletionRequest, cfg: AiRuntimeConfig): string {
  if (request.modelAlias) return AI_MODEL_CANDIDATES.openai[request.modelAlias];
  return request.model ?? cfg.model;
}

export const openaiCompletionProvider: AiCompletionProvider = {
  kind: "openai",
  async complete(
    request: AiCompletionRequest,
    cfg: AiRuntimeConfig,
  ): Promise<AiCompletionResult> {
    if (!enabled()) return { status: "disabled", reason: "mode_disabled" };
    const apiKey = liveApiKey();
    if (!apiKey) return { status: "disabled", reason: "missing_api_key" };

    const model = resolveModel(request, cfg);
    const maxTokens = Math.min(
      request.maxOutputTokens ?? cfg.maxOutputTokens,
      cfg.maxOutputTokens,
    );

    try {
      const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: maxTokens,
          response_format: { type: "json_object" },
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
        return {
          status: "error",
          code: "provider_error",
          message: `openai http ${res.status}`,
        };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content;
      const raw = typeof text === "string" ? extractJson(text) : undefined;
      if (raw === undefined) {
        return { status: "error", code: "malformed_output", message: "no JSON in response" };
      }
      return {
        status: "ok",
        provider: "openai",
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
