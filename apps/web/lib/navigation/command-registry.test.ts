import { describe, expect, it } from "vitest";

import { matchCommands } from "@/lib/navigation/command-registry";

describe("quick search finds the hours page", () => {
  it.each([
    ["lt", "valandos"],
    ["lt", "darbo valandos"],
    ["lt", "tabelis"],
    ["en", "timesheet"],
    ["ru", "табель"],
  ] as const)("%s %s → /dashboard/hours", (locale, q) => {
    const hits = matchCommands(q, locale, new Set(["public"]));
    expect(hits[0]?.route).toBe("/dashboard/hours");
  });
});
