import { expect, test, type Page } from "@playwright/test";

/**
 * `CRITICAL_MOBILE_HORIZONTAL_OVERFLOW = 0`, measured rather than asserted.
 *
 * ## Why this is a spec and not a review note
 *
 * Two real overflows were found on 2026-08-28 by walking the authenticated
 * product at 375px with a signed-in session, and neither was visible from the
 * source:
 *
 *   /dashboard/company           89px — a project link in the gallery grid. A
 *                                grid item's default `min-width: auto` floors
 *                                it at max-content, so the <li> rendered 427px
 *                                wide inside a 301px grid and the `truncate`
 *                                on its title could never engage.
 *   /dashboard/company/scouting  13px — three status badges in a non-wrapping
 *                                flex row: 355px inside a 309px parent.
 *
 * Both are one-class fixes, and both would come back the moment somebody adds
 * a fourth badge or a second grid list. A measurement that only ran once is a
 * fact about one afternoon; this makes it a property of the product.
 *
 * ## What it measures
 *
 * `document.body.scrollWidth - document.documentElement.clientWidth`, which is
 * the number that actually decides whether a phone can be scrolled sideways.
 * Deliberately NOT `documentElement.scrollWidth` — that read exactly 768 on a
 * 768px viewport while the body read 999, which is how the dashboard nav row's
 * overflow hid from everyone until #1313 went looking with the right property.
 *
 * A horizontally scrolling STRIP is not a defect and is not counted: the
 * company control chips live in an `overflow-x-auto` container and are meant
 * to scroll. Only overflow that reaches the BODY makes the whole page slide.
 */

const PHONE = { width: 375, height: 812 };

/** Representative authenticated routes for each identity. */
const ROUTES: { state: string; paths: string[] }[] = [
  {
    state: "tests/e2e/.storage-state.worker.json",
    paths: [
      "/lt/dashboard",
      "/lt/dashboard/journal",
      "/lt/dashboard/profile",
      "/lt/dashboard/opportunities",
      "/lt/dashboard/account",
    ],
  },
  {
    state: "tests/e2e/.storage-state.company.json",
    paths: [
      "/lt/dashboard/company",
      "/lt/dashboard/company/scouting",
      "/lt/dashboard/projects",
    ],
  },
];

async function bodyOverflow(page: Page): Promise<number> {
  return page.evaluate(
    "document.body.scrollWidth - document.documentElement.clientWidth",
  ) as Promise<number>;
}

/**
 * EXACTLY ONE `<main>`, or none.
 *
 * Found while measuring the above: `/dashboard/opportunities` and
 * `/dashboard/company/scouting` each rendered their OWN `<main>` inside the
 * shell's, so the document carried two. That is invalid HTML and a real cost to
 * anyone navigating by landmark — offered a choice between two "main"s and told
 * nothing about either. Playwright's strict mode is what surfaced it; nobody
 * would have seen it by looking.
 *
 * `0` is legitimate and is why this is not `toBe(1)`: the conversation surface
 * at `/dashboard` renders bare by design and supplies no shell.
 */
test.describe("landmarks are not duplicated", () => {
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: PHONE,
  });
  for (const path of [
    "/lt/dashboard",
    "/lt/dashboard/company",
    "/lt/dashboard/company/scouting",
  ]) {
    test(`${path} has at most one <main>`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const mains = (await page.evaluate(
        "document.querySelectorAll('main').length",
      )) as number;
      expect(mains, `${path} renders ${mains} <main> landmarks`).toBeLessThanOrEqual(1);
    });
  }
});

for (const group of ROUTES) {
  test.describe(`no sideways scroll at 375px — ${group.state.split(".").at(-2)}`, () => {
    test.use({ storageState: group.state, viewport: PHONE });
    test.setTimeout(120_000);

    for (const path of group.paths) {
      test(`${path} fits the phone`, async ({ page }) => {
        await page.goto(path, { waitUntil: "networkidle" });
        // The page must have actually rendered — a 404 or a redirect to an
        // empty shell would "pass" this with nothing on screen.
        //
        // Asserted on TEXT rather than on a `<main>` landmark, and that is a
        // finding rather than a convenience: `/dashboard` is the conversation
        // surface and renders BARE by design (DashboardChrome's conversation
        // mode supplies no shell), so it has no <main> at all and never should.
        // Requiring one here would have failed a page that is behaving
        // correctly.
        const rendered = (await page.evaluate(
          "document.body.innerText.trim().length",
        )) as number;
        expect(rendered, `${path} rendered nothing`).toBeGreaterThan(200);
        const overflow = await bodyOverflow(page);
        expect(
          overflow,
          `${path} overflows the viewport by ${overflow}px — the whole page can be dragged sideways`,
        ).toBeLessThanOrEqual(0);
      });
    }
  });
}
