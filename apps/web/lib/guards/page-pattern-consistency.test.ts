import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE PAGE PATTERN (owner order 2026-10-25, phase 3 of the one navigation
 * system): every signed-in area shares the header, the page title and the
 * back link — and no navigation strip scrolls sideways.
 *
 * Measured before this change on a local production build at 390px: the
 * organization doors on /dashboard/projects, /company and /company/people
 * scrolled 966px of doors inside a 366px strip, and the profile card modes on
 * /dashboard/journal 518px inside 290px. Back links came in three looks (muted
 * text-xs, blue underlined text-xs, mono uppercase) with a typed "←".
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const NAV_STRIPS = [
  "components/app/historical/historical-workspace.tsx",
  "components/app/player-card/player-card-modes.tsx",
  "components/app/conversation/chat/my-space-row.tsx",
  // Carousel spec N11 (finding M3): the marketplace's group tabs, domain
  // chips and actor filter, and scouting's filter chips, wrap.
  "components/app/marketplace-listings-section.tsx",
  "app/[locale]/dashboard/company/scouting/page.tsx",
];

describe("navigation strips wrap instead of scrolling sideways", () => {
  for (const rel of NAV_STRIPS) {
    it(`${rel} has no horizontal scroll strip`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/overflow-x-(auto|scroll)/);
      expect(src).toMatch(/flex-wrap/);
    });
  }
});

/**
 * THE ORGANISATION DOORS ARE ONE ROW ON A PHONE (coordinator decision of
 * 2026-11-22 on the owner's orders of 2026-11-21/22: horizontal card rows with
 * the next card peeking on phones). Wrapped, 8–9 doors took three or four rows
 * (150–200 px) above every organisation page. This replaces, for this strip
 * only, the 2026-10-25 rule above; from `sm` the doors still wrap.
 */
describe("organisation doors: one sideways row on a phone, wrapped from sm", () => {
  const src = read("components/app/organization/organization-doors.tsx");
  it("scrolls sideways below sm and wraps from sm (no snap: the one rail is CardRail)", () => {
    expect(src).toMatch(/max-sm:overflow-x-auto/);
    expect(src).toMatch(/max-sm:flex-nowrap/);
    expect(src).not.toMatch(/snap-x/);
    expect(src).toMatch(/sm:flex-wrap/);
  });
  it("keeps 44 px door targets and brings the current door into view", () => {
    expect(src).toMatch(/min-h-11 shrink-0/);
    expect(src).toMatch(/aria-current="page"/);
  });
});

/** Pages whose "up a level" link was converted to the shared primitive. */
const BACK_PAGES = [
  "app/[locale]/dashboard/admin/company-need-intakes/page.tsx",
  "app/[locale]/dashboard/admin/company-verification/page.tsx",
  "app/[locale]/dashboard/admin/league/page.tsx",
  "app/[locale]/dashboard/admin/market/page.tsx",
  "app/[locale]/dashboard/admin/matching/page.tsx",
  "app/[locale]/dashboard/admin/pilots/page.tsx",
  "app/[locale]/dashboard/admin/pilots/[id]/page.tsx",
  "app/[locale]/dashboard/admin/pipeline/page.tsx",
  "app/[locale]/dashboard/admin/users/[id]/page.tsx",
  "app/[locale]/dashboard/buyer/page.tsx",
  "app/[locale]/dashboard/candidates/page.tsx",
  "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
  "app/[locale]/dashboard/company/page.tsx",
  "app/[locale]/dashboard/company/projects/new/page.tsx",
  "app/[locale]/dashboard/network/page.tsx",
  "app/[locale]/dashboard/privacy/page.tsx",
  "app/[locale]/dashboard/projects/page.tsx",
  "app/[locale]/dashboard/reports/evidence/page.tsx",
  "app/[locale]/dashboard/start/buyer/page.tsx",
  "app/[locale]/dashboard/start/company/page.tsx",
  "app/[locale]/dashboard/work-in-numbers/page.tsx",
  "components/app/market-map-shell.tsx",
];

describe("one back pattern above the page title", () => {
  it("the primitive names its destination with an icon and keeps the 44px floor", () => {
    const src = read("components/app/premium/page-back.tsx");
    expect(src).toMatch(/<ArrowLeft/);
    expect(src).toMatch(/min-h-11/);
    expect(src).toMatch(/motion-reduce:transition-none/);
  });

  for (const rel of BACK_PAGES) {
    it(`${rel} uses <PageBack>, not a hand-rolled "←" link`, () => {
      const src = read(rel);
      expect(src).toMatch(/<PageBack href=/);
      // A "back to <level>" link must not be hand-rolled again. (In-flow step
      // controls such as a pager's "previous" keep their own look.)
      expect(src).not.toMatch(/>\s*←\s*\{t[A-Za-z]*\("[A-Za-z.]*[bB]ack[A-Za-z.]*"\)\}\s*<\/Link>/);
    });
  }
});

describe("one page title", () => {
  const PAGES = [
    "app/[locale]/dashboard/company/people/[personId]/page.tsx",
    "app/[locale]/dashboard/gallery/page.tsx",
    "app/[locale]/dashboard/talent/page.tsx",
    "app/[locale]/dashboard/market-map/page.tsx",
    "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
  ];
  for (const rel of PAGES) {
    it(`${rel} renders its h1 through <PageTitle>`, () => {
      const src = read(rel);
      expect(src).toMatch(/<PageTitle\b/);
      expect(src).not.toMatch(/<h1\b/);
    });
  }
});

describe("the retired nav components stay retired", () => {
  it("no second tab row, phone bar or role switcher exists", () => {
    for (const rel of [
      "components/app/dashboard-tabs.tsx",
      "components/app/bottom-nav.tsx",
      "components/app/role-switcher.tsx",
      "lib/hooks/use-popover-dismiss.ts",
    ]) {
      expect(existsSync(join(APP, rel)), rel).toBe(false);
    }
  });
});
