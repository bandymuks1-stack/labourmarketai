import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * SAVING AVAILABILITY (real person's report, 2026-11-05): "Application error: a
 * client-side exception" after Save on the work card, again on every try. The
 * row was stored each time. The page they read was Lithuanian through the
 * browser's translator ("Laisvas" reached them as "Free").
 *
 * A translator swaps a page's text nodes for its own <font> elements. React still
 * holds the old nodes: `insertBefore(spinner, oldText)` then throws NotFoundError.
 *
 * WHAT THIS IS NOT. A headless run can't start Chrome's translator, so
 * `TRANSLATOR` does the same DOM swap and leaves the words as they are. It is real
 * Chrome, scripted, on the same synthetic worker as the other walks. Sign-out and
 * a new sign-in aren't walked: a minted session can't sign in again, so persistence
 * is a new browser context on the same session, a fresh load and the database.
 *
 * WRITES. Only `qa.worker+goal3`, only its work card. `afterAll` puts the status and
 * the country back through the same RPC; a saved figure can be changed, not cleared.
 * Logs carry case names, counts and error names only.
 */
const state = resolve(__dirname, ".storage-state.prod-qa.worker2.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 900_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

const SAVE_WAIT = 60_000;
const short = (e: unknown) => (e as Error).message.split("\n")[0].slice(0, 160);

/** After load, every text node becomes <font><font>text</font></font>, and so does each new one. */
const TRANSLATOR = `(() => {
  const swap = (t) => {
    const p = t.parentNode;
    if (!p || !t.nodeValue || !t.nodeValue.trim()) return;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|FONT|TITLE)$/.test(p.nodeName)) return;
    const outer = document.createElement("font");
    const inner = document.createElement("font");
    inner.textContent = t.nodeValue;
    outer.appendChild(inner);
    p.replaceChild(outer, t);
    window.__translatedNodes = (window.__translatedNodes || 0) + 1;
  };
  const sweep = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(swap);
  };
  window.addEventListener("load", () => setTimeout(() => {
    sweep();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; sweep(); }, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }, 1500));
})();`;

async function open(browser: Browser, translated: boolean): Promise<{ ctx: BrowserContext; page: Page; crashes: string[] }> {
  const ctx = await browser.newContext({ storageState: state, locale: "lt-LT" });
  if (translated) await ctx.addInitScript(TRANSLATOR);
  const page = await ctx.newPage();
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(e.name));
  return { ctx, page, crashes };
}

const inMain = (page: Page): Locator => page.getByRole("main");

/** The dead screen, either kind. */
async function deadScreen(page: Page): Promise<boolean> {
  const text = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).slice(0, 2_000);
  return text.includes("Application error") || (await page.getByTestId("global-error-message").count()) > 0;
}

async function storedCard(): Promise<{ status: string | null; country: string | null }> {
  const token = bearerOf("worker2");
  const id = (JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub: string }).sub;
  const res = await qaApi(`/rest/v1/workers?profile_id=eq.${id}&select=availability_status,current_location_country`, token);
  if (!res.ok) throw new Error(`reading the card answered ${res.status}`);
  const [row] = (await res.json()) as { availability_status: string | null; current_location_country: string | null }[];
  return { status: row?.availability_status ?? null, country: row?.current_location_country ?? null };
}

/** The chat's work card form, opened by the sentence that opens it for a person. */
async function chatForm(page: Page): Promise<Locator> {
  await page.goto("/lt/dashboard");
  await page.waitForLoadState("load");
  const composer = inMain(page).getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await composer.fill("galiu dirbti nuo spalio 1 d.");
  await inMain(page).getByTestId("composer-send").click();
  const form = inMain(page).getByTestId("inline-action-form-worker.save-work-card").last();
  await expect(form).toBeVisible({ timeout: 60_000 });
  // Translation starts 1.5 s after load, as a person's page would have it before they click.
  await page.waitForTimeout(2_500);
  await form.getByTestId("field-availableFrom").fill("");
  return form;
}

type Case = { name: string; status: string; country: string; expectCountry?: string; click?: "dbl"; invalid?: boolean };

const results: string[] = [];
function record(label: string, pass: boolean, detail: string): void {
  results.push(`${label} ${pass ? "PASS" : "FAIL"}`);
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

/** One save through the chat form: the same steps the person took. */
async function chatSave(browser: Browser, translated: boolean, c: Case): Promise<void> {
  const label = `chat ${translated ? "translated" : "plain"} ${c.name}`;
  const { ctx, page, crashes } = await open(browser, translated);
  try {
    const form = await chatForm(page);
    await form.getByTestId("field-availabilityStatus").selectOption(c.status);
    await form.getByTestId("field-locationCountry").fill(c.country);
    await form.getByTestId("inline-action-continue").click();
    await expect(form.getByTestId("inline-action-review")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const nodes = await page.evaluate(() => (window as unknown as { __translatedNodes?: number }).__translatedNodes ?? 0);
    const save = form.getByTestId("inline-action-save");
    if (c.click === "dbl") await save.dblclick({ timeout: 10_000 });
    else await save.click({ timeout: 10_000 });
    const done = inMain(page).getByTestId("inline-action-done").last();
    const refused = inMain(page).getByTestId("inline-action-error").last();
    const answered = await done.or(refused).first().waitFor({ state: "visible", timeout: SAVE_WAIT }).then(() => true, () => false);
    await page.waitForTimeout(3_000);
    const dead = await deadScreen(page);
    const refusedShown = answered && (await refused.isVisible().catch(() => false));
    const stored = await storedCard();
    const rowOk = c.invalid ? true : stored.status === c.status && stored.country === (c.expectCountry ?? c.country);
    const ok = !dead && crashes.length === 0 && answered && (c.invalid ? refusedShown : !refusedShown) && rowOk;
    record(label, ok, `translated_nodes=${nodes} crash=${crashes.join("/") || "none"} dead_screen=${dead} answered=${answered} refused=${refusedShown} stored=${stored.status}/${stored.country}`);
  } catch (e) {
    record(label, false, `stopped (${short(e)}) crash=${crashes.join("/") || "none"} dead_screen=${await deadScreen(page)}`);
  } finally {
    await ctx.close();
  }
}

let original: { status: string | null; country: string | null } | null = null;

test("the work card saves through a translated page and a plain one, and what was saved stays", async ({ browser }) => {
  original = await storedCard();
  console.info(`[browser] ${browser.browserType().name()} ${browser.version()} channel=chrome scripted, translator emulated`);

  // The person's own steps first, then the same on an untranslated page as the control.
  await chatSave(browser, true, { name: "available + Bangladesh", status: "available", country: "Bangladesh", expectCountry: "BD" });
  await chatSave(browser, false, { name: "available + Bangladesh", status: "available", country: "Bangladesh", expectCountry: "BD" });
  await chatSave(browser, true, { name: "same again", status: "available", country: "BD" });
  await chatSave(browser, true, { name: "double click", status: "busy", country: "BD", click: "dbl" });
  await chatSave(browser, true, { name: "unavailable", status: "unavailable", country: "bd", expectCountry: "BD" });
  await chatSave(browser, true, { name: "label as listed", status: "available", country: "Bangladesh (BD)", expectCountry: "BD" });
  await chatSave(browser, true, { name: "unknown country", status: "available", country: "Xyzland", invalid: true });

  // Empty country keeps the stored one.
  await chatSave(browser, true, { name: "empty country", status: "busy", country: "", expectCountry: "BD" });

  // The profile's editor: the same save, the other door.
  {
    const { ctx, page, crashes } = await open(browser, true);
    try {
      await page.goto("/lt/dashboard/profile#cv-availability");
      await page.waitForLoadState("load");
      const main = inMain(page);
      await expect(main.getByTestId("profile-work-card-editor")).toBeVisible({ timeout: 60_000 });
      const toggle = main.getByTestId("work-card-editor-toggle");
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      const form = main.getByTestId("work-card-editor");
      await page.waitForTimeout(2_500);
      await form.locator('select[name="availability_status"]').selectOption("available");
      await form.getByTestId("work-card-save").dblclick();
      await expect(form.getByTestId("work-card-saved").or(form.getByTestId("work-card-error")).first()).toBeVisible({ timeout: SAVE_WAIT });
      await page.waitForTimeout(3_000);
      const dead = await deadScreen(page);
      const shownSaved = await form.getByTestId("work-card-saved").isVisible().catch(() => false);
      const shownError = await form.getByTestId("work-card-error").isVisible().catch(() => false);
      const stored = await storedCard();
      record("profile editor translated double click", !dead && crashes.length === 0 && shownSaved && !shownError && stored.status === "available", `crash=${crashes.join("/") || "none"} dead_screen=${dead} saved=${shownSaved} error=${shownError} stored=${stored.status}/${stored.country}`);
    } catch (e) {
      record("profile editor translated double click", false, `stopped (${short(e)}) crash=${crashes.join("/") || "none"}`);
    } finally {
      await ctx.close();
    }
  }

  // A new browser context on the same session, a fresh load, and the database.
  {
    const { ctx, page } = await open(browser, false);
    try {
      await page.goto("/lt/dashboard/profile#cv-availability");
      const main = inMain(page);
      await expect(main.getByTestId("profile-work-card-editor")).toBeVisible({ timeout: 60_000 });
      const toggle = main.getByTestId("work-card-editor-toggle");
      if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
      const form = main.getByTestId("work-card-editor");
      const status = await form.locator('select[name="availability_status"]').inputValue();
      const country = await form.locator('[name="location_country"]').inputValue();
      const stored = await storedCard();
      record("persisted after a new context and fresh load", status === "available" && country === "BD" && stored.status === "available" && stored.country === "BD", `page=${status}/${country} db=${stored.status}/${stored.country}`);
    } catch (e) {
      record("persisted after a new context and fresh load", false, `stopped (${short(e)})`);
    } finally {
      await ctx.close();
    }
  }
  console.info(`[summary] ${results.filter((r) => r.endsWith("PASS")).length}/${results.length} PASS`);
});

test.afterAll(async () => {
  if (!original) return;
  const res = await qaApi("/rest/v1/rpc/save_worker_card", bearerOf("worker2"), {
    method: "POST",
    body: {
      p_availability_status: original.status,
      p_available_from: null,
      p_location_country: original.country,
      p_preferred_countries: null,
      p_salary_min: null,
      p_salary_max: null,
    },
  });
  const back = await storedCard();
  console.info(`[restore] answered=${res.status} status_back=${back.status === (original.status ?? back.status)} country_back=${back.country === (original.country ?? back.country)} never_saved=${original.status === null || original.country === null}`);
  expect(res.ok, "the synthetic worker's card is put back").toBe(true);
});
