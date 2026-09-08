/**
 * AI Router v1 — runner behaviors added on top of task routing:
 *   (a) latency timeout → ONE visible fallback-tier retry ('latency_timeout');
 *   (b) withLatencyTimeout races honestly (timeout result, no throw);
 *   (c) real cost is computed from real usage on live providers — and never
 *       for the mock provider (no fabricated cost);
 *   (d) audit record carries model id / prompt version / input source /
 *       bounded output excerpt;
 *   (e) language flows into the routing decision (deepl preference recorded);
 *   (f) env-gated adapters return honest disabled results without env.
 * Mock/core only — no env, no key, no network.
 */
import { describe, it, expect } from "vitest";
import { resolveAiRuntimeConfig } from "./runtime/config-core";
import {
  runAiAgentCore,
  withLatencyTimeout,
  type AiDispatcher,
} from "./run-agent";
import type { AiCompletionResult } from "./runtime/types";
import { matchingExplanationEntry } from "./registry/agents/matching-explanation";
import { translationCopyEntry } from "./registry/agents/translation-copy";
import { deeplCompletionProvider } from "./runtime/providers/deepl";
import { openaiCompletionProvider } from "./runtime/providers/openai";
import { geminiCompletionProvider } from "./runtime/providers/gemini";
import { xaiCompletionProvider } from "./runtime/providers/xai";
import { AI_MODEL_CANDIDATES } from "./runtime/model-candidates";
import {
  computeActualCostUsd,
  estimateCostUsd,
  estimateTokensFromText,
} from "./runtime/model-pricing";
import { TASK_POLICIES } from "./runtime/task-routing";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: 10,
});

const input = {
  workerSkills: ["tiling"],
  companyNeed: "Two tilers for a renovation in Vilnius.",
};

const validMock = {
  suggestion: true,
  agent: "matching_explanation",
  confidence: "medium",
  evidence_refs: [{ source: "worker_skills", ref: "router-test" }],
  missing_information: [],
  needs_human_review: true,
  blocked_claims: [],
  data: {
    fit_summary: "Skills align with the need.",
    strong_matches: ["tiling trade"],
    gaps: [],
    blockers: [],
    suggested_next_action: "Review documents.",
    explanation_company: "Good fit on paper.",
    explanation_worker: "You match this need.",
  },
};

const okResult = (model: string, provider: "mock" | "anthropic" = "mock"):
  AiCompletionResult => ({
  status: "ok",
  provider,
  model,
  raw: validMock,
  usage: { inputTokens: 1000, outputTokens: 500 },
});

describe("(a) latency timeout applies ONE visible fallback-tier retry", () => {
  it("first dispatch times out → fallback tier serves with reason latency_timeout", async () => {
    const seenModels: (string | undefined)[] = [];
    const dispatcher: AiDispatcher = async (req) => {
      seenModels.push(req.model);
      if (seenModels.length === 1) {
        return { status: "error", code: "timeout", message: "simulated hang" };
      }
      return okResult(req.model ?? "unknown");
    };
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, dispatchOverride: dispatcher,
    });
    expect(out.status).toBe("suggestion");
    expect(seenModels).toHaveLength(2);
    // explain_match: standard (sonnet) → fallback low_cost (haiku)
    expect(seenModels[0]).toBe(AI_MODEL_CANDIDATES.anthropic.sonnet);
    expect(seenModels[1]).toBe(AI_MODEL_CANDIDATES.anthropic.haiku);
    expect(out.routing?.fallback).toBe(true);
    expect(out.routing?.fallbackReason).toBe("latency_timeout");
    expect(out.routing?.selectedTier).toBe("low_cost");
    expect(out.routing?.modelAlias).toBe("haiku");
  });

  it("both attempts time out → honest needs_review timeout, no third attempt", async () => {
    let calls = 0;
    const dispatcher: AiDispatcher = async () => {
      calls += 1;
      return { status: "error", code: "timeout", message: "simulated hang" };
    };
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, dispatchOverride: dispatcher,
    });
    expect(calls).toBe(2);
    expect(out.status).toBe("needs_review");
    if (out.status === "needs_review") expect(out.reason).toBe("timeout");
    expect(out.routing?.fallbackReason).toBe("latency_timeout");
  });

  it("the adapter-facing cfg timeout is clamped to the policy latency ceiling", async () => {
    let seenTimeoutMs: number | null = null;
    const dispatcher: AiDispatcher = async (req, cfg) => {
      seenTimeoutMs = cfg.timeoutMs;
      return okResult(req.model ?? "unknown");
    };
    await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, dispatchOverride: dispatcher,
    });
    // explain_match policy.maxLatencyMs = 30_000; default cfg.timeoutMs = 30_000.
    expect(seenTimeoutMs).toBe(30_000);
  });
});

describe("(b) withLatencyTimeout", () => {
  it("returns the honest timeout result when the dispatch hangs", async () => {
    const never = new Promise<AiCompletionResult>(() => {});
    const r = await withLatencyTimeout(never, 20);
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.code).toBe("timeout");
      expect(r.message).toMatch(/latency ceiling 20ms/);
    }
  });

  it("passes a fast result through untouched", async () => {
    const r = await withLatencyTimeout(Promise.resolve(okResult("m")), 1000);
    expect(r.status).toBe("ok");
  });
});

describe("(c) real cost from real usage — never for mock", () => {
  it("a live-provider result with usage computes actual_cost from the pricing table", async () => {
    const dispatcher: AiDispatcher = async () =>
      okResult(AI_MODEL_CANDIDATES.anthropic.sonnet, "anthropic");
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, dispatchOverride: dispatcher,
    });
    // sonnet: 1000 in * $3/MTok + 500 out * $15/MTok = 0.003 + 0.0075
    expect(out.routing?.actualCostUsd).toBe(0.0105);
  });

  it("mock provider runs keep actualCostUsd null (no fabricated spend)", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
    });
    expect(out.routing?.providerAdapter).toBe("mock");
    expect(out.routing?.actualCostUsd).toBeNull();
  });
});

describe("(d) audit record completeness (AI Router v1 fields)", () => {
  it("carries model id, prompt version, input source and a bounded output excerpt", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, inputSource: "match_preview",
    });
    expect(out.status).toBe("suggestion");
    expect(out.routing?.modelId).toBe(AI_MODEL_CANDIDATES.anthropic.sonnet);
    expect(out.routing?.promptVersion).toBe(matchingExplanationEntry.version);
    expect(out.routing?.inputSource).toBe("match_preview");
    expect(out.routing?.outputExcerpt).toBeTruthy();
    expect(out.routing?.outputExcerpt?.length).toBeLessThanOrEqual(4000);
    // The excerpt is the VALIDATED output — never the input content.
    expect(out.routing?.outputExcerpt).toContain("Skills align");
    expect(out.routing?.outputExcerpt).not.toContain("Vilnius");
  });
});

describe("(e) language flows into the routing decision", () => {
  it("translate run records the language and the deepl preference", async () => {
    const translationMock = {
      suggestion: true,
      agent: "translation_copy",
      confidence: "medium",
      evidence_refs: [{ source: "canonical_message", ref: "t" }],
      missing_information: [],
      needs_human_review: false,
      blocked_claims: [],
      data: {
        localized_copy: "Hallo Welt",
        plain_language_version: null,
        wording_warnings: [],
      },
    };
    const out = await runAiAgentCore(
      translationCopyEntry,
      { canonicalMessage: "Hello world", locale: "de" },
      MOCK,
      { locale: "en", language: "de", mock: translationMock },
    );
    expect(out.status).toBe("suggestion");
    expect(out.routing?.languageConsidered).toBe("de");
    expect(out.routing?.preferredProvider).toBe("deepl");
    // Mock mode never reaches the deepl wire — deterministic mock serves.
    expect(out.routing?.providerAdapter).toBe("mock");
  });
});

describe("(f) env-gated adapters are honestly inert without env", () => {
  const req = {
    agentKey: "translation_copy",
    promptVersion: "1.0.0",
    system: "s",
    input: { canonicalMessage: "Hello", locale: "de" },
    locale: "en" as const,
  };

  it.each([
    ["openai", openaiCompletionProvider],
    ["gemini", geminiCompletionProvider],
    ["xai", xaiCompletionProvider],
    ["deepl", deeplCompletionProvider],
  ] as const)("%s returns the typed disabled sentinel (no flag/key)", async (_id, provider) => {
    const r = await provider.complete(req, MOCK);
    expect(r.status).toBe("disabled");
    if (r.status === "disabled") expect(r.reason).toBe("mode_disabled");
  });
});

describe("(g) the persisted estimate is re-priced from the SERVING candidate", () => {
  // The exact token shape run-agent prices with: system prompt + validated
  // input, and the output bound the ceiling was judged on.
  const expectedInputTokens =
    estimateTokensFromText(matchingExplanationEntry.system) +
    estimateTokensFromText(
      JSON.stringify(matchingExplanationEntry.inputSchema.parse(input)),
    );
  const outputBound = Math.max(
    TASK_POLICIES.explain_match.expectedOutputTokens,
    600,
  );
  const servedBy =
    (
      provider: "mock" | "anthropic" | "openai" | "gemini",
      model: string,
    ): AiDispatcher =>
    async () => ({
      status: "ok",
      provider,
      model,
      raw: validMock,
      usage: { inputTokens: 1000, outputTokens: 500 },
    });

  it("a chain candidate from another vendor re-prices estimate AND actual on ITS rate card", async () => {
    // Primary is anthropic (sonnet tier); the chain serves from the priced
    // gemini candidate. Before the fix the estimate stayed anthropic-priced
    // beside a gemini-priced actual — two ledgers disagreeing about one run.
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en",
      mock: validMock,
      maxOutputTokens: 600,
      dispatchOverride: servedBy("gemini", "gemini-3.5-flash-lite"),
    });
    expect(out.status).toBe("suggestion");
    const geminiEstimate = estimateCostUsd(
      "gemini-3.5-flash-lite",
      expectedInputTokens,
      outputBound,
    );
    const primaryEstimate = estimateCostUsd(
      AI_MODEL_CANDIDATES.anthropic.sonnet,
      expectedInputTokens,
      outputBound,
    );
    expect(geminiEstimate).not.toBeNull();
    expect(out.routing?.estimatedCostUsd).toBe(geminiEstimate);
    expect(out.routing?.estimatedCostUsd).not.toBe(primaryEstimate);
    expect(out.routing?.actualCostUsd).toBe(
      computeActualCostUsd("gemini-3.5-flash-lite", 1000, 500),
    );
  });

  it("the latency-fallback tier's model prices the estimate, not the original tier's", async () => {
    let calls = 0;
    const dispatcher: AiDispatcher = async (req) => {
      calls += 1;
      if (calls === 1) {
        return { status: "error", code: "timeout", message: "simulated hang" };
      }
      return {
        status: "ok",
        provider: "anthropic",
        model: req.model ?? "unknown",
        raw: validMock,
        usage: { inputTokens: 1000, outputTokens: 500 },
      };
    };
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en",
      mock: validMock,
      maxOutputTokens: 600,
      dispatchOverride: dispatcher,
    });
    expect(out.status).toBe("suggestion");
    expect(out.routing?.modelAlias).toBe("haiku");
    // auditBase read the ORIGINAL (sonnet) decision's estimate; the served
    // model is the haiku candidate and the persisted estimate must say so.
    expect(out.routing?.estimatedCostUsd).toBe(
      estimateCostUsd(
        AI_MODEL_CANDIDATES.anthropic.haiku,
        expectedInputTokens,
        outputBound,
      ),
    );
  });

  it("an UNPRICED serving model yields an honest null, never another vendor's number", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en",
      mock: validMock,
      maxOutputTokens: 600,
      dispatchOverride: servedBy("openai", "gpt-5.2-mini"),
    });
    expect(out.status).toBe("suggestion");
    expect(out.routing?.estimatedCostUsd).toBeNull();
  });

  it("a caller-supplied estimate stays authoritative (it is what the ceiling enforced)", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en",
      mock: validMock,
      maxOutputTokens: 600,
      route: { attempt: 1, estimatedCostUsd: 0.01 },
      dispatchOverride: servedBy("gemini", "gemini-3.5-flash-lite"),
    });
    expect(out.status).toBe("suggestion");
    expect(out.routing?.estimatedCostUsd).toBe(0.01);
  });

  it("a mock result keeps the router's estimate (deterministic, never persisted)", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en",
      mock: validMock,
      maxOutputTokens: 600,
      dispatchOverride: servedBy("mock", "mock-model"),
    });
    expect(out.status).toBe("suggestion");
    expect(out.routing?.estimatedCostUsd).toBe(
      estimateCostUsd(
        AI_MODEL_CANDIDATES.anthropic.sonnet,
        expectedInputTokens,
        outputBound,
      ),
    );
  });
});
