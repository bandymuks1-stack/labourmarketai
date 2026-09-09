// READ-ONLY PROBE — H2 residue: does /dashboard/market-map really stack three map instances?
// The completion map records "the page still stacks three map instances (P5 composition later)".
// A doc note is not evidence, and a stacked map is only a real defect if a PERSON sees more than
// one — so this counts the instances, their sizes, and whether more than one is actually visible.
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
const OUT = path.join(__dirname, "probe-world-map"); fs.mkdirSync(OUT, { recursive: true });
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
  for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const c = await b.newContext({ viewport: vp, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const errors = [];
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
    await p.goto("https://labourmarket.ai/lt/dashboard/market-map", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(9000);
    const state = await p.evaluate(() => {
      const vis = (e) => {
        const r = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
      };
      const maps = [...document.querySelectorAll('[data-testid="market-map"], [data-testid="market-map-world"], [data-testid="workspace-map"]')];
      return {
        leafletContainers: document.querySelectorAll(".leaflet-container").length,
        mapNodes: maps.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            testid: e.getAttribute("data-testid"),
            mode: e.getAttribute("data-map-mode"),
            layer: e.getAttribute("data-map-layer") || e.getAttribute("data-world-layer"),
            origin: e.getAttribute("data-map-origin"),
            w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y),
            visible: vis(e),
          };
        }),
        anchors: document.querySelectorAll("[data-anchor-id]").length,
        docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    log({ viewport: label, ...state, consoleErrors: errors });
    await p.screenshot({ path: path.join(OUT, "world-" + label + ".png"), fullPage: true });
    await c.close();
  }
  await b.close();
  log({ step: "done" });
})().catch((e) => { console.error("PROBE_FAILED", e && e.message ? e.message : e); process.exit(1); });
