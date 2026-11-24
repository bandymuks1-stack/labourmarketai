/**
 * Anthropic live completion provider — the ONE allowlisted SDK importer.
 *
 * This is the ONLY file in the repo permitted to import `@anthropic-ai/sdk`
 * (enforced by lib/guards/ai-readiness.test.ts + no-direct-llm-client-call). It
 * is reached ONLY when the runtime config resolves to `live` (AI_PROVIDER_MODE=
 * live + a real key). The SDK is lazy-imported so it is never pulled into a
 * bundle that doesn't use it, and the key is read from the resolved config
 * (sourced from server env), never hard-coded, never sent to the client.
 *
 * It asks Claude for a single JSON object matching the agent's schema and
 * returns the RAW parsed output. It NEVER persists, verifies, prices, or sends
 * anything — it only returns text the agent layer then validates against a
 * strict zod schema. Default model: claude-opus-4-8 (see the claude-api skill).
 *
 * Server-only (the dispatcher never selects it outside `live`).
 */
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { supportsAdaptiveThinking } from "../model-registry";

/** Read the live key from server env at call time (never imported into client). */
function liveApiKey(): string | undefined {
  // Indirect access keeps this out of any client bundle; the dispatcher only
  // ever calls this provider when the config already proved a key is present.
  return process.env.AI_API_KEY?.trim() || undefined;
}

/** Best-effort: pull the first JSON object out of a model text response. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export const anthropicCompletionProvider: AiCompletionProvider = {
  kind: "anthropic",
  async complete(
    request: AiCompletionRequest,
    cfg: AiRuntimeConfig,
  ): Promise<AiCompletionResult> {
    const apiKey = liveApiKey();
    if (!apiKey) return { status: "error", code: "no_api_key", message: "AI_API_KEY missing" };

    let Anthropic: typeof import("@anthropic-ai/sdk").default;
    try {
      ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    } catch {
      return { status: "error", code: "unsupported", message: "AI SDK unavailable" };
    }

    const client = new Anthropic({
      apiKey,
      maxRetries: cfg.maxRetries,
      timeout: cfg.timeoutMs,
    });

    const maxTokens = Math.min(
      request.maxOutputTokens ?? cfg.maxOutputTokens,
      cfg.maxOutputTokens,
    );

    // Task-routing model override (an id resolved from a tier alias) — falls
    // back to the config default when the caller did not route the request.
    const model = request.model ?? cfg.model;

    // The agent's strict schema is the contract; we instruct JSON-only output
    // and validate downstream (the agent layer rejects anything off-shape).
    const schemaHint = request.jsonSchema
      ? `\n\nReturn ONLY a single JSON object matching this JSON Schema (no prose, no code fence):\n${JSON.stringify(request.jsonSchema)}`
      : "\n\nReturn ONLY a single JSON object (no prose, no code fence).";

    try {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        // Model-aware: adaptive thinking is valid only on 4.6+ generations;
        // pre-4.6 models (the routed `haiku` alias among them) reject it with
        // a 400. Omitting the parameter is valid everywhere, so omit is the
        // fail-safe for any model the registry does not affirm.
        ...(supportsAdaptiveThinking(model)
          ? { thinking: { type: "adaptive" as const } }
          : {}),
        system: request.system + schemaHint,
        messages: [
          {
            role: "user",
            content: `Locale: ${request.locale}\nInput:\n${JSON.stringify(request.input)}`,
          },
        ],
      });

      const textBlock = res.content.find(
        (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
      );
      const raw = textBlock ? extractJson(textBlock.text) : undefined;
      if (raw === undefined) {
        // A response cut at the token ceiling is not the model failing the
        // schema — the same request truncates identically on any provider, so
        // it must be attributed to the request, never retried as INVALID_OUTPUT.
        if (res.stop_reason === "max_tokens") {
          return {
            status: "error",
            code: "truncated",
            message: `output truncated at max_tokens=${maxTokens}`,
          };
        }
        return { status: "error", code: "malformed_output", message: "no JSON in response" };
      }
      return {
        status: "ok",
        provider: "anthropic",
        model,
        raw,
        usage: {
          inputTokens: res.usage?.input_tokens,
          outputTokens: res.usage?.output_tokens,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "provider error";
      const code = /timeout|aborted/i.test(message) ? "timeout" : "provider_error";
      return { status: "error", code, message };
    }
  },
};
