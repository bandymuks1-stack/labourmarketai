import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * CIE goal-phrase sanity (rebuild phase 3): the exact sentences the owner
 * directive names must route deterministically — and the today-phrases must
 * NEVER shadow the past-tense work log.
 */
describe("goal phrases route to the work-context readback", () => {
  it("today questions → calendar-view (the context brief)", () => {
    for (const s of [
      "Parodyk ką šiandien turiu padaryti",
      "ką šiandien turiu padaryti?",
      "what do I have today",
      "что у меня сегодня",
      "šiandienos planas",
      "mano planas",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("calendar-view");
    }
  });

  it("past-tense work sentences still route to log-work", () => {
    for (const s of [
      "šiandien dirbau nuo 8 iki 17 objekte",
      "today I worked 8 hours on site",
      "сегодня работал с 8 до 17",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("log-work");
    }
  });

  it("reminders stay reminders (honest blocked answer)", () => {
    expect(classifyIntent("primink rytoj 8 val").intent).toBe("reminder");
  });
});
