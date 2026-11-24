/**
 * Disabled completion provider — the INERT default (Internal LLM Agents v1).
 *
 * Returns the `disabled` sentinel for every request. No key, no network, no env
 * read, no SDK import. Safe in build, tests, dev, preview and production.
 *
 * Pure. No IO.
 */
import type { AiCompletionProvider, AiCompletionResult } from "../types";
import type { AiRuntimeConfig } from "../config-core";

export const disabledCompletionProvider: AiCompletionProvider = {
  kind: "disabled",
  async complete(
    _request,
    cfg: AiRuntimeConfig,
  ): Promise<AiCompletionResult> {
    return { status: "disabled", reason: cfg.reason };
  },
};
