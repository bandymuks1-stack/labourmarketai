/**
 * Multi-provider translation — the secondary walk (owner order 2026-10-01).
 *
 * `translate_message` tries the dedicated machine-translation engines in order
 * BEFORE the LLM chain; one engine's 429/timeout/outage must advance to the
 * next and never break the thread; an engine the data-egress gate refuses is
 * never called; the original text is the final answer (the caller degrades, it
 * never receives a thrown error). The fallback hook is the injected
 * `secondaries` list — a controlled test seam, never an env flag.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAiCompletion, SECONDARY_TRANSLATION_PROVIDERS, type SecondaryTranslationProvider } from "./run-core";
import { resolveAiRuntimeConfig } from "./config-core";
import { resolveTaskRoute } from "./task-routing";
import type { AiCompletionProvider, AiCompletionRequest, AiCompletionResult } from "./types";
import { libretranslateCompletionProvider } from "./providers/libretranslate";
import { cloudflareCompletionProvider } from "./providers/cloudflare";

const cfg = resolveAiRuntimeConfig({
  mode: "live",
  provider: "local",
  apiKey: undefined,
  model: undefined,
  timeoutMs: "2000",
  maxRetries: undefined,
  maxOutputTokens: undefined,
  dailyRunBudget: undefined,
  localBaseUrl: "http://127.0.0.1:9/v1",
  localModel: "none",
});

const request = (over: Partial<AiCompletionRequest> = {}): AiCompletionRequest => ({
  agentKey: "translation_copy",
  promptVersion: "v1",
  system: "translate",
  input: { canonicalMessage: "Labas rytas", locale: "en" },
  locale: "en",
  preferredProvider: "deepl",
  sourceLanguage: "lt",
  ...over,
});

const ctx = (secondaries: readonly SecondaryTranslationProvider[]) => ({
  decision: resolveTaskRoute("translate_message", { attempt: 1 }),
  states: [{ id: "local", health: "ready" as const }],
  secondaries,
});

const stub = (
  id: string,
  result: AiCompletionResult,
  profile: SecondaryTranslationProvider["profile"] = () => ({ id, locality: "local", costClass: "free_local" }),
) => {
  const complete = vi.fn(async () => result);
  const adapter = { kind: id, complete } as unknown as AiCompletionProvider;
  return { secondary: { id, adapter, profile } satisfies SecondaryTranslationProvider, complete };
};

const ok = (provider: string): AiCompletionResult => ({
  status: "ok",
  provider: provider as "deepl",
  model: `${provider}-m`,
  raw: { data: { localized_copy: "Good morning" } },
});
const fail429: AiCompletionResult = { status: "error", code: "provider_error", message: "http 429 quota" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("secondary walk order and fallback", () => {
  it("the shipped order is self-hosted first, then DeepL, then Cloudflare", () => {
    expect(SECONDARY_TRANSLATION_PROVIDERS.map((s) => s.id)).toEqual(["libretranslate", "deepl", "cloudflare"]);
  });

  it("a 429 on the first engine advances to the next; the second one answers", async () => {
    const a = stub("a", fail429);
    const b = stub("b", ok("b"));
    const r = await dispatchAiCompletion(request(), cfg, ctx([a.secondary, b.secondary]));
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.provider).toBe("b");
    expect(a.complete).toHaveBeenCalledTimes(1);
    expect(b.complete).toHaveBeenCalledTimes(1);
  });

  it("an engine that throws never breaks the walk", async () => {
    const boom = { id: "boom", adapter: { kind: "boom", complete: async () => { throw new Error("x"); } } as unknown as AiCompletionProvider, profile: () => ({ id: "boom", locality: "local" as const, costClass: "free_local" }) };
    const b = stub("b", ok("b"));
    const r = await dispatchAiCompletion(request(), cfg, ctx([boom, b.secondary]));
    expect(r.status === "ok" && r.provider).toBe("b");
  });

  it("every engine failing falls through to the chain and the caller still gets a plain result, never a throw", async () => {
    const a = stub("a", fail429);
    const b = stub("b", { status: "disabled", reason: "mode_disabled" });
    const r = await dispatchAiCompletion(request(), cfg, ctx([a.secondary, b.secondary]));
    expect(a.complete).toHaveBeenCalledTimes(1);
    expect(b.complete).toHaveBeenCalledTimes(1);
    // The chain (unreachable local here) answered with a typed non-ok result:
    // the read side then shows the ORIGINAL.
    expect(r.status).not.toBe("ok");
  });

  it("an external free-tier engine is refused by the egress gate and never called", async () => {
    const cloud = stub("cloud", ok("cloud"), () => ({ id: "cloud", locality: "cloud", costClass: "free_tier" }));
    const r = await dispatchAiCompletion(request(), cfg, ctx([cloud.secondary]));
    expect(cloud.complete).not.toHaveBeenCalled();
    expect(r.status === "ok" && r.provider).not.toBe("cloud");
  });

  it("a task with no dedicated-engine preference skips the walk", async () => {
    const a = stub("a", ok("a"));
    await dispatchAiCompletion(request({ preferredProvider: undefined }), cfg, ctx([a.secondary]));
    expect(a.complete).not.toHaveBeenCalled();
  });
});

describe("LibreTranslate adapter", () => {
  it("is inert until enabled and configured", async () => {
    expect((await libretranslateCompletionProvider.complete(request(), cfg)).status).toBe("disabled");
    vi.stubEnv("AI_LIBRETRANSLATE_ENABLED", "true");
    expect((await libretranslateCompletionProvider.complete(request(), cfg)).status).toBe("disabled");
  });

  it("translates, wrapping the text in the honest envelope", async () => {
    vi.stubEnv("AI_LIBRETRANSLATE_ENABLED", "true");
    vi.stubEnv("LIBRETRANSLATE_URL", "http://translate.internal:5000/");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ translatedText: "Good morning" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await libretranslateCompletionProvider.complete(request(), cfg);
    expect(r.status).toBe("ok");
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).toMatchObject({ q: "Labas rytas", source: "lt", target: "en", format: "text" });
    if (r.status === "ok") {
      const raw = r.raw as { data: { localized_copy: string; plain_language_version: unknown } };
      expect(raw.data.localized_copy).toBe("Good morning");
      expect(raw.data.plain_language_version).toBeNull();
    }
  });

  it("declines a language it does not serve instead of sending the text", async () => {
    vi.stubEnv("AI_LIBRETRANSLATE_ENABLED", "true");
    vi.stubEnv("LIBRETRANSLATE_URL", "http://translate.internal:5000");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await libretranslateCompletionProvider.complete(request({ sourceLanguage: "ka" }), cfg);
    expect(r).toMatchObject({ status: "error", code: "unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is `local` for the egress gate only when declared self-hosted", async () => {
    const { libretranslateEgressProfile } = await import("./providers/libretranslate");
    expect(libretranslateEgressProfile().locality).toBe("cloud");
    vi.stubEnv("AI_LIBRETRANSLATE_SELF_HOSTED", "true");
    expect(libretranslateEgressProfile().locality).toBe("local");
  });
});

describe("Cloudflare adapter", () => {
  it("is inert until enabled and keyed; needs the source language", async () => {
    expect((await cloudflareCompletionProvider.complete(request(), cfg)).status).toBe("disabled");
    vi.stubEnv("AI_CLOUDFLARE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await cloudflareCompletionProvider.complete(request({ sourceLanguage: undefined }), cfg);
    expect(r).toMatchObject({ status: "error", code: "unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("translates with the free m2m100 model", async () => {
    vi.stubEnv("AI_CLOUDFLARE_ENABLED", "true");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, result: { translated_text: "Good morning" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await cloudflareCompletionProvider.complete(request(), cfg);
    expect(r.status === "ok" && r.model).toBe("@cf/meta/m2m100-1.2b");
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).toEqual({ text: "Labas rytas", source_lang: "lt", target_lang: "en" });
  });
});
