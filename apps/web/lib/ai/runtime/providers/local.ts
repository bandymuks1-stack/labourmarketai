/**
 * LOCAL OpenAI-compatible completion provider — the keyless adapter.
 *
 * The one adapter whose endpoint is CONFIGURED rather than compiled in. It
 * speaks the OpenAI chat-completions shape against a server the operator runs
 * themselves — Ollama's OpenAI-compatible API, LM Studio, vLLM, llama.cpp's
 * server, anything else implementing that shape. NO PRODUCT IS HARD-CODED and
 * none is privileged: the runtime knows a wire format, not a vendor.
 *
 * That is also why this file names no host, and therefore needs no entry in the
 * provider-host allowlist that `lib/guards/ai-task-routing.test.ts` pins — there
 * is no host to allow. The address comes from `cfg.localBaseUrl`, which
 * `config-core.checkLocalBaseUrl` already validated (http/https only, no
 * embedded credentials, plaintext confined to loopback).
 *
 * HONEST GATING, same doctrine as every other adapter — it runs ONLY when
 *   - AI_LOCAL_ENABLED=true, and
 *   - the config carries a validated base URL, and
 *   - the config carries an explicit model id.
 * Otherwise it returns the typed disabled sentinel; it never fakes a result.
 *
 * WHAT IT DOES NOT REQUIRE: an api key. `AI_LOCAL_API_KEY` is optional and
 * exists only for a local runtime placed behind a reverse proxy that wants a
 * bearer token. Its ABSENCE is the normal case and is never an error — that is
 * the whole point of the local seam, and demanding a placeholder secret would
 * have made a fake key look like configuration.
 *
 * Server-only by usage (env read at call time; never in a client bundle).
 */
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { extractJson, fetchErrorResult, jsonSchemaHint } from "./extract-json";

function enabled(): boolean {
  return process.env.AI_LOCAL_ENABLED === "true";
}

/** Optional bearer for a proxied local runtime. Absent is the normal case. */
function localBearer(): string | undefined {
  return process.env.AI_LOCAL_API_KEY?.trim() || undefined;
}

/**
 * Build the chat-completions endpoint from the operator's base URL.
 *
 * Both spellings are in the wild and both are accepted: an operator who
 * copied the URL out of their runtime's UI usually has the `/v1` suffix
 * already (`…:11434/v1`), while one who typed the origin does not. Appending
 * `/v1` unconditionally would 404 the first group; assuming it is present
 * would 404 the second. So the suffix decides.
 */
export function chatCompletionsUrl(baseUrl: string): string {
  return /\/v\d+$/.test(baseUrl)
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
}

export const localCompletionProvider: AiCompletionProvider = {
  kind: "local",
  async complete(
    request: AiCompletionRequest,
    cfg: AiRuntimeConfig,
  ): Promise<AiCompletionResult> {
    if (!enabled()) return { status: "disabled", reason: "mode_disabled" };
    if (!cfg.localBaseUrl) {
      return { status: "disabled", reason: "missing_base_url" };
    }
    if (!cfg.localModel) {
      return { status: "disabled", reason: "missing_local_model" };
    }

    // The routed tier ALIAS is meaningless here: a local server hosts exactly
    // the model the operator pulled. Honouring `request.model` would send an
    // anthropic-shaped id to a machine that has never heard of it, so the
    // configured id wins — deliberately, and it is what the audit records.
    const model = cfg.localModel;
    const maxTokens = Math.min(
      request.maxOutputTokens ?? cfg.maxOutputTokens,
      cfg.maxOutputTokens,
    );
    const bearer = localBearer();

    try {
      const res = await fetch(chatCompletionsUrl(cfg.localBaseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          // Small local models drift from a schema more often than the frontier
          // cloud models do (provider-chain marks this one structuredOutput:
          // false). The format is REQUESTED here and the JSON repair pass in
          // extractJson stays the safety net — a server that ignores the field
          // still works, one that honours it just works more often.
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: request.system + jsonSchemaHint(request.jsonSchema),
            },
            {
              role: "user",
              content: `Locale: ${request.locale}\nInput:\n${JSON.stringify(request.input)}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) {
        // Status only. A local server's body can echo the request — which here
        // contains the prompt — so it never reaches a log line.
        return {
          status: "error",
          code: "provider_error",
          message: `local runtime http ${res.status}`,
        };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content;
      const raw = typeof text === "string" ? extractJson(text) : undefined;
      if (raw === undefined) {
        return {
          status: "error",
          code: "malformed_output",
          message: "no JSON in local runtime response",
        };
      }
      return {
        status: "ok",
        provider: "local",
        model,
        raw,
        usage: {
          inputTokens: json.usage?.prompt_tokens,
          outputTokens: json.usage?.completion_tokens,
        },
      };
    } catch (err) {
      // A stopped local runtime lands here as ECONNREFUSED. It is an ordinary,
      // expected state — the machine is off — and the chain treats it as
      // "unavailable, try the next candidate", never as a crash.
      const { code, message } = fetchErrorResult(err);
      return { status: "error", code, message };
    }
  },
};
