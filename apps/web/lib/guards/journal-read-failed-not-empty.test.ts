import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A FAILED JOURNAL READ IS NOT AN EMPTY JOURNAL (SEP-7, audit 2026-11-03).
 *
 * The journal page set `entries = null` when the list read failed, then
 * rendered `(entries ?? []).length === 0` — the first-run "Start building work
 * records" empty state, "No entries yet" in the CV bridge and "0 entries this
 * month" in the proof loop. A person with a full journal was told they had
 * none. This pins the three branches.
 */
const ROOT = join(__dirname, "..", "..");
const page = readFileSync(join(ROOT, "app/[locale]/dashboard/journal/page.tsx"), "utf8");
const LOCALES = ["en", "lt", "ru", "de", "nl", "pl", "fi"] as const;

describe("journal page: a failed list read reads as unavailable", () => {
  it("the list's first branch is the unavailable notice, before any empty state", () => {
    const unavailable = page.indexOf('data-testid="journal-list-unavailable"');
    expect(unavailable).toBeGreaterThan(-1);
    expect(page).toMatch(/\{entries === null \? \(\s*\/\*[\s\S]*?\*\/\s*<div\s+role="status"/);
    expect(unavailable).toBeLessThan(page.indexOf('data-testid="journal-day-empty"'));
    expect(unavailable).toBeLessThan(page.indexOf('testId="journal-empty-state"'));
  });

  it("the CV bridge says the count is unknown, never 'no entries yet'", () => {
    expect(page).toMatch(/entries === null\s*\?\s*t\("cvBridgeUnavailable"\)/);
  });

  it("the proof loop shows no counts on a failed read", () => {
    expect(page).toMatch(/\{entries !== null && \(\s*<p\s+className="[^"]*"\s+data-testid="journal-proof-loop"/);
  });

  for (const loc of LOCALES) {
    it(`${loc}: the unavailable copy exists`, () => {
      const j = JSON.parse(readFileSync(join(ROOT, `messages/${loc}/journal.json`), "utf8")) as Record<
        string,
        unknown
      >;
      for (const key of ["listUnavailableTitle", "listUnavailable", "cvBridgeUnavailable"]) {
        expect(typeof j[key], `${loc}.${key}`).toBe("string");
      }
    });
  }
});
