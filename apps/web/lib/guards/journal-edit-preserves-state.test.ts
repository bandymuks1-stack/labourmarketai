import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Owner-smoke follow-up (PR #490): editing a journal entry must preload — and
 * therefore preserve on save — the entry's date / hours / quantity / direction /
 * skills, not just its text. This guard pins the composer + page wiring (the
 * pure reconstruction itself is covered by `lib/journal/edit-entry.test.ts`).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const composer = read("components/app/journal-entry-composer.tsx");
const page = read("app/[locale]/dashboard/journal/page.tsx");

describe("composer preloads structured state from editingEntry", () => {
  it("preloads work date from the entry (not reset to today)", () => {
    expect(composer).toMatch(/editingEntry\?\.workDate\s*\?\?\s*today/);
  });
  it("preloads time + quantity as confirmed so they re-save", () => {
    expect(composer).toMatch(/editingEntry\?\.time\s*\?\s*"confirmed"/);
    expect(composer).toMatch(/editingEntry\?\.quantity\s*\?\s*"confirmed"/);
    expect(composer).toMatch(/editingEntry\?\.time\s*\?\s*String\(editingEntry\.time\.value\)/);
  });
  it("preloads direction / site / institution / topic", () => {
    expect(composer).toMatch(/editingEntry\?\.workDirectionSlug\s*\?\?\s*""/);
    expect(composer).toMatch(/editingEntry\?\.siteName\s*\?\?\s*""/);
    expect(composer).toMatch(/editingEntry\?\.institutionName\s*\?\?\s*""/);
    expect(composer).toMatch(/editingEntry\?\.topic\s*\?\?\s*""/);
  });
  it("preloads linked skills as confirmed chips", () => {
    expect(composer).toMatch(/editingEntry\?\.skillSlugs/);
    expect(composer).toMatch(/editSkillSuggestions\.map\(\(s\)\s*=>\s*\[s\.slug,\s*"confirmed"\]\)/);
  });
  it("always submits the work date (so it is never dropped)", () => {
    expect(composer).toMatch(/fd\.set\("work_date",\s*workDate\)/);
  });
  it("shows the carried-over details so preservation is visible", () => {
    expect(composer).toMatch(/data-testid="journal-edit-preserved"/);
    expect(composer).toMatch(/t\("editPreservedTitle"\)/);
  });
});

describe("page reconstructs the full editing entry", () => {
  it("builds editingEntry via the pure buildEditingEntry helper", () => {
    expect(page).toMatch(/buildEditingEntry\(\{/);
    expect(page).toMatch(/metrics:\s*editingRow\.journal_entry_metrics/);
    expect(page).toMatch(/linkedSkillSlugs:/);
  });
  it("only allows editing unconfirmed entries", () => {
    expect(page).toMatch(/journal_entry_confirmations\s*\?\?\s*\[\]\)\.length\s*===\s*0/);
  });
});
