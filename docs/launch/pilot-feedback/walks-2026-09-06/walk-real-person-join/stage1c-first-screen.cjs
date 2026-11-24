// WINDOW 6 LANE A — stage 1c: the FIRST SCREEN after onboarding for the person who joined
// (session reused from the scratch storage state). 390 and 1280. Read-only.
//   EXPECT_BUILD=<sha> SCRATCH=<dir> node stage1c-first-screen.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const HOST = "https://labourmarket.ai";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const SCRATCH = process.env.SCRATCH; if (!SCRATCH) throw new Error("SCRATCH required");
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "shots"); fs.mkdirSync(OUT, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
const overflow = (p) => p.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
const textOf = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    const tag = vp.width;
    const c = await b.newContext({ viewport: vp, locale: "lt-LT", storageState: path.join(SCRATCH, "join-state.json"), ...(vp.width < 768 ? { isMobile: true, hasTouch: true } : {}) });
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    let t0 = Date.now();
    await p.goto(HOST + "/lt/dashboard/profile#setup-journey", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    log({ step: "profile_first_screen_" + tag, ms: Date.now() - t0, url: p.url().replace(HOST, ""), ...(await overflow(p)), text: (await textOf(p.locator("main").first())).slice(0, 2500) });
    log({ step: "profile_first_screen_buttons_" + tag, buttons: (await p.locator("main button, main a").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40) });
    await shot(p, "08-profile-first-" + tag);
    t0 = Date.now();
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    const tComposer = Date.now() - t0;
    await p.waitForTimeout(12000);
    const assistant = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    log({ step: "chat_first_screen_" + tag, msToComposer: tComposer, ...(await overflow(p)), greeting: await textOf(p.getByTestId("msg-greeting")).catch(() => ""), assistant: assistant.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 500)), chips: (await p.getByTestId("conversation-thread").locator("button").allInnerTexts().catch(() => [])).slice(-10), placeholder: await p.getByTestId("composer-input").getAttribute("placeholder") });
    await shot(p, "09-chat-first-" + tag);
    log({ step: "failed_" + tag, failed: failed.slice(0, 8) });
    await c.close();
  }
  await b.close();
  log({ result: "STAGE1C_DONE" });
})().catch((e) => { log({ result: "STAGE1C_ERROR", error: String(e && e.stack || e) }); process.exit(1); });
