/**
 * ZERO PAID API BUDGET (owner order 2026-10-27) — the CLOSED state, which is
 * the default. No network: every metered provider is refused before its
 * adapter is reached, and the free classes are untouched by the switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveAiRuntimeConfig, type AiRuntimeConfigInput } from "./config-core";
import { blockedByZeroPaidBudget, paidProvidersAllowed, ZERO_PAID_BUDGET_REASON } from "./paid-budget";
import { AI_PROVIDER_PROFILES, resolveProviderChain, type AiProviderState } from "./provider-chain";
import { dispatchAiCompletion } from "./run-core";
import { resolveTaskRoute } from "./task-routing";
import type { AiCompletionRequest } from "./types";

const base: AiRuntimeConfigInput = {
  mode: undefined, provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: undefined,
};

const translation = (): AiCompletionRequest => ({
  agentKey: "translation_copy",
  promptVersion: "1.0.0",
  system: "translate",
  input: { canonicalMessage: "Labas", locale: "en", context: "work message between colleagues" },
  locale: "en",
});

beforeEach(() => {
  vi.stubEnv("AI_PAID_PROVIDERS_ALLOWED", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the switch", () => {
  it("is closed unless it is exactly \"true\"", () => {
    expect(paidProvidersAllowed(undefined)).toBe(false);
    expect(paidProvidersAllowed("")).toBe(false);
    expect(paidProvidersAllowed("1")).toBe(false);
    expect(paidProvidersAllowed("TRUE")).toBe(false);
    expect(paidProvidersAllowed(" true ")).toBe(true);
  });
  it("blocks metered and unclassified providers, never the free classes", () => {
    expect(blockedByZeroPaidBudget("paid", false)).toBe(true);
    expect(blockedByZeroPaidBudget("unknown", false)).toBe(true);
    expect(blockedByZeroPaidBudget("free_local", false)).toBe(false);
    expect(blockedByZeroPaidBudget("free_tier", false)).toBe(false);
    expect(blockedByZeroPaidBudget("paid", true)).toBe(false);
  });
});

describe("the chain, with the budget closed", () => {
  const decision = resolveTaskRoute("normalize_work_scope", { attempt: 1 });
  const allReady: AiProviderState[] = AI_PROVIDER_PROFILES.map((p) => ({ id: p.id, health: "ready" as const }));

  it("a ready metered provider is never selected and never a retry candidate", () => {
    const outcome = resolveProviderChain(decision, allReady, AI_PROVIDER_PROFILES, undefined, false);
    const paid = new Set(AI_PROVIDER_PROFILES.filter((p) => p.costClass === "paid").map((p) => p.id));
    expect(paid.size).toBeGreaterThan(0);
    if (outcome.kind === "provider") {
      expect(paid.has(outcome.selected.id)).toBe(false);
      expect(outcome.remaining.some((r) => paid.has(r.id))).toBe(false);
    }
    const skippedPaid = (outcome.kind === "deterministic" ? [] : outcome.skipped).filter((s) => paid.has(s.id));
    expect(skippedPaid.length).toBe([...paid].filter((id) => AI_PROVIDER_PROFILES.find((p) => p.id === id)!.capabilities.includes(decision.taskType)).length);
    for (const s of skippedPaid) expect(s.reason).toBe(ZERO_PAID_BUDGET_REASON);
  });

  it("when only metered providers are ready the run degrades honestly — no bill", () => {
    const onlyPaidReady = AI_PROVIDER_PROFILES.map((p) => ({
      id: p.id,
      health: p.costClass === "paid" ? ("ready" as const) : ("unconfigured" as const),
    }));
    const outcome = resolveProviderChain(decision, onlyPaidReady, AI_PROVIDER_PROFILES, undefined, false);
    expect(outcome.kind).toBe("unavailable");
  });

  it("NEGATIVE CONTROL: the same metered provider IS selectable once the owner opens the budget", () => {
    const onlyGemini = AI_PROVIDER_PROFILES.map((p) => ({
      id: p.id,
      health: p.id === "gemini" ? ("ready" as const) : ("unconfigured" as const),
    }));
    // `explain_market_demand` is the one PUBLIC task: the egress gate admits
    // an ungranted external provider for it, so only the budget decides here.
    const publicTask = resolveTaskRoute("explain_market_demand", { attempt: 1 });
    expect(resolveProviderChain(publicTask, onlyGemini, AI_PROVIDER_PROFILES, undefined, false).kind).toBe("unavailable");
    const outcome = resolveProviderChain(publicTask, onlyGemini, AI_PROVIDER_PROFILES, undefined, true);
    expect(outcome.kind === "provider" && outcome.selected.id).toBe("gemini");
  });
});

describe("the legacy single-provider path, with the budget closed", () => {
  it.each(["gemini", "anthropic", "openai", "xai"])(
    "%s is refused before any provider work",
    async (provider) => {
      const cfg = resolveAiRuntimeConfig({ ...base, mode: "live", provider, apiKey: "presence-only" });
      const r = await dispatchAiCompletion(translation(), cfg);
      expect(r.status).toBe("error");
      if (r.status === "error") {
        expect(r.code).toBe("unsupported");
        expect(r.message).toBe(ZERO_PAID_BUDGET_REASON);
      }
    },
  );

  it("NEGATIVE CONTROL: opening the budget hands the request to the egress gate again", async () => {
    vi.stubEnv("AI_PAID_PROVIDERS_ALLOWED", "true");
    const cfg = resolveAiRuntimeConfig({ ...base, mode: "live", provider: "anthropic", apiKey: "presence-only" });
    const r = await dispatchAiCompletion(translation(), cfg);
    expect(r.status === "error" && r.message).not.toBe(ZERO_PAID_BUDGET_REASON);
  });
});
