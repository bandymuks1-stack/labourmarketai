import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  __resetRateLimitsForTest,
  clientKeyFromHeaders,
  rateLimit,
} from "@/lib/security/rate-limit";

/**
 * Anonymous-write rate limiting — security audit finding M-03.
 *
 * Two halves:
 *   1. BEHAVIOUR of the limiter (deterministic — time is injected, never slept).
 *   2. WIRING: that the anonymous write paths actually call it. A correct
 *      limiter nobody invokes is the exact shape of this finding before the fix,
 *      so the wiring assertions matter as much as the behaviour ones.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

const WINDOW = 60_000;

beforeEach(() => {
  __resetRateLimitsForTest();
});

describe("rateLimit behaviour (audit M-03)", () => {
  it("allows requests up to the limit", () => {
    for (let i = 1; i <= 3; i++) {
      const d = rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 + i });
      expect(d.limited, `request ${i} should be allowed`).toBe(false);
      expect(d.count).toBe(i);
    }
  });

  it("refuses the request that exceeds the limit", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 + i });
    }
    const over = rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1100 });
    expect(over.limited).toBe(true);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("frees the budget once the window has passed", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 + i });
    }
    expect(
      rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 + WINDOW + 1 })
        .limited,
    ).toBe(false);
  });

  it("does not extend its own lockout when a blocked caller keeps hammering", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 });
    }
    // Hammer while blocked; the window must still expire on the ORIGINAL hits.
    for (let i = 0; i < 50; i++) {
      rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 + i });
    }
    expect(
      rateLimit({ name: "t", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 + WINDOW + 1 })
        .limited,
      "a blocked caller must not be able to keep pushing their own reset out forever",
    ).toBe(false);
  });

  it("keeps separate keys independent", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit({ name: "t", key: "a", limit: 3, windowMs: WINDOW, nowMs: 1000 });
    }
    expect(
      rateLimit({ name: "t", key: "b", limit: 3, windowMs: WINDOW, nowMs: 1000 }).limited,
      "one caller exhausting their budget must not block everyone else",
    ).toBe(false);
  });

  it("keeps separate limiters independent", () => {
    for (let i = 0; i < 3; i++) {
      rateLimit({ name: "one", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 });
    }
    expect(
      rateLimit({ name: "two", key: "k", limit: 3, windowMs: WINDOW, nowMs: 1000 }).limited,
      "surfaces must not consume each other's budget",
    ).toBe(false);
  });
});

describe("clientKeyFromHeaders (audit M-03)", () => {
  it("uses the first x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(clientKeyFromHeaders(h)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe(
      "198.51.100.9",
    );
  });

  /** Fail-CLOSED: stripping the header must not mint a fresh unlimited bucket. */
  it("returns a shared constant when no client header is present", () => {
    const a = clientKeyFromHeaders(new Headers());
    const b = clientKeyFromHeaders(new Headers());
    expect(a).toBe(b);
    expect(a).not.toBe("");
  });

  it("shares one bucket across unidentifiable callers", () => {
    const key = clientKeyFromHeaders(new Headers());
    for (let i = 0; i < 3; i++) {
      rateLimit({ name: "t", key, limit: 3, windowMs: WINDOW, nowMs: 1000 });
    }
    expect(
      rateLimit({
        name: "t",
        key: clientKeyFromHeaders(new Headers()),
        limit: 3,
        windowMs: WINDOW,
        nowMs: 1000,
      }).limited,
      "callers with no forwarding header must share a bucket, not each get their own",
    ).toBe(true);
  });
});

describe("anonymous write paths are actually throttled (audit M-03)", () => {
  it("the waitlist route rate-limits and answers 429", () => {
    const src = read("app/api/waitlist/route.ts");
    expect(src).toContain("rateLimit(");
    expect(src).toContain("clientKeyFromHeaders");
    expect(src, "a throttled request must answer 429, not a generic error").toContain("429");
    expect(src, "429 should carry retry-after").toContain("retry-after");
  });

  it("the anonymous company-need intake rate-limits before touching Supabase", () => {
    const src = read("lib/staffing/company-need-public-intake.ts");
    expect(src).toContain("rateLimit(");
    expect(src).toContain("clientKeyFromHeaders");
    expect(src, "the caller needs a distinct code to degrade honestly").toContain(
      "rate_limited",
    );
    // Order matters: throttle before the network call, or a flood still costs us.
    expect(
      src.indexOf("rateLimit("),
      "rate limiting must happen BEFORE the Supabase client is constructed",
    ).toBeLessThan(src.indexOf("createSupabaseClient("));
  });

  /**
   * The finding was "no rate limiting on ANY anonymous write path", so this
   * enumerates them. A NEW anonymous write surface added without a throttle is
   * the regression to catch — add it here together with its limiter.
   */
  it("every known anonymous write surface is covered", () => {
    const surfaces = [
      "app/api/waitlist/route.ts",
      "lib/staffing/company-need-public-intake.ts",
    ] as const;
    const missing = surfaces.filter((s) => !read(s).includes("rateLimit("));
    expect(missing, `anonymous write surfaces with no throttle: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  /**
   * Wagon A (value train 2): every PUBLIC server action that can invoke the AI
   * runtime is metered. These are `"use server"` actions POST-reachable from
   * unauthenticated marketing routes — the moment the owner activates a
   * provider, an unthrottled one becomes unmetered anonymous spend. A NEW
   * public AI action added without `aiActionRateLimited(` is the regression.
   */
  it("every public AI server action is throttled", () => {
    const surfaces = [
      "lib/staffing/match-preview-actions.ts",
      "lib/staffing/worker-intake-form-actions.ts",
      "lib/staffing/company-need-form-actions.ts",
    ] as const;
    const missing = surfaces.filter(
      (s) => !read(s).includes("aiActionRateLimited("),
    );
    expect(
      missing,
      `public AI actions with no throttle: ${missing.join(", ")}`,
    ).toEqual([]);
    // The helper itself must really meter and really key by client.
    const helper = read("lib/security/ai-action-throttle.ts");
    expect(helper).toContain("rateLimit(");
    expect(helper).toContain("clientKeyFromHeaders");
  });
});
