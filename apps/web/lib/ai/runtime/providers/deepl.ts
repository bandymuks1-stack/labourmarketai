/**
 * DeepL translation provider — env-gated fetch wire (AI Router v1).
 *
 * REAL minimal HTTP wire to the DeepL v2 translate API. It serves EXACTLY ONE
 * task: translate_message (agent "translation_copy") — the routing layer's
 * languageRouting preference sends translation requests here first; every
 * other agent gets an honest "unsupported" error. Only files under
 * lib/ai/runtime/providers/ may reference api.deepl.com (pinned by
 * lib/guards/ai-task-routing.test.ts).
 *
 * HONEST GATING: runs ONLY when BOTH AI_DEEPL_ENABLED=true AND DEEPL_API_KEY
 * are present; otherwise the typed disabled sentinel is returned and run-core
 * falls through to the primary LLM tier — never a faked translation.
 *
 * ENVELOPE SHAPING (documented, honest): DeepL returns plain translated text,
 * not the agent envelope, so this adapter wraps the translation in the strict
 * translation_copy envelope with truthful fields: plain_language_version is
 * null (DeepL does not produce one), wording_warnings is empty AND
 * missing_information declares that wording strength was NOT assessed —
 * nothing is claimed that the machine translation cannot back.
 *
 * Server-only by usage (env read at call time; never in a client bundle).
 */
import type {
  AiCompletionProvider,
  AiCompletionRequest,
  AiCompletionResult,
} from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { fetchErrorResult } from "./extract-json";

function enabled(): boolean {
  return process.env.AI_DEEPL_ENABLED === "true";
}

function liveApiKey(): string | undefined {
  return process.env.DEEPL_API_KEY?.trim() || undefined;
}

/** Free-plan keys end in ":fx" and must call the free host. */
function apiHost(key: string): string {
  return key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

/** Map a product locale to a DeepL target_lang. */
export function deeplTargetLang(locale: string): string {
  const lower = locale.trim().toLowerCase();
  if (lower.startsWith("en")) return "EN-GB";
  if (lower.startsWith("pt")) return "PT-PT";
  return lower.slice(0, 2).toUpperCase();
}

export const deeplCompletionProvider: AiCompletionProvider = {
  kind: "deepl",
  async complete(
    request: AiCompletionRequest,
    cfg: AiRuntimeConfig,
  ): Promise<AiCompletionResult> {
    if (!enabled()) return { status: "disabled", reason: "mode_disabled" };
    const apiKey = liveApiKey();
    if (!apiKey) return { status: "disabled", reason: "missing_api_key" };

    if (request.agentKey !== "translation_copy") {
      return {
        status: "error",
        code: "unsupported",
        message: "deepl adapter serves the translate_message task only",
      };
    }
    const input = request.input as {
      canonicalMessage?: unknown;
      locale?: unknown;
    } | null;
    const sourceText =
      input && typeof input.canonicalMessage === "string"
        ? input.canonicalMessage
        : null;
    const targetLocale =
      input && typeof input.locale === "string" ? input.locale : request.locale;
    if (!sourceText) {
      return {
        status: "error",
        code: "unsupported",
        message: "deepl adapter needs a canonicalMessage string input",
      };
    }

    try {
      const res = await fetch(`${apiHost(apiKey)}/v2/translate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `DeepL-Auth-Key ${apiKey}`,
        },
        body: JSON.stringify({
          text: [sourceText],
          target_lang: deeplTargetLang(targetLocale),
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) {
        return {
          status: "error",
          code: "provider_error",
          message: `deepl http ${res.status}`,
        };
      }
      const json = (await res.json()) as {
        translations?: { text?: string }[];
      };
      const translated = json.translations?.[0]?.text;
      if (typeof translated !== "string" || translated.length === 0) {
        return {
          status: "error",
          code: "malformed_output",
          message: "no translation in response",
        };
      }
      // Honest envelope shaping (see file docblock) — validated downstream by
      // the strict translation_copy output schema exactly like any raw output.
      return {
        status: "ok",
        provider: "deepl",
        model: "deepl-v2",
        raw: {
          suggestion: true,
          agent: "translation_copy",
          confidence: "medium",
          evidence_refs: [{ source: "canonical_message", ref: "deepl:v2" }],
          missing_information: [
            "wording_warnings not assessed — machine translation via DeepL",
            "plain_language_version not produced by DeepL",
          ],
          needs_human_review: false,
          blocked_claims: [],
          data: {
            localized_copy: translated.slice(0, 8000),
            plain_language_version: null,
            wording_warnings: [],
          },
        },
        // DeepL bills per character, not tokens — honest nulls, never faked.
        usage: undefined,
      };
    } catch (err) {
      const { code, message } = fetchErrorResult(err);
      return { status: "error", code, message };
    }
  },
};
