/**
 * AI runtime config-core — disabled by default, mock keyless, live needs a key.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAiRuntimeConfig,
  providerKindFor,
  isAiRuntimeActive,
  DEFAULT_AI_MODEL,
  type AiRuntimeConfigInput,
} from "./config-core";

const base: AiRuntimeConfigInput = {
  mode: undefined,
  provider: undefined,
  apiKey: undefined,
  model: undefined,
  timeoutMs: undefined,
  maxRetries: undefined,
  maxOutputTokens: undefined,
  dailyRunBudget: undefined,
};

describe("resolveAiRuntimeConfig", () => {
  it("is disabled by default (no env)", () => {
    const c = resolveAiRuntimeConfig(base);
    expect(c.state).toBe("disabled");
    expect(c.reason).toBe("mode_disabled");
    expect(c.hasApiKey).toBe(false);
    expect(c.model).toBe(DEFAULT_AI_MODEL);
    expect(isAiRuntimeActive(c)).toBe(false);
    expect(providerKindFor(c)).toBe("disabled");
  });

  it("mock mode is active without any key", () => {
    const c = resolveAiRuntimeConfig({ ...base, mode: "mock" });
    expect(c.state).toBe("mock");
    expect(c.reason).toBe("ok");
    expect(c.hasApiKey).toBe(false);
    expect(isAiRuntimeActive(c)).toBe(true);
    expect(providerKindFor(c)).toBe("mock");
  });

  it("live mode WITHOUT a key falls back to disabled (never silently live)", () => {
    const c = resolveAiRuntimeConfig({ ...base, mode: "live", provider: "anthropic" });
    expect(c.state).toBe("disabled");
    expect(c.reason).toBe("missing_api_key");
    expect(providerKindFor(c)).toBe("disabled");
  });

  it("live mode with an unknown provider is disabled", () => {
    const c = resolveAiRuntimeConfig({
      ...base,
      mode: "live",
      provider: "acme",
      apiKey: "sk-ant-xxxxxxxx",
    });
    expect(c.state).toBe("disabled");
    expect(c.reason).toBe("unknown_provider");
  });

  it("live mode with a known provider + key is live (anthropic default model)", () => {
    const c = resolveAiRuntimeConfig({
      ...base,
      mode: "live",
      provider: "anthropic",
      apiKey: "sk-ant-realkey-value",
    });
    expect(c.state).toBe("live");
    expect(c.reason).toBe("ok");
    expect(c.provider).toBe("anthropic");
    expect(c.hasApiKey).toBe(true);
    expect(c.model).toBe(DEFAULT_AI_MODEL);
    expect(providerKindFor(c)).toBe("anthropic");
  });

  it("never carries the key VALUE — only a presence flag", () => {
    const c = resolveAiRuntimeConfig({
      ...base,
      mode: "live",
      provider: "anthropic",
      apiKey: "sk-ant-supersecret",
    });
    expect(JSON.stringify(c)).not.toContain("supersecret");
    expect(c.hasApiKey).toBe(true);
  });

  it("clamps cost/safety guards into safe bounds", () => {
    const c = resolveAiRuntimeConfig({
      ...base,
      mode: "mock",
      timeoutMs: "999999",
      maxRetries: "99",
      maxOutputTokens: "999999",
      dailyRunBudget: "-5",
    });
    expect(c.timeoutMs).toBe(120_000);
    expect(c.maxRetries).toBe(5);
    expect(c.maxOutputTokens).toBe(8_000);
    expect(c.dailyRunBudget).toBe(0);
  });

  it("uses safe defaults for missing/garbage guard values", () => {
    const c = resolveAiRuntimeConfig({ ...base, mode: "mock", timeoutMs: "abc" });
    expect(c.timeoutMs).toBe(30_000);
    expect(c.maxRetries).toBe(2);
    expect(c.maxOutputTokens).toBe(2_000);
    expect(c.dailyRunBudget).toBe(500);
  });

  it("honours an explicit model override when live", () => {
    const c = resolveAiRuntimeConfig({
      ...base,
      mode: "live",
      provider: "anthropic",
      apiKey: "sk-ant-x-value-1234",
      model: "claude-sonnet-4-6",
    });
    expect(c.model).toBe("claude-sonnet-4-6");
  });
});
