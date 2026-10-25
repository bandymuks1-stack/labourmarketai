/**
 * FREE API TIERS — routing, failover, egress refusal, timeouts (2026-10-25).
 *
 * Exercises the REAL `dispatchAiCompletion` and the REAL free-tier bindings
 * (providers/free-tier.ts) with `fetch` stubbed per vendor host, so what is
 * asserted is which vendor endpoint a request would actually reach, with which
 * key, in which order — and which requests never leave at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchAiCompletion, type ChainDispatchContext } from "./run-core";
import { resolveAiRuntimeConfig, type AiRuntimeConfig } from "./config-core";
import {
  AI_PROVIDER_PROFILES,
  orderedCandidatesFor,
  resolveProviderChain,
  type AiProviderState,
} from "./provider-chain";
import { observeProviderStates } from "./provider-health";
import { ProviderCooldown } from "./provider-cooldown";
import { resolveTaskRoute, type AiTaskType } from "./task-routing";
import { AI_EGRESS_GRANTS, egressPermitted, maxPermittedSensitivity } from "./data-egress";
import { sensitivityForTask } from "./data-sensitivity";
import { AI_MODEL_CANDIDATES } from "./model-candidates";
import { isSelectable, MODEL_REGISTRY } from "./model-registry";
import { estimateCostUsd } from "./model-pricing";
import type { AiCompletionRequest } from "./types";
import { geminiCompletionProvider } from "./providers/gemini";

type Behaviour = "ok" | "429" | "500" | "timeout" | "garbage";

const HOSTS = {
  cloudflare: "api.cloudflare.com",
  mistral: "api.mistral.ai",
  groq: "api.groq.com",
} as const;
type FreeId = keyof typeof HOSTS;

let behaviour: Record<FreeId, Behaviour>;
let calls: { id: FreeId; url: string; auth: string | null; body: Record<string, unknown> }[];

function idForUrl(url: string): FreeId {
  for (const [id, host] of Object.entries(HOSTS) as [FreeId, string][]) {
    if (url.includes(host)) return id;
  }
  throw new Error(`unexpected host: ${url}`);
}

beforeEach(() => {
  behaviour = { cloudflare: "ok", mistral: "ok", groq: "ok" };
  calls = [];
  vi.stubEnv("AI_CLOUDFLARE_ENABLED", "true");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct-test");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "cf-presence-only");
  vi.stubEnv("AI_MISTRAL_ENABLED", "true");
  vi.stubEnv("MISTRAL_API_KEY", "mistral-presence-only");
  vi.stubEnv("AI_GROQ_ENABLED", "true");
  vi.stubEnv("GROQ_API_KEY", "groq-presence-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const id = idForUrl(url);
      const headers = new Headers(init?.headers);
      calls.push({
        id,
        url,
        auth: headers.get("authorization"),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      switch (behaviour[id]) {
        case "429":
          return new Response(JSON.stringify({ error: { message: "Rate limit reached", type: "tokens" } }), {
            status: 429,
            headers: { "retry-after": "7", "content-type": "application/json" },
          });
        case "500":
          return new Response("upstream down", { status: 503 });
        case "timeout": {
          const e = new Error("The operation was aborted due to timeout");
          e.name = "TimeoutError";
          throw e;
        }
        case "garbage":
          return Response.json({ choices: [{ message: { content: "prose, not json" } }] });
        default:
          return Response.json({
            choices: [{ message: { content: JSON.stringify({ data: { summary: `from ${id}` } }) } }],
            usage: { prompt_tokens: 120, completion_tokens: 40 },
          });
      }
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function cfg(provider: "cloudflare" | "mistral" | "groq" = "cloudflare"): AiRuntimeConfig {
  return resolveAiRuntimeConfig({
    mode: "live",
    provider,
    apiKey: "presence-only",
    model: undefined,
    timeoutMs: "5000",
    maxRetries: undefined,
    maxOutputTokens: undefined,
    dailyRunBudget: undefined,
  });
}

const marketRequest = (): AiCompletionRequest => ({
  agentKey: "market_explanation",
  promptVersion: "v1",
  system: "explain the public market facts",
  input: { profession_slug: "welder", active_ads: 12 },
  locale: "lt",
  modelAlias: "haiku",
});

const READY = (id: string): AiProviderState => ({ id, health: "ready" });
const ALL_FREE_READY = [READY("cloudflare"), READY("mistral"), READY("groq")];

const chainFor = (
  task: AiTaskType,
  states: AiProviderState[] = ALL_FREE_READY,
  extra: Partial<ChainDispatchContext> = {},
): ChainDispatchContext => ({
  decision: resolveTaskRoute(task, { attempt: 1 }),
  states,
  ...extra,
});

describe("routing: free quota first, in a stated order", () => {
  it("orders the free tiers after local and before every metered vendor", () => {
    const order = orderedCandidatesFor("explain_market_demand").map((p) => p.id);
    expect(order.slice(0, 4)).toEqual(["local", "cloudflare", "mistral", "groq"]);
    for (const paid of ["gemini", "anthropic", "openai", "xai"]) {
      expect(order.indexOf(paid)).toBeGreaterThan(order.indexOf("groq"));
    }
  });

  it("every free tier is an EXTERNAL free_tier profile — never local, never paid", () => {
    for (const id of ["cloudflare", "mistral", "groq"]) {
      const p = AI_PROVIDER_PROFILES.find((x) => x.id === id);
      expect(p, id).toBeDefined();
      expect(p!.costClass, id).toBe("free_tier");
      expect(p!.locality, id).toBe("cloud");
      expect(p!.requiresKey, id).toBe(true);
    }
  });

  it("the PUBLIC task is served by the first free tier, on its own endpoint, with its own key and model", async () => {
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.provider).toBe("cloudflare");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct-test/ai/v1/chat/completions",
    );
    expect(calls[0].auth).toBe("Bearer cf-presence-only");
    expect(calls[0].body.model).toBe(AI_MODEL_CANDIDATES.cloudflare.haiku);
    // Cloudflare does not document response_format → not sent.
    expect(calls[0].body).not.toHaveProperty("response_format");
  });

  it("each binding reaches only its own vendor host with its own key", async () => {
    const r = await dispatchAiCompletion(
      marketRequest(),
      cfg("mistral"),
      chainFor("explain_market_demand", [READY("mistral"), READY("groq")]),
    );
    expect(r.status === "ok" && r.provider).toBe("mistral");
    expect(calls[0].url).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer mistral-presence-only");
    expect(calls[0].body.model).toBe("mistral-large-latest");
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(calls[0].body).toHaveProperty("max_tokens");
  });
});

describe("failover: 429 / 5xx / timeout advance, bounded", () => {
  it("429 on Cloudflare → Mistral answers", async () => {
    behaviour.cloudflare = "429";
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status === "ok" && r.provider).toBe("mistral");
    expect(calls.map((c) => c.id)).toEqual(["cloudflare", "mistral"]);
  });

  it("5xx then timeout → Groq answers; each candidate is tried at most once", async () => {
    behaviour.cloudflare = "500";
    behaviour.mistral = "timeout";
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status === "ok" && r.provider).toBe("groq");
    expect(calls.map((c) => c.id)).toEqual(["cloudflare", "mistral", "groq"]);
  });

  it("every free tier failing ends in an honest, attributed error — never a fabricated answer", async () => {
    behaviour = { cloudflare: "429", mistral: "500", groq: "timeout" };
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status).toBe("error");
    expect(r.status === "error" && r.code).toBe("timeout");
    expect(r.status === "error" && r.provider).toBe("groq");
    expect(calls).toHaveLength(3);
  });

  it("malformed output escalates ONCE, then stops (no payload sprayed down the chain)", async () => {
    behaviour = { cloudflare: "garbage", mistral: "garbage", groq: "ok" };
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status).toBe("error");
    expect(calls.map((c) => c.id)).toEqual(["cloudflare", "mistral"]);
  });

  it("the 429's retry-after is carried, structurally, for the cooldown", async () => {
    behaviour = { cloudflare: "429", mistral: "429", groq: "429" };
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status === "error" && r.message).toMatch(/http 429 .*\(retry-after 7s\)$/);
  });
});

describe("cooldown: a provider that just failed is tried LAST, never removed", () => {
  it("after a 429, the next run starts at the next free tier", async () => {
    const cooldown = new ProviderCooldown();
    let t = 1_000_000;
    const now = () => t;
    behaviour.cloudflare = "429";
    await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand", ALL_FREE_READY, { cooldown, now }));
    expect(calls.map((c) => c.id)).toEqual(["cloudflare", "mistral"]);

    calls = [];
    behaviour.cloudflare = "ok";
    t += 2_000; // inside the vendor's 7 s retry-after
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand", ALL_FREE_READY, { cooldown, now }));
    expect(r.status === "ok" && r.provider).toBe("mistral");
    expect(calls.map((c) => c.id)).toEqual(["mistral"]);

    calls = [];
    t += 10_000; // past the window
    const r2 = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand", ALL_FREE_READY, { cooldown, now }));
    expect(r2.status === "ok" && r2.provider).toBe("cloudflare");
  });

  it("with ONE provider configured, a cooling provider is still tried (a cooldown cannot empty the chain)", async () => {
    const cooldown = new ProviderCooldown();
    const now = () => 5_000_000;
    behaviour.groq = "500";
    await dispatchAiCompletion(marketRequest(), cfg("groq"), chainFor("explain_market_demand", [READY("groq")], { cooldown, now }));
    behaviour.groq = "ok";
    calls = [];
    const r = await dispatchAiCompletion(marketRequest(), cfg("groq"), chainFor("explain_market_demand", [READY("groq")], { cooldown, now }));
    expect(r.status === "ok" && r.provider).toBe("groq");
  });
});

describe("egress: free tiers receive PUBLIC payloads only", () => {
  const PERSONAL_OR_PRIVATE: { task: AiTaskType; agentKey: string }[] = [
    { task: "extract_cv", agentKey: "worker_profile" },
    { task: "normalize_work_scope", agentKey: "work_journal" },
    { task: "explain_match", agentKey: "matching_explanation" },
    // draft_follow_up has no agent since support_onboarding was retired
    // (2026-10-25, row 10.11); the task's refusal is still pinned — the agent
    // key in the request is only a label here.
    { task: "draft_follow_up", agentKey: "draft_follow_up" },
    { task: "translate_message", agentKey: "translation_copy" },
    { task: "propose_conversation_intent", agentKey: "conversation_intent" },
    { task: "translate_vacancy", agentKey: "vacancy_translation" },
    // LOW_RISK company data is refused too: no grant names a free tier.
    { task: "structure_future_work", agentKey: "company_need" },
    { task: "derive_workforce_requirements", agentKey: "country_readiness" },
  ];

  it.each(PERSONAL_OR_PRIVATE)("$task never reaches a free-tier vendor", async ({ task, agentKey }) => {
    const r = await dispatchAiCompletion(
      { ...marketRequest(), agentKey },
      cfg(),
      chainFor(task),
    );
    expect(r.status).toBe("error");
    expect(r.status === "error" && r.message).toMatch(/data egress gate/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the free-tier ceiling caps any grant at LOW_RISK_PROJECT_DATA, and no shipped grant names a free tier", () => {
    for (const id of ["cloudflare", "mistral", "groq"]) {
      const p = AI_PROVIDER_PROFILES.find((x) => x.id === id)!;
      expect(maxPermittedSensitivity(p), id).toBe("PUBLIC");
      expect(AI_EGRESS_GRANTS.some((g) => g.provider === id), id).toBe(false);
      const generous = [{ provider: id, maxSensitivity: "SENSITIVE_FREE_TEXT" as const, basis: "t", grantedOn: "2026-10-25" }];
      // Free-tier cap LOW_RISK; Mistral's free mode trains by default, so its
      // own terms cap it lower still (provider-catalogue.ts).
      expect(maxPermittedSensitivity(p, generous), id).toBe(id === "mistral" ? "PUBLIC" : "LOW_RISK_PROJECT_DATA");
      expect(egressPermitted(p, "PERSONAL", generous).permitted, id).toBe(false);
    }
    expect(sensitivityForTask("explain_market_demand")).toBe("PUBLIC");
  });

  it("the legacy (no-chain) path applies the same gate to a free-tier primary", async () => {
    const r = await dispatchAiCompletion({ ...marketRequest(), agentKey: "worker_profile" }, cfg("groq"));
    expect(r.status).toBe("error");
    expect(r.status === "error" && r.message).toMatch(/data egress gate/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("configuration: inert without a key, a free key alone can make the runtime live", () => {
  it("a free tier is a valid PRIMARY: live with its key, disabled without", () => {
    expect(cfg("cloudflare").state).toBe("live");
    const noKey = resolveAiRuntimeConfig({
      mode: "live",
      provider: "groq",
      apiKey: undefined,
      model: undefined,
      timeoutMs: undefined,
      maxRetries: undefined,
      maxOutputTokens: undefined,
      dailyRunBudget: undefined,
    });
    expect(noKey.state).toBe("disabled");
    expect(noKey.reason).toBe("missing_api_key");
  });

  it("each binding returns the typed disabled sentinel without its flag or key — no network", async () => {
    vi.stubEnv("AI_MISTRAL_ENABLED", "false");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const r = await dispatchAiCompletion(marketRequest(), cfg(), chainFor("explain_market_demand"));
    expect(r.status).toBe("disabled");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("observed health: flag off → disabled, flag on without key → unconfigured, both → ready", () => {
    const states = observeProviderStates({
      runtimeState: "live",
      local: { enabled: false, baseUrl: null, model: null },
      anthropic: { enabled: true, hasKey: false },
      openai: { enabled: false, hasKey: false },
      gemini: { enabled: true, hasKey: true, disabledReason: "Gemini free tier may not serve EEA users" },
      xai: { enabled: false, hasKey: false },
      cloud: {
        cloudflare: { enabled: true, hasKey: true },
        mistral: { enabled: true, hasKey: false },
        groq: { enabled: false, hasKey: true },
      },
    });
    const by = Object.fromEntries(states.map((s) => [s.id, s]));
    expect(by.cloudflare.health).toBe("ready");
    expect(by.mistral.health).toBe("unconfigured");
    expect(by.groq.health).toBe("disabled");
    // A configured Gemini key without the paid-tier confirmation is NOT ready.
    expect(by.gemini.health).toBe("disabled");
    expect(by.gemini.reason).toMatch(/EEA/);
  });

  it("when nothing free is ready, the outcome names every candidate and why", () => {
    const outcome = resolveProviderChain(resolveTaskRoute("explain_market_demand", { attempt: 1 }), [
      { id: "cloudflare", health: "unconfigured", reason: "no API key is set" },
      { id: "mistral", health: "disabled", reason: "AI_MISTRAL_ENABLED is not true" },
    ]);
    expect(outcome.kind).toBe("unavailable");
    const text = outcome.kind === "unavailable" ? outcome.skipped.map((s) => `${s.id}: ${s.reason}`).join("; ") : "";
    expect(text).toContain("cloudflare: no API key is set");
    expect(text).toContain("mistral: AI_MISTRAL_ENABLED is not true");
  });
});

describe("Gemini: free tier is not a lawful option for an EEA-facing product", () => {
  it("a Gemini key without AI_GEMINI_PAID_TIER_CONFIRMED=1 stays disabled — no network", async () => {
    vi.stubEnv("AI_GEMINI_ENABLED", "true");
    vi.stubEnv("GEMINI_API_KEY", "presence-only");
    vi.stubEnv("AI_GEMINI_PAID_TIER_CONFIRMED", "");
    const r = await geminiCompletionProvider.complete(marketRequest(), cfg());
    expect(r.status).toBe("disabled");
    expect(r.status === "disabled" && r.reason).toBe("paid_tier_unconfirmed");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("cost: every free-tier model is priced, sourced and inside the PUBLIC task's ceiling", () => {
  it("is selectable only with a first-hand source and a date", () => {
    const free = MODEL_REGISTRY.filter((e) => ["cloudflare", "mistral", "groq"].includes(e.provider));
    // 6 tier models + Llama 3.3 and Nemotron registered under their host.
    expect(free.length).toBe(8);
    for (const e of free) {
      expect(isSelectable(e), e.model).toBe(true);
      expect(e.freeTier, e.model).toBe(true);
      expect(e.pricingSource, e.model).toMatch(/https:\/\/(developers\.cloudflare\.com|mistral\.ai|console\.groq\.com)/);
      expect(e.inputUsdPerMTok!, e.model).toBeGreaterThan(0);
    }
  });

  it("explain_market_demand at a realistic size stays far below its 0.02 USD ceiling on every free tier", () => {
    for (const provider of ["cloudflare", "mistral", "groq"]) {
      const model = AI_MODEL_CANDIDATES[provider].haiku;
      const usd = estimateCostUsd(model, 2_000, 2_000);
      expect(usd, provider).not.toBeNull();
      expect(usd!, provider).toBeLessThan(0.02);
    }
  });
});
