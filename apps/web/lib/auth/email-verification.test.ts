import { describe, expect, it } from "vitest";

import {
  VERIFY_EMAIL_FLOW,
  buildVerifyEmailRedirectTo,
  isEmailVerifiedRead,
  isVerifyEmailFlow,
  parseVerifyResult,
  verifyOutcomeToParam,
} from "./email-verification";

describe("verified-email boundary — pure helpers", () => {
  it("only an explicit boolean true from the database is verified (fail-closed)", () => {
    expect(isEmailVerifiedRead({ verified: true, email: "a@b.c" })).toBe(true);
    for (const bad of [
      null,
      undefined,
      {},
      { verified: false },
      { verified: "true" },
      { verified: 1 },
      { email_confirmed_at: "2026-01-01" },
      "verified",
      [],
    ]) {
      expect(isEmailVerifiedRead(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("an unknown or failed outcome is never rendered as success", () => {
    expect(verifyOutcomeToParam("verified")).toBe("ok");
    expect(verifyOutcomeToParam("already_verified")).toBe("ok");
    for (const o of ["no_proof", "no_request", "email_changed", "verified_maybe", "", null, undefined, 1]) {
      expect(verifyOutcomeToParam(o), String(o)).toBe("failed");
    }
  });

  it("the result param parses only its closed vocabulary", () => {
    expect(parseVerifyResult("ok")).toBe("ok");
    expect(parseVerifyResult("failed")).toBe("failed");
    expect(parseVerifyResult("OK")).toBeNull();
    expect(parseVerifyResult("<script>")).toBeNull();
    expect(parseVerifyResult(null)).toBeNull();
  });

  it("the proof mail returns to the auth callback with the flow marker and the sanitised next", () => {
    const url = new URL(buildVerifyEmailRedirectTo("https://labourmarket.ai/", "en", "/dashboard/network"));
    expect(url.pathname).toBe("/en/auth/callback");
    expect(url.searchParams.get("flow")).toBe(VERIFY_EMAIL_FLOW);
    expect(url.searchParams.get("next")).toBe("/dashboard/network");
    expect(new URL(buildVerifyEmailRedirectTo("https://x.test", "lt", null)).searchParams.has("next")).toBe(false);
  });

  it("flow detection is exact", () => {
    expect(isVerifyEmailFlow(new URLSearchParams("flow=verify_email"))).toBe(true);
    expect(isVerifyEmailFlow(new URLSearchParams("flow=email_confirm"))).toBe(false);
    expect(isVerifyEmailFlow(new URLSearchParams(""))).toBe(false);
  });
});
