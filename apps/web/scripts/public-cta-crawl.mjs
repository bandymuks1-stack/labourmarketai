#!/usr/bin/env node
/**
 * Public CTA crawl — every public page, every routed locale, phone and desktop.
 *
 *   node apps/web/scripts/public-cta-crawl.mjs [--origin https://labourmarket.ai]
 *        [--locales lt,en] [--widths 360,1440] [--max-pages 0] [--out report.json]
 *        [--no-clicks] [--delay-ms 150] [--static-via-node]
 *
 * What it reports, per page and width:
 *   Requests to other sites are aborted too (analytics, sign-in widgets): they are
 *   not under test, and a crawl must not inflate anyone's statistics.
 *   - the page itself: HTTP status, an error screen (global or locale boundary,
 *     Next's "Application error"), a not-found screen behind a 200, a chunk or
 *     script that failed to load, an uncaught page error;
 *   - every link target: resolved once with a GET; 404 and 5xx are findings;
 *     a link that leaves the page's locale is a finding of its own;
 *   - every button that is visible, enabled and not a form submit: clicked once;
 *     "dead" when the click changes nothing a person could notice (no navigation,
 *     no request, no DOM change, no new tab);
 *   - banned words in the visible copy ("demo", doctrine §18).
 *
 * READ-ONLY BY CONSTRUCTION. Signed out, no cookies kept between pages, and every
 * request that is not GET or HEAD is aborted in the browser before it leaves, so a
 * click can never submit a form, call a server action or write a row — against
 * production as well. One page at a time with a pause between pages: it is never
 * a load source. Pages come from /sitemap.xml plus the public links found on them.
 *
 * Exit code 1 when there is at least one finding (so it can gate), 0 otherwise.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)("playwright");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

/** The routed locales, read from the one place that defines them. */
function activeLocales() {
  const src = readFileSync(join(HERE, "..", "lib", "i18n", "config.ts"), "utf8");
  const m = src.match(/export const activeLocales = \[([^\]]+)\] as const/);
  if (!m) throw new Error("activeLocales not found in lib/i18n/config.ts");
  return m[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
}

const ORIGIN = arg("origin", "https://labourmarket.ai").replace(/\/+$/, "");
const LOCALES = arg("locales", activeLocales().join(",")).split(",");
const WIDTHS = arg("widths", "360,1440").split(",").map(Number);
const MAX_PAGES = Number(arg("max-pages", "0"));
const DELAY_MS = Number(arg("delay-ms", "150"));
const OUT = arg("out", "");
const CLICKS = !flag("no-clicks");
const STATIC_VIA_NODE = flag("static-via-node");

/** Banned in product copy (doctrine §18; lib/guards/product-copy-forbidden-terms.test.ts). */
const BANNED = [/\bdemo\b/i, /\bdemonstrac/i, /\bдемо\b/i];
/** Signed-in or machine surfaces: resolved as link targets, never crawled as pages. */
const NOT_A_PUBLIC_PAGE = /^\/(api|_next)\/|^\/[a-z]{2}\/(dashboard|onboarding|oauth|invite)(\/|$)|\.(xml|txt|png|svg|ico|pdf|json|webmanifest)$/i;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36 lm-cta-crawl";

const findings = [];
const seenFinding = new Set();
function report(kind, page, width, detail) {
  const key = `${kind}|${page}|${detail}`;
  if (seenFinding.has(key)) {
    const f = findings.find((x) => x.key === key);
    if (f && !f.widths.includes(width)) f.widths.push(width);
    return;
  }
  seenFinding.add(key);
  findings.push({ key, kind, page, widths: [width], detail });
}

const localeOf = (path) => path.split("/")[1] ?? "";
const samePage = (a, b) => a.split("#")[0] === b.split("#")[0];

async function sitemapPaths() {
  const res = await fetch(`${ORIGIN}/sitemap.xml`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`sitemap.xml -> ${res.status}`);
  const xml = await res.text();
  const paths = new Set();
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = new URL(m[1].replace(/&amp;/g, "&"));
    paths.add(u.pathname + u.search);
  }
  return [...paths];
}

/** GET a link target once; the answer is shared by every page that links it. */
const resolved = new Map();
async function resolveTarget(request, url) {
  if (resolved.has(url)) return resolved.get(url);
  const p = (async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await request.get(url, { maxRedirects: 5, timeout: 30_000, failOnStatusCode: false });
        const status = res.status();
        if (status >= 500 && attempt === 1) continue;
        let notFoundScreen = false;
        if (status === 200 && /text\/html/.test(res.headers()["content-type"] ?? "")) {
          const body = await res.text();
          notFoundScreen = /data-testid="not-found|name="robots" content="noindex[^"]*"[^>]*>[\s\S]{0,4000}NEXT_HTTP_ERROR_FALLBACK;404/.test(body);
        }
        return { status, finalUrl: res.url(), notFoundScreen };
      } catch (error) {
        if (attempt === 2) return { status: 0, finalUrl: url, error: String(error?.message ?? error).slice(0, 120) };
      }
    }
    return { status: 0, finalUrl: url };
  })();
  resolved.set(url, p);
  return p;
}

async function newContext(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 780 : 900 },
    userAgent: UA,
    isMobile: width < 600,
    hasTouch: width < 600,
  });
  // The write lock: nothing but GET / HEAD ever leaves the browser.
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (!["GET", "HEAD"].includes(req.method())) return route.abort("blockedbyclient");
    // Other sites (analytics, sign-in widgets, fonts) are not under test and are never loaded.
    if (!req.url().startsWith(ORIGIN) && !/^(data|blob):/.test(req.url())) return route.abort("blockedbyclient");
    // --static-via-node: when the crawl itself sits behind a URL-normalising proxy that breaks
    // a chunk request (the 2026-11-12 defect), fetch static files outside the browser so the
    // pages can still be judged. The defect has its own probe; this only keeps the crawl useful.
    if (STATIC_VIA_NODE && req.url().includes("/_next/static/")) {
      try {
        const res = await fetch(req.url(), { headers: { "user-agent": UA } });
        const body = Buffer.from(await res.arrayBuffer());
        return route.fulfill({ status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" }, body });
      } catch {
        return route.abort("failed");
      }
    }
    return route.continue();
  });
  return context;
}

async function visiblePageState(page) {
  return page.evaluate(() => ({
    url: location.href,
    html: document.body ? document.body.innerHTML.length : 0,
    open: document.querySelectorAll('[aria-expanded="true"],[role="dialog"],dialog[open],[data-state="open"],details[open]').length,
    pressed: [...document.querySelectorAll("[aria-pressed],[aria-checked],[aria-selected]")]
      .map((e) => e.getAttribute("aria-pressed") ?? e.getAttribute("aria-checked") ?? e.getAttribute("aria-selected"))
      .join(""),
    theme: document.documentElement.className + (document.documentElement.getAttribute("data-theme") ?? ""),
    focus: document.activeElement ? document.activeElement.tagName + (document.activeElement.id ?? "") : "",
    scroll: Math.round(window.scrollY),
  }));
}

async function crawlPage(context, path, width, discovered) {
  const page = await context.newPage();
  const url = ORIGIN + path;
  const failedScripts = [];
  const pageErrors = [];
  page.on("response", (res) => {
    if (res.status() >= 400 && /\/_next\/static\//.test(res.url())) failedScripts.push(`${res.status()} ${new URL(res.url()).pathname}`);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  let response;
  try {
    response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  } catch (error) {
    report("page-unreachable", path, width, String(error?.message ?? error).split("\n")[0].slice(0, 140));
    await page.close();
    return;
  }
  await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => {});
  const status = response?.status() ?? 0;
  if (status !== 200) report("page-status", path, width, `HTTP ${status}`);

  const screen = await page.evaluate(() => {
    const has = (s) => !!document.querySelector(s);
    const text = document.body?.innerText ?? "";
    return {
      globalError: has('[data-testid="global-error-message"]'),
      localeError: has('[data-testid="error-boundary-message"]'),
      appError: /Application error: a (client|server)-side exception/.test(text),
      notFound: has('[data-testid^="not-found"]'),
      text,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (screen.globalError) report("error-screen", path, width, "global error screen");
  if (screen.localeError) report("error-screen", path, width, "error boundary screen");
  if (screen.appError) report("error-screen", path, width, "Next application error");
  if (screen.notFound && status === 200) report("not-found-screen", path, width, "not-found content behind HTTP 200");
  for (const f of new Set(failedScripts)) report("script-failed", path, width, f);
  for (const e of new Set(pageErrors)) report("page-error", path, width, e);
  if (screen.overflow > 1) report("horizontal-overflow", path, width, `${screen.overflow}px wider than the screen`);
  for (const re of BANNED) {
    const m = screen.text.match(re);
    if (m) {
      const at = Math.max(0, m.index - 40);
      report("banned-word", path, width, `"${screen.text.slice(at, m.index + m[0].length + 40).replace(/\s+/g, " ")}"`);
    }
  }
  if (screen.globalError || screen.appError) {
    await page.close();
    return; // nothing on a crashed page is worth clicking
  }

  // ---- links -------------------------------------------------------------
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((a) => ({
      raw: a.getAttribute("href"),
      href: a.href,
      text: (a.innerText || a.getAttribute("aria-label") || a.title || "").trim().replace(/\s+/g, " ").slice(0, 60),
      visible: !!(a.offsetWidth || a.offsetHeight || a.getClientRects().length),
    })),
  );
  // Resolve the page's own-site targets six at a time; each distinct target is fetched once per crawl.
  const ownTargets = [...new Set(links.map((l) => {
    try {
      const u = new URL(l.href);
      return u.origin === ORIGIN && l.raw && !/^(mailto:|tel:|sms:|javascript:)/i.test(l.raw) ? ORIGIN + u.pathname + u.search : null;
    } catch {
      return null;
    }
  }).filter(Boolean))];
  for (let i = 0; i < ownTargets.length; i += 6) await Promise.all(ownTargets.slice(i, i + 6).map((t) => resolveTarget(context.request, t)));
  for (const link of links) {
    const label = `"${link.text || "(no text)"}"`;
    if (link.raw === null || link.raw.trim() === "" || link.raw.trim() === "#") {
      if (link.visible) report("dead-link", path, width, `${label} has no target (href="${link.raw ?? ""}")`);
      continue;
    }
    if (/^(mailto:|tel:|sms:)/i.test(link.raw)) {
      if (!/^(mailto:[^@\s]+@[^@\s]+\.[^@\s]+|tel:\+?[\d\s()-]{5,}|sms:)/i.test(link.raw)) report("dead-link", path, width, `${label} -> malformed ${link.raw}`);
      continue;
    }
    if (/^javascript:/i.test(link.raw)) {
      report("dead-link", path, width, `${label} -> ${link.raw.slice(0, 40)}`);
      continue;
    }
    let target;
    try {
      target = new URL(link.href);
    } catch {
      report("dead-link", path, width, `${label} -> unparsable ${link.raw.slice(0, 60)}`);
      continue;
    }
    if (target.origin !== ORIGIN) continue; // other sites are not ours to fetch
    const targetPath = target.pathname + target.search;
    if (target.hash && samePage(targetPath, path)) {
      const id = decodeURIComponent(target.hash.slice(1));
      if (id && !(await page.evaluate((i) => !!document.getElementById(i) || !!document.querySelector(`[name="${CSS.escape(i)}"]`), id)))
        report("dead-link", path, width, `${label} -> #${id} is not on the page`);
      continue;
    }
    const res = await resolveTarget(context.request, ORIGIN + targetPath);
    if (res.status === 404 || res.notFoundScreen) report("link-404", path, width, `${label} -> ${targetPath}`);
    else if (res.status >= 500 || res.status === 0) report("link-error", path, width, `${label} -> ${targetPath} (HTTP ${res.status}${res.error ? ` ${res.error}` : ""})`);
    else if (res.status >= 400 && res.status !== 401 && res.status !== 403) report("link-error", path, width, `${label} -> ${targetPath} (HTTP ${res.status})`);
    const from = localeOf(path);
    const to = localeOf(new URL(res.finalUrl).pathname);
    if (LOCALES.includes(from) && activeLocaleSet.has(to) && to !== from && link.visible && !/^[a-z]{2}$/i.test(link.text) && !languageNames.test(link.text))
      report("locale-leak", path, width, `${label} -> ${targetPath} lands in /${to}`);
    if (!NOT_A_PUBLIC_PAGE.test(targetPath) && LOCALES.includes(localeOf(targetPath)) && res.status === 200) discovered.add(targetPath.split("#")[0]);
  }

  // ---- buttons -----------------------------------------------------------
  if (CLICKS) {
    const count = await page.locator("button, [role=button]").count();
    for (let i = 0; i < Math.min(count, 60); i++) {
      // A previous click may have navigated: come back so indexes still mean the same page.
      if (!samePage(page.url(), url)) {
        await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
      }
      const button = page.locator("button, [role=button]").nth(i);
      const info = await button
        .evaluate((el) => ({
          text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60),
          submit: el.tagName === "BUTTON" && !!el.closest("form") && (el.getAttribute("type") ?? "submit") === "submit",
          disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
          visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          inLink: !!el.closest("a[href]"),
          testid: el.getAttribute("data-testid") ?? "",
          // Where the control sits, without its words: the same header or footer control on
          // another page or in another language has the same signature.
          signature: (() => {
            const parts = [];
            for (let n = el; n && n !== document.body && parts.length < 6; n = n.parentElement)
              parts.push(`${n.tagName}${n.getAttribute("data-testid") ? `#${n.getAttribute("data-testid")}` : ""}:${n.parentElement ? [...n.parentElement.children].indexOf(n) : 0}`);
            return `${el.getAttribute("aria-controls") ?? ""}|${el.getAttribute("aria-haspopup") ?? ""}|${parts.join(">")}`;
          })(),
        }))
        .catch(() => null);
      if (!info || !info.visible || info.disabled || info.submit || info.inLink) continue;
      // A shared control (header, footer, cookie bar) is pressed on the first pages that
      // carry it, not on all of them: twice per width and page shape proves it.
      const sigKey = `${width}|${pageShape(path)}|${info.signature}`;
      const pressed = (pressCount.get(sigKey) ?? 0) + (pressCount.get(`${width}|*|${info.signature}`) ?? 0);
      if (pressed >= 2) continue;
      pressCount.set(sigKey, (pressCount.get(sigKey) ?? 0) + 1);
      pressCount.set(`${width}|*|${info.signature}`, (pressCount.get(`${width}|*|${info.signature}`) ?? 0) + 0.25);
      const before = await visiblePageState(page);
      let requests = 0;
      let popup = false;
      const onRequest = () => requests++;
      const onPopup = (p) => {
        popup = true;
        p.close().catch(() => {});
      };
      page.on("request", onRequest);
      context.on("page", onPopup);
      const clicked = await button.click({ timeout: 800 }).then(() => true).catch(() => false);
      await page.waitForTimeout(250);
      page.off("request", onRequest);
      context.off("page", onPopup);
      if (!clicked) continue; // covered or moved away: not something a person could press either
      const after = await visiblePageState(page).catch(() => null);
      if (!after) continue;
      const changed =
        popup || requests > 0 || after.url !== before.url || Math.abs(after.html - before.html) > 0 || after.open !== before.open ||
        after.pressed !== before.pressed || after.theme !== before.theme || after.focus !== before.focus || after.scroll !== before.scroll;
      if (!changed) report("dead-button", path, width, `"${info.text || info.testid || "(no text)"}" does nothing when pressed`);
      // close whatever opened, so the next button is reachable
      if (after.open !== before.open) await page.keyboard.press("Escape").catch(() => {});
    }
  }
  await page.close();
}

const activeLocaleSet = new Set(activeLocales());
const pressCount = new Map();
/** A page's shape: its path without the locale and without ids. */
const pageShape = (p) => p.split("?")[0].split("/").slice(2).map((s) => (/\d/.test(s) || s.length > 24 ? ":id" : s)).join("/");
/** A language switcher is allowed to leave the locale. */
const languageNames = /^(lietuvi|english|русский|nederlands|deutsch|polski|svenska|norsk|dansk|latvie|eesti|lt|en|ru|nl|de|pl)/i;

async function main() {
  const all = await sitemapPaths();
  let pages = all.filter((p) => LOCALES.includes(localeOf(p)));
  console.log(`origin ${ORIGIN} · locales ${LOCALES.join(",")} · widths ${WIDTHS.join(",")} · sitemap pages ${pages.length}`);
  // PW_CHROMIUM_PATH: a Chromium that is already on the machine, when the pinned download is not.
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const discovered = new Set();
  const visited = new Set();
  let done = 0;
  const run = async (list) => {
    for (const path of list) {
      if (visited.has(path) || (MAX_PAGES > 0 && visited.size >= MAX_PAGES)) continue;
      visited.add(path);
      for (const width of WIDTHS) {
        const context = await newContext(browser, width);
        try {
          await crawlPage(context, path, width, discovered);
        } catch (error) {
          report("crawl-error", path, width, String(error?.message ?? error).split("\n")[0].slice(0, 140));
        }
        await context.close();
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
      if (++done % 10 === 0) console.log(`  ${done} pages · ${findings.length} findings so far`);
    }
  };
  await run(pages);
  // Public pages that are linked but not in the sitemap (sign-in, sign-up, detail pages):
  // one of each shape per locale, so a list of 5,000 adverts is one page, not 5,000.
  const shape = (p) => p.split("?")[0].split("/").map((s, i) => (i > 2 && (/\d/.test(s) || s.length > 24) ? ":id" : s)).join("/");
  const shapes = new Set(pages.map(shape));
  const extra = [];
  for (const p of [...discovered].sort()) {
    if (visited.has(p) || shapes.has(shape(p))) continue;
    shapes.add(shape(p));
    extra.push(p);
  }
  console.log(`linked public pages outside the sitemap: ${extra.length}`);
  await run(extra);
  await browser.close();

  const byKind = {};
  for (const f of findings) (byKind[f.kind] ??= []).push(f);
  console.log(`\npages crawled: ${visited.size} × ${WIDTHS.length} widths · link targets resolved: ${resolved.size} · findings: ${findings.length}`);
  for (const [kind, list] of Object.entries(byKind).sort()) {
    console.log(`\n${kind} (${list.length})`);
    // The same defect on the same page in every locale reads as one line.
    const grouped = new Map();
    for (const f of list) {
      const k = `${f.page.replace(/^\/[a-z]{2}(?=\/|$|\?)/, "/:locale")} — ${f.detail.replace(/\/(lt|en|ru|nl|de|pl)(?=\/|$|\?| )/g, "/:locale")}`;
      const g = grouped.get(k) ?? { locales: new Set(), widths: new Set() };
      g.locales.add(localeOf(f.page));
      f.widths.forEach((w) => g.widths.add(w));
      grouped.set(k, g);
    }
    for (const [k, g] of grouped) console.log(`  [${[...g.locales].join(",")} @ ${[...g.widths].sort((a, b) => a - b).join("/")}] ${k}`);
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ origin: ORIGIN, locales: LOCALES, widths: WIDTHS, pages: [...visited], findings: findings.map(({ key: _key, ...f }) => f) }, null, 2));
  process.exit(findings.length > 0 ? 1 : 0);
}

await main();
