import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: a journal entry CARD must not show the worker's whole profile-skill set
 * as chips (owner smoke, PR #490 — a construction worker saw construction chips
 * on a dog-walking entry). By default the card shows only the skills LINKED to
 * that entry; the full profile-skill picker is opt-in behind a disclosure.
 */
const ROOT = join(__dirname, "..", "..");
const src = readFileSync(
  join(ROOT, "components", "app", "journal-entry-skill-links.tsx"),
  "utf8",
);

describe("entry card shows only entry-linked skills by default", () => {
  it("does NOT map ALL availableSkills unconditionally", () => {
    // The old code did `availableSkills.map(...)` directly. It must now gate on
    // the picker / selected set.
    expect(src).not.toMatch(/\{availableSkills\.map\(/);
  });
  it("default render is filtered to the selected (linked) skills", () => {
    expect(src).toMatch(/availableSkills\.filter\(\(s\)\s*=>\s*selected\.has\(s\.id\)\)/);
  });
  it("the full profile-skill picker is behind a disclosure toggle", () => {
    // The catalogue renders in its OWN gated section (never mixed into the
    // detected-skill chip list), filtered to skills not yet linked.
    expect(src).toMatch(/\{picker && \(/);
    expect(src).toMatch(/availableSkills\s*\n?\s*\.filter\(\(s\)\s*=>\s*!selected\.has\(s\.id\)\)/);
    expect(src).toMatch(/data-testid={`entry-skill-picker-toggle-/);
  });
  it("the picker section explains these are the worker's own profile skills", () => {
    expect(src).toMatch(/t\("pickerHint"\)/);
  });
});
