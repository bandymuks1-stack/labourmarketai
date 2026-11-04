import { expect, type Page } from "./prod-walk";

/**
 * READ-ONLY production proof of the ONE action tile (#2828, owner A-09
 * ruling 2026-11-03), shared by the walks that already sign in to its pages.
 *
 * On the page, inside `scopeTestId` when given (the related-door grids) or the
 * page's <main> otherwise, at 1280 and at 390:
 *   - every tile is a real link with a destination;
 *   - exactly `primaries` gold primaries (1 where the screen has a primary
 *     action, 0 on a related-door grid);
 *   - no ROUTE appears twice. Same-page `#anchors` are logged, not compared:
 *     two tiles may legitimately open the same section of the page.
 * It opens pages and reads; it writes nothing.
 */
export type OpenSession = (mobile: boolean) => Promise<{ page: Page; close: () => Promise<void> }>;

export async function proveActionTiles(
  open: OpenSession,
  path: string,
  { scopeTestId, primaries, prepare }: { scopeTestId?: string; primaries: number; prepare?: (page: Page) => Promise<void> },
): Promise<void> {
  for (const mobile of [false, true]) {
    const { page, close } = await open(mobile);
    try {
      await prepare?.(page);
      await page.goto(path);
      const main = page.getByRole("main");
      const scope = scopeTestId ? main.getByTestId(scopeTestId).first() : main;
      const tiles = scope.locator(".lm-card3d");
      await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
      const info = await tiles.evaluateAll((els) =>
        els.map((e) => ({
          tag: e.tagName,
          href: e.getAttribute("href") ?? "",
          primary: e.className.includes("lm-card3d--primary"),
        })),
      );
      console.info(
        `[tiles] ${path} ${mobile ? "390" : "1280"}: ${info.map((t) => `${t.href}${t.primary ? "*" : ""}`).join(" ")}`,
      );
      expect(info.every((t) => t.tag === "A" && t.href.length > 0), "every tile is a link with a destination").toBe(true);
      expect(info.filter((t) => t.primary).length, "gold primaries").toBe(primaries);
      const routes = info.map((t) => t.href).filter((h) => !h.startsWith("#"));
      expect(new Set(routes).size, `duplicate destinations: ${routes.join(" ")}`).toBe(routes.length);
    } finally {
      await close();
    }
  }
}
