import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { emptyGoal } from "@/lib/conversation/conversation-goal";
import { assistantJournalDay, GOAL_ACROSS_PAGES_KEY, keptAssistantJournalDay } from "./assistant-day";

/** One-tap journal (owner P1 2026-11-22): the header opens the day the person named. */
const TODAY = "2026-11-22";
const goal = (said: string[]) => ({ ...emptyGoal("log-work"), said });

describe("the work day the assistant named", () => {
  it("yesterday, said in Lithuanian and in English, opens yesterday", () => {
    expect(assistantJournalDay(goal(["Užpildyk vakarykštį darbo žurnalą"]), TODAY)).toBe("2026-11-21");
    expect(assistantJournalDay(goal(["Fill in yesterday's work journal"]), TODAY)).toBe("2026-11-21");
  });
  it("no day named, today, or another goal → null (the journal's own default)", () => {
    expect(assistantJournalDay(goal(["Užpildyk darbo žurnalą"]), TODAY)).toBeNull();
    expect(assistantJournalDay(goal(["Today I painted the hall, 6 hours"]), TODAY)).toBeNull();
    expect(assistantJournalDay({ ...emptyGoal("find-work"), said: ["vakar"] }, TODAY)).toBeNull();
    expect(assistantJournalDay(null, TODAY)).toBeNull();
  });
  it("the kept goal is read only for the same owner, within 30 minutes, and never throws", () => {
    const raw = (owner: string, at: number) => JSON.stringify({ owner, at, goal: goal(["Užpildyk vakarykštį darbo žurnalą"]) });
    const now = 1_000_000_000;
    expect(keptAssistantJournalDay(raw("u:w", now - 60_000), "u:w", TODAY, now)).toBe("2026-11-21");
    expect(keptAssistantJournalDay(raw("other:w", now), "u:w", TODAY, now)).toBeNull();
    expect(keptAssistantJournalDay(raw("u:w", now - 31 * 60_000), "u:w", TODAY, now)).toBeNull();
    expect(keptAssistantJournalDay("{not json", "u:w", TODAY, now)).toBeNull();
    expect(keptAssistantJournalDay(null, "u:w", TODAY, now)).toBeNull();
  });
});

describe("one key, one reader: the chat and the header share them", () => {
  const web = join(__dirname, "..", "..");
  const chat = readFileSync(join(web, "components/app/conversation/chat/conversation-chat.tsx"), "utf8");
  const header = readFileSync(join(web, "components/app/conversation/chat/conversation-header.tsx"), "utf8");
  it("the chat keeps its goal under the shared key and hands the header its live day", () => {
    expect(GOAL_ACROSS_PAGES_KEY).toBe("lm.chat.goalAcrossPages");
    expect(chat).toContain('from "@/lib/journal/assistant-day"');
    expect(chat).not.toMatch(/const GOAL_ACROSS_PAGES_KEY = /);
    expect(chat).toMatch(/journalDay=\{\(\) => assistantJournalDay\(goalRef\.current, todayIso\(\)\)\}/);
  });
  it("the header's phone shortcut and the core-nav journal both take the day-aware tap", () => {
    expect(header).toContain('data-testid="header-journal-shortcut"');
    expect(header).toMatch(/onClick=\{item === journalItem \? openJournal : undefined\}/);
    expect(header).toMatch(/router\.push\(journalDayHref\(day, false\)/);
    // An organization workspace keeps its own doors; the area sheet still lists the journal.
    expect(header).toMatch(/actingRole !== "company" && actingRole !== "agency"/);
  });
});
