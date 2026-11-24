/**
 * AI provider selector — the single entry point a future assist call would use.
 *
 * Today it ALWAYS returns the inert {@link ./noop-provider}. The gate is the
 * owner-controlled `AI_ASSIST_ENABLED` flag (lib/config/ai.ts), a source literal
 * `false`. There is intentionally NO real provider to return, NO SDK import, and
 * NO `process.env`-driven provider selection — so AI cannot be switched on by a
 * production environment variable. A real provider is wired ONLY in a future,
 * owner-approved activation slice (after provider/budget/key decisions), and
 * even then this selector must keep returning noop while the flag is false.
 *
 * Pure (no IO). Safe in build, tests, dev, preview and production.
 */
import { AI_ASSIST_ENABLED } from "@/lib/config/ai";
import { noopAiProvider } from "./noop-provider";
import type { AiProvider } from "./types";

/**
 * Resolve the active AI provider. While `AI_ASSIST_ENABLED` is false (always,
 * in this skeleton) this returns the no-op provider — inert, keyless, networkless.
 */
export function getAiProvider(): AiProvider {
  // Total gate: today there is no real provider, so the ONLY thing this can
  // return is the inert no-op. A future activation slice adds the real branch
  // here (behind owner approval), and it must still return noop while
  // `AI_ASSIST_ENABLED` is false. The flag is read via `isAiAssistEnabled()`.
  return noopAiProvider;
}

/** True only when the owner has flipped the master flag (false today). */
export function isAiAssistEnabled(): boolean {
  return AI_ASSIST_ENABLED;
}
