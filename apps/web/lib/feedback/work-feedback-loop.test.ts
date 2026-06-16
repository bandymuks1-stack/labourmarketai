import { describe, expect, it } from "vitest";
import {
  currentFeedbackStage,
  hasTrustSignal,
  FEEDBACK_LOOP,
} from "./work-feedback-loop";

describe("work feedback loop — trust only from real confirmations", () => {
  it("the loop stages are work → journal → confirmed → evidence → trust", () => {
    expect(FEEDBACK_LOOP).toEqual([
      "work_done",
      "journal_logged",
      "confirmed_by_manager_or_client",
      "evidence",
      "trust_signal",
    ]);
  });

  it("no journal, no confirmations → work_done, no trust", () => {
    const s = { journalEntries: 0, confirmations: 0 };
    expect(currentFeedbackStage(s)).toBe("work_done");
    expect(hasTrustSignal(s)).toBe(false);
  });

  it("journal logged but unconfirmed → journal_logged, still no trust", () => {
    const s = { journalEntries: 5, confirmations: 0 };
    expect(currentFeedbackStage(s)).toBe("journal_logged");
    expect(hasTrustSignal(s)).toBe(false);
  });

  it("a real confirmation → trust_signal", () => {
    const s = { journalEntries: 5, confirmations: 2 };
    expect(currentFeedbackStage(s)).toBe("trust_signal");
    expect(hasTrustSignal(s)).toBe(true);
  });
});
