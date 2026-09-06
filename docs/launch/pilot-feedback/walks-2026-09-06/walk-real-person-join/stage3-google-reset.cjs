// WINDOW 6 LANE A — stage 3: Google door (read-only: never authenticates) and the
// password-reset door (a reset is requested ONLY for the controlled E2E address).
//   EXPECT_BUILD=<sha> node stage3-google-reset.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const HOST = "https://labourmarket.ai";
const EMAIL = "e2e-join-2026-09-06@labourmarket.ai";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "shots"); fs.mkdirSync(OUT, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
const textOf = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true });
  const p = await c.newPage();
  // Google door — click, observe the navigation target, never sign in.
  await p.goto(HOST + "/lt/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  const g = p.getByRole("button", { name: /Google/ }).first();
  log({ step: "google_button", present: await g.count(), label: await textOf(g) });
  const t0 = Date.now();
  await g.click().catch((e) => log({ step: "google_click_error", e: String(e) }));
  await p.waitForURL(/accounts\.google\.com|supabase\.co\/auth/, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const u = new URL(p.url());
  log({ step: "google_door", ms: Date.now() - t0, host: u.host, path: u.pathname, hasClientId: u.searchParams.has("client_id"), redirectUri: u.searchParams.get("redirect_uri"), title: await p.title().catch(() => "") });
  await shot(p, "20-google-door-390");
  // Password reset door.
  await p.goto(HOST + "/lt/auth/forgot-password", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.locator("form").waitFor({ timeout: 30000 });
  log({ step: "forgot_form", text: await textOf(p.locator("main").first()), scrollW: await p.evaluate(() => document.documentElement.scrollWidth) });
  await shot(p, "21-forgot-390");
  await p.locator('input[type="email"], input[name="email"]').first().fill(EMAIL);
  await p.locator('form button[type="submit"]').click();
  await p.waitForTimeout(6000);
  log({ step: "forgot_after_submit", text: await textOf(p.locator("main").first()) });
  await shot(p, "22-forgot-submitted-390");
  // The reset landing itself (what a person sees when the link is opened without a token).
  await p.goto(HOST + "/lt/auth/reset-password", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(3000);
  log({ step: "reset_page_no_token", url: p.url().replace(HOST, ""), text: (await textOf(p.locator("main").first())).slice(0, 500) });
  await shot(p, "23-reset-no-token-390");
  await c.close(); await b.close();
  log({ result: "STAGE3_DONE" });
})().catch((e) => { log({ result: "STAGE3_ERROR", error: String(e && e.stack || e) }); process.exit(1); });
