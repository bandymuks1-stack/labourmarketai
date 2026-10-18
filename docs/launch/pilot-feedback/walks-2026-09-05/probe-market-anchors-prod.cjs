// READ-ONLY PROBE — does the market MARKER render for the identity that owns real persisted demand?
// The drilldown fix (#1556) only changes what happens AFTER a marker is clicked. If the marker itself
// never appears for an employer who owns a real `customer_requests` need, the chain is still
// unreachable and that is a SECOND defect, in `market-result.ts`, not in the drilldown.
// No writes, no clicks that mutate anything. Usage: EXPECT_BUILD=<sha7> node probe-market-anchors-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const IDENTITIES = [
  ["e2e-walker-202609021438@labourmarket.ai", "owns customer_requests b0a48f65 (LT, welder, 2)"],
  ["e2e-spine-org-202609051508@labourmarket.ai", "owns no placeable demand — expected empty"],
];
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "probe-market-anchors"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const b = await chromium.launch();
  for (const [email, why] of IDENTITIES) {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai/lt/dashboard?result=market", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("market-map").waitFor({ timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(6000);
    const anchors = await p.locator("[data-anchor-id]").evaluateAll((els) => els.map((e) => ({
      id: e.getAttribute("data-anchor-id"),
      precision: e.getAttribute("data-anchor-precision"),
      label: (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    })));
    const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    log({
      identity: email, why,
      mapPresent: (await p.getByTestId("market-map").count()) > 0,
      anchors,
      ltAnchor: anchors.filter((a) => (a.id || "").startsWith("LT")),
      emptyText: /atvirų poreikių su vieta nėra|neradome|nėra/i.test(body),
      excerpt: body.slice(0, 260),
    });
    await p.screenshot({ path: path.join(OUT, email.split("@")[0] + ".png") });
    await c.close();
  }
  await b.close();
  log({ step: "done" });
})().catch((e) => { console.error("PROBE_FAILED", e && e.message ? e.message : e); process.exit(1); });
