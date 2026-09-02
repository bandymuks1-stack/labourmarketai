import { describe, expect, it } from "vitest";

import {
  EMAIL_CONFIRM_FLOW,
  buildEmailConfirmRedirectTo,
  classifyAuthRedirectError,
  classifyExchangeFailure,
  isEmailConfirmFlow,
  parseEmailVerification,
  parseRedirectToHint,
} from "./email-confirm";

const ORIGIN = "https://labourmarket.ai";
const LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

describe("parseEmailVerification", () => {
  it("accepts a token_hash + allowed type", () => {
    const p = new URLSearchParams(
      "token_hash=8ce3b52e51545a2706f2a2d2dd344797ddb53112f9caa9fd418f404d&type=signup",
    );
    expect(parseEmailVerification(p)).toEqual({
      tokenHash: "8ce3b52e51545a2706f2a2d2dd344797ddb53112f9caa9fd418f404d",
      type: "signup",
    });
  });

  it("returns null without a token_hash, without a type, or with an unknown type", () => {
    expect(parseEmailVerification(new URLSearchParams("type=signup"))).toBeNull();
    expect(
      parseEmailVerification(new URLSearchParams("token_hash=abcdefghijklmnop")),
    ).toBeNull();
    expect(
      parseEmailVerification(
        new URLSearchParams("token_hash=abcdefghijklmnop&type=sms"),
      ),
    ).toBeNull();
  });

  it("rejects a malformed token_hash (too short, control chars, url junk)", () => {
    for (const bad of ["short", "abc def ghi jkl mno", "a/b?c=d&e=f#ghijklmnop", "x".repeat(300)]) {
      expect(
        parseEmailVerification(
          new URLSearchParams({ token_hash: bad, type: "signup" }),
        ),
        bad,
      ).toBeNull();
    }
  });
});

describe("buildEmailConfirmRedirectTo / isEmailConfirmFlow", () => {
  it("always carries the flow marker so a token_hash template can append with &", () => {
    const url = buildEmailConfirmRedirectTo(ORIGIN, "lt", null);
    expect(url).toBe(`${ORIGIN}/lt/auth/callback?flow=${EMAIL_CONFIRM_FLOW}`);
    expect(isEmailConfirmFlow(new URL(url).searchParams)).toBe(true);
  });

  it("carries next only when the caller had a real destination", () => {
    const next = "/lt/oauth/consent?authorization_id=abc";
    const url = new URL(buildEmailConfirmRedirectTo(ORIGIN + "/", "en", next));
    expect(url.pathname).toBe("/en/auth/callback");
    expect(url.searchParams.get("next")).toBe(next);
    expect(url.searchParams.get("flow")).toBe(EMAIL_CONFIRM_FLOW);
  });

  it("is not the email flow for a Google return", () => {
    expect(isEmailConfirmFlow(new URLSearchParams("code=abc&next=%2Flt"))).toBe(false);
  });
});

describe("parseRedirectToHint", () => {
  it("lifts locale + next from a same-origin RedirectTo", () => {
    const rt = `${ORIGIN}/en/auth/callback?flow=email_confirm&next=%2Fen%2Fdashboard%2Fjournal`;
    expect(parseRedirectToHint(rt, ORIGIN, LOCALES)).toEqual({
      locale: "en",
      next: "/en/dashboard/journal",
    });
  });

  it("ignores a foreign origin entirely (no open-redirect hint)", () => {
    expect(
      parseRedirectToHint("https://evil.example/lt/auth/callback?next=%2Fx", ORIGIN, LOCALES),
    ).toEqual({ locale: null, next: null });
  });

  it("ignores garbage and an unknown locale", () => {
    expect(parseRedirectToHint("not a url", ORIGIN, LOCALES)).toEqual({ locale: null, next: null });
    expect(parseRedirectToHint(`${ORIGIN}/xx/auth/callback`, ORIGIN, LOCALES)).toEqual({
      locale: null,
      next: null,
    });
    expect(parseRedirectToHint(null, ORIGIN, LOCALES)).toEqual({ locale: null, next: null });
  });
});

describe("classifyAuthRedirectError", () => {
  it("an expired / used e-mail link is link_expired even though GoTrue says access_denied", () => {
    expect(
      classifyAuthRedirectError({ error: "access_denied", errorCode: "otp_expired" }),
    ).toBe("link_expired");
  });

  it("a plain access_denied is the person cancelling at the provider", () => {
    expect(classifyAuthRedirectError({ error: "access_denied", errorCode: null })).toBe(
      "cancelled",
    );
  });

  it("anything else is a provider error", () => {
    expect(classifyAuthRedirectError({ error: "server_error", errorCode: null })).toBe(
      "provider_error",
    );
    expect(
      classifyAuthRedirectError({ error: "invalid_request", errorCode: "bad_oauth_state" }),
    ).toBe("provider_error");
  });
});

describe("classifyExchangeFailure", () => {
  it("verifier missing on the e-mail flow → confirmed_sign_in (another device opened the link)", () => {
    expect(
      classifyExchangeFailure({ name: "AuthPKCECodeVerifierMissingError" }, true),
    ).toBe("confirmed_sign_in");
    expect(
      classifyExchangeFailure(
        { message: "invalid request: both auth code and code verifier should be non-empty" },
        true,
      ),
    ).toBe("confirmed_sign_in");
  });

  it("the same failure outside the e-mail flow stays a generic exchange failure", () => {
    expect(
      classifyExchangeFailure({ name: "AuthPKCECodeVerifierMissingError" }, false),
    ).toBe("exchange_failed");
  });

  it("a different failure on the e-mail flow is still an exchange failure", () => {
    expect(classifyExchangeFailure({ code: "invalid_grant", message: "expired" }, true)).toBe(
      "exchange_failed",
    );
    expect(classifyExchangeFailure(null, true)).toBe("exchange_failed");
  });
});
