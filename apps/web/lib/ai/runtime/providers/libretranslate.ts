/**
 * LibreTranslate (Argos) — self-hostable, open-source machine translation.
 *
 * REAL minimal HTTP wire to a LibreTranslate server's `/translate`. Serves
 * EXACTLY ONE task: translate_message (agent "translation_copy").
 *
 * HONEST GATING: runs ONLY when AI_LIBRETRANSLATE_ENABLED=true AND
 * LIBRETRANSLATE_URL is set; otherwise the typed disabled sentinel is returned
 * and the secondary walk moves to the next provider. Never a faked translation.
 *
 * DATA BOUNDARY. Whether a message may be sent here is the data-egress gate's
 * decision, not this file's. `egressProfile()` states the truth the gate needs:
 * the server is `local` (inside infrastructure the owner controls — no egress)
 * ONLY when the operator declares AI_LIBRETRANSLATE_SELF_HOSTED=true; any other
 * instance (a public host, a vendor's hosted API) is an external free tier and
 * the standing free-tier rule refuses private text for it. The URL is also held
 * to the outbound host policy by the caller of this module's env (see
 * lib/config/outbound-host-policy.ts); this file never widens it.
 *
 * LANGUAGES. `SUPPORTED` is the set the project needs that LibreTranslate
 * lists; a language outside it returns `unsupported` so the walk advances to the
 * next provider instead of sending a request the engine cannot honour. Georgian
 * is not in it.
 */
import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResult } from "../types";
import type { AiRuntimeConfig } from "../config-core";
import { fetchErrorResult, httpErrorResult } from "./extract-json";
import { readTranslationRequest, translationEnvelope } from "./mt-envelope";

/** Product communication codes → LibreTranslate codes (`no` is Norwegian Bokmål). */
const CODE: Readonly<Record<string, string>> = { no: "nb" };
const SUPPORTED: ReadonlySet<string> = new Set([
  "en", "lt", "lv", "et", "ru", "pl", "de", "nl", "da", "nb", "sv", "uk",
]);

function enabled(): boolean {
  return process.env.AI_LIBRETRANSLATE_ENABLED === "true";
}
function baseUrl(): string | undefined {
  const raw = process.env.LIBRETRANSLATE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : undefined;
}

/** What the data-egress gate must know, evaluated at call time. */
export function libretranslateEgressProfile(): {
  readonly id: "libretranslate";
  readonly locality: "local" | "cloud";
  readonly costClass: "free_local" | "free_tier";
} {
  const selfHosted = process.env.AI_LIBRETRANSLATE_SELF_HOSTED === "true";
  return {
    id: "libretranslate",
    locality: selfHosted ? "local" : "cloud",
    costClass: selfHosted ? "free_local" : "free_tier",
  };
}

export const libretranslateCompletionProvider: AiCompletionProvider = {
  kind: "libretranslate",
  async complete(request: AiCompletionRequest, cfg: AiRuntimeConfig): Promise<AiCompletionResult> {
    if (!enabled()) return { status: "disabled", reason: "mode_disabled" };
    const url = baseUrl();
    if (!url) return { status: "disabled", reason: "missing_base_url" };
    if (request.agentKey !== "translation_copy") {
      return { status: "error", code: "unsupported", message: "libretranslate serves the translate_message task only" };
    }
    const { text, target: rawTarget, source: rawSource } = readTranslationRequest(request);
    if (!text) {
      return { status: "error", code: "unsupported", message: "libretranslate needs a canonicalMessage string input" };
    }
    const target = CODE[rawTarget] ?? rawTarget;
    const source = rawSource ? (CODE[rawSource] ?? rawSource) : "auto";
    if (!SUPPORTED.has(target) || (source !== "auto" && !SUPPORTED.has(source))) {
      return {
        status: "error",
        code: "unsupported",
        message: `libretranslate does not serve ${source}→${target}`,
      };
    }
    try {
      const apiKey = process.env.LIBRETRANSLATE_API_KEY?.trim();
      const res = await fetch(`${url}/translate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: text,
          source,
          target,
          format: "text",
          ...(apiKey ? { api_key: apiKey } : {}),
        }),
        signal: AbortSignal.timeout(Math.min(cfg.timeoutMs, 8000)),
      });
      if (!res.ok) return { status: "error", ...(await httpErrorResult("libretranslate", res)) };
      const json = (await res.json()) as { translatedText?: unknown };
      const translated = typeof json.translatedText === "string" ? json.translatedText : "";
      if (translated.trim().length === 0) {
        return { status: "error", code: "malformed_output", message: "no translation in response" };
      }
      return {
        status: "ok",
        provider: "libretranslate",
        model: "libretranslate-argos",
        raw: translationEnvelope({ translated, engine: "libretranslate" }),
        usage: undefined,
      };
    } catch (err) {
      const { code, message } = fetchErrorResult(err);
      return { status: "error", code, message };
    }
  },
};
