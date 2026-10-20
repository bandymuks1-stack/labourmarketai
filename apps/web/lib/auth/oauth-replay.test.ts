import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyAuthRedirectError, isReplayableProviderError } from "@/lib/auth/email-confirm";

/**
 * "OAuth state not found or expired" AFTER a successful sign-in (production
 * 2026-10-19: 3 of 25 Google/LinkedIn sign-ins). In every case the person had
 * already signed in seconds to minutes earlier; the browser replayed the
 * provider step and GoTrue rejected the spent state. A signed-in person is
 * sent on; without a session the error stays exactly as it was.
 */
describe("a replayed provider step after a successful sign-in", () => {
  it("bad_oauth_state and expired flow states are replay errors", () => {
    expect(isReplayableProviderError("bad_oauth_state")).toBe(true);
    expect(isReplayableProviderError("flow_state_expired")).toBe(true);
    expect(isReplayableProviderError("flow_state_not_found")).toBe(true);
  });

  it("a cancel or a dead e-mail link is never treated as a replay", () => {
    expect(isReplayableProviderError(null)).toBe(false);
    expect(isReplayableProviderError("otp_expired")).toBe(false);
    expect(isReplayableProviderError("")).toBe(false);
    // ...and those keep their own message.
    expect(classifyAuthRedirectError({ error: "access_denied", errorCode: null })).toBe("cancelled");
    expect(classifyAuthRedirectError({ error: "access_denied", errorCode: "otp_expired" })).toBe("link_expired");
  });

  it("the callback checks for a live session before reporting a replay as a failure", () => {
    const route = readFileSync(join(__dirname, "..", "..", "app", "[locale]", "auth", "callback", "route.ts"), "utf8");
    const branch = route.slice(route.indexOf("if (providerError) {"), route.indexOf("if (!code && !verification)"));
    expect(branch).toMatch(/isReplayableProviderError\(errorCode\)/);
    expect(branch).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(branch).toMatch(/getSafeReturnPath\(nextParam, locale\)/);
    // The session check comes BEFORE the error redirect.
    expect(branch.indexOf("isReplayableProviderError")).toBeLessThan(branch.indexOf('loginUrl.searchParams.set(\n      "error"'));
  });
});
