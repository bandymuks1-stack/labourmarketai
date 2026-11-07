import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, firstVisit, type Browser } from "./prod-walk";

/**
 * WHAT A STRANGER'S BROWSER GETS FROM PUBLIC ADDRESSES (register rows UX-9, UX-10, DS-1,
 * DS-2): the not-found answers, the icon in the tab, and the sign-up form on a phone.
 *
 * Read-only, signed out, no form sent. Dispatch only. A headless browser draws no tab, so
 * UX-10 proves the bytes served, not what a person sees in the tab.
 *
 * A record that does not exist still gets Next's shell in the raw HTML, because a thrown
 * `notFound()` renders outside the layout. Those rows pass on status, `noindex` and title,
 * and their detail states what the raw HTML holds, so the limit stays visible.
 */
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

const read = (html: string) => ({
  lang: /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1] ?? null,
  shell: /<html[^>]*\bid="__next_error__"/.test(html),
  h1: /<h1[\s>]/.test(html),
  title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null,
  noindex: /<meta[^>]+name="robots"[^>]+noindex/.test(html),
});

async function stranger(browser: Browser, viewport = { width: 1280, height: 800 }) {
  return browser.newContext(firstVisit({ viewport, locale: "lt-LT" }));
}

test("UX-9. an address no route can answer is a real page in the raw HTML", async ({ browser }) => {
  const ctx = await stranger(browser);
  for (const path of ["/lt/this-page-does-not-exist", "/en/nothing-here/deeper", "/lt/jobs/a/b", "/en/about/x", "/lt/legal/privacy/x"]) {
    const res = await ctx.request.get(path, { maxRedirects: 0 });
    const r = read(await res.text());
    record(`not-found ${path}`, res.status() === 404 && !r.shell && !!r.lang && r.h1 && r.noindex, `status=${res.status()} lang=${r.lang} h1=${r.h1} noindex=${r.noindex} title=${r.title}`);
  }
  await ctx.close();
});

test("UX-9. a live page is not mistaken for a missing one", async ({ browser }) => {
  const ctx = await stranger(browser);
  for (const path of ["/lt", "/lt/jobs", "/lt/legal/privacy", "/lt/auth/signup", "/en/for-companies"]) {
    const res = await ctx.request.get(path, { maxRedirects: 0 });
    const r = read(await res.text());
    record(`live ${path}`, res.status() === 200 && !r.shell && r.h1, `status=${res.status()} lang=${r.lang} h1=${r.h1}`);
  }
  await ctx.close();
});

test("UX-9. a missing record keeps its 404 and title, and a person with JavaScript gets the page", async ({ browser }) => {
  const ctx = await stranger(browser);
  for (const path of ["/lt/jobs/00000000-0000-0000-0000-000000000000", "/lt/auth/nera", "/lt/questions/nera-tokio-klausimo"]) {
    const res = await ctx.request.get(path, { maxRedirects: 0 });
    const r = read(await res.text());
    record(`missing record ${path}`, res.status() === 404 && r.noindex && !/LabourMarket\.ai$/.test(r.title ?? ""), `status=${res.status()} noindex=${r.noindex} title=${r.title} raw_html: shell=${r.shell} lang=${r.lang} h1=${r.h1}`);

    const page = await ctx.newPage();
    await page.goto(path);
    const heading = page.locator("h1").first();
    const seen = await heading.waitFor({ state: "visible", timeout: 45_000 }).then(() => true, () => false);
    record(`with JavaScript ${path}`, seen, `h1=${seen ? (await heading.innerText()).slice(0, 40) : "none"} lang=${await page.evaluate(() => document.documentElement.lang)}`);
    await page.close();
  }
  await ctx.close();
});

test("UX-10. the icons served are the LM mark, not the old one", async ({ browser }) => {
  const ctx = await stranger(browser);
  const expected = createHash("sha256").update(readFileSync(resolve(__dirname, "../../public/favicon.ico"))).digest("hex");
  const ico = await ctx.request.get("/favicon.ico");
  const got = createHash("sha256").update(await ico.body()).digest("hex");
  record("favicon.ico", ico.status() === 200 && got === expected, `status=${ico.status()} sha_prefix=${got.slice(0, 12)} expected=${expected.slice(0, 12)}`);

  const page = await ctx.newPage();
  await page.goto("/lt/auth/signup");
  const hrefs = await page.locator('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).getAttribute("href") ?? ""));
  record("icon links exist", hrefs.length > 0, `count=${hrefs.length}`);
  for (const href of hrefs) {
    const res = await ctx.request.get(href);
    record(`icon ${href.split("?")[0]}`, res.status() === 200, `status=${res.status()} type=${res.headers()["content-type"]}`);
  }
  await ctx.close();
});

for (const [row, width, height] of [["DS-1", 360, 780], ["DS-2", 390, 844]] as const) {
  test(`${row}. sign-up at ${width} px: no sideways scroll, 16 px fields, a reachable button`, async ({ browser }) => {
    const ctx = await stranger(browser, { width, height });
    const page = await ctx.newPage();
    await page.goto("/lt/auth/signup");
    const email = page.locator('input[type="email"]').first();
    await email.waitFor({ state: "visible", timeout: 45_000 });
    const m = await page.evaluate(() => ({
      wide: document.documentElement.scrollWidth > window.innerWidth,
      fields: [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio])")]
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => parseFloat(getComputedStyle(e).fontSize)),
      autocomplete: [...document.querySelectorAll("input")].map((e) => e.autocomplete).filter(Boolean),
      submit: document.querySelector('button[type="submit"]')?.getBoundingClientRect().height ?? 0,
    }));
    const small = m.fields.filter((s) => s < 16);
    record(`${row} sideways scroll`, !m.wide, `wide=${m.wide}`);
    record(`${row} fields`, m.fields.length >= 3 && small.length === 0, `count=${m.fields.length} under_16px=${small.length}`);
    record(`${row} autocomplete`, m.autocomplete.includes("email") && m.autocomplete.includes("new-password"), m.autocomplete.join(","));
    record(`${row} submit height`, m.submit >= 40, `px=${Math.round(m.submit)}`);
    await ctx.close();
  });
}
