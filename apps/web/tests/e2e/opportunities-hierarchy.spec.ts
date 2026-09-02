import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * OPPORTUNITIES — the page leads with opportunities.
 *
 * Before this, a worker who opened "Galimybės" met, in order: a title, an
 * intro paragraph restating the title, a feature note explaining the feature,
 * a link to a different surface, their own profile-completeness scorecard, an
 * AI market explanation, a weekly summary, and a market-statistics grid —
 * eight blocks, and only then the opportunities. On a profile with no imported
 * ads three of those blocks were cards of zeroes.
 *
 * This spec pins the ORDER, not merely the presence, because presence is what
 * the page always had. `getBoundingClientRect().top` is the assertion: the
 * board must come before every block that now sits below it, at every width.
 *
 * Nothing was deleted from the page except two pieces of copy that explained
 * the page to the reader of the page. Every other block moved into a
 * disclosure on the SAME surface — asserted here by opening them.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION,
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first (needs the local stack).`,
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

const ROUTE = "/lt/dashboard/opportunities";

/**
 * `nonce` guarantees a FRESH document rather than a repeat visit to a URL this
 * browser has seen. Chrome restores `<details>` open state as part of session
 * history, so once any earlier navigation had opened a disclosure, every later
 * `goto` of the same URL re-opened it — and "is this collapsed by default?"
 * silently became "did the last visit leave it open?". Restoring a reader's own
 * choice is correct product behaviour; it is just not what these assertions are
 * about. Unknown query params are ignored by `parseDiscoveryParams`.
 */
async function open(page: Page, width: number, height: number, nonce = "") {
  await page.setViewportSize({ width, height });
  await page.goto(nonce ? `${ROUTE}?_=${nonce}` : ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("h1").first().waitFor();
}

/** Document-space top of the first match, or null when absent. */
async function topOf(page: Page, selector: string): Promise<number | null> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  return el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
}

test.describe("opportunities lead the opportunities page", () => {
  test("the board precedes every secondary block, at every width", async ({ page }) => {
    for (const [w, h] of [
      [1920, 1080],
      [1440, 900],
      [1280, 800],
      [768, 1024],
      [375, 812],
    ] as const) {
      await open(page, w, h, `w${w}`);
      const label = `@${w}`;

      // The board renders as cards, or as one of two honest empty states.
      // Whichever it is, it is the FIRST thing under the title.
      const boardTop =
        (await topOf(page, '[data-testid="opportunities-list"]')) ??
        (await topOf(page, '[data-testid="opportunities-empty"]')) ??
        (await topOf(page, '[data-testid="opportunities-pending"]'));
      expect(boardTop, `${label}: the board must exist in some form`).not.toBeNull();

      // Everything that used to sit ABOVE the board now sits below it.
      for (const below of [
        '[data-testid="opportunities-market-situation"]',
        '[data-testid="opportunities-readiness-disclosure"]',
        '[data-testid="opportunities-how-matching"]',
      ]) {
        const t = await topOf(page, below);
        expect(t, `${label}: ${below} must be on the page`).not.toBeNull();
        expect(
          t!,
          `${label}: ${below} is still above the board (${Math.round(t!)} < ${Math.round(boardTop!)})`,
        ).toBeGreaterThan(boardTop!);
      }

      // The two blocks of copy that explained the page ON the page are gone
      // from the default view. The feature note still EXISTS (a guard pins it,
      // and the explanation is a real thing a reader may want) — it lives
      // inside the how-matching disclosure now, so it must not be visible
      // while that disclosure is shut.
      await expect(
        page.locator('[data-testid="feature-note-opportunities"]'),
        `${label}: the feature note must not be permanently visible`,
      ).toBeHidden();
      await expect(
        page.locator('[data-testid="opportunities-trust-note"]'),
        `${label}: the trust note must not be permanently visible`,
      ).toBeHidden();

      await page.screenshot({
        path: `.playwright-proofs/opportunities/${w}x${h}.png`,
        fullPage: false,
      });
    }
  });

  test("the first viewport carries the opportunities, not the diagnostics", async ({
    page,
  }) => {
    // 1280x800 is the laptop width the owner named; the fold is what matters.
    await open(page, 1280, 800, "fold");
    const FOLD = 800;

    const boardTop =
      (await topOf(page, '[data-testid="opportunities-list"]')) ??
      (await topOf(page, '[data-testid="opportunities-empty"]')) ??
      (await topOf(page, '[data-testid="opportunities-pending"]'));
    expect(
      boardTop!,
      `the board starts below the fold (${Math.round(boardTop!)} >= ${FOLD})`,
    ).toBeLessThan(FOLD);

    // And the diagnostics do NOT.
    for (const sel of [
      '[data-testid="opportunities-market-situation"]',
      '[data-testid="opportunities-readiness-disclosure"]',
    ]) {
      const t = await topOf(page, sel);
      expect(t!, `${sel} still competes for the first viewport`).toBeGreaterThan(
        boardTop!,
      );
    }
  });

  test("nothing was removed — every moved block is still reachable, on this page", async ({
    page,
  }) => {
    await open(page, 1280, 800);

    // Market situation: the salary/benchmark cards, the AI market reading, the
    // weekly summary and the market-map link all still exist, one click away.
    const market = page.locator('[data-testid="opportunities-market-situation"]');
    await market.locator("summary").click();
    await expect(
      market.locator('[data-testid="opportunities-market-map-link"]'),
    ).toBeVisible();

    // Readiness: the same real own-data scorecard, with the same chips.
    const readiness = page.locator(
      '[data-testid="opportunities-readiness-disclosure"]',
    );
    await readiness.locator("summary").click();
    const card = page.locator('[data-testid="opportunities-readiness"]');
    await expect(card).toBeVisible();
    await expect(card.locator("li")).toHaveCount(5);

    // The readiness title is printed ONCE, not twice: it is the disclosure's
    // summary, so the card's own duplicate <h2> was removed.
    const summaryText = (await readiness.locator("summary").innerText()).trim();
    await expect(
      card.getByRole("heading", { name: summaryText }),
      "the readiness title must not be printed twice",
    ).toHaveCount(0);

    // The explanations live in how-matching.
    const how = page.locator('[data-testid="opportunities-how-matching"]');
    await how.locator("summary").click();
    await expect(
      page.locator('[data-testid="feature-note-opportunities"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="opportunities-trust-note"]'),
    ).toBeVisible();
  });
});
