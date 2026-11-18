import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, firstVisit, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * A SLOW PHONE (owner 2026-11-06): a person in Bangladesh on a mobile connection fills
 * forms while the page is still loading. Real Chrome, phone size, a throttled network
 * and CPU. What was typed must survive the page waking up, a save must show its state,
 * and a lost connection must say so instead of killing the page.
 *
 * It answers with PASS or FAIL per case. Timings are logged in whole seconds.
 *
 * WRITES. Only `qa.worker+goal3`, only its work card status, put back in `afterAll`.
 * The sign-up form is filled and never sent. Dispatch only.
 */
const state = resolve(__dirname, ".storage-state.prod-qa.worker2.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 900_000, retries: 0 });
test.use({ actionTimeout: 60_000, channel: "chrome" });

const PHONE = { width: 390, height: 844 };
const short = (e: unknown) => (e as Error).message.split("\n")[0].slice(0, 160);
const seconds = (since: number) => Math.round((Date.now() - since) / 1000);
const TYPED = "qa.synthetic.slow@example.invalid";

async function open(browser: Browser, signedIn: boolean): Promise<{ ctx: BrowserContext; page: Page; crashes: string[] }> {
  // A stranger has never answered the consent banner: it has to be in what is measured (UX-3).
  const options = { viewport: PHONE, hasTouch: true, isMobile: true, locale: "en-US" };
  const ctx = await browser.newContext(signedIn ? { ...options, storageState: state } : firstVisit(options));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(`${e.name}: ${e.message.slice(0, 60)}`));
  return { ctx, page, crashes };
}

async function deadScreen(page: Page): Promise<boolean> {
  const text = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).slice(0, 2_000);
  return text.includes("Application error") || (await page.getByTestId("global-error-message").count()) > 0;
}

const settled = (page: Page) => page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => undefined);
const inMain = (page: Page): Locator => page.getByRole("main");

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

async function statusOf(): Promise<string | null> {
  const token = bearerOf("worker2");
  const id = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub: string }).sub;
  const res = await qaApi(`/rest/v1/workers?profile_id=eq.${id}&select=availability_status`, token);
  if (!res.ok) throw new Error(`reading the card answered ${res.status}`);
  const [row] = (await res.json()) as { availability_status: string | null }[];
  return row?.availability_status ?? null;
}

async function editor(page: Page): Promise<{ form: Locator; openAfter: number }> {
  const started = Date.now();
  await page.goto("/en/dashboard/profile#cv-availability", { waitUntil: "commit" });
  const main = inMain(page);
  await expect(main.getByTestId("profile-work-card-editor")).toBeVisible({ timeout: 120_000 });
  const toggle = main.getByTestId("work-card-editor-toggle");
  const form = main.getByTestId("work-card-editor");
  // A person keeps pressing until the page answers.
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click({ timeout: 5_000 });
    await expect(form).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 120_000 });
  return { form, openAfter: seconds(started) };
}

let original: string | null = null;

test("forms work on a slow phone: what was typed stays, a save shows its state, an offline save says so", async ({ browser }) => {
  original = await statusOf();
  console.info(`[browser] ${browser.browserType().name()} ${browser.version()} channel=chrome, 400 kbit/s, 400 ms, CPU 4x, phone`);

  // Typing while the page is still loading.
  {
    const label = "sign-up: typing during load survives the page waking up";
    const { ctx, page, crashes } = await open(browser, false);
    try {
      const started = Date.now();
      await page.goto("/en/auth/signup", { waitUntil: "commit" });
      const email = page.locator('input[type="email"]').first();
      await email.waitFor({ state: "visible", timeout: 120_000 });
      const visibleAfter = seconds(started);
      await email.fill(TYPED);
      await settled(page);
      const kept = await email.inputValue();
      record(label, kept === TYPED && crashes.length === 0, `field_visible_s=${visibleAfter} loaded_s=${seconds(started)} kept=${kept === TYPED} crash=${crashes.join("/") || "none"}`);
    } catch (e) {
      record(label, false, `stopped (${short(e)})`);
    } finally {
      await ctx.close();
    }
  }

  {
    const label = "chat: a sentence typed during load survives and sends";
    const { ctx, page, crashes } = await open(browser, true);
    try {
      const started = Date.now();
      await page.goto("/en/dashboard", { waitUntil: "commit" });
      const composer = inMain(page).getByTestId("composer-input");
      await expect(composer).toBeVisible({ timeout: 120_000 });
      const visibleAfter = seconds(started);
      const sentence = "what should I do next?";
      await composer.fill(sentence);
      await settled(page);
      const kept = await composer.inputValue();
      if (kept === "") await composer.fill(sentence);
      // The composer clears at once; what counts is the message on screen and an answer to it.
      const answers = inMain(page).getByTestId("assistant-mark");
      const answersBefore = await answers.count();
      await inMain(page).getByTestId("composer-send").click();
      await expect(inMain(page).getByText(sentence).first()).toBeVisible({ timeout: 120_000 });
      await expect.poll(() => answers.count(), { timeout: 120_000, intervals: [1_000] }).toBeGreaterThan(answersBefore);
      await settled(page);
      record(label, kept === sentence && crashes.length === 0 && !(await deadScreen(page)), `field_visible_s=${visibleAfter} kept=${kept === sentence} crash=${crashes.join("/") || "none"}`);
    } catch (e) {
      record(label, false, `stopped (${short(e)})`);
    } finally {
      await ctx.close();
    }
  }

  // A save on a slow connection: the state shows, then the answer.
  {
    const label = "work card: the save shows its state, then saved, and stays";
    const { ctx, page, crashes } = await open(browser, true);
    try {
      const { form, openAfter } = await editor(page);
      const next = original === "busy" ? "available" : "busy";
      await form.locator('select[name="availability_status"]').selectOption(next);
      const save = form.getByTestId("work-card-save");
      const before = await save.innerText();
      const started = Date.now();
      await save.click();
      const pendingShown = await expect(save).toBeDisabled({ timeout: 3_000 }).then(() => true, () => false);
      await expect(form.getByTestId("work-card-saved").or(form.getByTestId("work-card-error")).first()).toBeVisible({ timeout: 120_000 });
      const saved = await form.getByTestId("work-card-saved").isVisible();
      const stored = await statusOf();
      record(label, pendingShown && saved && stored === next && crashes.length === 0 && before.length > 0, `editor_open_s=${openAfter} save_s=${seconds(started)} pending_shown=${pendingShown} saved=${saved} stored_ok=${stored === next} crash=${crashes.join("/") || "none"}`);
    } catch (e) {
      record(label, false, `stopped (${short(e)})`);
    } finally {
      await ctx.close();
    }
  }

  // The connection drops just before Save: the person is told, and the page lives.
  {
    const label = "work card: a save with no connection says so and the page lives";
    const { ctx, page, crashes } = await open(browser, true);
    try {
      const { form } = await editor(page);
      await settled(page);
      await form.locator('select[name="availability_status"]').selectOption("available");
      await ctx.setOffline(true);
      await form.getByTestId("work-card-save").click();
      const told = await page.getByTestId("connection-notice").waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false);
      const dead = await deadScreen(page);
      await ctx.setOffline(false);
      // Back online the notice goes, and the same form still saves.
      await expect(page.getByTestId("connection-notice")).toHaveCount(0, { timeout: 30_000 });
      const save = form.getByTestId("work-card-save");
      await expect(save).toBeEnabled({ timeout: 120_000 });
      await save.click();
      const again = await form.getByTestId("work-card-saved").waitFor({ state: "visible", timeout: 120_000 }).then(() => true, () => false);
      record(label, told && !dead && again, `notice_shown=${told} dead_screen=${dead} saved_after_reconnect=${again} crash=${crashes.join("/") || "none"}`);
    } catch (e) {
      record(label, false, `stopped (${short(e)}) crash=${crashes.join("/") || "none"}`);
    } finally {
      await ctx.close();
    }
  }

  // The first screens a stranger meets, on the same phone.
  for (const path of ["/en", "/en/jobs", "/en/for-workers", "/bn"]) {
    const label = `public page ${path}`;
    const { ctx, page, crashes } = await open(browser, false);
    try {
      const started = Date.now();
      const res = await page.goto(path, { waitUntil: "commit", timeout: 120_000 });
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 120_000 });
      const headingAfter = seconds(started);
      await settled(page);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      // UX-3: nothing below the consent banner may move while the page wakes up.
      const shift = await page.evaluate(
        () =>
          new Promise<number>((done) => {
            let total = 0;
            new PerformanceObserver((list) => {
              for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
                if (!e.hadRecentInput) total += e.value;
              }
            }).observe({ type: "layout-shift", buffered: true });
            setTimeout(() => done(total), 500);
          }),
      );
      record(label, (res?.status() ?? 0) < 400 && crashes.length === 0 && !wide && shift <= 0.1, `status=${res?.status()} heading_s=${headingAfter} loaded_s=${seconds(started)} layout_shift=${shift.toFixed(3)} sideways_scroll=${wide} crash=${crashes.join("/") || "none"}`);
    } catch (e) {
      record(label, false, `stopped (${short(e)})`);
    } finally {
      await ctx.close();
    }
  }
});

test.afterAll(async () => {
  if (!original) return;
  const res = await qaApi("/rest/v1/rpc/save_worker_card", bearerOf("worker2"), {
    method: "POST",
    body: {
      p_availability_status: original,
      p_available_from: null,
      p_location_country: null,
      p_preferred_countries: null,
      p_salary_min: null,
      p_salary_max: null,
    },
  });
  console.info(`[restore] answered=${res.status} status_back=${(await statusOf()) === original}`);
  expect(res.ok, "the synthetic worker's card is put back").toBe(true);
});
