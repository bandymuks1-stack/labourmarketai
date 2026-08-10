/**
 * AI runtime config — PURE core (Internal LLM Agents v1, PR2). No IO, no
 * server-only, no env read: safe to unit-test and to import from a guard. The
 * server wrapper (lib/ai/runtime/config.ts) feeds validated env into
 * {@link resolveAiRuntimeConfig}. Mirrors the proven billing config-core shape.
 *
 * Hard guarantees encoded here:
 *   - OFF by default: the runtime is `disabled` unless AI_PROVIDER_MODE is set
 *     to `mock` or `live`.
 *   - A CLOUD provider is impossible without a real key: AI_PROVIDER_MODE=live
 *     + a known provider + a NON-EMPTY apiKey. A missing key → `disabled`
 *     (never silently live). The key VALUE is never returned — only a presence
 *     flag.
 *   - `mock` needs no key, no network: deterministic provider for tests/dev.
 *   - timeout / retry / output-token / daily-run budgets are clamped to safe
 *     bounds so a misconfigured env can never remove the cost guard.
 *
 * WHY A KEY IS NO LONGER THE UNIVERSAL PROOF OF CONFIGURATION. Until now `live`
 * was conditional on a non-empty api key, and that single line made a whole
 * class of provider unrepresentable: a runtime the operator hosts themselves
 * (Ollama, LM Studio, vLLM — anything speaking the OpenAI chat-completions
 * shape) authenticates by NETWORK LOCATION, not by a secret. Demanding a key
 * from it forced the operator to invent one, and a fake secret is worse than no
 * secret: it looks like configuration and proves nothing.
 *
 * So the proof-of-configuration is now per-LOCALITY, and it was made stricter,
 * not looser:
 *   - a CLOUD provider still requires its key — unchanged, byte for byte;
 *   - a LOCAL provider requires a VALID base URL *and* an explicit model id.
 *     Two required values instead of one, both validated (see
 *     {@link checkLocalBaseUrl}); either missing or malformed → `disabled` with
 *     a reason naming which one.
 *
 * The base URL is TRUSTED CONFIGURATION — it comes from the operator's env, and
 * nothing in the product may route a user-supplied string here. It is still
 * validated, because a typo must fail closed rather than become a server-side
 * fetch target: only http/https, no embedded credentials, and PLAINTEXT http is
 * confined to loopback. That last rule is a privacy rule, not a pedantry: the
 * prompts carry CVs, journal entries and absence notes, and a cleartext hop to
 * a non-loopback host would put them on the wire.
 */

export type AiRuntimeState = "disabled" | "mock" | "live";
/**
 * `local` is the keyless self-hosted seam. It is a first-class provider kind —
 * NOT a cloud vendor with the key check relaxed.
 */
export type AiProviderKind = "local" | "anthropic" | "openai" | "gemini" | "xai";
/** Secondary (task-specific) providers reachable only via routing preference —
 *  never a primary AI_PROVIDER value. */
export type AiSecondaryProviderKind = "deepl";

export type AiDisabledReason =
  | "ok"
  | "mode_disabled"
  | "unknown_provider"
  | "missing_api_key"
  /** Local provider selected with no AI_LOCAL_BASE_URL. */
  | "missing_base_url"
  /** Local base URL is unparseable, not http/https, credential-bearing, or
   *  plaintext http to a non-loopback host. */
  | "invalid_base_url"
  /** Local provider selected with no AI_LOCAL_MODEL — a local server hosts
   *  whatever the operator pulled, so the id can never be defaulted. */
  | "missing_local_model";

export interface AiRuntimeConfig {
  readonly state: AiRuntimeState;
  /** The live provider id (only meaningful when state === "live"). */
  readonly provider: AiProviderKind;
  /** Model id used when live (default claude-opus-4-8). */
  readonly model: string;
  /** Presence only — the key VALUE is never carried on the config. */
  readonly hasApiKey: boolean;
  readonly reason: AiDisabledReason;
  // ── Local (keyless) provider ─────────────────────────────────────────────
  /** VALIDATED, normalised local base URL — null unless it passed every check. */
  readonly localBaseUrl: string | null;
  /** Explicit local model id — null when unset. Never defaulted. */
  readonly localModel: string | null;
  /**
   * Presence only. A local runtime MAY sit behind a reverse proxy that wants a
   * bearer token; that is optional and its absence is never an error.
   */
  readonly hasLocalApiKey: boolean;
  // ── Cost / safety guards (always present, always clamped) ────────────────
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxOutputTokens: number;
  readonly dailyRunBudget: number;
}

export interface AiRuntimeConfigInput {
  mode: string | undefined;
  provider: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  timeoutMs: string | number | undefined;
  maxRetries: string | number | undefined;
  maxOutputTokens: string | number | undefined;
  dailyRunBudget: string | number | undefined;
  /** Base URL of an OpenAI-compatible server the operator runs. */
  localBaseUrl?: string | undefined;
  /** Model id that server actually hosts. Never defaulted. */
  localModel?: string | undefined;
  /** Optional bearer token for a proxied local runtime. */
  localApiKey?: string | undefined;
}

/** Default model for a future live provider — the latest Opus (see claude-api). */
export const DEFAULT_AI_MODEL = "claude-opus-4-8";

const KNOWN_PROVIDERS: readonly AiProviderKind[] = [
  "local",
  "anthropic",
  "openai",
  "gemini",
  "xai",
];

/** Cloud vendors — the providers for which a key IS the proof of configuration. */
const CLOUD_PROVIDERS: readonly AiProviderKind[] = [
  "anthropic",
  "openai",
  "gemini",
  "xai",
];

export function isCloudProvider(p: AiProviderKind): boolean {
  return CLOUD_PROVIDERS.includes(p);
}

/**
 * Is this hostname on the machine/network loopback?
 *
 * Used for ONE decision: whether plaintext http is acceptable. Everything else
 * about the URL is protocol-agnostic. Deliberately conservative — an unlisted
 * host is treated as remote, so the failure mode is "https required", never
 * "cleartext allowed by accident".
 */
function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  // 127.0.0.0/8 — the whole loopback block, not just 127.0.0.1.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

export type LocalBaseUrlCheck =
  | { readonly ok: true; readonly url: string }
  | {
      readonly ok: false;
      readonly reason: "missing_base_url" | "invalid_base_url";
      /** Why it was rejected — safe to log; carries no credential. */
      readonly detail: string;
    };

/**
 * Validate + normalise the operator-supplied local base URL.
 *
 * This is CONFIGURATION validation, not user-input sanitisation: the value
 * comes from env and no product path may route a user string into it. It fails
 * CLOSED on anything it does not positively recognise, so a typo disables the
 * provider instead of silently becoming a fetch target.
 */
export function checkLocalBaseUrl(raw: string | undefined): LocalBaseUrlCheck {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "") {
    return {
      ok: false,
      reason: "missing_base_url",
      detail: "AI_LOCAL_BASE_URL is not set",
    };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "invalid_base_url",
      detail: "AI_LOCAL_BASE_URL is not a parseable absolute URL",
    };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: "invalid_base_url",
      detail: `unsupported protocol "${url.protocol}" — only http and https are accepted`,
    };
  }
  if (url.username !== "" || url.password !== "") {
    // A credential in the URL would be logged by every intermediary that logs
    // a URL. If the local runtime needs a token it belongs in AI_LOCAL_API_KEY.
    return {
      ok: false,
      reason: "invalid_base_url",
      detail:
        "AI_LOCAL_BASE_URL must not embed credentials — use AI_LOCAL_API_KEY",
    };
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    return {
      ok: false,
      reason: "invalid_base_url",
      detail:
        "plaintext http is allowed only for a loopback host — a remote local runtime must use https",
    };
  }
  // Normalise: keep the path (a runtime may live under a prefix), drop the
  // trailing slash and any query/fragment so the adapter can append cleanly.
  const path = url.pathname.replace(/\/+$/, "");
  return { ok: true, url: `${url.origin}${path}` };
}

/** A live API key shape we never want to see committed (sanity, not auth). */
export const AI_KEY_SHAPE = /^(sk-ant-|sk-|sk-proj-)[A-Za-z0-9_-]{6,}/;

function clampInt(
  raw: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function resolveAiRuntimeConfig(
  input: AiRuntimeConfigInput,
): AiRuntimeConfig {
  const provider: AiProviderKind = KNOWN_PROVIDERS.includes(
    input.provider as AiProviderKind,
  )
    ? (input.provider as AiProviderKind)
    : "anthropic";
  const model =
    typeof input.model === "string" && input.model.trim() !== ""
      ? input.model.trim()
      : DEFAULT_AI_MODEL;
  const hasApiKey =
    typeof input.apiKey === "string" && input.apiKey.trim().length > 0;

  // Cost/safety guards — clamped so a bad env can never disable the budget.
  const guards = {
    timeoutMs: clampInt(input.timeoutMs, 30_000, 1_000, 120_000),
    maxRetries: clampInt(input.maxRetries, 2, 0, 5),
    maxOutputTokens: clampInt(input.maxOutputTokens, 2_000, 256, 8_000),
    dailyRunBudget: clampInt(input.dailyRunBudget, 500, 0, 1_000_000),
  } as const;

  const localCheck = checkLocalBaseUrl(input.localBaseUrl);
  const localModel =
    typeof input.localModel === "string" && input.localModel.trim() !== ""
      ? input.localModel.trim()
      : null;
  const base = {
    provider,
    model,
    hasApiKey,
    localBaseUrl: localCheck.ok ? localCheck.url : null,
    localModel,
    hasLocalApiKey:
      typeof input.localApiKey === "string" &&
      input.localApiKey.trim().length > 0,
    ...guards,
  } as const;

  const mode = input.mode;

  // OFF by default — only `mock` or `live` leave the disabled state.
  if (mode !== "mock" && mode !== "live") {
    return { state: "disabled", reason: "mode_disabled", ...base };
  }

  if (mode === "mock") {
    return { state: "mock", reason: "ok", ...base };
  }

  // mode === "live": needs a known provider…
  if (!KNOWN_PROVIDERS.includes(input.provider as AiProviderKind)) {
    return { state: "disabled", reason: "unknown_provider", ...base };
  }

  // …and then whatever THAT provider's proof of configuration is.
  //
  // Local: a valid base URL AND an explicit model — two required values, both
  // checked. A local server hosts whatever the operator pulled, so defaulting
  // the model id would mean guessing, and a guessed id fails at the vendor with
  // an opaque 404 instead of here with a sentence.
  if (provider === "local") {
    if (!localCheck.ok) {
      return { state: "disabled", reason: localCheck.reason, ...base };
    }
    if (localModel === null) {
      return { state: "disabled", reason: "missing_local_model", ...base };
    }
    return { state: "live", reason: "ok", ...base };
  }

  // Cloud: unchanged — a real key, or nothing.
  if (!hasApiKey) {
    return { state: "disabled", reason: "missing_api_key", ...base };
  }

  return { state: "live", reason: "ok", ...base };
}

/** Pure provider selection — only `live` reaches a real SDK adapter. */
export function providerKindFor(
  cfg: AiRuntimeConfig,
): "disabled" | "mock" | AiProviderKind {
  if (cfg.state === "mock") return "mock";
  if (cfg.state === "live") return cfg.provider;
  return "disabled";
}

/** True when the runtime can produce structured suggestions (mock or live). */
export function isAiRuntimeActive(cfg: AiRuntimeConfig): boolean {
  return cfg.state === "mock" || cfg.state === "live";
}
