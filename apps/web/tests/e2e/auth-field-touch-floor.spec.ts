import { test, expect, type Page } from "@playwright/test";

/**
 * AUTH FIELDS MEET THE 44px FLOOR AT EVERY WIDTH THE PRODUCT SUPPORTS.
 *
 * Production measurement (2026-08-08) found the email and password inputs at
 * 42px — two pixels under the floor the rest of the product keeps, on the first
 * screen a new user touches and the one they return to when something has gone
 * wrong. Four auth forms each carried their own copy of the same class string,
 * so the defect existed four times.
 *
 * WHY MEASURED AND NOT READ FROM SOURCE. A class can be present and still lose
 * to whatever wins the cascade. The unit guard pins the shared string; this
 * pins what the browser actually lays out.
 */
const WIDTHS = [320, 360, 375, 390, 412, 768, 1440] as const;

/** Auth surfaces reachable without a session. */
const ROUTES = [
  "/lt/auth/login",
  "/lt/auth/signup",
  "/lt/auth/forgot-password",
] as const;

async function measure(page: Page): Promise<{
  short: string[];
  overflow: number;
}> {
  return page.evaluate(() => {
    const short: string[] = [];
    const fields = document.querySelectorAll<HTMLElement>(
      'input[type="email"], input[type="password"], input[type="text"], button[type="submit"]',
    );
    for (const el of fields) {
      const r = el.getBoundingClientRect();
      // Skip anything not laid out (hidden panels, confirm-email states).
      if (r.height === 0 && r.width === 0) continue;
      if (r.height < 44) {
        const kind =
          el.tagName === "INPUT"
            ? `input[${(el as HTMLInputElement).type}]`
            : "submit";
        short.push(`${kind}:${Math.round(r.height)}`);
      }
    }
    return {
      short,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
}

test.describe("auth fields — 44px touch floor", () => {
  for (const route of ROUTES) {
    test(`${route} holds the floor at every width`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(route);
        // The Google control is the anchor that proves the form rendered.
        await expect(page.locator("form").first()).toBeVisible({
          timeout: 30_000,
        });

        const { short, overflow } = await measure(page);
        expect(short, `${route} @ ${width}px: controls under 44px`).toEqual([]);
        expect(
          overflow,
          `${route} @ ${width}px: horizontal overflow`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }

  test("the login form is still usable — fields accept input and nothing overlaps", async ({
    page,
  }) => {
    // A touch-target change must not cost the form its actual job.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/auth/login");

    const email = page.locator('input[type="email"]');
    const pw = page.locator('input[type="password"]');
    await email.fill("someone@example.com");
    await pw.fill("not-a-real-password");
    await expect(email).toHaveValue("someone@example.com");
    await expect(pw).toHaveValue("not-a-real-password");

    // Each field owns its own centre point — no control sits on top of it.
    const owns = await page.evaluate(() => {
      const bad: string[] = [];
      for (const sel of ['input[type="email"]', 'input[type="password"]']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        if (!(el === top || el.contains(top))) bad.push(sel);
      }
      return bad;
    });
    expect(owns, "an auth field is covered by another control").toEqual([]);

    // The Google control remains present and tappable beside them.
    const google = page.getByTestId("google-signin");
    await expect(google).toBeVisible();
    const box = await google.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
