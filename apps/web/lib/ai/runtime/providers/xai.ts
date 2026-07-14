/**
 * xAI Grok live completion provider — env-gated fetch wire (AI Router v1).
 *
 * REAL minimal HTTP wire to the xAI OpenAI-compatible Chat Completions API.
 * No SDK import; only files under lib/ai/runtime/providers/ may reference
 * api.x.ai (pinned by lib/guards/ai-task-routing.test.ts).
 *
 * HONEST GATING: runs ONLY when BOTH AI_XAI_ENABLED=true AND XAI_API_KEY are
 * present; otherwise the typed disabled sentinel is returned — never a faked
 * result. Reached only through run-core dispatch (AI_PROVIDER=xai + live
 * mode); business logic never imports this file.
 *
 * Server-only by usage (env read at call time; never in a client bundle).
 */
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { AI_MODEL_CANDIDATES } from "../../types";
import { extractJson, fetchErrorResult, jsonSchemaHint } from "./extract-json";

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";

function enabled(): boolean {
  return process.env.AI_XAI_ENABLED === "true";
}

function liveApiKey(): string | undefined {
  return process.env.XAI_API_KEY?.trim() || undefined;
}

function resolveModel(request: AiCompletionRequest, cfg: AiRuntimeConfig): string {
  if (request.modelAlias) return AI_MODEL_CANDIDATES.xai[request.modelAlias];
  return request.model ?? cfg.model;
}

export const xaiCompletionProvider: AiCompletionProvider = {
  kind: "xai",
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
      const res = await fetch(XAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
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
          message: `xai http ${res.status}`,
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
        provider: "xai",
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
