// Production walk — the institution's learner OUTCOMES block (#1484): the E2E institution
// (E2E Walker UAB, org a996113c, < 5 learners) must see the block with the HONEST suppressed line.
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
const OUT = path.join(__dirname, "walk-outcomes"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL }); if (error) throw error;
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: v } = await anon.auth.verifyOtp({ email: EMAIL, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
  const val = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: val, domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const t0 = Date.now();
  await p.goto("https://labourmarket.ai/lt/dashboard/company", { waitUntil: "domcontentloaded", timeout: 60000 });
  const section = p.getByTestId("institution-learners");
  await section.waitFor({ timeout: 90000 });
  const body = await section.innerText();
  const outcomes = p.getByTestId("institution-learner-outcomes");
  const suppressed = p.getByTestId("institution-learner-outcomes-suppressed");
  log({
    step: "learners_section",
    ms: Date.now() - t0,
    outcomesBlock: (await outcomes.count()) > 0,
    suppressedLine: (await suppressed.count()) > 0,
    suppressedText: (await suppressed.count()) > 0 ? await suppressed.first().innerText() : null,
    countsBlock: (await p.getByTestId("institution-learner-outcomes-counts").count()) > 0,
    sectionExcerpt: body.slice(0, 400),
  });
  await outcomes.first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: path.join(OUT, "90-learner-outcomes.png") });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
