/**
 * Chain dispatch — the behavioural proof that the runtime actually RUNS.
 *
 * #1102 landed the ordering module inert: nothing imported it, so "free comes
 * first" was a claim about a pure function, not about the product. These tests
 * exercise the real `dispatchAiCompletion` against a real HTTP server, so what
 * is asserted is what a request would actually do.
 *
 * THE FAKE SERVER IS THE POINT. It speaks the OpenAI chat-completions shape on
 * loopback and can be told to fail, hang or answer garbage on demand. CI must
 * never need a GPU, an Ollama install or a key to prove the free-local path
 * works — if it did, the path would be untested everywhere it matters.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dispatchAiCompletion, type ChainDispatchContext } from "./run-core";
import type { AiEgressGrant } from "./data-egress";
import { resolveAiRuntimeConfig, type AiRuntimeConfig } from "./config-core";
import {
  advancePolicyFor,
  classifyCompletionFailure,
  type AiProviderProfile,
  type AiProviderState,
} from "./provider-chain";
import { resolveTaskRoute, type AiTaskType } from "./task-routing";
import type { AiCompletionRequest } from "./types";

// ── A deterministic OpenAI-compatible server ────────────────────────────────

type Mode = "ok" | "http_500" | "http_429" | "garbage" | "empty";

let server: Server;
let baseUrl = "";
let mode: Mode = "ok";
let received: unknown[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        received.push(JSON.parse(body));
      } catch {
        received.push(body);
      }
      if (mode === "http_500") {
        res.writeHead(500).end("boom");
        return;
      }
      if (mode === "http_429") {
        res.writeHead(429).end("rate limited");
        return;
      }
      const content =
        mode === "garbage"
          ? "I am a small model and I would rather write prose."
          : mode === "empty"
            ? ""
            : JSON.stringify({ ok: true, note: "from the local runtime" });
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 11, completion_tokens: 7 },
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

afterEach(() => {
  mode = "ok";
  received = [];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Fixtures ────────────────────────────────────────────────────────────────

function cfgFor(over: { localBaseUrl?: string; localModel?: string } = {}): AiRuntimeConfig {
  return resolveAiRuntimeConfig({
    mode: "live",
    provider: "local",
    apiKey: undefined,
    model: undefined,
    timeoutMs: "5000",
    maxRetries: undefined,
    maxOutputTokens: undefined,
    dailyRunBudget: undefined,
    localBaseUrl: over.localBaseUrl ?? baseUrl,
    localModel: over.localModel ?? "test-model",
  });
}

const request = (task = "explain_match"): AiCompletionRequest => ({
  agentKey: "matching_explanation",
  promptVersion: "v1",
  system: `system prompt for ${task}`,
  input: { worker_skills: ["a"] },
  locale: "en",
});

const chain = (
  task: AiTaskType,
  states: AiProviderState[],
  profiles?: readonly AiProviderProfile[],
  grants?: readonly AiEgressGrant[],
): ChainDispatchContext => ({
  decision: resolveTaskRoute(task, { attempt: 1 }),
  states,
  profiles,
  grants,
});

/**
 * OWNER DECISION 2026-08-19 (AI DATA BOUNDARY): an external provider with no
 * egress grant may receive PUBLIC data only, and no task is classed PUBLIC.
 * Reaching a cloud ADAPTER therefore requires an injected grant — otherwise the
 * dispatch-level mechanics below (fallback ordering, adapter invocation) have
 * no subject and could not be proven at all. The gate's own behaviour is pinned
 * separately, without a grant.
 */
const GRANT_ALL = (...providers: string[]): AiEgressGrant[] =>
  providers.map((provider) => ({
    provider,
    maxSensitivity: "SENSITIVE_FREE_TEXT" as const,
    basis: "test fixture",
    grantedOn: "2026-08-19",
  }));

const READY = (id: AiProviderState["id"]): AiProviderState => ({ id, health: "ready" });
const DOWN = (id: AiProviderState["id"], reason: string): AiProviderState => ({
  id,
  health: "unavailable",
  reason,
});
const UNCONFIGURED = (id: AiProviderState["id"]): AiProviderState => ({
  id,
  health: "unconfigured",
  reason: "not configured",
});

// ── 1. free_local is selected, and it works with NO key ─────────────────────

describe("FREE_LOCAL healthy → selected, keyless, before anything paid", () => {
  it("answers through the local runtime with no API key configured", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const cfg = cfgFor();
    expect(cfg.hasApiKey).toBe(false);

    const r = await dispatchAiCompletion(
      request(),
      cfg,
      // anthropic is ALSO ready — local must still win on cost class.
      chain("explain_match", [READY("local"), READY("anthropic")], undefined, GRANT_ALL("anthropic")),
    );

    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.provider).toBe("local");
    expect(r.status === "ok" && r.model).toBe("test-model");
    expect(r.status === "ok" && r.raw).toEqual({
      ok: true,
      note: "from the local runtime",
    });
    // It really went over the wire to the fake server.
    expect(received).toHaveLength(1);
  });

  it("sends NO authorization header when no local bearer is configured", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");
    await dispatchAiCompletion(request(), cfgFor(), chain("explain_match", [READY("local")]));
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain(
      "authorization",
    );
  });

  it("usage is reported honestly from the runtime's own numbers", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("explain_match", [READY("local")]),
    );
    expect(r.status === "ok" && r.usage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
    });
  });
});

// ── 2. degradation ──────────────────────────────────────────────────────────

describe("FREE_LOCAL unavailable → the next eligible candidate", () => {
  it("a stopped local runtime does not end the run — the chain advances", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    // A port nothing listens on: the real ECONNREFUSED path, not a mock of it.
    const cfg = cfgFor({ localBaseUrl: "http://127.0.0.1:1/v1" });

    const r = await dispatchAiCompletion(
      request(),
      cfg,
      chain("explain_match", [READY("local"), READY("anthropic")], undefined, GRANT_ALL("anthropic")),
    );

    // anthropic is env-gated and keyless here, so it cannot answer either —
    // the assertion is that the chain GOT THERE at all (before this wiring, a
    // dead local runtime simply ended the run), and that the result is
    // attributed to the candidate that actually produced it rather than to the
    // one that failed first.
    expect(r.status).not.toBe("ok");
    expect(r.status !== "ok" && r.provider).toBe("anthropic");
  });

  it("an unconfigured local provider is skipped without being attempted", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");
    await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("explain_match", [UNCONFIGURED("local"), READY("anthropic")], undefined, GRANT_ALL("anthropic")),
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("every provider unusable → an honest unavailable, never a crash", () => {
  it("names each candidate and why it was passed over", async () => {
    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain(
        "explain_match",
        [
          DOWN("local", "runtime is switched off"),
          DOWN("anthropic", "no key"),
          UNCONFIGURED("openai"),
          UNCONFIGURED("gemini"),
          UNCONFIGURED("xai"),
        ],
        undefined,
        GRANT_ALL("anthropic", "openai", "gemini", "xai"),
      ),
    );
    expect(r.status).toBe("error");
    expect(r.status === "error" && r.code).toBe("unsupported");
    // "the AI is off" and "everything is down" must not be the same silence.
    expect(r.status === "error" && r.message).toMatch(/local: runtime is switched off/);
    expect(r.status === "error" && r.message).toMatch(/anthropic: no key/);
  });

  it("a deterministic task never reaches a provider", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("detect_capacity_gap", [READY("local")]),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(r.status).toBe("error");
    expect(r.status === "error" && r.message).toMatch(/deterministic/);
  });
});

describe("provider failures are classified, not merged", () => {
  it("a 500 from the local runtime advances the chain", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    mode = "http_500";
    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("explain_match", [READY("local"), READY("anthropic")], undefined, GRANT_ALL("anthropic")),
    );
    // The local runtime's 500 did not end the run; anthropic was reached and
    // reported its own (unconfigured) state.
    expect(r.status !== "ok" && r.provider).toBe("anthropic");
  });

  it("malformed output does not re-send the payload down the chain", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    mode = "garbage";
    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("explain_match", [
        READY("local"),
        READY("anthropic"),
        READY("openai"),
        READY("gemini"),
        READY("xai"),
      ]),
    );
    // THE ASSERTION THAT MATTERS: the personal payload left this process
    // exactly once. Every cloud candidate after the local one declines at its
    // own env gate before making a request, so walking past them costs nothing
    // and discloses nothing — what would have been unacceptable is four
    // vendors each receiving the CV to return the same malformed answer.
    expect(received).toHaveLength(1);
    expect(r.status).not.toBe("ok");
  });

  it("the INVALID_OUTPUT retry budget is one, not the whole chain", () => {
    // Proven directly on the policy function. The dispatch scenario above
    // cannot exercise it — it would need two providers that both answer AND
    // both answer off-schema, and every cloud adapter here declines before it
    // answers. Asserting the rule where it lives beats asserting a
    // coincidence where it does not.
    expect(advancePolicyFor("INVALID_OUTPUT")).toBe("advance_once");
    for (const f of [
      "CONFIGURATION",
      "UNAVAILABLE",
      "TIMEOUT",
      "RATE_LIMIT",
      "PROVIDER_ERROR",
    ] as const) {
      expect(advancePolicyFor(f), f).toBe("advance");
    }
    for (const f of ["PRIVACY_BLOCK", "UNSUPPORTED_CAPABILITY"] as const) {
      expect(advancePolicyFor(f), f).toBe("stop");
    }
  });

  it("classification separates a provider fault from a request fault", () => {
    expect(classifyCompletionFailure({ status: "ok" })).toBeNull();
    expect(classifyCompletionFailure({ status: "disabled" })).toBe("CONFIGURATION");
    expect(
      classifyCompletionFailure({ status: "error", code: "timeout", message: "x" }),
    ).toBe("TIMEOUT");
    expect(
      classifyCompletionFailure({
        status: "error",
        code: "malformed_output",
        message: "no JSON",
      }),
    ).toBe("INVALID_OUTPUT");
    // A 429 arrives inside a provider_error message — it is worth separating
    // because it is the one provider failure expected to clear on its own.
    expect(
      classifyCompletionFailure({
        status: "error",
        code: "provider_error",
        message: "local runtime http 429",
      }),
    ).toBe("RATE_LIMIT");
    expect(
      classifyCompletionFailure({
        status: "error",
        code: "provider_error",
        message: "fetch failed ECONNREFUSED",
      }),
    ).toBe("UNAVAILABLE");
    expect(
      classifyCompletionFailure({
        status: "error",
        code: "provider_error",
        message: "local runtime http 500",
      }),
    ).toBe("UNAVAILABLE");
    expect(
      classifyCompletionFailure({
        status: "error",
        code: "provider_error",
        message: "something else entirely",
      }),
    ).toBe("PROVIDER_ERROR");
  });
});

// ── 3. the privacy veto, proven at ADAPTER-INVOCATION level ─────────────────

/**
 * A synthetic provider that reuses the LOCAL adapter's wire but is declared
 * cloud + free_tier. Reusing the local adapter is deliberate: it is the one
 * adapter that will actually make a request in a test, so "was it invoked?"
 * becomes an observable fact rather than an argument about mocks.
 */
const syntheticFreeTier = (
  costClass: "free_tier" | "paid",
): AiProviderProfile[] => [
  {
    id: "local",
    displayName: "synthetic free cloud tier",
    costClass,
    requiresKey: true,
    locality: "cloud",
    capabilities: ["explain_match", "structure_future_work"],
    structuredOutput: false,
    priority: 0,
  },
];

describe("an ungranted external provider never RECEIVES the payload", () => {
  it("PERSONAL data: the adapter is never invoked", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");

    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      // explain_match is PERSONAL — built from a named worker's evidence.
      chain("explain_match", [READY("local")], syntheticFreeTier("free_tier")),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
    expect(r.status).toBe("error");
    expect(r.status === "error" && r.message).toMatch(/egress grant/i);
  });

  it("EUR 0 grants nothing: marking the SAME provider paid changes nothing", async () => {
    // Under the OLD price-based rule this was the negative control — flipping
    // the cost class to `paid` made the call happen. The owner's AI DATA
    // BOUNDARY decision reversed exactly that: paying a vendor is not
    // permitting it to process a worker's evidence. Same id, same wire, same
    // payload, now still refused.
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");

    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("explain_match", [READY("local")], syntheticFreeTier("paid")),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
    expect(r.status).toBe("error");
  });

  it("NEGATIVE CONTROL: an explicit egress grant DOES make the call happen", async () => {
    // The control that keeps the assertions above meaningful — without it they
    // would prove that nothing works, not that the gate works. The grant is the
    // only thing that changes.
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");

    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain(
        "explain_match",
        [READY("local")],
        syntheticFreeTier("paid"),
        // The synthetic profile reuses the id "local" with locality "cloud",
        // so the grant is keyed on that id.
        GRANT_ALL("local"),
      ),
    );

    expect(spy).toHaveBeenCalled();
    expect(received).toHaveLength(1);
    expect(r.status).toBe("ok");
  });

  it("a business's own project data is ALSO refused without a grant", async () => {
    // This used to assert the opposite: LOW_RISK_PROJECT_DATA reached a free
    // tier because the veto only guarded personal data. The owner's AI DATA
    // BOUNDARY decision lists organisations' internal information and project
    // / task data as non-exportable by default too, so the gate now covers it.
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const r = await dispatchAiCompletion(
      request("structure_future_work"),
      cfgFor(),
      chain(
        "structure_future_work",
        [READY("local")],
        syntheticFreeTier("free_tier"),
      ),
    );
    expect(received).toHaveLength(0);
    expect(r.status).toBe("error");
  });

  it("a grant capped at LOW_RISK lets project data through, but nothing above it", async () => {
    // The free-tier ceiling in one test: granted, so project data flows; the
    // cap still refuses anything personal to the same provider.
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const grants = [
      {
        provider: "local",
        maxSensitivity: "LOW_RISK_PROJECT_DATA" as const,
        basis: "test fixture",
        grantedOn: "2026-08-19",
      },
    ];

    const projectRun = await dispatchAiCompletion(
      request("structure_future_work"),
      cfgFor(),
      chain(
        "structure_future_work",
        [READY("local")],
        syntheticFreeTier("free_tier"),
        grants,
      ),
    );
    expect(received).toHaveLength(1);
    expect(projectRun.status).toBe("ok");

    received = [];
    const personalRun = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain(
        "explain_match",
        [READY("local")],
        syntheticFreeTier("free_tier"),
        grants,
      ),
    );
    expect(received).toHaveLength(0);
    expect(personalRun.status).toBe("error");
  });
});

// ── 4. whole-runtime states still win ───────────────────────────────────────

describe("mock and disabled are not overridable by a chain", () => {
  it("a disabled runtime reaches no provider even with a ready chain", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");
    const off = resolveAiRuntimeConfig({
      mode: undefined,
      provider: "local",
      apiKey: undefined,
      model: undefined,
      timeoutMs: undefined,
      maxRetries: undefined,
      maxOutputTokens: undefined,
      dailyRunBudget: undefined,
      localBaseUrl: baseUrl,
      localModel: "test-model",
    });
    const r = await dispatchAiCompletion(
      request(),
      off,
      chain("explain_match", [READY("local")]),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(r.status).toBe("disabled");
  });

  it("a mock runtime stays deterministic under a chain", async () => {
    vi.stubEnv("AI_LOCAL_ENABLED", "true");
    const spy = vi.spyOn(globalThis, "fetch");
    const mockCfg = resolveAiRuntimeConfig({
      mode: "mock",
      provider: "local",
      apiKey: undefined,
      model: undefined,
      timeoutMs: undefined,
      maxRetries: undefined,
      maxOutputTokens: undefined,
      dailyRunBudget: undefined,
      localBaseUrl: baseUrl,
      localModel: "test-model",
    });
    const r = await dispatchAiCompletion(
      { ...request(), mock: { hello: "world" } },
      mockCfg,
      chain("explain_match", [READY("local")]),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.provider).toBe("mock");
  });
});

// ── 5. the local adapter's own gate ─────────────────────────────────────────

describe("the local adapter is inert until the operator enables it", () => {
  it("AI_LOCAL_ENABLED unset → disabled sentinel, no request", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const r = await dispatchAiCompletion(
      request(),
      cfgFor(),
      chain("explain_match", [READY("local")]),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(r.status).not.toBe("ok");
  });
});
