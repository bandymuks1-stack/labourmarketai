import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import {
  buildPseudonyms,
  catalogueWords,
  isRewritableContentType,
  leakCount,
  maskFreeText,
  rewrite,
  stripPngMetadata,
  type Pseudonyms,
} from "../../lib/testing/living-cv-deidentify";
import { test } from "./prod-walk";

/**
 * prod-living-cv-screens — the owner's eight Living CV screens, de-identified and encrypted
 * (coordinator order 2026-11-23, owner-approved read-only grant).
 *
 * Read-only. The synthetic `livingcv` account holds a READ-ONLY membership in exactly two
 * organizations. The walk only opens pages and switches the active workspace; it never presses a
 * save, export, send or confirm control.
 *
 * De-identification happens BEFORE rendering:
 *   1. Discovery (no screenshot): the people list, the company history and one person's page are
 *      read in each organization; every person name, and every other organization named on the
 *      person's history, is collected IN MEMORY only.
 *   2. Every same-origin document, RSC and fetch body is rewritten on the way to the browser:
 *      people become "Darbuotojas A/B/…", other organizations "Uzsakovas 1/2/…". The two chosen
 *      organizations stay. Photos and other images from storage are not loaded at all.
 *      Each name is matched with its Lithuanian endings (Linas, Lino, Linui), and e-mail
 *      addresses, international phones and personal codes are masked, all at the same byte length.
 *   3. Before each screenshot every visible text and field value is masked again,
 *      case-insensitively: roster names, contact data (`redactContactData`), personal codes, and
 *      every other capitalised word that is not a word of the product's own catalogues or one of
 *      the two chosen organizations ("[…]"; over-masking is accepted).
 *   4. Then the whole document is checked: the markup, scripts and hidden streamed copies for
 *      every roster form as sent, and the visible text and field values case-insensitively. One
 *      left means FAIL and no screenshot.
 *
 * Nothing that names a person or an organization is printed: no text locators, no text
 * assertions, no logging, and every failure is rethrown as a fixed message naming only the step. Only
 * the count of leaked tokens is ever reported.
 *
 * Screens (each at 1440 and 390 px), written as metadata-free PNGs to PROD_QA_LCV_DIR (outside
 * the repository). The workflow zips, encrypts and destroys them; only the encrypted files are
 * uploaded.
 *   1. a worker's Living CV in the first organization, overview (the first screen);
 *   2. the same person, the whole history (full page);
 *   3. the first organization's company Living CV (company history, full page);
 *   4. the second organization's company Living CV.
 * The pages are the canonical ones as of 2026-11-23; Lane G confirms them.
 */

const OUT = process.env.PROD_QA_LCV_DIR ?? "";
const SLOT = "livingcv";
const STATE = resolve(__dirname, `.storage-state.prod-qa.${SLOT}.json`);
const ORIGIN = new URL(process.env.E2E_BASE_URL || "https://labourmarket.ai").origin;
const LOCALE = "lt";
const PERSONAL = "personal";
const PERSON_HREF = /\/dashboard\/company\/people\/([0-9a-f-]{36})(?:[/?#]|$)/;

const VIEWPORTS = [
  { key: "1440", options: { viewport: { width: 1440, height: 900 } } },
  { key: "390", options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
] as const;

/** Words that are never names: the product's own LT and EN catalogues (interface, professions, skills). */
function catalogue(): Set<string> {
  const dir = resolve(__dirname, "..", "..", "messages");
  const files = ["lt.json", "en.json", ...readdirSync(join(dir, "lt")).map((f) => join("lt", f)), ...readdirSync(join(dir, "en")).map((f) => join("en", f))];
  const words = new Set<string>();
  for (const f of files.filter((f) => f.endsWith(".json"))) catalogueWords(JSON.parse(readFileSync(join(dir, f), "utf8")), words);
  return words;
}

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000);

let step = "start";

/** Run `fn`; any failure is reported as the step name only, never the page's text or a URL. */
async function at<T>(name: string, fn: () => Promise<T>): Promise<T> {
  step = name;
  try {
    return await fn();
  } catch {
    throw new Error(`living-cv-screens failed at: ${name}`);
  }
}

async function context(browser: Browser, options: object): Promise<BrowserContext> {
  return browser.newContext({ storageState: STATE, locale: "lt-LT", ...options });
}

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(`${ORIGIN}/${LOCALE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!res || res.status() >= 400) throw new Error("page did not open");
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  if (!(await page.locator("main").first().isVisible({ timeout: 30_000 }))) throw new Error("no main");
}

/** The organization workspaces of this account: ids and display names, in menu order. */
async function organizations(page: Page): Promise<Array<{ id: string; name: string }>> {
  await open(page, "/dashboard");
  const chip = page.getByTestId("workspace-chip").first();
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.waitFor({ state: "visible", timeout: 30_000 });
  const found = await menu.locator('[data-testid^="workspace-option-"]').evaluateAll((els) =>
    els.map((el) => ({
      id: (el.getAttribute("data-testid") ?? "").replace("workspace-option-", ""),
      name: ((el as HTMLElement).innerText ?? "").split("\n")[0]!.trim(),
    })),
  );
  await page.keyboard.press("Escape");
  return found.filter((o) => o.id && o.id !== PERSONAL);
}

/** Make an organization the active workspace through the real header chip (no text matching). */
async function activate(page: Page, orgId: string): Promise<void> {
  await open(page, "/dashboard");
  const chip = page.getByTestId("workspace-chip").first();
  await chip.getByRole("button").first().click();
  const option = page.getByTestId(`workspace-option-${orgId}`);
  if ((await option.getAttribute("aria-current")) !== "true") {
    await option.click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await open(page, "/dashboard");
    await chip.getByRole("button").first().click();
  }
  if ((await page.getByTestId(`workspace-option-${orgId}`).getAttribute("aria-current")) !== "true") {
    throw new Error("workspace did not switch");
  }
  await page.keyboard.press("Escape");
}

/** Person names on the people list and the company history, and links to people's pages. */
async function peopleOnPage(page: Page): Promise<{ names: string[]; personIds: string[] }> {
  return page.evaluate((hrefSource) => {
    const href = new RegExp(hrefSource);
    const names: string[] = [];
    const directText = (el: Element) =>
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? "").trim())
        .filter(Boolean)
        .join(" ");
    // The people list: the name is the row's own text beside the role and review badges.
    document.querySelectorAll('li[data-testid^="org-member-"] > span:first-child').forEach((s) => names.push(directText(s)));
    // The company history: "who worked here" chips (the name beside the hours).
    document.querySelectorAll('[data-testid="company-place-people"] li span').forEach((s) => names.push(directText(s)));
    // A person's own page title.
    document.querySelectorAll('[data-testid="company-person-name"]').forEach((s) => names.push((s.textContent ?? "").trim()));
    const personIds: string[] = [];
    document.querySelectorAll("a[href]").forEach((a) => {
      const m = href.exec(a.getAttribute("href") ?? "");
      if (!m) return;
      personIds.push(m[1]!);
      names.push(((a as HTMLElement).innerText ?? "").split("\n")[0]!.replace(/[\d.,]+\s*h.*$/u, "").trim());
    });
    return { names: names.filter((n) => n && n !== "—"), personIds };
  }, PERSON_HREF.source);
}

/** Organizations named on a person's history (employers before this one, clients, partners). */
async function organizationsOnPage(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="cv-history-node"] > span.font-display, [data-testid="cv-history-node"] > span:nth-of-type(3)')]
      .map((s) => (s.textContent ?? "").trim())
      .filter(Boolean),
  );
}

/** Rewrite every same-origin text body before the page sees it; load no stored images. */
async function deidentify(ctx: BrowserContext, p: Pseudonyms, allow: ReadonlySet<string>): Promise<void> {
  await ctx.exposeBinding("__lcvMask", (_source, texts: string[]) => texts.map((t) => maskFreeText(t, p, allow)));
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const type = req.resourceType();
    if (type === "image" || type === "media") {
      // Only the app's own static artwork; photos and documents from storage never load.
      if (url.origin === ORIGIN && /^\/(_next\/static|icons?\/|favicon|logo)/.test(url.pathname)) return route.continue();
      return route.abort();
    }
    if (url.origin !== ORIGIN || !["document", "fetch", "xhr"].includes(type)) return route.continue();
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if (!isRewritableContentType(headers["content-type"])) return route.fulfill({ response: res });
    const body = rewrite(await res.text(), p);
    delete headers["content-length"];
    delete headers["content-encoding"];
    return route.fulfill({ status: res.status(), headers, body });
  });
}

/** Mask every visible text node and field value through the Node-side `maskFreeText`. */
async function maskRendered(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const n = walker.currentNode as Text;
      if (n.parentElement && skip.has(n.parentElement.tagName)) continue;
      if (/\S/.test(n.data)) nodes.push(n);
    }
    const fields = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")];
    const mask = (window as unknown as { __lcvMask: (t: string[]) => Promise<string[]> }).__lcvMask;
    const out = await mask([...nodes.map((n) => n.data), ...fields.map((f) => f.value), document.title]);
    nodes.forEach((n, i) => {
      if (out[i] !== n.data) n.data = out[i]!;
    });
    fields.forEach((f, i) => {
      const v = out[nodes.length + i]!;
      if (v !== f.value) f.value = v;
    });
    document.title = out[out.length - 1]!;
  });
}

/** Fail, without a screenshot, if any roster form is anywhere in the document. */
async function assertClean(page: Page, p: Pseudonyms): Promise<void> {
  const { html, visible } = await page.evaluate(() => ({
    html: `${document.title}\n${document.documentElement.outerHTML}`,
    visible: `${document.title}\n${document.body.innerText}\n${[...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].map((f) => f.value).join("\n")}`,
  }));
  const leaks = leakCount(html, p, false) + leakCount(visible, p, true);
  if (leaks > 0) {
    step = `${step} (${leaks} original name tokens remain; no screenshot taken)`;
    throw new Error("not de-identified");
  }
}

async function shoot(page: Page, p: Pseudonyms, file: string, fullPage: boolean): Promise<void> {
  await maskRendered(page);
  await assertClean(page, p);
  const png = stripPngMetadata(await page.screenshot({ fullPage, animations: "disabled", caret: "hide" }));
  writeFileSync(join(OUT, file), png, { mode: 0o600 });
}

test("LCV. eight de-identified Living CV screens", async ({ browser }) => {
  if (!OUT || !isAbsolute(OUT) || resolve(OUT).startsWith(resolve(__dirname, "..", "..", ".."))) {
    throw new Error("PROD_QA_LCV_DIR must be an absolute directory outside the repository");
  }
  mkdirSync(OUT, { recursive: true, mode: 0o700 });

  // 1. Discovery: names into memory, nothing rendered for a screen.
  const discovery = await context(browser, VIEWPORTS[0].options);
  const page = await discovery.newPage();
  let orgs: Array<{ id: string; name: string }> = [];
  const people: string[] = [];
  const companies: string[] = [];
  let personId = "";
  try {
    orgs = await at("read the organization workspaces", () => organizations(page));
    if (orgs.length !== 2) throw new Error(`living-cv-screens failed at: expected exactly two organization workspaces, found ${orgs.length}`);
    for (const [i, org] of orgs.entries()) {
      await at(`discover organization ${i + 1}`, async () => {
        await activate(page, org.id);
        await open(page, "/dashboard/company/people");
        const a = await peopleOnPage(page);
        await open(page, "/dashboard/company/history");
        const b = await peopleOnPage(page);
        people.push(...a.names, ...b.names);
        if (i === 0) personId = b.personIds[0] ?? a.personIds[0] ?? "";
      });
    }
    if (!personId) throw new Error("living-cv-screens failed at: no person page in the first organization");
    await at("discover the person", async () => {
      await activate(page, orgs[0]!.id);
      await open(page, `/dashboard/company/people/${personId}`);
      people.push(...(await peopleOnPage(page)).names);
      companies.push(...(await organizationsOnPage(page)));
    });
  } finally {
    await discovery.close();
  }
  const keep = orgs.map((o) => o.name);
  const p = buildPseudonyms(people, companies.filter((c) => !keep.includes(c)), keep);
  if (p.tokens.length === 0) throw new Error("living-cv-screens failed at: no names discovered; nothing to de-identify against");
  const allow = catalogue();

  // 2. The screens, each viewport in its own rewritten context.
  for (const vp of VIEWPORTS) {
    const ctx = await context(browser, vp.options);
    await deidentify(ctx, p, allow);
    const view = await ctx.newPage();
    try {
      await at(`${vp.key}: worker Living CV, overview`, async () => {
        await activate(view, orgs[0]!.id);
        await open(view, `/dashboard/company/people/${personId}`);
        await shoot(view, p, `1-worker-overview-${vp.key}.png`, false);
      });
      await at(`${vp.key}: worker Living CV, history`, () => shoot(view, p, `2-worker-history-${vp.key}.png`, true));
      await at(`${vp.key}: first organization's company Living CV`, async () => {
        await open(view, "/dashboard/company/history");
        await shoot(view, p, `3-company-1-${vp.key}.png`, true);
      });
      await at(`${vp.key}: second organization's company Living CV`, async () => {
        await activate(view, orgs[1]!.id);
        await open(view, "/dashboard/company/history");
        await shoot(view, p, `4-company-2-${vp.key}.png`, true);
      });
    } catch {
      throw new Error(`living-cv-screens failed at: ${step}`);
    } finally {
      await ctx.close();
    }
  }
});
