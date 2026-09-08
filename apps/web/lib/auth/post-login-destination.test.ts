import { describe, expect, it } from "vitest";

import {
  needsOnboardingCheck,
  onboardingPathWithReturn,
  postLoginDestination,
} from "./post-login-destination";

const NEXT = "/lt/dashboard?say=esu+suvirintojas%2C+ie%C5%A1kau+darbo+Norvegijoje";

describe("password login destination (pure)", () => {
  it("a login without a destination never spends a profile read", () => {
    expect(needsOnboardingCheck(null)).toBe(false);
    expect(needsOnboardingCheck("")).toBe(false);
    expect(needsOnboardingCheck("/dashboard?say=x")).toBe(true);
    expect(
      postLoginDestination({ locale: "lt", nextParam: null, nextPath: "/lt/dashboard" }),
    ).toBe("/lt/dashboard");
  });

  it("a not-yet-onboarded person keeps the landing sentence through onboarding", () => {
    expect(
      postLoginDestination({ locale: "lt", nextParam: NEXT, nextPath: NEXT, onboardedAt: null }),
    ).toBe(onboardingPathWithReturn("lt", NEXT));
    expect(onboardingPathWithReturn("lt", NEXT)).toBe(
      "/lt/onboarding?next=" + encodeURIComponent(NEXT),
    );
  });

  it("an onboarded person goes straight to the destination — no onboarding hop", () => {
    expect(
      postLoginDestination({
        locale: "lt",
        nextParam: NEXT,
        nextPath: NEXT,
        onboardedAt: "2026-09-06T06:49:52.501Z",
      }),
    ).toBe(NEXT);
  });

  it("a failed profile read degrades to today's behaviour, never to an error", () => {
    expect(
      postLoginDestination({ locale: "lt", nextParam: NEXT, nextPath: NEXT }),
    ).toBe(NEXT);
  });
});
