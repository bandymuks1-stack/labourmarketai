import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE MARKETPLACE IS ONE SCREEN, THEN A FOLD (decision 0034, owner P0
 * 2026-11-24, marketplace walk). The browse list rendered every active
 * listing as a tall card, 11,098 px on a 390 px phone. It now shows the first
 * rows and folds the rest behind "Show all (n)" with the shared FoldedRows;
 * a row a link focuses (`?focus=`) is never folded away.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("the marketplace browse list folds", () => {
  const src = read("components/app/marketplace-listings-section.tsx");

  it("renders the rows through FoldedRows with the shared show-all label", () => {
    expect(src).toMatch(/<FoldedRows\s+rows=\{shownRows\}\s+testId="market-browse-more"/);
    expect(src).toContain('tDisclosure("showAll", { count })');
    expect(src).not.toMatch(/\{shownRows\.map\(/);
  });

  it("never folds away the row a link focuses", () => {
    expect(src).toMatch(/focusId && shownRows\.findIndex\(\(r\) => r\.id === focusId\) >= FOLDED_ROWS_VISIBLE\s*\?\s*undefined/);
  });

  it("the production walks open the fold before they look for their row", () => {
    for (const rel of ["tests/e2e/prod-marketplace.spec.ts", "tests/e2e/prod-marketplace-goods-services.spec.ts"]) {
      expect(read(rel)).toMatch(/getByTestId\("market-browse-more"\)\.locator\("summary"\)\.click/);
    }
  });
});
