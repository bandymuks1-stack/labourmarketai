import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PHONE IS THE QUALITY TEST (owner direction 2026-09-13).
 *
 * The owner's walk found the backend honest and the phone unusable: pages
 * opened as bedsheets, the journal was an endless list of date headings, and
 * every opportunity arrived as a full-height card with a pile of buttons.
 * This guard pins the corrections that make those surfaces compact, so the
 * next change has to retire them deliberately rather than by inertia.
 *
 * It pins COMPOSITION, never data. Every figure on both surfaces still comes
 * from the same readers it always did; nothing here weakens a disclosure,
 * and the two mandatory ones (talent pool, pay-not-stated) are asserted to
 * survive the compaction.
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

describe("MANO DARBAS — the records live on a calendar, not in a list of dates", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");

  it("the calendar is the day navigator, fed by the page's own day groups", () => {
    expect(page).toMatch(/<JournalCalendar/);
    expect(page).toMatch(/grid=\{calendarGrid\}/);
    expect(page).toMatch(/days: entryDayGroups\.map/);
  });

  it("the flat day-chip strip is gone — it could not reach a day with no records", () => {
    expect(page).not.toMatch(/data-testid="journal-day-nav"/);
    expect(page).not.toMatch(/journal-day-nav-\$\{/);
  });

  it("tapping a day shows THAT day — an empty day stays selected and says so", () => {
    expect(page).toMatch(/const dayFilterActive = selectedDate !== null;/);
    expect(page).toMatch(/data-testid="journal-day-empty"/);
  });

  it("a selected day carries its own actions: record, and the one canonical calendar", () => {
    expect(page).toMatch(/data-testid="journal-day-actions"/);
    expect(page).toMatch(/data-testid="journal-day-record"/);
    expect(page).toMatch(/data-testid="journal-day-open-calendar"/);
    expect(page).toMatch(/dashboard\/planning\?view=day&date=\$\{selectedDate\}/);
  });

  it("the diary is bounded with an honest count of the days it is not stacking", () => {
    expect(page).toMatch(/const DIARY_DAY_LIMIT = \d+;/);
    expect(page).toMatch(/data-testid="journal-days-bounded"/);
    expect(page).toMatch(/data-hidden-days=\{hiddenDayCount\}/);
  });

  it("quick recording stays on the page, above the history", () => {
    expect(page).toMatch(/<JournalQuickRecord/);
    expect(page).toMatch(/id="journal-composer" className="order-1"/);
  });

  it("the calendar itself needs no JavaScript — the day lives in the URL", () => {
    const cal = read("components/app/journal/journal-calendar.tsx");
    expect(cal).not.toMatch(/"use client"/);
    expect(cal).not.toMatch(/useState|useEffect|onClick=/);
    expect(cal).toMatch(/data-testid="journal-calendar-day"/);
  });
});

describe("GALIMYBĖS — a compact row first, the detail on selection", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("the list row carries the essence only; the rest is the detail it opens into", () => {
    const row = page.slice(
      page.indexOf('<Card compact variant="interactive"'),
      page.indexOf("<OpportunityDetailsDisclosure"),
    );
    expect(row.length).toBeGreaterThan(200);
    // essence: the work, where it is, the pay if stated, the band, the why
    expect(row).toMatch(/<FitBandChip/);
    expect(row).toMatch(/data-testid="opportunity-company"/);
    expect(row).toMatch(/essence\s*\n?\s*\/>/);
    expect(row).toMatch(/line-clamp-2[^"]*"\s*data-testid="opportunity-why"/);
    // and the detail really is behind the disclosure, not beside it
    expect(page).toMatch(/<OpportunityDetailsDisclosure/);
  });

  it("the two mandatory disclosures survive the compaction", () => {
    // pay that was never stated is said so on the ROW, not inside the detail
    const row = page.slice(
      page.indexOf('<Card compact variant="interactive"'),
      page.indexOf("<OpportunityDetailsDisclosure"),
    );
    expect(row).toMatch(/data-testid="opportunity-pay-not-stated"/);
    // a talent pool must always announce itself at card level
    const chips = read("components/app/opportunity-structured-detail.tsx");
    const essenceBlock = chips.slice(chips.indexOf("const ESSENCE_CHIP_KEYS"));
    expect(essenceBlock).toMatch(/data-testid="opportunity-talent-pool"/);
    expect(essenceBlock).toMatch(/const shown = essence \? chips\.filter/);
    // the talent-pool chip is rendered OUTSIDE the filtered list, so no
    // compaction can drop it
    expect(essenceBlock).toMatch(/\{shown\.map\(\(c\) => \([\s\S]*?talentPool \?/);
  });

  it("actions read in one hierarchy: the forward action first, keep-for-later quiet", () => {
    const actions = page.slice(
      page.indexOf('data-testid="opportunity-actions"'),
      page.indexOf("<OpportunityDetailsDisclosure"),
    );
    expect(actions.length).toBeGreaterThan(200);
    const interest = actions.indexOf("<WorkerInterestButton");
    const secondary = actions.indexOf('data-testid="opportunity-actions-secondary"');
    const save = actions.indexOf("<WorkerSaveOpportunityButton");
    const compare = actions.indexOf("<CompareToggleChip");
    for (const [name, idx] of Object.entries({ interest, secondary, save, compare })) {
      expect(idx, `${name} missing`).toBeGreaterThan(-1);
    }
    expect(interest).toBeLessThan(secondary);
    // save + compare moved INSIDE the quiet cluster, not deleted
    expect(secondary).toBeLessThan(save);
    expect(secondary).toBeLessThan(compare);
  });
});
