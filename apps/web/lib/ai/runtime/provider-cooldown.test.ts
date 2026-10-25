import { describe, expect, it } from "vitest";
import {
  COOLDOWN_MAX_MS,
  COOLDOWN_MIN_MS,
  ProviderCooldown,
  retryAfterMsFrom,
} from "./provider-cooldown";

const C = (ids: string[]) => ids.map((id) => ({ id }));

describe("provider cooldown", () => {
  it("honours the vendor's retry-after on a rate limit", () => {
    const c = new ProviderCooldown();
    const until = c.noteFailure("groq", "RATE_LIMIT", "groq http 429 — tokens (retry-after 12s)", 0);
    expect(until).toBe(12_000);
    expect(c.activeFor("groq", 11_999)).not.toBeNull();
    expect(c.activeFor("groq", 12_000)).toBeNull();
  });

  it("defaults, then doubles on repeated failures, capped at 15 minutes", () => {
    const c = new ProviderCooldown();
    expect(c.noteFailure("mistral", "UNAVAILABLE", "mistral http 503", 0)).toBe(30_000);
    expect(c.noteFailure("mistral", "UNAVAILABLE", "mistral http 503", 30_000)).toBe(30_000 + 60_000);
    let t = 100_000;
    for (let i = 0; i < 20; i++) t = c.noteFailure("mistral", "TIMEOUT", "timeout", t)!;
    const until = c.noteFailure("mistral", "TIMEOUT", "timeout", t)!;
    expect(until - t).toBe(COOLDOWN_MAX_MS);
  });

  it("clamps a vendor hint into [5 s, 15 min]", () => {
    const c = new ProviderCooldown();
    expect(c.noteFailure("a", "RATE_LIMIT", "http 429 (retry-after 0s)", 0)).toBe(COOLDOWN_MIN_MS);
    expect(c.noteFailure("b", "RATE_LIMIT", "http 429 (retry-after 999999s)", 0)).toBe(COOLDOWN_MAX_MS);
  });

  it("request-attributed failures never cool a provider down", () => {
    const c = new ProviderCooldown();
    for (const f of ["INVALID_OUTPUT", "TRUNCATED", "PRIVACY_BLOCK", "UNSUPPORTED_CAPABILITY", "CONFIGURATION", "PROVIDER_ERROR"] as const) {
      expect(c.noteFailure("x", f, "m", 0), f).toBeNull();
    }
    expect(c.activeFor("x", 1)).toBeNull();
  });

  it("a success clears the cooldown", () => {
    const c = new ProviderCooldown();
    c.noteFailure("cloudflare", "RATE_LIMIT", undefined, 0);
    c.noteSuccess("cloudflare");
    expect(c.activeFor("cloudflare", 1)).toBeNull();
  });

  it("reorders — cooling providers last, original order kept — and never removes one", () => {
    const c = new ProviderCooldown();
    c.noteFailure("cloudflare", "RATE_LIMIT", undefined, 0);
    expect(c.order(C(["cloudflare", "mistral", "groq"]), 1).map((x) => x.id)).toEqual(["mistral", "groq", "cloudflare"]);
    expect(c.order(C(["cloudflare"]), 1).map((x) => x.id)).toEqual(["cloudflare"]);
  });

  it("reads retry-after only in the adapter's fixed structural shape", () => {
    expect(retryAfterMsFrom("x (retry-after 3s)")).toBe(3_000);
    expect(retryAfterMsFrom("Retry after 3 seconds")).toBeNull();
    expect(retryAfterMsFrom(undefined)).toBeNull();
  });
});
