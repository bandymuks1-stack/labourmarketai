import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";

/** COMPANY loop walk 2026-09-29: the panel counted the task; the chat could not list it. */
describe("the chat lists open tasks", () => {
  it.each([
    ["Kokios užduotys projekte Testinis projektas?", "open-tasks"],
    ["Kokios užduotys dar atviros?", "open-tasks"],
    ["Pridėk užduotį projektui: sumontuoti pastolius", "add-task"],
    ["Užduotis sumontuoti pastolius atlikta", "task-status"],
  ])("%s → %s", (s, intent) => {
    expect(classifyIntent(s).intent).toBe(intent);
  }, 20_000);

  it("reads the same open-task read task-status uses, narrowed by a named project", () => {
    const chat = readFileSync(join(__dirname, "..", "..", "components/app/conversation/chat/conversation-chat.tsx"), "utf8");
    const h = chat.slice(chat.indexOf("openTasks: () => {"), chat.indexOf("savedOpportunities: () => {"));
    expect(h).toMatch(/loadOpenTasksForChat\(\)/);
    expect(h).toMatch(/projectNamedInSentence\(text, projectsSeen\)/);
  });
});
