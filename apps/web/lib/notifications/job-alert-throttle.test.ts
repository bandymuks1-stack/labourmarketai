import { describe, expect, it } from "vitest";

import {
  JOB_ALERT_READ_TIME_TTL_MS,
  claimJobAlertEvaluation,
  forgetJobAlertEvaluation,
} from "./job-alert-throttle";

describe("read-time job-alert throttle", () => {
  it("evaluates a person once per window", () => {
    const t = 1_000_000_000_000;
    expect(claimJobAlertEvaluation("p-window", t)).toBe(true);
    expect(claimJobAlertEvaluation("p-window", t + 60_000)).toBe(false);
    expect(claimJobAlertEvaluation("p-window", t + JOB_ALERT_READ_TIME_TTL_MS)).toBe(true);
  });

  it("a work-card save makes the next visit evaluate at once", () => {
    const t = 2_000_000_000_000;
    // First render after onboarding: no country stated yet, window spent.
    expect(claimJobAlertEvaluation("p-card", t)).toBe(true);
    forgetJobAlertEvaluation("p-card");
    expect(claimJobAlertEvaluation("p-card", t + 60_000)).toBe(true);
  });

  it("forgetting one person leaves another's window alone", () => {
    const t = 3_000_000_000_000;
    claimJobAlertEvaluation("p-a", t);
    claimJobAlertEvaluation("p-b", t);
    forgetJobAlertEvaluation("p-a");
    expect(claimJobAlertEvaluation("p-b", t + 1)).toBe(false);
  });
});
