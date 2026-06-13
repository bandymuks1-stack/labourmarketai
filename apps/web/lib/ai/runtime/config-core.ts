/**
 * AI runtime config — PURE core (Internal LLM Agents v1, PR2). No IO, no
 * server-only, no env read: safe to unit-test and to import from a guard. The
 * server wrapper (lib/ai/runtime/config.ts) feeds validated env into
 * {@link resolveAiRuntimeConfig}. Mirrors the proven billing config-core shape.
 *
 * Hard guarantees encoded here:
 *   - OFF by default: the runtime is `disabled` unless AI_PROVIDER_MODE is set
 *     to `mock` or `live`.
 *   - `live` is impossible without a real key: AI_PROVIDER_MODE=live + a known
 *     provider + a NON-EMPTY apiKey. A missing key → `disabled` (never silently
 *     live). The key VALUE is never returned — only a presence flag.
 *   - `mock` needs no key, no network: deterministic provider for tests/dev.
 *   - timeout / retry / output-token / daily-run budgets are clamped to safe
 *     bounds so a misconfigured env can never remove the cost guard.
 */

export type AiRuntimeState = "disabled" | "mock" | "live";
export type AiProviderKind = "anthropic" | "openai";

export type AiDisabledReason =
  | "ok"
  | "mode_disabled"
  | "unknown_provider"
  | "missing_api_key";

export interface AiRuntimeConfig {
  readonly state: AiRuntimeState;
  /** The live provider id (only meaningful when state === "live"). */
  readonly provider: AiProviderKind;
  /** Model id used when live (default claude-opus-4-8). */
  readonly model: string;
  /** Presence only — the key VALUE is never carried on the config. */
  readonly hasApiKey: boolean;
  readonly reason: AiDisabledReason;
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
}

/** Default model for a future live provider — the latest Opus (see claude-api). */
export const DEFAULT_AI_MODEL = "claude-opus-4-8";

const KNOWN_PROVIDERS: readonly AiProviderKind[] = ["anthropic", "openai"];

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

  const base = { provider, model, hasApiKey, ...guards } as const;

  const mode = input.mode;

  // OFF by default — only `mock` or `live` leave the disabled state.
  if (mode !== "mock" && mode !== "live") {
    return { state: "disabled", reason: "mode_disabled", ...base };
  }

  if (mode === "mock") {
    return { state: "mock", reason: "ok", ...base };
  }

  // mode === "live": needs a known provider AND a real key.
  if (!KNOWN_PROVIDERS.includes(input.provider as AiProviderKind)) {
    return { state: "disabled", reason: "unknown_provider", ...base };
  }
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
