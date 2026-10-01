/**
 * Cloudflare Workers AI — m2m100-1.2b machine translation (free allocation).
 *
 * REAL minimal HTTP wire to the Workers AI REST `ai/run` endpoint for the
 * `@cf/meta/m2m100-1.2b` translation model (100 languages, incl. Lithuanian,
 * Latvian, Estonian, Ukrainian and Georgian). Serves EXACTLY ONE task:
 * translate_message (agent "translation_copy").
 *
 * HONEST GATING: runs ONLY when AI_CLOUDFLARE_ENABLED=true AND
 * CLOUDFLARE_ACCOUNT_ID AND CLOUDFLARE_API_TOKEN are present; otherwise the
 * typed disabled sentinel is returned. The model is the free-allocation one
 * (10,000 neurons/day on the Free plan, no card); this adapter never selects a
 * paid model and never upgrades a plan.
 *
 * DATA BOUNDARY. Cloudflare is an EXTERNAL free-tier provider, so the standing
 * data-egress rule caps it below private message text (see
 * data-egress.ts MAX_GRANTABLE_FOR_FREE_TIER). The adapter is therefore wired
 * but REFUSED by the gate for messages until the owner records Cloudflare's
 * data terms and reclassifies it — an owner act, deliberately not made here.
 *
 * The source language is REQUIRED by the model (it defaults to English), so an
 * unknown author language returns `unsupported` rather than guessing.
 */
import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResult } from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { fetchErrorResult, httpErrorResult } from "./extract-json";
import { readTranslationRequest, translationEnvelope } from "./mt-envelope";

const MODEL = "@cf/meta/m2m100-1.2b";

function enabled(): boolean {
  return process.env.AI_CLOUDFLARE_ENABLED === "true";
}

/** What the data-egress gate must know. External, free tier. */
export function cloudflareEgressProfile(): {
  readonly id: "cloudflare";
  readonly locality: "cloud";
  readonly costClass: "free_tier";
} {
  return { id: "cloudflare", locality: "cloud", costClass: "free_tier" };
}

export const cloudflareCompletionProvider: AiCompletionProvider = {
  kind: "cloudflare",
  async complete(request: AiCompletionRequest, cfg: AiRuntimeConfig): Promise<AiCompletionResult> {
    if (!enabled()) return { status: "disabled", reason: "mode_disabled" };
    const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!account || !token) return { status: "disabled", reason: "missing_api_key" };
    if (request.agentKey !== "translation_copy") {
      return { status: "error", code: "unsupported", message: "cloudflare serves the translate_message task only" };
    }
    const { text, target, source } = readTranslationRequest(request);
    if (!text) {
      return { status: "error", code: "unsupported", message: "cloudflare needs a canonicalMessage string input" };
    }
    if (!source) {
      return { status: "error", code: "unsupported", message: "cloudflare m2m100 needs the source language" };
    }
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, source_lang: source, target_lang: target }),
          signal: AbortSignal.timeout(Math.min(cfg.timeoutMs, 8000)),
        },
      );
      if (!res.ok) return { status: "error", ...(await httpErrorResult("cloudflare", res)) };
      const json = (await res.json()) as { success?: boolean; result?: { translated_text?: unknown } };
      const translated = typeof json.result?.translated_text === "string" ? json.result.translated_text : "";
      if (json.success === false || translated.trim().length === 0) {
        return { status: "error", code: "malformed_output", message: "no translation in response" };
      }
      return {
        status: "ok",
        provider: "cloudflare",
        model: MODEL,
        raw: translationEnvelope({ translated, engine: "cloudflare" }),
        usage: undefined,
      };
    } catch (err) {
      const { code, message } = fetchErrorResult(err);
      return { status: "error", code, message };
    }
  },
};
