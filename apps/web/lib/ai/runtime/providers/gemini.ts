/**
 * Google Gemini live completion provider — env-gated fetch wire (AI Router v1).
 *
 * REAL minimal HTTP wire to the Gemini generateContent REST API. No SDK
 * import; only files under lib/ai/runtime/providers/ may reference
 * generativelanguage.googleapis.com (pinned by lib/guards/ai-task-routing.test.ts).
 *
 * HONEST GATING: runs ONLY when BOTH AI_GEMINI_ENABLED=true AND
 * GEMINI_API_KEY are present; otherwise the typed disabled sentinel is
 * returned — never a faked result. Reached only through run-core dispatch
 * (AI_PROVIDER=gemini + live mode); business logic never imports this file.
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
import {
  extractJson,
  fetchErrorResult,
  jsonSchemaHint,
  malformedOrTruncated,
  httpErrorResult,
} from "./extract-json";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function enabled(): boolean {
  return process.env.AI_GEMINI_ENABLED === "true";
}

function liveApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

function resolveModel(request: AiCompletionRequest, cfg: AiRuntimeConfig): string {
  if (request.modelAlias) return AI_MODEL_CANDIDATES.gemini[request.modelAlias];
  return request.model ?? cfg.model;
}

export const geminiCompletionProvider: AiCompletionProvider = {
  kind: "gemini",
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
      const res = await fetch(
        `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: request.system + jsonSchemaHint(request.jsonSchema) }],
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Locale: ${request.locale}\nInput:\n${JSON.stringify(request.input)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        },
      );
      if (!res.ok) {
        return { status: "error", ...(await httpErrorResult("gemini", res)) };
      }
      const json = (await res.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
        }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      const raw = typeof text === "string" ? extractJson(text) : undefined;
      if (raw === undefined) {
        return malformedOrTruncated(
          json.candidates?.[0]?.finishReason === "MAX_TOKENS",
          "gemini",
        );
      }
      return {
        status: "ok",
        provider: "gemini",
        model,
        raw,
        usage: {
          inputTokens: json.usageMetadata?.promptTokenCount,
          outputTokens: json.usageMetadata?.candidatesTokenCount,
        },
      };
    } catch (err) {
      const { code, message } = fetchErrorResult(err);
      return { status: "error", code, message };
    }
  },
};
