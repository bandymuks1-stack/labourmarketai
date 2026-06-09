/**
 * Safe translation service layer (slice translation-safe-service-layer-v1).
 *
 * This is the HONEST INTERFACE for translating work instructions — NOT a real
 * translation product. No external AI / translation provider is connected to
 * private messages here. Connecting a real provider requires SEPARATE owner
 * approval (a RED action: external AI + private data). Until then the default
 * provider returns `unavailable`, and the worker keeps seeing the original.
 *
 * Guarantees enforced by this layer (so a future provider cannot lie):
 *  - the ORIGINAL is read-only — never mutated, never overwritten;
 *  - only `available` results may carry translated text; an empty result or one
 *    that merely echoes the original is downgraded to `needs_review` (never a
 *    fake translation);
 *  - bounded timeout + at most a couple of retries; any error → `failed`;
 *  - no silent overwrite — the caller stores `translated_text` separately from
 *    the original `body`.
 */

/** Lifecycle of a translation (superset of the DB check today; `failed` /
 *  `needs_review` are persisted once a provider is wired behind owner approval). */
export type TranslationStatus =
  | "pending"
  | "unavailable"
  | "available"
  | "failed"
  | "needs_review";

export interface TranslationRequest {
  /** The ORIGINAL text. This layer treats it as immutable. */
  readonly text: string;
  readonly sourceLanguage: string | null;
  readonly targetLanguage: string;
}

export interface TranslationResult {
  status: TranslationStatus;
  /** Non-null ONLY when status === "available". Never the original echoed back. */
  translatedText: string | null;
  /** Which provider produced this, or null when none is configured. */
  provider: string | null;
  error: string | null;
}

export interface TranslateOptions {
  timeoutMs?: number;
  retries?: number;
}

export interface TranslationProvider {
  readonly id: string;
  translate(
    req: TranslationRequest,
    opts: { timeoutMs: number; signal: AbortSignal },
  ): Promise<TranslationResult>;
}

/**
 * The default provider — NO external service connected. Returns `unavailable`
 * honestly. This is the ONLY provider shipped until the owner approves wiring a
 * real one to private messages.
 */
export const NO_PROVIDER_CONFIGURED: TranslationProvider = {
  id: "none",
  async translate(): Promise<TranslationResult> {
    return {
      status: "unavailable",
      translatedText: null,
      provider: null,
      error: null,
    };
  },
};

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

/**
 * Safe entry point. With the default provider it returns `unavailable`. With a
 * (future, owner-approved) provider it enforces the honesty guarantees above.
 * The original `req.text` is never mutated.
 */
export async function translateInstruction(
  req: TranslationRequest,
  provider: TranslationProvider = NO_PROVIDER_CONFIGURED,
  opts: TranslateOptions = {},
): Promise<TranslationResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.min(Math.max(opts.retries ?? 1, 0), MAX_RETRIES);

  let lastError: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await provider.translate(req, {
        timeoutMs,
        signal: controller.signal,
      });

      if (res.status === "available") {
        const t = res.translatedText?.trim() ?? "";
        // An empty translation, or one that just echoes the original, is NOT a
        // real translation — surface it for human review, never as `available`.
        if (t.length === 0 || t === req.text.trim()) {
          return {
            status: "needs_review",
            translatedText: null,
            provider: res.provider,
            error: "empty-or-echo",
          };
        }
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "error";
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    status: "failed",
    translatedText: null,
    provider: provider.id === "none" ? null : provider.id,
    error: lastError,
  };
}

/** Whether a real provider is configured. Always false until owner approval. */
export function isTranslationProviderConfigured(
  provider: TranslationProvider = NO_PROVIDER_CONFIGURED,
): boolean {
  return provider.id !== "none";
}
