/**
 * No-op AI provider — the deterministic, INERT default (and the only provider
 * that exists today).
 *
 * Every method returns the `AiDisabledResult` sentinel. It:
 *   - requires NO API key;
 *   - makes NO network call (there is no fetch/SDK/import here at all);
 *   - reads NO environment variable;
 *   - is safe in build, tests, local dev, preview and production;
 *   - never persists, verifies, prices, matches, or sends anything.
 *
 * It cannot be "accidentally enabled": `enabled` is the literal `false`.
 *
 * Pure. No IO.
 */
import type {
  AiProvider,
  AiDisabledResult,
  DemandDraftAssistInput,
  EstimateClarifyInput,
  WorkerProfileDraftInput,
} from "./types";

const DISABLED: AiDisabledResult = {
  status: "disabled",
  provider: "noop",
  reason: "ai_assist_disabled",
};

export const noopAiProvider: AiProvider = {
  id: "noop",
  enabled: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async assistDemandDraft(_input: DemandDraftAssistInput) {
    return DISABLED;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async assistEstimateClarify(_input: EstimateClarifyInput) {
    return DISABLED;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async assistWorkerProfileDraft(_input: WorkerProfileDraftInput) {
    return DISABLED;
  },
};
