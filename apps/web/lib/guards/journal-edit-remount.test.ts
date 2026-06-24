import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Owner-smoke regression (fix/owner-smoke-map-skills-journal-edit-v1, bug 3).
 *
 * Editing a journal entry must ALWAYS show the entry's saved original text.
 * The composer derives its textarea from `editingEntry` with useState (initial
 * value only) and the Edit control is a client-side <Link> (no full reload).
 * Without a remount key, React keeps the same composer instance and the stale
 * create-mode text — the entry's text never loads ("blank editor"). The page
 * must therefore key the composer on the editing id so each edit (and cancel)
 * remounts with the correct text.
 */
const PAGE = join(
  __dirname,
  "..",
  "..",
  "app",
  "[locale]",
  "dashboard",
  "journal",
  "page.tsx",
);
const src = readFileSync(PAGE, "utf8");

describe("journal composer remounts on edit-target change", () => {
  it("passes a remount key tied to the editing id", () => {
    // The key must reference editingId so create→edit, edit→other, and
    // edit→cancel all force a fresh mount (correct text every time).
    expect(src).toMatch(/key=\{editingId\s*\?\?\s*["']new["']\}/);
  });

  it("still prefills the composer from the entry's original_text", () => {
    expect(src).toMatch(/originalText:/);
    expect(src).toMatch(/original_text/);
  });
});
