/**
 * Wagon A — AI activation-readiness repairs (value train 2, 2026-08-23).
 *
 * Pins the four defects repaired from the D6 audit so they cannot regress:
 *
 *   1. THINKING IS MODEL-AWARE — `thinking: {type:"adaptive"}` is valid only on
 *      4.6+ generations; the routed `haiku` alias (Haiku 4.5) rejects it with a
 *      400. The adapter now consults the registry and OMITS the parameter for
 *      any model the registry does not affirm (omit is valid everywhere).
 *   2. CANONICAL MODEL IDS — Anthropic ids carry no date suffix.
 *   3. STRUCTURED-OUTPUT SCHEMA PROPAGATION — `AiCompletionRequest.jsonSchema`
 *      existed but nothing ever set it; every adapter's schema plumbing was
 *      dead. The agent runner now projects the entry's zod output schema.
 *   4. TRUNCATION IS REQUEST-ATTRIBUTED — an answer cut at the token ceiling
 *      reproduces on every provider, so the chain STOPS instead of paying (and
 *      disclosing) again as if it were a provider-shaped INVALID_OUTPUT.
 *
 * Plus the chain fix: a fallback candidate never receives another vendor's
 * model id — it gets its own registry model for the routed alias, or an honest
 * skip.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  MODEL_REGISTRY,
  supportsAdaptiveThinking,
} from "./runtime/model-registry";
import {
  advancePolicyFor,
  classifyCompletionFailure,
  profileFor,
  type AiProviderState,
} from "./runtime/provider-chain";
import { malformedOrTruncated } from "./runtime/providers/extract-json";
import { anthropicCompletionProvider } from "./runtime/providers/anthropic";
import { dispatchAiCompletion } from "./runtime/run-core";
import { resolveAiRuntimeConfig } from "./runtime/config-core";
import { resolveTaskRoute } from "./runtime/task-routing";
import type { AiEgressGrant } from "./runtime/data-egress";
import { runAiAgentCore } from "./run-agent";
import type { PromptRegistryEntry } from "./registry/types";
import type { AiCompletionRequest } from "./runtime/types";

const MOCK_CFG = resolveAiRuntimeConfig({
  mode: "mock",
  provider: undefined,
  apiKey: undefined,
  model: undefined,
  timeoutMs: undefined,
  maxRetries: undefined,
  maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

// ── 1 + 2: model registry facts ─────────────────────────────────────────────

describe("model registry — thinking capability + canonical ids", () => {
  it("the routed haiku alias does NOT accept adaptive thinking", () => {
    expect(supportsAdaptiveThinking("claude-haiku-4-5")).toBe(false);
  });

  it("4.6+ generations do", () => {
    expect(supportsAdaptiveThinking("claude-sonnet-4-6")).toBe(true);
    expect(supportsAdaptiveThinking("claude-opus-4-8")).toBe(true);
  });

  it("an unknown model fails safe to omit", () => {
    expect(supportsAdaptiveThinking("some-operator-model")).toBe(false);
  });

  it("no Anthropic id carries a date suffix (canonical ids only)", () => {
    for (const e of MODEL_REGISTRY.filter((e) => e.provider === "anthropic")) {
      expect(e.model, `${e.model} looks date-suffixed`).not.toMatch(/-\d{8}$/);
    }
  });
});

// ── 4: truncation classification ────────────────────────────────────────────

describe("truncation is request-attributed", () => {
  it("classifies `truncated` as TRUNCATED and stops the chain", () => {
    expect(
      classifyCompletionFailure({
        status: "error",
        code: "truncated",
        message: "output truncated at token ceiling",
      }),
    ).toBe("TRUNCATED");
    expect(advancePolicyFor("TRUNCATED")).toBe("stop");
  });

  it("malformedOrTruncated separates the two failure shapes", () => {
    expect(malformedOrTruncated(true, "x").code).toBe("truncated");
    expect(malformedOrTruncated(false, "x").code).toBe("malformed_output");
  });
});

// ── 3: schema propagation through the agent runner ──────────────────────────

describe("structured-output schema propagation", () => {
  const entry: PromptRegistryEntry = {
    agent: "matching_explanation",
    version: "test-v1",
    title: "test entry",
    system: "test system prompt",
    inputSchema: z.object({ a: z.string() }).strict(),
    outputSchema: z
      .object({ data: z.object({ fit_summary: z.string().nullable() }) })
      .strict(),
    safetyRules: [],
    allowedEvidenceSources: [],
    blockedClaims: [],
    lastUpdated: "2026-08-23",
  };

  it("the dispatched request carries the entry's output schema as JSON Schema", async () => {
    let captured: AiCompletionRequest | null = null;
    await runAiAgentCore(entry, { a: "x" }, MOCK_CFG, {
      locale: "en",
      dispatchOverride: async (req) => {
        captured = req;
        return {
          status: "ok",
          provider: "mock",
          model: "mock-model",
          raw: { data: { fit_summary: "ok" } },
        };
      },
    });
    expect(captured).not.toBeNull();
    const schema = captured!.jsonSchema as Record<string, unknown> | undefined;
    expect(schema, "jsonSchema must be set — the adapters' hint was dead without it").toBeDefined();
    expect(schema?.type).toBe("object");
    expect(Object.keys((schema?.properties ?? {}) as object)).toContain("data");
  });
});

// ── Chain: no cross-vendor model id ─────────────────────────────────────────

describe("chain fallback never dispatches another vendor's model id", () => {
  const GRANT = (provider: string): AiEgressGrant => ({
    provider,
    maxSensitivity: "SENSITIVE_FREE_TEXT",
    basis: "test fixture",
    grantedOn: "2026-08-23",
  });
  const READY = (id: string): AiProviderState => ({ id, health: "ready" });

  it("a candidate with a foreign concrete model (no alias) is skipped with a reason", async () => {
    const cfg = resolveAiRuntimeConfig({
      mode: "live",
      provider: "anthropic",
      apiKey: "test-key",
      model: undefined,
      timeoutMs: "2000",
      maxRetries: undefined,
      maxOutputTokens: undefined,
      dailyRunBudget: undefined,
    });
    const openaiProfile = profileFor("openai");
    expect(openaiProfile).toBeDefined();
    const result = await dispatchAiCompletion(
      {
        agentKey: "matching_explanation",
        promptVersion: "v1",
        system: "s",
        input: { a: 1 },
        locale: "en",
        // Anthropic-owned concrete id, NO alias: the openai candidate must be
        // skipped, never asked to serve `claude-opus-4-8`.
        model: "claude-opus-4-8",
      },
      cfg,
      {
        decision: resolveTaskRoute("explain_match", { attempt: 1 }),
        states: [READY("openai")],
        profiles: [openaiProfile!],
        grants: [GRANT("openai")],
      },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("no registry model for this route");
      expect(result.provider).toBe("openai");
    }
  });
});

// ── 1: the adapter on the wire ──────────────────────────────────────────────

const createSpy = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createSpy };
    constructor(_opts: unknown) {}
  },
}));

describe("anthropic adapter — model-aware thinking + truncation", () => {
  const LIVE_CFG = resolveAiRuntimeConfig({
    mode: "live",
    provider: "anthropic",
    apiKey: "test-key",
    model: undefined,
    timeoutMs: "2000",
    maxRetries: undefined,
    maxOutputTokens: undefined,
    dailyRunBudget: undefined,
  });
  const req = (model: string): AiCompletionRequest => ({
    agentKey: "matching_explanation",
    promptVersion: "v1",
    system: "s",
    input: { a: 1 },
    locale: "en",
    model,
  });
  const okResponse = {
    content: [{ type: "text", text: '{"ok":true}' }],
    usage: { input_tokens: 1, output_tokens: 1 },
    stop_reason: "end_turn",
  };

  it("omits `thinking` for the haiku-tier model", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    createSpy.mockResolvedValueOnce(okResponse);
    const result = await anthropicCompletionProvider.complete(
      req("claude-haiku-4-5"),
      LIVE_CFG,
    );
    expect(result.status).toBe("ok");
    const sent = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.model).toBe("claude-haiku-4-5");
    expect("thinking" in sent, "adaptive thinking on a pre-4.6 model is a 400").toBe(false);
  });

  it("sends adaptive thinking for a 4.6+ model", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    createSpy.mockResolvedValueOnce(okResponse);
    await anthropicCompletionProvider.complete(req("claude-opus-4-8"), LIVE_CFG);
    const sent = createSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.thinking).toEqual({ type: "adaptive" });
  });

  it("reports `truncated` when the answer was cut at max_tokens", async () => {
    vi.stubEnv("AI_API_KEY", "test-key");
    createSpy.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"half": ' }],
      usage: { input_tokens: 1, output_tokens: 2000 },
      stop_reason: "max_tokens",
    });
    const result = await anthropicCompletionProvider.complete(
      req("claude-opus-4-8"),
      LIVE_CFG,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("truncated");
  });
});
