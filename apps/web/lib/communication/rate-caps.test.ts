import { describe, expect, it } from "vitest";
import {
  CONVERSATION_RATE_CAP,
  MESSAGE_RATE_CAP,
  evaluateRateCap,
  rateCapWindowStartIso,
} from "./rate-caps";

describe("§8.2 messaging rate caps — pure decision model", () => {
  it("allows writes strictly below the cap", () => {
    expect(evaluateRateCap(0, MESSAGE_RATE_CAP)).toBe("allowed");
    expect(evaluateRateCap(MESSAGE_RATE_CAP.max - 1, MESSAGE_RATE_CAP)).toBe("allowed");
    expect(evaluateRateCap(0, CONVERSATION_RATE_CAP)).toBe("allowed");
    expect(evaluateRateCap(CONVERSATION_RATE_CAP.max - 1, CONVERSATION_RATE_CAP)).toBe(
      "allowed",
    );
  });

  it("rate-limits at and above the cap", () => {
    expect(evaluateRateCap(MESSAGE_RATE_CAP.max, MESSAGE_RATE_CAP)).toBe("rate_limited");
    expect(evaluateRateCap(MESSAGE_RATE_CAP.max + 500, MESSAGE_RATE_CAP)).toBe(
      "rate_limited",
    );
    expect(evaluateRateCap(CONVERSATION_RATE_CAP.max, CONVERSATION_RATE_CAP)).toBe(
      "rate_limited",
    );
  });

  it("is default-closed: an unreadable count is unavailable, never allowed", () => {
    expect(evaluateRateCap(null, MESSAGE_RATE_CAP)).toBe("unavailable");
    expect(evaluateRateCap(undefined, MESSAGE_RATE_CAP)).toBe("unavailable");
    expect(evaluateRateCap(Number.NaN, MESSAGE_RATE_CAP)).toBe("unavailable");
    expect(evaluateRateCap(Number.POSITIVE_INFINITY, MESSAGE_RATE_CAP)).toBe("unavailable");
    expect(evaluateRateCap(-1, MESSAGE_RATE_CAP)).toBe("unavailable");
  });

  it("caps are real, bounded, and spam-hostile but chat-friendly", () => {
    // Messages: a real conversation fits (2/min sustained); a flood does not.
    expect(MESSAGE_RATE_CAP.windowMinutes).toBe(60);
    expect(MESSAGE_RATE_CAP.max).toBe(120);
    // Conversations: a handful of new threads per day, no bulk cold outreach.
    expect(CONVERSATION_RATE_CAP.windowMinutes).toBe(24 * 60);
    expect(CONVERSATION_RATE_CAP.max).toBe(20);
  });

  it("window start is exactly windowMinutes before now", () => {
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    expect(rateCapWindowStartIso(MESSAGE_RATE_CAP, now)).toBe(
      new Date(now - 60 * 60_000).toISOString(),
    );
    expect(rateCapWindowStartIso(CONVERSATION_RATE_CAP, now)).toBe(
      new Date(now - 24 * 60 * 60_000).toISOString(),
    );
  });
});
