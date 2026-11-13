#!/usr/bin/env node
/**
 * Public CTA crawl — every public page, every routed locale, phone and desktop.
 *
 *   node apps/web/scripts/public-cta-crawl.mjs [--origin https://labourmarket.ai]
 *        [--locales lt,en] [--widths 360,1440] [--press-widths 360,1440] [--max-pages 0] [--out report.json]
 *        [--no-clicks] [--max-presses 25] [--delay-ms 150] [--static-via-node]
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
 *     an error thrown or a script that fails to load when a button is pressed is a finding too;
 *   - acceptance gates: sign-in and sign-up reachable within two actions on every page, no
 *     menu shown twice, no visible control that cannot be pressed;
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
/** Widths at which buttons are pressed (default: every width). Layout, links and the acceptance checks run at all widths. */
const PRESS_WIDTHS = arg("press-widths", "") ? arg("press-widths", "").split(",").map(Number) : WIDTHS;
const MAX_PAGES = Number(arg("max-pages", "0"));
const DELAY_MS = Number(arg("delay-ms", "150"));
const OUT = arg("out", "");
const CLICKS = !flag("no-clicks");
const STATIC_VIA_NODE = flag("static-via-node");
/** --only /en/pricing: crawl just these paths (comma-separated). --verbose: time each phase. */
const ONLY = arg("only", "");
const VERBOSE = flag("verbose");
const lap = (t0, what) => VERBOSE && console.log(`      ${what}: ${Date.now() - t0} ms`);
/** Buttons pressed per page and width; shared controls are skipped once proven elsewhere. */
const MAX_PRESSES = Number(arg("max-presses", "25"));

/** Banned in product copy (doctrine §18; lib/guards/product-copy-forbidden-terms.test.ts). */
const BANNED = [/\bdemo\b/i, /\bdemonstrac/i, /\bдемо\b/i];
/** Signed-in or machine surfaces: resolved as link targets, never crawled as pages. */
const NOT_A_PUBLIC_PAGE = /^\/(api|_next)\/|^\/[a-z]{2}\/(dashboard|onboarding|oauth|invite)(\/|$)|\.(xml|txt|png|svg|ico|pdf|json|webmanifest)$/i;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36 lm-cta-crawl";

const findings = [];
/** Pages whose first load failed and whose second succeeded: said in the summary, not a finding. */
const slowLoads = [];
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
  // Said at once as well as in the summary: a crawl that is stopped early has still reported.
  console.log(`  ! ${kind} ${page} @${width} — ${detail}`);
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

/** Writes the crawl has aborted so far (see the route below). */
let writesBlocked = 0;

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
    if (!["GET", "HEAD"].includes(req.method())) {
      writesBlocked++; // the crawl stopped a write: an error that follows is the crawl's doing
      return route.abort("blockedbyclient");
    }
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
    // What the fields hold: a control whose whole effect is to fill or clear a field (an
    // example prompt, a "clear" button) changes no markup, and is not dead.
    fields: [...document.querySelectorAll("input:not([type=hidden]):not([type=password]), textarea, select")]
      .map((e) => (e.type === "checkbox" || e.type === "radio" ? (e.checked ? "1" : "0") : String(e.value ?? "")))
      .join("\u0001"),
  }));
}

async function crawlPage(context, path, width, discovered, firstFailure = null) {
  const page = await context.newPage();
  const url = ORIGIN + path;
  const failedScripts = [];
  const pageErrors = [];
  page.on("response", (res) => {
    if (res.status() >= 400 && /\/_next\/static\//.test(res.url())) failedScripts.push(`${res.status()} ${new URL(res.url()).pathname}`);
  });
  // A chunk that dies without any HTTP answer (reset, DNS) is seen by neither
  // the status check above nor, necessarily, a page error. ERR_ABORTED is a
  // request the browser dropped on navigation, or one this crawler blocked.
  page.on("requestfailed", (req) => {
    const why = req.failure()?.errorText ?? "failed";
    if (/\/_next\/static\//.test(req.url()) && !/ERR_ABORTED/i.test(why)) failedScripts.push(`no answer ${new URL(req.url()).pathname} (${why})`);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  let t0 = Date.now();
  let response;
  try {
    response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  } catch (error) {
    // One load that does not finish is not yet a page that cannot be reached: a single stall
    // (the network, the runner, a busy server) would fail a whole release check. Loaded once
    // more in a fresh tab; a second failure is the finding, a success is said out loud.
    const why = String(error?.message ?? error).split("\n")[0].slice(0, 130);
    await page.close().catch(() => {});
    if (firstFailure === null) return crawlPage(context, path, width, discovered, why);
    report("page-unreachable", path, width, `twice: ${why}`);
    return;
  }
  if (firstFailure !== null) {
    slowLoads.push({ page: path, width, first: firstFailure });
    console.log(`  ~ slow-load ${path} @${width} — first load failed (${firstFailure}); loaded on the second attempt`);
  }
  await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => {});
  lap(t0, "load");
  t0 = Date.now();
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
  // What follows is collected again after the controls are pressed.
  failedScripts.length = 0;
  pageErrors.length = 0;
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

  // ---- acceptance: sign-in and sign-up within two actions; one main menu ------
  if (!/\/auth\//.test(path)) {
    const authVisible = () =>
      page.evaluate(() => {
        const seen = (re) => [...document.querySelectorAll("a[href]")].some((a) => re.test(a.getAttribute("href") ?? "") && !!(a.offsetWidth || a.offsetHeight || a.getClientRects().length));
        return { login: seen(/\/auth\/(login|sign-?in)/), signup: seen(/\/auth\/(signup|sign-?up|register)/) };
      });
    let auth = await authVisible();
    let actions = 1; // one press on the visible link
    if (!auth.login || !auth.signup) {
      // One more action is allowed: opening the page's menu.
      const toggle = page.locator('[data-testid="mobile-nav-toggle"], header button[aria-controls][aria-expanded="false"]').first();
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click({ timeout: 1_500 }).catch(() => {});
        await page.waitForTimeout(300);
        const opened = await authVisible();
        auth = { login: auth.login || opened.login, signup: auth.signup || opened.signup };
        actions = 2;
        await page.keyboard.press("Escape").catch(() => {});
        if (await toggle.getAttribute("aria-expanded").catch(() => null) === "true") await toggle.click({ timeout: 1_500 }).catch(() => {});
      }
    }
    if (!auth.login) report("auth-not-findable", path, width, `sign-in is not reachable within 2 actions`);
    if (!auth.signup) report("auth-not-findable", path, width, `sign-up is not reachable within 2 actions`);
    authActions.push(actions);
  }
  // Two visible menus that offer mostly the same destinations are one menu shown twice.
  const menus = await page.evaluate(() =>
    [...document.querySelectorAll("nav, [role=navigation]")]
      .filter((n) => !n.closest("footer") && !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length))
      .map((n) => [...new Set([...n.querySelectorAll("a[href]")].filter((a) => !!(a.offsetWidth || a.offsetHeight || a.getClientRects().length)).map((a) => a.getAttribute("href")))])
      .filter((hrefs) => hrefs.length >= 3),
  );
  for (let i = 0; i < menus.length; i++)
    for (let j = i + 1; j < menus.length; j++) {
      const shared = menus[i].filter((h) => menus[j].includes(h)).length;
      if (shared / Math.min(menus[i].length, menus[j].length) >= 0.6) report("duplicate-menu", path, width, `two visible menus share ${shared} of ${Math.min(menus[i].length, menus[j].length)} destinations`);
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
  const stateLinks = [];
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
      if (id && !(await page.evaluate((i) => !!document.getElementById(i) || !!document.querySelector(`[name="${CSS.escape(i)}"]`), id))) {
        // No anchor with that name. It may still be a STATE link the page
        // itself answers (the goal navigator's `#goal=work` opens a panel), so
        // it is judged by pressing it, after every other link has been read.
        if (link.visible && !stateLinks.some((x) => x.raw === link.raw)) stateLinks.push({ raw: link.raw, id, label });
        else if (!link.visible) report("dead-link", path, width, `${label} -> #${id} is not on the page`);
      }
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

  // ---- same-page links with no anchor: do they do anything? ----------------
  // Pressed (a press sends no request the route lock would not allow). The
  // link is alive when the page visibly answers: its text changes, or the link
  // itself reports a new state. Without presses (--no-clicks) nothing can be
  // said about them, so nothing is reported.
  if (CLICKS && stateLinks.length > 0) {
    for (const s of stateLinks.slice(0, 12)) {
      const a = page.locator(`a[href="${s.raw.replace(/["\\]/g, "\\$&")}"]`).filter({ visible: true }).first();
      const textOf = () => page.evaluate(() => document.body.innerText);
      let acted = false;
      const blockedBefore = writesBlocked;
      failedScripts.length = 0;
      pageErrors.length = 0;
      try {
        const handle = await a.elementHandle({ timeout: 3_000 });
        const stateOf = () => handle.evaluate((el) => ["aria-current", "aria-expanded", "aria-selected", "aria-pressed"].map((k) => el.getAttribute(k)).join("|"));
        const before = { text: await textOf(), state: await stateOf() };
        await a.click({ timeout: 3_000 });
        await page.waitForTimeout(700);
        const after = { text: await textOf(), state: await stateOf().catch(() => "gone") };
        acted = !samePage(page.url(), url) || after.text !== before.text || after.state !== before.state;
      } catch {
        acted = false;
      }
      if (!acted) report("dead-link", path, width, `${s.label} -> #${s.id} is not on the page and pressing it changes nothing`);
      // A link that answers but throws, or loads a script that fails, is broken
      // all the same (as in the button pass; not when the crawl blocked a write).
      if (writesBlocked === blockedBefore) {
        for (const f of new Set(failedScripts)) report("script-failed", path, width, `after pressing ${s.label}: ${f}`);
        for (const e of new Set(pageErrors)) report("page-error", path, width, `after pressing ${s.label}: ${e}`);
      }
      failedScripts.length = 0;
      pageErrors.length = 0;
      if (!samePage(page.url(), url)) await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => {});
    }
    // The presses opened panels: start the button pass from the page as loaded.
    await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => {});
    failedScripts.length = 0;
    pageErrors.length = 0;
  }

  lap(t0, `links (${links.length}, own targets ${ownTargets.length})`);
  t0 = Date.now();

  // ---- buttons -----------------------------------------------------------
  if (CLICKS && PRESS_WIDTHS.includes(width)) {
    const count = await page.locator("button, [role=button]").count();
    let presses = 0;
    for (let i = 0; i < Math.min(count, 80) && presses < MAX_PRESSES; i++) {
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
          // The step, tab or option a person is already on: pressing it rightly changes nothing.
          current: el.hasAttribute("aria-current") && el.getAttribute("aria-current") !== "false" || el.getAttribute("aria-selected") === "true",
          testid: el.getAttribute("data-testid") ?? "",
          // Site furniture (header, footer, navigation, a dialog such as the cookie bar) is the
          // same control on every page; a button in the page's own content is not, even when
          // it happens to sit at the same place in the markup as one on another page.
          shared: !!el.closest("header, footer, nav, [role=banner], [role=contentinfo], [role=navigation], [role=dialog], [role=alertdialog]"),
          // Where the control sits, without its words: the same header or footer control on
          // another page or in another language has the same signature.
          signature: (() => {
            const parts = [];
            for (let n = el; n && n !== document.body && parts.length < 6; n = n.parentElement)
              parts.push(`${n.tagName}${n.getAttribute("data-testid") ? `#${n.getAttribute("data-testid")}` : ""}:${n.parentElement ? [...n.parentElement.children].indexOf(n) : 0}`);
            return `${el.getAttribute("aria-controls") ?? ""}|${el.getAttribute("aria-haspopup") ?? ""}|${parts.join(">")}`;
          })(),
        }), undefined, { timeout: 1_500 }) // a control that left the page is skipped, not waited for
        .catch(() => null);
      if (!info || !info.visible || info.disabled || info.submit || info.inLink || info.current) continue;
      // A shared control (header, footer, cookie bar) is pressed on the first pages that
      // carry it, not on all of them: twice per width and page shape proves it.
      const sigKey = `${width}|${pageShape(path)}|${info.signature}`;
      const anyPage = `${width}|*|${info.signature}`;
      const pressed = (pressCount.get(sigKey) ?? 0) + (info.shared ? pressCount.get(anyPage) ?? 0 : 0);
      if (pressed >= 2) continue;
      pressCount.set(sigKey, (pressCount.get(sigKey) ?? 0) + 1);
      // Only site furniture is counted across page shapes. Counting a content button that way
      // would, after a few pages, skip every later button at the same place in the markup,
      // and a dead one among them would pass.
      if (info.shared) pressCount.set(anyPage, (pressCount.get(anyPage) ?? 0) + 0.25);
      const blockedBefore = writesBlocked;
      // Focus first: a press always moves focus to the control, and that alone is not an effect.
      await button.focus({ timeout: 800 }).catch(() => {});
      presses++;
      // Pressed up to twice: a press that lands while the page is still wiring itself up can
      // be lost once, and a control is only called dead when a second press is lost too.
      let dead = false;
      let opened = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
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
        const tc = Date.now();
        const clicked = await button.click({ timeout: 800 }).then(() => true).catch(() => false);
        await page.waitForTimeout(attempt === 1 ? 250 : 700);
        page.off("request", onRequest);
        context.off("page", onPopup);
        lap(tc, `press "${info.text.slice(0, 30)}" ${clicked ? "ok" : "not pressable"}`);
        if (!clicked) {
          // Still there, still enabled, and the press could not land: something covers it or
          // it sits outside what can be scrolled to. Checked twice before it is said.
          const still = await button.evaluate((el) => !!(el.offsetWidth || el.offsetHeight) && el.disabled !== true && el.isConnected, undefined, { timeout: 1_000 }).catch(() => false);
          if (still && attempt === 2) report("control-not-pressable", path, width, `"${info.text || info.testid || "(no text)"}" is visible and enabled but cannot be pressed (covered or clipped)`);
          if (still && attempt === 1) continue;
          break;
        }
        const after = await visiblePageState(page).catch(() => null);
        if (!after) break;
        const changed =
          popup || requests > 0 || after.url !== before.url || after.html !== before.html || after.open !== before.open ||
          after.pressed !== before.pressed || after.theme !== before.theme || after.focus !== before.focus || after.scroll !== before.scroll ||
          after.fields !== before.fields;
        opened = after.open > before.open;
        dead = !changed;
        if (changed) break;
      }
      if (dead) report("dead-button", path, width, `"${info.text || info.testid || "(no text)"}" does nothing when pressed`);
      // A press that throws, or loads a script that fails, is a broken control even though
      // "something happened". Not when the crawl itself aborted the control's write: the
      // error is then the crawl's doing, and the errors are dropped unreported.
      if (writesBlocked === blockedBefore) {
        const name = `"${info.text || info.testid || "(no text)"}"`;
        for (const f of new Set(failedScripts)) report("script-failed", path, width, `after pressing ${name}: ${f}`);
        for (const e of new Set(pageErrors)) report("page-error", path, width, `after pressing ${name}: ${e}`);
      }
      failedScripts.length = 0;
      pageErrors.length = 0;
      const after = { open: opened ? 1 : 0 };
      const before = { open: 0 };
      // close whatever opened, so the next button is reachable
      if (after.open !== before.open) await page.keyboard.press("Escape").catch(() => {});
    }
  }
  lap(t0, "buttons");
  await page.close();
}

const activeLocaleSet = new Set(activeLocales());
const pressCount = new Map();
/** Actions needed to reach sign-in and sign-up, one entry per page and width (1 = visible, 2 = behind the menu). */
const authActions = [];
/** A page's shape: its path without the locale and without ids. */
const pageShape = (p) => p.split("?")[0].split("/").slice(2).map((s) => (/\d/.test(s) || s.length > 24 ? ":id" : s)).join("/");
/** A language switcher is allowed to leave the locale. */
const languageNames = /^(lietuvi|english|русский|nederlands|deutsch|polski|svenska|norsk|dansk|latvie|eesti|lt|en|ru|nl|de|pl)/i;

async function main() {
  const all = await sitemapPaths();
  let pages = ONLY ? ONLY.split(",") : all.filter((p) => LOCALES.includes(localeOf(p)));
  console.log(`origin ${ORIGIN} · locales ${LOCALES.join(",")} · widths ${WIDTHS.join(",")} · sitemap pages ${pages.length}`);
  // PW_CHROMIUM_PATH: a Chromium that is already on the machine, when the pinned download is not.
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const discovered = new Set();
  const visited = new Set();
  let done = 0;
  const startedAt = Date.now();
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
      console.log(`  ${++done}/${list.length} ${path} · ${Math.round((Date.now() - startedAt) / 1000)}s · ${findings.length} findings`);
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
  const maxAuth = authActions.length ? Math.max(...authActions) : 0;
  console.log(`acceptance: sign-in and sign-up checked on ${authActions.length} page views, most actions needed ${maxAuth}; widths ${WIDTHS.join("/")}`);
  if (slowLoads.length) console.log(`slow loads (first attempt failed, second loaded): ${slowLoads.length} — ${slowLoads.map((x) => `${x.page} @${x.width}`).join(", ").slice(0, 600)}`);
  for (const [kind, list] of Object.entries(byKind).sort()) {
    console.log(`\n${kind} (${list.length})`);
    // The same defect on the same page in every locale reads as one line.
    const grouped = new Map();
    for (const f of list) {
      const k = `${f.page.replace(/^\/[a-z]{2}(?=\/|$|\?)/, "/:locale")} — ${f.detail.replace(/(?<!lands in )\/(lt|en|ru|nl|de|pl)(?=\/|$|\?| )/g, "/:locale")}`;
      const g = grouped.get(k) ?? { locales: new Set(), widths: new Set() };
      g.locales.add(localeOf(f.page));
      f.widths.forEach((w) => g.widths.add(w));
      grouped.set(k, g);
    }
    for (const [k, g] of grouped) console.log(`  [${[...g.locales].join(",")} @ ${[...g.widths].sort((a, b) => a - b).join("/")}] ${k}`);
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ origin: ORIGIN, locales: LOCALES, widths: WIDTHS, pages: [...visited], slowLoads, findings: findings.map(({ key: _key, ...f }) => f) }, null, 2));
  process.exit(findings.length > 0 ? 1 : 0);
}

await main();
