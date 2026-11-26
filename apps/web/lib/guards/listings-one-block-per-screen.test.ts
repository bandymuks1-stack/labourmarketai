import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Decision 0034 — one functional block per screen, each with its own address.
 * The market page is two blocks: browse (`/dashboard/listings`) and my
 * listings (`?tab=mine`). Nothing is removed: the ONE section component still
 * holds both, and the page picks which one it shows.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const PAGE = read("app/[locale]/dashboard/listings/page.tsx");
const SECTION = read("components/app/marketplace-listings-section.tsx");

describe("listings — one block per screen", () => {
  it("the page offers both blocks as addressed tabs", () => {
    expect(PAGE).toContain('data-testid="listings-tabs"');
    expect(PAGE).toContain('["browse", t("browseTitle")]');
    expect(PAGE).toContain('["mine", t("myTitle")]');
    expect(PAGE).toContain("`/dashboard/listings?tab=${id}`");
    expect(PAGE).toContain('aria-current={tab === id ? "page" : undefined}');
  });

  it("one section mount picks its block — no second implementation", () => {
    expect(PAGE.split("<MarketplaceListingsSection").length - 1).toBe(1);
    expect(PAGE).toContain("view={tab}");
    expect(SECTION).toContain('view?: "all" | "browse" | "mine"');
    expect(SECTION).toContain('{view !== "mine" && (');
    expect(SECTION).toContain('{view !== "browse" && (');
  });

  it("a focused listing (`?focus=<id>`, one of MY rows) opens on my listings", () => {
    expect(PAGE).toMatch(/focus !== null && myRows\.some\(\(r\) => r\.id === focus\)/);
    expect(SECTION).toContain("id={`listing-${row.id}`}");
  });

  it("no page-level intro text (decision 0032); payment notes stay on the form", () => {
    expect(PAGE).not.toContain('t("pageIntro")');
    expect(SECTION).toContain('t("priceHint")');
  });

  it("the services cross-link stays", () => {
    expect(PAGE).toContain('data-testid="listings-to-services-link"');
  });
});
