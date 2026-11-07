import { test, expect, firstVisit, type Browser, type Page } from "./prod-walk";

/**
 * THE THREE REQUEST DOORS ON THE LANDING (owner P0 2026-11-07): a stranger opens each
 * door with no account, on a phone and a computer, and sends a real request.
 *
 * WRITES. Exactly three rows in the existing intake queue, once per run, each named
 * `QA-SYNTHETIC R<run id>` with an `example.invalid` address, so nobody is contacted
 * and the queue's reader can tell them apart. They also raise the real internal alert,
 * which is the point. The form is read and left unsent at the other sizes and languages.
 * Dispatch only: never in the rotation, because each run adds three rows.
 */
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 480_000, retries: 0, mode: "serial" });
test.use({ actionTimeout: 30_000, channel: "chrome" });

const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC R${RUN}`;
const DOORS = ["worker-search", "b2b", "project"] as const;
type Door = (typeof DOORS)[number];
const PROMISE: Record<string, string> = { lt: "24 valand", en: "24 hours" };
const PHONE = { width: 390, height: 844 };
const short = (e: unknown) => (e as Error).message.split("\n")[0].slice(0, 160);

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

async function open(browser: Browser, path: string, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext(firstVisit({ viewport, locale: "lt-LT" }));
  const page = await ctx.newPage();
  const crashes: string[] = [];
  page.on("pageerror", (e) => {
    if (!e.message.includes("#418")) crashes.push(e.name);
  });
  await page.goto(path);
  await expect(page.getByTestId("request-door-worker-search-open").first()).toBeVisible({ timeout: 60_000 });
  return { ctx, page, crashes };
}

/** The door's own fields; a stranger fills only what the form requires. */
async function fill(page: Page, door: Door): Promise<void> {
  const form = page.getByTestId("request-door-form");
  if (door === "worker-search") {
    await form.locator('[name="profession"]').fill(`${TAG} suvirintojas`);
    await form.locator('[name="workers"]').fill("2");
  } else if (door === "b2b") {
    await form.locator('[name="work"]').fill(`${TAG} fasado darbai`);
  } else {
    await form.locator('[name="need"]').fill(`${TAG} biuro remontas`);
  }
  await form.locator('[name="country"]').selectOption("LT");
  await form.locator('[name="name"]').fill(TAG);
  await form.locator('[name="email"]').fill(`qa.synthetic+${RUN}.${door}@example.invalid`);
}

test("every door is visible with its promise, on a phone and a computer, in every language", async ({ browser }) => {
  for (const [name, viewport] of [["phone", PHONE], ["computer", { width: 1280, height: 800 }]] as const) {
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const label = `${name} /${locale}`;
      try {
        const { ctx, page } = await open(browser, `/${locale}`, viewport);
        const visible: boolean[] = [];
        for (const door of DOORS) visible.push(await page.getByTestId(`request-door-${door}-open`).first().isVisible());
        const body = await page.locator("body").innerText();
        const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const promise = PROMISE[locale] ? body.includes(PROMISE[locale]) : /24/.test(body);
        record(label, visible.every(Boolean) && promise && !wide, `doors=${visible.filter(Boolean).length}/3 promise=${promise} sideways=${wide}`);
        await ctx.close();
      } catch (e) {
        record(label, false, `stopped (${short(e)})`);
      }
    }
  }
});

test("each door takes a request with no account and says it was received", async ({ browser }) => {
  for (const door of DOORS) {
    const label = `sent ${door}`;
    const { ctx, page, crashes } = await open(browser, "/lt", PHONE);
    try {
      await page.getByTestId(`request-door-${door}-open`).first().click();
      await expect(page.getByTestId("request-door-form")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("request-door-panel")).toHaveAttribute("data-door", door);
      await fill(page, door);
      const started = Date.now();
      await page.getByTestId("request-door-send").dblclick();
      const received = page.getByTestId("request-door-received");
      const problem = page.getByTestId("request-door-problem");
      await expect(received.or(problem).first()).toBeVisible({ timeout: 60_000 });
      const ok = await received.isVisible();
      const account = /\/auth\//.test(page.url());
      record(label, ok && !account && crashes.length === 0, `received=${ok} sent_to_signup=${account} seconds=${Math.round((Date.now() - started) / 1000)} crash=${crashes.join("/") || "none"}`);
    } catch (e) {
      record(label, false, `stopped (${short(e)}) crash=${crashes.join("/") || "none"}`);
    } finally {
      await ctx.close();
    }
  }
});
