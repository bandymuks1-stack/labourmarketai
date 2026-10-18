// Production walk — P8 World discovery subset (#1538) on /lt/dashboard/market-map (E2E Walker UAB).
//  X1 [market-map-world] present with data-world-layer=demand, three world-layer-* pills with aria-pressed, [market-map][data-map-origin=live];
//  X2 [world-counts-inview] "N places, M objects" (N ≤ 60) and [world-counts-scale];
//  X3 switch layers: projects → its state; supply → state + [world-note-aggregate];
//  X4 list rows [world-list-row][data-provenance=fact|derived]; X5 no write requests on the network; X6 390 px overflow 0;
//  X7 anon → redirected to login. No writes → zero residue.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-world"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const b = await chromium.launch();
  const open = async (viewport, authed = true) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    if (authed) await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(MANAGER), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const writes = [];
    p.on("request", (r) => { if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) && !/\/monitoring|pilot_events|funnel|telemetry|_vercel|sentry/i.test(r.url())) writes.push(r.method() + " " + r.url().slice(0, 100)); });
    p.writes = writes;
    await p.goto("https://labourmarket.ai/lt/dashboard/market-map", { waitUntil: "domcontentloaded", timeout: 60000 });
    return p;
  };
  const t0 = Date.now();
  const p = await open({ width: 1280, height: 900 });
  const world = p.getByTestId("market-map-world");
  await world.waitFor({ timeout: 90000 });
  await p.waitForTimeout(6000);
  const state = async () => ({
    layer: await world.getAttribute("data-world-layer"),
    layerState: await p.locator("[data-testid=world-layer-state]").first().getAttribute("data-world-state").catch(() => null),
    inview: (await p.getByTestId("world-counts-inview").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 120),
    scale: (await p.getByTestId("world-counts-scale").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 80),
    rows: await p.getByTestId("world-list-row").count(),
    rowProvenance: await p.getByTestId("world-list-row").evaluateAll((els) => Array.from(new Set(els.map((e) => e.getAttribute("data-provenance"))))),
    aggregateNote: await p.getByTestId("world-note-aggregate").count(),
  });
  const pills = await p.locator('[data-testid^="world-layer-"]').evaluateAll((els) => els.filter((e) => e.getAttribute("aria-pressed") !== null).map((e) => ({ id: e.getAttribute("data-testid"), pressed: e.getAttribute("aria-pressed"), text: (e.textContent || "").trim().slice(0, 40) })));
  const mapOrigin = await p.getByTestId("market-map").first().getAttribute("data-map-origin").catch(() => null);
  const s1 = await state();
  const placesMatch = s1.inview.match(/(\d+)/g);
  log({ step: "X1_X2_demand", mapOrigin, pills, state: s1, placesWithinCap: placesMatch ? Number(placesMatch[0]) <= 60 : null });
  await p.screenshot({ path: path.join(OUT, "01-demand.png"), fullPage: true });
  // X3 — other layers
  for (const id of ["world-layer-projects", "world-layer-supply"]) {
    const pill = p.getByTestId(id).first();
    if ((await pill.count()) === 0) { log({ step: "X3_" + id, missing: true }); continue; }
    await pill.click(); await p.waitForTimeout(5000);
    log({ step: "X3_" + id, state: await state() });
    await p.screenshot({ path: path.join(OUT, `02-${id}.png`), fullPage: true });
  }
  await p.getByTestId("world-layer-demand").first().click().catch(() => {});
  await p.waitForTimeout(3000);
  log({ step: "X5_network_writes", writes: p.writes.slice(0, 10) });
  // X6 — 390 px
  const m = await open({ width: 390, height: 844 });
  await m.getByTestId("market-map-world").waitFor({ timeout: 90000 });
  await m.waitForTimeout(4000);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log({ step: "X6_mobile", horizontalOverflowPx: overflow });
  await m.screenshot({ path: path.join(OUT, "03-mobile.png"), fullPage: true });
  // X7 — anon
  const a = await open({ width: 1280, height: 900 }, false);
  await a.waitForTimeout(3000);
  log({ step: "X7_anon", url: a.url(), redirectedToLogin: /\/auth\/login/.test(a.url()) });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
