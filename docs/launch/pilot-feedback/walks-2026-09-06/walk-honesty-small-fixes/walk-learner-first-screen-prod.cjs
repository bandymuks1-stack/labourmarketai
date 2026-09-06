// PRODUCTION WALK (read-only) — the LEARNER's first screen, verbatim.
//
// WHAT IT MEASURES: every assistant turn on the learner's opening screen after the
// opening brief has settled (6 s), so the institution line(s) can be quoted verbatim.
// Defect under test (W6 honesty lane, item 3): the institution is named TWICE — the
// SSR intro line (`learnerGreetingContext`) AND the opening brief (`briefLearner`).
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-honesty-small-fixes/walk-learner-first-screen-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const LEARNER = "e2e-learner-202609021634@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = __dirname;

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
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
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(LEARNER), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
  const t0 = Date.now();
  await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
  const composerMs = Date.now() - t0;
  // Let the opening brief land (it is a slow read) so the screen we quote is the FINAL one.
  await p.waitForTimeout(6000);
  const bubbles = (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim());
  const greeting = (await p.locator("[data-testid='msg-greeting'], h1").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim());
  const chips = await p.getByTestId("conversation-thread").locator("button").allInnerTexts().catch(() => []);
  const institutionLines = bubbles.filter((t) => /mokot/i.test(t));
  log({ leg: "learner_first_screen", composerMs, greeting, bubbles, chips: chips.slice(-6), institutionLines, institutionMentions: institutionLines.length, failed: failed.slice(0, 5) });
  await p.screenshot({ path: path.join(OUT, "learner-first-screen-" + EXPECT_BUILD.slice(0, 8) + ".png"), fullPage: true }).catch(() => {});
  await c.close();
  await b.close();
})().catch((e) => { log({ fatal: String(e && e.message || e) }); process.exit(1); });
