import { describe, expect, it } from "vitest";
import {
  generateOauthTraceId,
  withOauthTraceId,
  readOauthTraceId,
  isVercelPreviewHost,
} from "./oauth-trace";

describe("oauth-trace — generateOauthTraceId", () => {
  it("returns a 16-char hex string", () => {
    const id = generateOauthTraceId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces unique ids on successive calls (collision-resistant)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(generateOauthTraceId());
    expect(ids.size).toBe(200);
  });
});

describe("oauth-trace — withOauthTraceId / readOauthTraceId", () => {
  it("round-trips a trace id through the URL", () => {
    const url = new URL("https://labourmarket.ai/lt/auth/callback?next=%2Flt%2Fdashboard");
    const with_ = withOauthTraceId(url, "abc123def4567890");
    expect(with_.searchParams.get("trace")).toBe("abc123def4567890");
    expect(readOauthTraceId(with_)).toBe("abc123def4567890");
  });

  it("does not mutate the source URL", () => {
    const url = new URL("https://labourmarket.ai/lt/auth/callback");
    withOauthTraceId(url, "xyz");
    expect(url.searchParams.has("trace")).toBe(false);
  });

  it("readOauthTraceId returns null for missing/empty trace", () => {
    expect(readOauthTraceId("https://x/y?next=z")).toBeNull();
    expect(readOauthTraceId("https://x/y?trace=")).toBeNull();
    expect(readOauthTraceId("https://x/y?trace=%20%20")).toBeNull();
  });

  it("readOauthTraceId trims surrounding whitespace", () => {
    expect(readOauthTraceId("https://x/y?trace=%20abc%20")).toBe("abc");
  });
});

describe("oauth-trace — isVercelPreviewHost", () => {
  it("treats production + legacy-alias hosts as NOT preview", () => {
    expect(isVercelPreviewHost("labourmarket.ai")).toBe(false);
    // Legacy redirect alias (308s to the apex) — not a preview either.
    expect(isVercelPreviewHost("app.labourmarket.ai")).toBe(false);
    expect(isVercelPreviewHost("labourmarket-ai.vercel.app")).toBe(false);
    expect(isVercelPreviewHost("LABOURMARKET-AI.VERCEL.APP")).toBe(false);
  });

  it("flags branch / per-deployment vercel.app hosts as preview", () => {
    expect(isVercelPreviewHost("labourmarketai-abc123.vercel.app")).toBe(true);
    expect(isVercelPreviewHost("labourmarketai-git-fix-foo-bandymuks1.vercel.app")).toBe(true);
    expect(isVercelPreviewHost("labourmarketai-pr-65.vercel.app")).toBe(true);
  });

  it("ignores localhost / unrelated hosts", () => {
    expect(isVercelPreviewHost("localhost")).toBe(false);
    expect(isVercelPreviewHost("localhost:3000")).toBe(false);
    expect(isVercelPreviewHost("example.com")).toBe(false);
    expect(isVercelPreviewHost("")).toBe(false);
    expect(isVercelPreviewHost(null)).toBe(false);
    expect(isVercelPreviewHost(undefined)).toBe(false);
  });
});
