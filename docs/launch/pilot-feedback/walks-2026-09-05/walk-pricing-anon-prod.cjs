/**
 * walk-pricing-anon-prod.cjs — J1: an ANONYMOUS visitor sees the real price figures on /lt/pricing (public_plans_v1
 * served) and no stale "payments not enabled / prices not final" wording once Stripe is LIVE.
 * Usage: EXPECT_BUILD=<sha7> node walk-pricing-anon-prod.cjs
 */
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-pricing-anon"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const b = await chromium.launch();
  for (const [tag, viewport, colorScheme] of [["desktop", { width: 1280, height: 900 }, "light"], ["mobile", { width: 390, height: 844 }, "dark"]]) {
    const c = await b.newContext({ viewport, locale: "lt-LT", colorScheme });
    const p = await c.newPage();
    await p.goto(HOST + "/lt/pricing", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(4000);
    const text = async (id) => (await p.getByTestId(id).count()) > 0 ? (await p.getByTestId(id).first().innerText()).replace(/\s+/g, " ").trim() : null;
    const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    const ids = await p.locator("[data-testid]").evaluateAll((els) => Array.from(new Set(els.map((e) => e.getAttribute("data-testid")))).filter((t) => /pric|plan|banner|concierge|early/.test(t)).slice(0, 60));
    const stale = ["neįjungt", "dar nėra galutin", "nėra galutin", "not enabled", "not final", "mokėjimai dar", "kainos dar"].filter((s) => body.toLowerCase().includes(s));
    log({ step: "pricing_" + tag, ms: Date.now(), url: p.url(), free: await text("pricing-price-free"), business: await text("pricing-price-business"), has99: /99\s*€\s*\/\s*mėn/.test(body), hasFree: /Nemokama/.test(body), staleHits: stale, banner: await text("concierge-banner") || await text("early-access-banner"), testids: ids, excerpt: (body.match(/Kain[^]{0,500}/) || [body.slice(0, 500)])[0] });
    await p.screenshot({ path: path.join(OUT, tag + ".png"), fullPage: true });
    await c.close();
  }
  await b.close();
  log({ step: "done" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
