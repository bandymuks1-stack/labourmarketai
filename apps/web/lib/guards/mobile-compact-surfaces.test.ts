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

  it("the list answers the same window the grid draws — day, period, or recent", () => {
    // browsing ‹ › must not leave the grid on August and the list on September
    expect(page).toMatch(/const diaryScope: "day" \| "period" \| "recent"/);
    expect(page).toMatch(/g\.isoKey >= calendarGrid\.rangeStart && g\.isoKey <= calendarGrid\.rangeEnd/);
    expect(page).toMatch(/t\("dayNav\.periodEmpty"\)/);
    const cal = read("components/app/journal/journal-calendar.tsx");
    // and period navigation drops a selection the new period does not contain
    expect(cal).toMatch(/month: grid\.prevAnchor, date: null/);
    expect(cal).toMatch(/month: grid\.nextAnchor, date: null/);
    // while clearing the day keeps the period the person is looking at
    expect(cal).toMatch(/date: null, month: grid\.anchor/);
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

  it("a date exposes entries, HOURS and confirmation state — measured at 390px", () => {
    const cal = read("components/app/journal/journal-calendar.tsx");
    // hours ON the date (the number; the unit is in the aria-label + summary)
    expect(cal).toMatch(/cell\.totalMinutes > 0 \?/);
    expect(cal).toMatch(/hoursLabel\(cell\.totalMinutes\)/);
    // confirmation as the marker's material AND as words (never colour alone)
    expect(cal).toMatch(/data-confirmation=\{cell\.confirmation\}/);
    expect(cal).toMatch(/t\(`confirmation\.\$\{cell\.confirmation\}`\)/);
    // a short day is never rounded UP into time the journal does not hold
    expect(cal).not.toMatch(/Math\.max\(0\.1/);
    expect(cal).toMatch(/hours === 0 \? `<\$\{hoursFmt\.format\(0\.1\)\}`/);
    // an untimed record is real work, never rendered as "0 h" (SEP-7)
    expect(cal).not.toMatch(/totalMinutes \|\| 0\s*\}/);
    // the page hands over the SAME confirmed derivation it uses elsewhere
    expect(page).toMatch(/deriveReviewResult\(e\.journal_entry_confirmations\) === "approved"/);
  });

  it("every calendar control meets the product's own 44px rule", () => {
    // rendered at 390px and 690px: prev/next were 36px and the pills 26px
    const cal = read("components/app/journal/journal-calendar.tsx");
    expect(cal).toMatch(/inline-flex size-11 shrink-0 items-center justify-center/);
    expect(cal).not.toMatch(/inline-flex size-9 shrink-0/);
    const pills = cal.match(/rounded-full border/g) ?? [];
    expect(pills.length).toBeGreaterThanOrEqual(2);
    expect(cal).toMatch(/inline-flex min-h-11 items-center rounded-full border px-3 text-xs transition-colors/);
    expect(cal).toMatch(/inline-flex min-h-11 items-center rounded-full border border-ink-500/);
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

describe("PASAULIS — the map viewport is withheld; the list and the door remain", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  /*
   * THIS BLOCK USED TO PIN THE EMBEDDED MAP as PASAULIS' base (owner direction
   * 2026-09-13). The owner withdrew that viewport on 2026-09-27 after walking
   * it: it opened on `EUROPE_CENTER = [52.2, 6.0]` — inside the NETHERLANDS —
   * so somebody who had told us they work in Germany was shown NL as their work
   * geography, and the demand layer had nothing honest to draw anyway (all
   * 111 187 `public_vacancies` rows `country = 'SE'`, none with lat/lng).
   *
   * The assertions therefore move from "the map is here and correctly placed"
   * to "the map is NOT here, the list still opens directly, and the capability
   * is still one tap away". The place-link contract is NOT dropped — it moved
   * to the surface that still renders the map, so the rule keeps its teeth.
   */

  it("the list is what the page opens on, right under the header", () => {
    const header = page.indexOf("</header>");
    const results = page.indexOf('id="opportunities-results"');
    expect(header).toBeGreaterThan(-1);
    expect(results).toBeGreaterThan(header);
    // No withheld-map placeholder left standing in its place.
    expect(page).not.toMatch(/data-testid="opportunities-map"/);
    expect(page).not.toMatch(/<WorldDiscovery\b/);
  });

  it("withholding the viewport did not grow a second map here", () => {
    expect(page).not.toMatch(/from "leaflet"|mountLeafletMap/);
    expect(page).not.toMatch(/mapMode="result"/);
  });

  it("the full map stays one tap away — the capability is not lost", () => {
    expect(page).toMatch(/data-testid="opportunities-map-full-link"/);
    expect(page).toMatch(/\/dashboard\/market-map/);
  });

  it("a place still links into a country filter, not a second board", () => {
    // Pinned where the map actually renders now.
    const mapPage = read("app/[locale]/dashboard/market-map/page.tsx");
    expect(mapPage).toMatch(/<WorldDiscovery\b/);
    const world = read("components/app/market-map/world-discovery.tsx");
    expect(world).toMatch(/data-testid="world-place-link"/);
    expect(world).toMatch(/placeLink\.hrefTemplate\.replace\("\{country\}", c\.country\)/);
  });
});

describe("PROFESINIS PROFILIS — the page opens on the person, not on seven decisions", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("the two destinations a worker leaves this page for stay visible", () => {
    const cluster = page.slice(
      page.indexOf('data-testid="profile-destinations"'),
      page.indexOf('data-testid="profile-more-destinations"'),
    );
    expect(cluster.length).toBeGreaterThan(100);
    expect(cluster).toMatch(/data-testid="profile-opportunities-link"/);
    expect(cluster).toMatch(/data-testid="profile-cv-export-link"/);
  });

  it("the other five moved behind ONE disclosure — all still there, all still one tap", () => {
    const more = page.slice(page.indexOf('data-testid="profile-more-destinations"'));
    for (const id of [
      "profile-documents-link",
      "profile-visibility-link",
      "profile-gallery-link",
      "profile-network-link",
      "room-my-spaces-link",
    ]) {
      expect(more, id).toMatch(new RegExp(`data-testid="${id}"`));
    }
  });
});

describe("MANO CV — a document with a way in, and never a dead anchor", () => {
  const page = read("app/[locale]/cv/page.tsx");

  it("the jump strip is the existing primitive and is never printed", () => {
    expect(page).toMatch(/from "@\/components\/app\/page-quick-nav"/);
    expect(page).toMatch(/<PageQuickNav[\s\S]{0,220}className="print:hidden"/);
  });

  it("every anchor is built from the SAME predicate that renders its section", () => {
    const items = page.slice(
      page.indexOf("const cvQuickNavItems = ["),
      page.indexOf("const cvQuickNavItems = [") + 1400,
    );
    for (const [flag, href] of [
      ["visibility.workHistory", "#cv-work-history"],
      ["visibility.practiceHistory", "#cv-practice-history"],
      ["visibility.education", "#cv-education"],
      ["visibility.languages", "#cv-languages"],
      ["visibility.certificates", "#cv-certificates"],
      ["visibility.projects", "#cv-projects"],
      ["visibility.achievements", "#cv-achievements"],
    ] as const) {
      expect(items, href).toContain(flag);
      expect(items, href).toContain(href);
    }
    // the summary anchor covers EITHER of the two blocks that can render it
    expect(items).toMatch(/cv\.professionalSummary \|\| factsSentences\.length > 0/);
  });

  it("every anchor has a real target on the page", () => {
    const hrefs = [
      ...page.slice(page.indexOf("const cvQuickNavItems = [")).matchAll(/href: "#(cv-[a-z-]+)"/g),
    ].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(8);
    for (const id of hrefs) {
      expect(page, id).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it("the CV stays a document — no section was collapsed to make it short", () => {
    // a CV is read top to bottom; the fix was a way IN, not a fold
    const body = page.slice(page.indexOf('data-testid="cv-work-history"'));
    expect(body).not.toMatch(/<details[\s\S]{0,200}data-testid="cv-/);
  });
});

describe("the calendar never claims independence the data cannot support", () => {
  /**
   * `deriveReviewResult` returns "approved" for a SELF-approval too (a worker
   * who manages their own organization), and the journal page's reader selects
   * `confirmation_scope, created_at, confirmer_role` — NOT `confirmer_id` — so
   * `isSelfConfirmation` cannot be evaluated there. The day marker must
   * therefore say a JOURNAL RECORD is confirmed, never that a MANAGER
   * confirmed it: the second would dress self-declared evidence as external
   * confirmation (SEP-3). Found by review on #1729.
   */
  const SERVED = ["lt", "en", "ru", "nl", "de", "pl"] as const;
  const MANAGER = /manager|vadov|руковод|Manager/;

  for (const loc of SERVED) {
    it(`${loc}: no confirmation state attributes the decision to a manager`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        calendar?: { confirmation?: Record<string, string> };
      };
      const conf = j.calendar?.confirmation;
      expect(conf, loc).toBeTruthy();
      for (const [state, text] of Object.entries(conf ?? {})) {
        expect(MANAGER.test(text), `${loc}.${state}: "${text}"`).toBe(false);
      }
      // and the unconfirmed state still names the person's own record
      expect(conf?.none, loc).toMatch(/paties|self|самостоятельн|zelf|selbst|samodzieln/i);
    });
  }

  it("the page records WHY it cannot use the independent derivation", () => {
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(/confirmer_id/);
    expect(page).toMatch(/isSelfConfirmation|independence|SELF-approval|SUBJECT approved/);
  });
});

describe("the CV summary anchor lands on whichever block renders", () => {
  const page = read("app/[locale]/cv/page.tsx");

  it("the facts-only state carries the summary id, and never duplicates it", () => {
    // the quick-nav offers the anchor when EITHER block renders
    expect(page).toMatch(/cv\.professionalSummary \|\| factsSentences\.length > 0/);
    // so the facts section takes the id exactly when the summary block is absent
    expect(page).toMatch(/id=\{!cv\.professionalSummary \? "cv-summary-section" : undefined\}/);
    // one unconditional id on the summary block, one conditional on the facts
    // \s matters: without it this also matches `data-testid="..."`
    const unconditional = page.match(/\sid="cv-summary-section"/g) ?? [];
    expect(unconditional).toHaveLength(1);
  });
});
