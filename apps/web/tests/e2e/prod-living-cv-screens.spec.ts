import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { bearerOf, qaApi } from "./prod-qa-api";
import { test } from "./prod-walk";

/**
 * prod-living-cv-screens — the owner's Living CV screens, de-identified and encrypted
 * (coordinator order 2026-11-23, owner-approved read-only grant).
 *
 * Read-only. The synthetic `livingcv` account holds an owner-granted, time-boxed READ grant
 * (`organization_history_read_grants_v1`, #3754) on exactly two organizations, and no membership.
 * Only the two grant-aware pages are opened, each naming its organization (`?org=`), one
 * organization per pass: the company history (`loadCompanyWorkHistory`) and one person's page
 * (`loadCompanyPerson`). No workspace chip, no people list. The walk never presses a save, export,
 * send or confirm control.
 *
 * De-identification happens BEFORE rendering:
 *   1. Discovery (no screenshot): the granted organizations come from `my_history_read_grants_v1`
 *      and each one's roster names from `organization_people`, through the account's own session and
 *      the grant's SELECT policies; then the company history and one person's page are read for the
 *      names shown there and the other organizations on the person's history. All IN MEMORY only.
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
 *      every roster form as sent, and the visible text and field values case-insensitively.
 *   Steps 3 and 4 and the PNG metadata strip are each image's OWN privacy gate (owner,
 *   2026-11-23): a failed gate generates no image, and the other screens still run.
 *   At 375 px the layout is checked too and never softened: no sideways scroll, no element past an
 *   edge, no block hiding content. A layout FAIL is still delivered, de-identified, marked FAIL with
 *   its cause, and never blocks 1440 or 390.
 *
 * Nothing that names a person or an organization is printed: no text locators, no text
 * assertions, no logging, and every failure is rethrown as a fixed message naming only the step. Only
 * the count of leaked tokens is ever reported.
 *
 * Screens (each at 1440, 390 and 375 px — twelve), with `manifest.json` (each screen PASS or FAIL and
 * why, naming no one), written as metadata-free PNGs to PROD_QA_LCV_DIR (outside
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
/**
 * The WORKER whose own Living CV (`/cv`) is photographed: a minted synthetic session slot, chosen by
 * the owner (repository variable PROD_QA_LCV_WORKER_SLOT; the owner is deciding whose CV). A real
 * person's /cv would need that person's own session, which a walk never mints. DISABLED BY DEFAULT
 * (owner 2026-11-24: the owner's own /cv is opened by the owner, never walked): unset, the walk
 * takes the organization screens only, six in all.
 */
const WORKER_SLOT = /^[a-z0-9-]{1,24}$/.test(process.env.PROD_QA_LCV_WORKER_SLOT ?? "") ? process.env.PROD_QA_LCV_WORKER_SLOT! : "";
const WORKER_STATE = WORKER_SLOT ? resolve(__dirname, `.storage-state.prod-qa.${WORKER_SLOT}.json`) : "";
const ORIGIN = new URL(process.env.E2E_BASE_URL || "https://labourmarket.ai").origin;
const LOCALE = "lt";
const PERSON_HREF = /\/dashboard\/company\/people\/([0-9a-f-]{36})(?:[/?#]|$)/;

const VIEWPORTS = [
  { key: "1440", options: { viewport: { width: 1440, height: 900 } } },
  { key: "390", options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  // Owner, 2026-11-23: the narrowest phone too. Here nothing may overflow or sit off-screen.
  { key: "375", options: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }, fit: true },
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

async function context(browser: Browser, options: object, state: string = STATE): Promise<BrowserContext> {
  return browser.newContext({ storageState: state, locale: "lt-LT", ...options });
}

/** The worker's own Living CV page: the person's name and the organizations on their history. */
async function workerCvNames(page: Page): Promise<{ own: string[]; organizations: string[] }> {
  return page.evaluate(() => ({
    own: [...document.querySelectorAll('[data-testid="cv-document-header"] h1')]
      .map((h) => (h.textContent ?? "").trim())
      .filter(Boolean),
    organizations: [...document.querySelectorAll('[data-testid="cv-history-node"] > span.font-display')]
      .map((s) => (s.textContent ?? "").trim())
      .filter(Boolean),
  }));
}

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(`${ORIGIN}/${LOCALE}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!res || res.status() >= 400) throw new Error("page did not open");
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  if (!(await page.locator("main").first().isVisible({ timeout: 30_000 }))) throw new Error("no main");
}

/** The organizations this account may read now: its live grants, through its own session. */
async function grants(): Promise<Array<{ id: string; name: string }>> {
  const res = await qaApi("/rest/v1/rpc/my_history_read_grants_v1", bearerOf(SLOT), { method: "POST", body: {} });
  if (res.status !== 200) throw new Error("grants unreadable");
  const rows = (await res.json()) as Array<{ organization_id: string; organization_name: string | null }>;
  return rows.map((g) => ({ id: g.organization_id, name: (g.organization_name ?? "").trim() }));
}

/** One granted organization's roster: every person's id and name, read under the grant. */
async function roster(orgId: string): Promise<Array<{ id: string; name: string }>> {
  const res = await qaApi(
    `/rest/v1/organization_people?organization_id=eq.${encodeURIComponent(orgId)}&select=id,display_name&order=created_at.asc&limit=5000`,
    bearerOf(SLOT),
  );
  if (res.status !== 200) throw new Error("roster unreadable");
  const rows = (await res.json()) as Array<{ id: string; display_name: string }>;
  return rows.map((r) => ({ id: r.id, name: r.display_name }));
}

/** A grant-aware page for one organization, by its own address: `?org=` names the organization. */
const historyPath = (orgId: string) => `/dashboard/company/history?org=${encodeURIComponent(orgId)}`;

/** The page really served to the grant: not redirected elsewhere, and its own root rendered. */
async function served(page: Page, path: string, rootTestId: string): Promise<void> {
  await open(page, path);
  const want = path.split("?")[0]!;
  if (!new URL(page.url()).pathname.endsWith(want)) throw new Error("redirected: the page was not served to the grant");
  if (!(await page.getByTestId(rootTestId).first().isVisible({ timeout: 30_000 }).catch(() => false))) {
    throw new Error("the page rendered without its content: hidden from the grant");
  }
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

/** Rewrite every same-origin text body before the page sees it; load no stored images. */
async function deidentify(ctx: BrowserContext, p: Pseudonyms, allow: ReadonlySet<string>): Promise<void> {
  await ctx.exposeBinding("__lcvMask", (_source, texts: string[]) => texts.map((t) => maskFreeText(t, p, allow, "lt")));
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

/** The privacy gate's scan: true only when no roster form is anywhere in the document. */
async function isClean(page: Page, p: Pseudonyms): Promise<{ clean: boolean; leaks: number }> {
  const { html, visible } = await page.evaluate(() => ({
    html: `${document.title}\n${document.documentElement.outerHTML}`,
    visible: `${document.title}\n${document.body.innerText}\n${[...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].map((f) => f.value).join("\n")}`,
  }));
  const leaks = leakCount(html, p, false) + leakCount(visible, p, true);
  return { clean: leaks === 0, leaks };
}

/**
 * The 375 px layout check, never softened: no sideways scroll, no visible element past either edge,
 * and no block that clips its own content (overflow hidden or clip with wider content). Each cause
 * names the element by tag, test id, id or first class and the pixels: never its text.
 */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const inner = window.innerWidth;
    const out: string[] = [];
    const name = (el: Element) => {
      const tid = el.getAttribute("data-testid");
      if (tid) return `${el.tagName.toLowerCase()}[data-testid=${tid}]`;
      if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
      const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)[0];
      return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
    };
    const scroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (scroll > inner + 1) out.push(`page scrolls sideways: ${scroll} px on a ${inner} px screen (+${scroll - inner})`);
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed") continue;
      // A closed drawer or an accessibility-only label is not content on the screen.
      if (el.closest("[aria-hidden='true'], [hidden], [inert], .sr-only")) continue;
      if (r.right > inner + 1) out.push(`${name(el)} reaches past the right edge: right ${Math.round(r.right)} px (+${Math.round(r.right - inner)})`);
      else if (r.left < -1) out.push(`${name(el)} starts past the left edge: left ${Math.round(r.left)} px`);
      const clips = ["hidden", "clip"].includes(cs.overflowX) || ["hidden", "clip"].includes(cs.overflow);
      if (clips && el.scrollWidth > el.clientWidth + 1) out.push(`${name(el)} hides content: ${el.scrollWidth} px inside ${el.clientWidth} px (+${el.scrollWidth - el.clientWidth})`);
    }
    return out.slice(0, 20);
  });
}

interface ScreenResult {
  readonly screen: string;
  readonly viewport: string;
  readonly file: string | null;
  readonly privacy: "PASS" | "FAIL";
  readonly layout: "PASS" | "FAIL" | "n/a";
  readonly status: "PASS" | "FAIL";
  readonly reasons: readonly string[];
}

/**
 * One image, its own privacy gate. Names were rewritten before render; here the free text is masked,
 * the DOM scanned and the metadata stripped. A failed gate: no image is generated. At 375 px the
 * layout is checked too; a layout FAIL still generates the de-identified image, marked FAIL.
 */
async function shoot(page: Page, p: Pseudonyms, screen: string, viewport: string, fullPage: boolean, fit: boolean): Promise<ScreenResult> {
  const file = `${screen}-${viewport}.png`;
  await maskRendered(page);
  const gate = await isClean(page, p);
  if (!gate.clean) {
    return { screen, viewport, file: null, privacy: "FAIL", layout: "n/a", status: "FAIL", reasons: [`privacy gate: ${gate.leaks} original name tokens remain; no image generated`] };
  }
  const problems = fit ? await layoutProblems(page) : [];
  const png = stripPngMetadata(await page.screenshot({ fullPage, animations: "disabled", caret: "hide" }));
  writeFileSync(join(OUT, file), png, { mode: 0o600 });
  const layout = fit ? (problems.length ? "FAIL" : "PASS") : "n/a";
  return { screen, viewport, file, privacy: "PASS", layout, status: problems.length ? "FAIL" : "PASS", reasons: problems };
}

// Owner, 2026-11-24: the worker's OWN Living CV (/cv) and the organization Living CV. The
// organization screens stay on the company history until Lane E names the organization surface.
const SCREENS = ["1-worker-cv", "2-worker-cv-full", "3-company-1", "4-company-2"] as const;

test("LCV. de-identified Living CV screens at 1440, 390 and 375 px", async ({ browser }) => {
  if (!OUT || !isAbsolute(OUT) || resolve(OUT).startsWith(resolve(__dirname, "..", "..", ".."))) {
    throw new Error("PROD_QA_LCV_DIR must be an absolute directory outside the repository");
  }
  mkdirSync(OUT, { recursive: true, mode: 0o700 });

  // 1. Discovery: names into memory, nothing rendered for a screen. One organization per pass.
  const discovery = await context(browser, VIEWPORTS[0].options);
  const page = await discovery.newPage();
  let orgs: Array<{ id: string; name: string }> = [];
  const people: string[] = [];
  const companies: string[] = [];
  try {
    orgs = await at("read the granted organizations", () => grants());
    if (orgs.length !== 2) throw new Error(`living-cv-screens failed at: expected exactly two read grants, found ${orgs.length}`);
    for (const [i, org] of orgs.entries()) {
      await at(`discover organization ${i + 1}`, async () => {
        const list = await roster(org.id);
        people.push(...list.map((x) => x.name));
        await served(page, historyPath(org.id), "company-history");
        people.push(...(await peopleOnPage(page)).names);
      });
    }
  } finally {
    await discovery.close();
  }
  // The worker's own CV: their name, and the organizations on their history.
  if (WORKER_STATE && existsSync(WORKER_STATE)) {
    const wctx = await context(browser, VIEWPORTS[0].options, WORKER_STATE);
    try {
      const wpage = await wctx.newPage();
      await at("discover the worker's own CV", async () => {
        await served(wpage, "/cv", "cv-document-header");
        const w = await workerCvNames(wpage);
        people.push(...w.own);
        companies.push(...w.organizations);
      });
    } finally {
      await wctx.close();
    }
  }
  const keep = orgs.map((o) => o.name);
  const p = buildPseudonyms(people, companies.filter((c) => !keep.includes(c)), keep);
  if (p.tokens.length === 0) throw new Error("living-cv-screens failed at: no names discovered; nothing to de-identify against");
  const allow = catalogue();

  // 2. Twelve screens. Each image stands alone: a failure records its reason and the next one runs.
  const results: ScreenResult[] = [];
  const attempt = async (screen: string, viewport: string, go: () => Promise<ScreenResult>) => {
    try {
      results.push(await go());
    } catch (e) {
      // Only the walk's own fixed messages are kept; anything else (a URL, a page text) is not.
      const own = e instanceof Error && /^(page did not open|no main|redirected: |the page rendered without its content)/.test(e.message);
      const why = own ? (e as Error).message : "the page did not open";
      results.push({ screen, viewport, file: null, privacy: "FAIL", layout: "n/a", status: "FAIL", reasons: [`not generated: ${why} (${step})`] });
    }
  };
  for (const vp of VIEWPORTS) {
    const fit = "fit" in vp;
    // The worker's own Living CV, through the worker's own session.
    if (!WORKER_SLOT) {
      // Disabled by default: no worker screens at all, and nothing recorded for them.
    } else if (!existsSync(WORKER_STATE)) {
      for (const screen of [SCREENS[0], SCREENS[1]]) {
        results.push({ screen, viewport: vp.key, file: null, privacy: "FAIL", layout: "n/a", status: "FAIL", reasons: ["not generated: the chosen worker session was not minted"] });
      }
    } else {
      const wctx = await context(browser, vp.options, WORKER_STATE);
      await deidentify(wctx, p, allow);
      const wview = await wctx.newPage();
      try {
        await attempt(SCREENS[0], vp.key, async () => {
          step = `${vp.key}: worker Living CV`;
          await served(wview, "/cv", "cv-document-header");
          return shoot(wview, p, SCREENS[0], vp.key, false, fit);
        });
        await attempt(SCREENS[1], vp.key, async () => {
          step = `${vp.key}: worker Living CV, whole page`;
          await served(wview, "/cv", "cv-document-header");
          return shoot(wview, p, SCREENS[1], vp.key, true, fit);
        });
      } finally {
        await wctx.close();
      }
    }
    const ctx = await context(browser, vp.options);
    await deidentify(ctx, p, allow);
    const view = await ctx.newPage();
    try {
      await attempt(SCREENS[2], vp.key, async () => {
        step = `${vp.key}: first organization's company Living CV`;
        await served(view, historyPath(orgs[0]!.id), "company-history");
        return shoot(view, p, SCREENS[2], vp.key, true, fit);
      });
      await attempt(SCREENS[3], vp.key, async () => {
        step = `${vp.key}: second organization's company Living CV`;
        await served(view, historyPath(orgs[1]!.id), "company-history");
        return shoot(view, p, SCREENS[3], vp.key, true, fit);
      });
    } finally {
      await ctx.close();
    }
  }

  // 3. The manifest: every screen with PASS or FAIL and its reason. It names no person and no
  //    organization, and it is encrypted together with the images.
  // `expected`: 6 organization screens, or 12 with the worker's own CV.
  const expected = VIEWPORTS.length * (WORKER_SLOT ? 4 : 2);
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ expected, screens: results }, null, 2), { mode: 0o600 });
  const failed = results.filter((r) => r.status === "FAIL");
  if (failed.length > 0) {
    throw new Error(`living-cv-screens: ${failed.length} of ${results.length} screens FAIL: ${failed.map((r) => `${r.screen}-${r.viewport}`).join(", ")} (reasons in the encrypted manifest)`);
  }
});
