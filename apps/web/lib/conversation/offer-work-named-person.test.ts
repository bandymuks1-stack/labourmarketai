import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/** COMPANY loop walk 2026-09-29: "Pasiūlyk Vytui darbą nuo spalio 20." → a job search. */
describe("offering work to a named person", () => {
  it.each([
    ["Pasiūlyk Vytui darbą nuo spalio 20.", "propose-booking"],
    ["Pasiūlyk darbą Jonui", "propose-booking"],
    ["Pasiūlyk man darbą", "find-work"],
    ["Pasiūlyk darbą Švedijoje", "find-work"],
  ])("%s → %s", (s, intent) => {
    expect(classifyIntent(s).intent).toBe(intent);
  }, 20_000);
});
