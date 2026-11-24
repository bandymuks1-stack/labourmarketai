// READ-ONLY PROBE — is the country-approx marker actually CLICKABLE, or is it announced without geometry?
// The drilldown walk found LT-approx resolving to <path d="M0 0"> (no drawn shape → Playwright reports
// "element is not visible"). Two very different explanations, and they must not be guessed between:
//   (a) TIMING — leaflet has not projected the path yet; it acquires real geometry shortly after mount.
//   (b) PRODUCT DEFECT — the anchor is rendered with an aria-label and role=button but never gets a shape,
//       so a PERSON cannot click it either and the drilldown is unreachable by pointer.
// This samples the geometry over time and reports the map container's own size, which distinguishes them.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const EMAIL = "e2e-walker-202609021438@labourmarket.ai";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "probe-anchor-geometry"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL }); if (error) throw error;
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: v } = await anon.auth.verifyOtp({ email: EMAIL, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  await p.goto("https://labourmarket.ai/lt/dashboard?result=market", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("market-map").waitFor({ timeout: 90000 });

  const sample = () => p.evaluate(() => {
    const el = document.querySelector('[data-anchor-id="LT-approx"]');
    const map = document.querySelector('[data-testid="market-map"]');
    const cont = document.querySelector(".leaflet-container");
    const r = el ? el.getBoundingClientRect() : null;
    const mr = map ? map.getBoundingClientRect() : null;
    return {
      d: el ? (el.getAttribute("d") || "").slice(0, 60) : null,
      anchorBox: r ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) } : null,
      mapBox: mr ? { w: Math.round(mr.width), h: Math.round(mr.height) } : null,
      leafletContainer: cont ? { w: cont.clientWidth, h: cont.clientHeight } : null,
      tiles: document.querySelectorAll(".leaflet-tile").length,
      paths: document.querySelectorAll("path[data-anchor-id]").length,
      all: [...document.querySelectorAll("path[data-anchor-id]")].map((e) => {
        const bb = e.getBoundingClientRect();
        return { id: e.getAttribute("data-anchor-id"), d: (e.getAttribute("d") || "").slice(0, 24), w: Math.round(bb.width), h: Math.round(bb.height) };
      }),
    };
  });

  for (const at of [0, 1000, 2000, 4000, 8000, 15000]) {
    if (at) await p.waitForTimeout(at === 1000 ? 1000 : at === 2000 ? 1000 : at === 4000 ? 2000 : at === 8000 ? 4000 : 7000);
    log({ step: "sample", atMs: at, ...(await sample()) });
  }
  await p.screenshot({ path: path.join(OUT, "market-map.png") });

  // Does a REAL pointer click work once geometry exists?
  const el = p.locator('[data-anchor-id="LT-approx"]').first();
  let clicked = "no";
  try { await el.click({ timeout: 15000 }); clicked = "yes"; }
  catch (e) { clicked = "failed: " + String(e.message).split("\n")[0].slice(0, 120); }
  await p.waitForTimeout(3000);
  log({ step: "click", clicked, url: p.url(), projectsView: await p.getByTestId("projects-view").count() });

  // Keyboard is the accessibility path the role=button + aria-label promise.
  if (clicked !== "yes") {
    try {
      await el.focus({ timeout: 5000 });
      await p.keyboard.press("Enter");
      await p.waitForTimeout(3000);
      log({ step: "keyboard", url: p.url(), projectsView: await p.getByTestId("projects-view").count() });
    } catch (e) { log({ step: "keyboard", error: String(e.message).split("\n")[0].slice(0, 120) }); }
  }
  await p.screenshot({ path: path.join(OUT, "after-activate.png") });
  await b.close();
  log({ step: "done" });
})().catch((e) => { console.error("PROBE_FAILED", e && e.message ? e.message : e); process.exit(1); });
